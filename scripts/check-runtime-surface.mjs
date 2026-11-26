#!/usr/bin/env node
/**
 * 运行面漏洞周检：采集交付镜像的 Node 运行时与 Alpine apk 清单，与公开数据源比对。
 *
 * 背景：基底镜像按 digest 固定后，Alpine 仓库里的安全修复不会自动进入运行镜像；2026-10-22 / 11-11 两次
 * Node / Alpine 公告都靠外部巡检才发现。`apps/platform/docker/check-node-version.mjs` 只是构建期的静态下限，
 * 本脚本补「是否落后于当前最新 security 发布 / 是否存在 secdb 修复版本」的周期判读。
 *
 * 数据源（实证见 docs/design/governance/runtime-surface-weekly-scan.md §2）：
 * - Node：`https://nodejs.org/dist/index.json`（`security: true` 标记安全发布）
 * - Alpine：`https://secdb.alpinelinux.org/<branch>/{main,community}.json`（`secfixes: { 修复版本: [CVE…] }`）
 * GitHub Advisory 不参与首版判定：按 CVE 反查会跨生态命中（实证 CVE-2026-4738 返回 OSGeo 的 GHSA）。
 *
 * **fail-closed**：数据源不可达 / 结构不符 / 版本无法解析 / apk 清单为空 / 豁免清单非法 → `unknown`（exit 2）；
 * 只有「采集成功、数据源正常、每条判定都成立、无 findings」才是 PASS（exit 0）。
 *
 * 退出码：0 干净 / 1 命中 findings / 2 数据源或环境异常（unknown，不得当作 PASS）。
 *
 * 用法：
 *   node scripts/check-runtime-surface.mjs                        # 检查默认镜像（caomeiyouren/dependfix:latest）
 *   node scripts/check-runtime-surface.mjs --image <ref>           # 指定镜像
 *   node scripts/check-runtime-surface.mjs --summary out.md        # 另写 Markdown 摘要（CI Job Summary）
 *   node scripts/check-runtime-surface.mjs --node-index <file> --secdb-dir <dir>   # 离线 fixture（单测 / 复算）
 */

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { isDirectExecution } from './shared/cli.mjs'

export const NODE_INDEX_URL = 'https://nodejs.org/dist/index.json'
export const SECDB_BASE_URL = 'https://secdb.alpinelinux.org'
export const DEFAULT_IMAGE = 'caomeiyouren/dependfix:latest'
export const DEFAULT_BASELINE_PATH = 'scripts/check-runtime-surface-baseline.json'
export const MAX_JSON_BYTES = 5 * 1024 * 1024
export const EXIT_CLEAN = 0
export const EXIT_FINDINGS = 1
export const EXIT_UNKNOWN = 2

/** 采集脚本：一次容器运行同时取 Node 版本、Alpine 版本与 apk 清单，避免三次冷启动。 */
const COLLECT_SCRIPT = [
    'printf "node=%s\\n" "$(node -v)"',
    'printf "alpine=%s\\n" "$(cat /etc/alpine-release)"',
    'apk info -v',
].join('\n')

/**
 * apk 版本后缀的排序权重（apk-tools 语义的常用子集；未列出的后缀直接抛错，不猜顺序）。
 * 参考 https://wiki.alpinelinux.org/wiki/APKBUILD_Reference#pkgver
 */
const APK_SUFFIX_RANK = {
    alpha: 0,
    beta: 1,
    pre: 2,
    rc: 3,
    '': 4,
    cvs: 5,
    svn: 6,
    git: 7,
    hg: 8,
    p: 9,
}

/** 版本串形态：以数字开头，允许 `.` / `-` 分隔的日期型版本、字母版次、`_suffix` 与 `-rN`。 */
const VERSION_RE = /^\d+(?:[.-]\d+)*(?:[a-z])?(?:_[a-z]+\d*)?(?:-r\d+)?$/

/**
 * 解析 apk 包行（`name-1.2.3-r4` / `quickjs-2021-03-27-r5`）为名称与版本。
 *
 * Alpine 包名不以数字开头，版本必以数字开头；因此从左向右找**第一个数字开头的段**作为版本起点，
 * 比「从右往左找最后一个 `-`」更稳（后者会把 `quickjs-2021-03-27-r5` 切成 `quickjs-2021-03` + `27-r5`）。
 * 解析失败返回 null（调用方按 unknown 处理），不得静默丢弃。
 * @param {string} line 单行 `apk info -v` 输出
 * @returns {{name: string, version: string} | null}
 */
export function splitApkEntry(line) {
    const text = String(line).trim()
    if (!text) {
        return null
    }
    const parts = text.split('-')
    for (let i = 1; i < parts.length; i += 1) {
        if (!/^\d/.test(parts[i])) {
            continue
        }
        const version = parts.slice(i).join('-')
        if (VERSION_RE.test(version)) {
            return { name: parts.slice(0, i).join('-'), version }
        }
    }
    return null
}

/**
 * 解析 apk 版本为可比较结构：数字段 + 字母版次 + 下划线后缀 + 修订号。
 *
 * 比较顺序为「数字段 → 字母版次（`1.2.3a` 高于 `1.2.3`）→ `_suffix`（`_alpha` < … < `_p`，
 * 无后缀介于 `_rc` 与 `_cvs` 之间）→ `-rN`」。日期型版本（`2021-03-27-r5`）按数字段逐段比较。
 * @param {string} version 形如 `1.2.3-r4` / `1.4` / `2.0_rc1-r0` / `2021-03-27-r5`
 * @returns {{segments: number[], letterRank: number, suffixRank: number, suffixNumber: number, revision: number}}
 */
export function parseApkVersion(version) {
    const match = /^(\d+(?:[.-]\d+)*)([a-z])?(?:_([a-z]+)(\d*))?(?:-r(\d+))?$/.exec(String(version).trim())
    if (!match) {
        throw new Error(`无法解析 apk 版本：${version}`)
    }
    const segments = match[1].split(/[.-]/).map((item) => Number(item))
    const letter = match[2] ?? ''
    const letterRank = letter ? letter.charCodeAt(0) - 'a'.charCodeAt(0) + 1 : 0
    const suffixName = match[3] ?? ''
    const suffixNumber = Number(match[4] || 0)
    const suffixRank = APK_SUFFIX_RANK[suffixName]
    if (suffixRank === undefined) {
        throw new Error(`未知的 apk 版本后缀：${version}`)
    }
    return { segments, letterRank, suffixRank, suffixNumber, revision: Number(match[5] || 0) }
}

/**
 * 比较两个 apk 版本。
 * @param {string} a
 * @param {string} b
 * @returns {number} a < b → 负数；相等 → 0；a > b → 正数
 */
export function compareApkVersion(a, b) {
    const left = parseApkVersion(a)
    const right = parseApkVersion(b)
    const length = Math.max(left.segments.length, right.segments.length)
    for (let i = 0; i < length; i += 1) {
        const diff = (left.segments[i] ?? 0) - (right.segments[i] ?? 0)
        if (diff !== 0) {
            return diff
        }
    }
    if (left.letterRank !== right.letterRank) {
        return left.letterRank - right.letterRank
    }
    if (left.suffixRank !== right.suffixRank) {
        return left.suffixRank - right.suffixRank
    }
    if (left.suffixNumber !== right.suffixNumber) {
        return left.suffixNumber - right.suffixNumber
    }
    return left.revision - right.revision
}

/**
 * 解析采集输出（`node=` / `alpine=` 行 + apk 清单）。
 * @param {string} raw 容器 stdout
 * @returns {{nodeVersion: string, alpineRelease: string, packages: Record<string, string>, unparsed: string[]}}
 */
export function parseSurfaceOutput(raw) {
    let nodeVersion = ''
    let alpineRelease = ''
    const packages = {}
    const unparsed = []
    for (const line of String(raw).split('\n')) {
        const text = line.trim()
        if (!text) {
            continue
        }
        if (text.startsWith('node=')) {
            nodeVersion = text.slice('node='.length)
            continue
        }
        if (text.startsWith('alpine=')) {
            alpineRelease = text.slice('alpine='.length)
            continue
        }
        if (text.startsWith('WARNING:') || text.startsWith('fetch ')) {
            continue
        }
        const entry = splitApkEntry(text)
        if (!entry) {
            unparsed.push(text)
            continue
        }
        packages[entry.name] = entry.version
    }
    if (!nodeVersion || !alpineRelease) {
        throw new Error('采集输出缺 node= / alpine= 行（镜像内命令异常？）')
    }
    return { nodeVersion, alpineRelease, packages, unparsed }
}

/**
 * Alpine 发行版 → secdb 分支（`3.24.4` → `v3.24`）。
 * @param {string} release `/etc/alpine-release` 内容
 * @returns {string}
 */
export function resolveAlpineBranch(release) {
    const match = /^(\d+)\.(\d+)/.exec(String(release).trim())
    if (!match) {
        throw new Error(`无法解析 Alpine 版本：${release}`)
    }
    return `v${match[1]}.${match[2]}`
}

/**
 * 归一化 Node 版本为数字三元组（`v26.13.0-rc.1` → `[26,13,0]`）。
 * @param {string} version
 * @returns {number[] | null} 无法解析返回 null（调用方按 unknown 处理）
 */
export function normalizeNodeVersion(version) {
    const match = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(String(version).trim())
    return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null
}

/**
 * 比较 Node 版本（按数字三元组，忽略预发布后缀）。
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function compareNodeVersion(a, b) {
    const left = normalizeNodeVersion(a)
    const right = normalizeNodeVersion(b)
    if (!left || !right) {
        throw new Error(`无法解析 Node 版本：${left ? b : a}`)
    }
    for (let i = 0; i < 3; i += 1) {
        const diff = left[i] - right[i]
        if (diff !== 0) {
            return diff
        }
    }
    return 0
}

/**
 * 挑选指定 major 线上最新的 security 发布。
 * @param {Array<{version: string, security?: boolean}>} index Node dist index
 * @param {number} major
 * @returns {string | null} 形如 `26.13.1`；该线无 security 发布时返回 null
 */
export function latestSecurityRelease(index, major) {
    let latest = null
    for (const entry of index) {
        const version = String(entry.version ?? '')
        const normalized = normalizeNodeVersion(version)
        if (!normalized || normalized[0] !== major || !entry.security) {
            continue
        }
        if (!latest || compareNodeVersion(version, latest) > 0) {
            latest = version.replace(/^v/, '')
        }
    }
    return latest
}

/**
 * 判定 Node 运行时是否落后于同线最新 security 发布。
 *
 * 三种无法得出「无问题」结论的形态都产出 finding（而不是 null）：
 * 版本串无法解析 → unknown；不在索引的线 → high；该线无 security 记录 → unknown。
 * @param {string} installed 已安装版本（可带 `v`）
 * @param {Array<{version: string, security?: boolean}>} index Node dist index
 * @returns {{id: string, severity: string, source: string, message: string} | null}
 */
export function evaluateNodeRisk(installed, index) {
    const source = 'nodejs.org/dist/index.json'
    const normalized = normalizeNodeVersion(installed)
    const raw = String(installed).trim()
    if (!normalized) {
        return {
            id: `node:${raw}`,
            severity: 'unknown',
            source,
            message: `无法解析 Node 版本 ${raw}（形态变化？），无法判定安全补丁状态`,
        }
    }
    const version = raw.replace(/^v/, '')
    const major = normalized[0]
    const inLine = index.some((entry) => normalizeNodeVersion(entry.version)?.[0] === major)
    if (!inLine) {
        return {
            id: `node:v${version}`,
            severity: 'high',
            source,
            message: `Node v${version} 不在 Node 发布索引中（EOL 线或缺发布记录），无法确认安全补丁状态`,
        }
    }
    const latest = latestSecurityRelease(index, major)
    if (!latest) {
        return {
            id: `node:v${version}`,
            severity: 'unknown',
            source,
            message: `Node v${major} 线在索引中没有 security 发布记录，无法判定`,
        }
    }
    if (compareNodeVersion(version, latest) < 0) {
        return {
            id: `node:v${version}`,
            severity: 'high',
            source,
            message: `Node v${version} 低于 v${major} 线最新 security 发布 v${latest}`,
        }
    }
    return null
}

/**
 * 判定 apk 包是否落后于 secdb 修复版本。
 *
 * 版本比较失败**不得**当作「不落后」：产出 severity=unknown 的 finding（仍使退出码非零），
 * 否则一个真实的过期包会因解析异常被静默放过（审计实证：secdb 中确实存在 `opensmtpd 6.6.2p1-r0`
 * / `cacti 1.2.31-0` 之类非常规版本串）。
 * @param {Record<string, string>} installed 包名 → 版本
 * @param {Record<string, Record<string, string[]>>} secdb 包名 → { 修复版本: [CVE…] }
 * @returns {Array<{id: string, severity: string, source: string, message: string, package: string, installed: string, fixed: string, cves: string[]}>}
 */
export function evaluateApkRisks(installed, secdb) {
    const findings = []
    for (const [name, version] of Object.entries(installed)) {
        const fixes = secdb[name]
        if (!fixes) {
            continue
        }
        const newer = []
        let unparsable = null
        for (const fixed of Object.keys(fixes)) {
            try {
                if (compareApkVersion(fixed, version) > 0) {
                    newer.push(fixed)
                }
            } catch (error) {
                unparsable = { fixed, error }
            }
        }
        if (unparsable) {
            findings.push({
                id: `apk:${name}`,
                severity: 'unknown',
                source: 'secdb.alpinelinux.org',
                message: `${name} ${version} 与 secdb 修复版本 ${unparsable.fixed} 无法比较（${unparsable.error.message}），需人工判定`,
                package: name,
                installed: version,
                fixed: unparsable.fixed,
                cves: fixes[unparsable.fixed] ?? [],
            })
            continue
        }
        if (newer.length === 0) {
            continue
        }
        newer.sort(compareApkVersion)
        const fixed = newer[0]
        const cves = [...new Set(newer.flatMap((item) => fixes[item] ?? []))]
        findings.push({
            id: `apk:${name}`,
            severity: 'unknown',
            source: 'secdb.alpinelinux.org',
            message: `${name} ${version} 低于 secdb 修复版本 ${fixed}（${cves.join(', ') || '未列出 CVE'}）`,
            package: name,
            installed: version,
            fixed,
            cves,
        })
    }
    return findings
}

/**
 * 校验豁免清单：`reason` 必填、`expires` 必填且为 `YYYY-MM-DD`，否则抛错（由调用方转 unknown）。
 * @param {unknown} baseline
 * @returns {Array<{id: string, fixed?: string, reason: string, expires: string}>}
 */
export function validateBaseline(baseline) {
    const items = baseline?.exempt
    if (items === undefined) {
        return []
    }
    if (!Array.isArray(items)) {
        throw new Error('豁免清单 exempt 必须是数组')
    }
    return items.map((item, index) => {
        const label = `豁免清单第 ${index + 1} 项`
        if (!item || typeof item.id !== 'string' || !item.id.trim()) {
            throw new Error(`${label}缺 id`)
        }
        if (typeof item.reason !== 'string' || !item.reason.trim()) {
            throw new Error(`${label}（${item.id}）缺 reason（人工确认理由必填）`)
        }
        if (typeof item.expires !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(item.expires)) {
            throw new Error(`${label}（${item.id}）expires 必须是 YYYY-MM-DD（不允许永久豁免）`)
        }
        if (item.fixed !== undefined && typeof item.fixed !== 'string') {
            throw new Error(`${label}（${item.id}）fixed 必须是字符串`)
        }
        return item
    })
}

/**
 * 过滤豁免清单（到期自动失效，不静默放行）。
 *
 * 匹配口径：`id` 相同且（清单给了 `fixed` 时必须与 finding 的 `fixed` 一致）。只按包名豁免会让
 * 「今天豁免的误报」连带吞掉后续新修复版本，因此鼓励登记 `fixed`。
 * @param {Array<{id: string, fixed?: string}>} findings
 * @param {unknown} baseline
 * @param {string} today `YYYY-MM-DD`
 * @returns {{active: Array<{id: string}>, exempted: Array<{id: string, reason: string, expires: string}>}}
 */
export function applyExemptions(findings, baseline, today) {
    const exemptions = validateBaseline(baseline)
    const live = exemptions.filter((item) => item.expires >= today)
    const exempted = []
    const active = findings.filter((finding) => {
        const hit = live.find((item) => item.id === finding.id && (!item.fixed || item.fixed === finding.fixed))
        if (hit) {
            exempted.push(hit)
            return false
        }
        return true
    })
    return { active, exempted }
}

/**
 * 渲染 Markdown 摘要（CI Job Summary）：镜像 / Node / Alpine / apk 清单 / findings（含数据源）/ 豁免 / 结论。
 * @param {object} report
 * @returns {string}
 */
export function renderSummary(report) {
    const lines = [
        '## Runtime surface check',
        '',
        '| 项 | 值 |',
        '|:--|:--|',
        `| 镜像 | \`${report.image}\` |`,
        `| Node | ${report.nodeVersion || 'unknown'} |`,
        `| Alpine | ${report.alpineRelease || 'unknown'}（分支 ${report.branch || 'unknown'}） |`,
        `| apk 包数 | ${report.packageCount ?? 'unknown'} |`,
        `| 结论 | ${report.verdict} |`,
        '',
    ]
    if (report.findings?.length) {
        lines.push('### Findings', '', '| id | 级别 | 数据源 | 说明 |', '|:--|:--|:--|:--|')
        for (const finding of report.findings) {
            lines.push(`| \`${finding.id}\` | ${finding.severity} | ${finding.source} | ${finding.message} |`)
        }
        lines.push('')
    }
    if (report.exempted?.length) {
        lines.push('### 已豁免', '')
        for (const item of report.exempted) {
            lines.push(`- \`${item.id}\`${item.fixed ? `（fixed ${item.fixed}）` : ''}：${item.reason}；到期 ${item.expires}`)
        }
        lines.push('')
    }
    if (report.packages?.length) {
        lines.push(
            `<details><summary>apk 清单（${report.packages.length}）</summary>`,
            '',
            '| 包 | 版本 |',
            '|:--|:--|',
        )
        for (const [name, version] of report.packages) {
            lines.push(`| ${name} | ${version} |`)
        }
        lines.push('', '</details>', '')
    }
    if (report.error) {
        lines.push('### 数据源 / 环境异常（unknown）', '', `\`${report.error}\``, '')
    }
    return lines.join('\n')
}

/**
 * 读取 JSON（本地路径或 http(s) URL），带超时与体积上限；任何异常抛出（由调用方转 unknown）。
 * @param {string} source 路径或 URL
 * @returns {Promise<unknown>}
 */
export async function loadJson(source) {
    if (!/^https?:\/\//.test(source)) {
        return JSON.parse(readFileSync(source, 'utf-8'))
    }
    const response = await fetch(source, { signal: AbortSignal.timeout(30_000) })
    if (!response.ok) {
        throw new Error(`${source} 返回 HTTP ${response.status}`)
    }
    const buffer = Buffer.from(await response.arrayBuffer())
    if (buffer.byteLength > MAX_JSON_BYTES) {
        throw new Error(`${source} 响应 ${buffer.byteLength} 字节，超过 ${MAX_JSON_BYTES} 上限`)
    }
    return JSON.parse(buffer.toString('utf-8'))
}

/**
 * 从镜像采集运行面清单（一次 `docker run`）。
 * @param {string} image 镜像 ref
 * @param {{exec?: typeof execFileSync}} [deps] 可注入执行器（单测用）
 * @returns {string} 原始 stdout
 */
export function collectSurfaceFromImage(image, deps = {}) {
    const exec = deps.exec ?? execFileSync
    return exec('docker', ['run', '--rm', '--entrypoint', 'sh', image, '-c', COLLECT_SCRIPT], {
        encoding: 'utf-8',
        timeout: 300_000,
    })
}

/**
 * 解析 CLI 参数。
 * @param {string[]} argv
 * @returns {{image: string, nodeIndex: string, secdbDir: string | null, secdbBase: string, summary: string | null, baseline: string, today: string}}
 */
export function parseArgs(argv) {
    // 同时接受 `--name=value` 与 `--name value`（后者仅当下一项不是另一个 flag），与仓库内其它脚本口径一致。
    const read = (name, fallback) => {
        const flag = `--${name}`
        const index = argv.findIndex((item) => item === flag || item.startsWith(`${flag}=`))
        if (index === -1) {
            return fallback
        }
        const current = argv[index]
        if (current.startsWith(`${flag}=`)) {
            return current.slice(flag.length + 1)
        }
        const next = argv[index + 1]
        return next && !next.startsWith('--') ? next : fallback
    }
    return {
        image: read('image', DEFAULT_IMAGE),
        nodeIndex: read('node-index', NODE_INDEX_URL),
        secdbDir: read('secdb-dir', null),
        secdbBase: read('secdb-base', SECDB_BASE_URL),
        summary: read('summary', null),
        baseline: read('baseline', DEFAULT_BASELINE_PATH),
        today: read('today', new Date().toISOString().slice(0, 10)),
    }
}

/**
 * 主流程：采集 → 比对 → 摘要 → 退出码。
 * @param {string[]} argv
 * @param {{log?: Pick<Console, 'log' | 'error'>, collect?: (image: string) => string}} [deps]
 * @returns {Promise<number>} 退出码
 */
export async function main(argv, deps = {}) {
    const log = deps.log ?? console
    const collect = deps.collect ?? collectSurfaceFromImage
    const args = parseArgs(argv)
    const report = {
        image: args.image,
        nodeVersion: '',
        alpineRelease: '',
        branch: '',
        packageCount: null,
        packages: [],
        findings: [],
        exempted: [],
        verdict: 'UNKNOWN（数据源 / 环境异常）',
    }

    try {
        const surface = parseSurfaceOutput(collect(args.image))
        report.nodeVersion = surface.nodeVersion
        report.alpineRelease = surface.alpineRelease
        const packages = Object.entries(surface.packages)
        report.packageCount = packages.length
        report.packages = packages
        if (surface.unparsed.length > 0) {
            throw new Error(`apk 清单有 ${surface.unparsed.length} 行无法解析：${surface.unparsed.slice(0, 3).join(' / ')}`)
        }
        if (packages.length === 0) {
            throw new Error('采集到的 apk 清单为空（apk 库缺失或输出形态变化？），无法判定')
        }
        const branch = resolveAlpineBranch(surface.alpineRelease)
        report.branch = branch

        const nodeIndex = await loadJson(args.nodeIndex)
        if (!Array.isArray(nodeIndex)) {
            throw new Error('Node 发布索引不是数组（形态变化？）')
        }
        const secdb = {}
        for (const repo of ['main', 'community']) {
            const source = args.secdbDir
                ? join(resolve(args.secdbDir), branch, `${repo}.json`)
                : `${args.secdbBase}/${branch}/${repo}.json`
            if (args.secdbDir && !existsSync(source)) {
                continue
            }
            const data = await loadJson(source)
            if (!Array.isArray(data?.packages)) {
                throw new Error(`${source} 缺 packages 数组（形态变化？）`)
            }
            for (const entry of data.packages) {
                const pkg = entry?.pkg
                if (!pkg?.name || typeof pkg.secfixes !== 'object' || pkg.secfixes === null) {
                    continue
                }
                secdb[pkg.name] = { ...(secdb[pkg.name] ?? {}), ...pkg.secfixes }
            }
        }
        if (Object.keys(secdb).length === 0) {
            throw new Error(`分支 ${branch} 的 secdb 没有可用 secfixes（数据源异常）`)
        }

        const nodeFinding = evaluateNodeRisk(surface.nodeVersion, nodeIndex)
        const apkFindings = evaluateApkRisks(surface.packages, secdb)
        const baseline = existsSync(args.baseline)
            ? JSON.parse(readFileSync(args.baseline, 'utf-8'))
            : { exempt: [] }
        const { active, exempted } = applyExemptions(
            [...(nodeFinding ? [nodeFinding] : []), ...apkFindings],
            baseline,
            args.today,
        )
        report.findings = active
        report.exempted = exempted
        report.verdict = active.length > 0 ? 'FAIL（命中 findings）' : 'PASS'
        log.log(`[runtime-surface] 镜像 ${args.image}：Node ${surface.nodeVersion} / Alpine ${surface.alpineRelease}（${report.packageCount} 个 apk）`)
        for (const finding of active) {
            log.log(`[runtime-surface] ${finding.severity} ${finding.id}（${finding.source}）：${finding.message}`)
        }
        for (const item of exempted) {
            log.log(`[runtime-surface] 豁免 ${item.id}（${item.reason}；到期 ${item.expires}）`)
        }
        log.log(`[runtime-surface] 结论：${report.verdict}`)
    } catch (error) {
        report.error = error instanceof Error ? error.message : String(error)
        report.verdict = 'UNKNOWN（数据源 / 环境异常）'
        log.error(`[runtime-surface] UNKNOWN：${report.error}`)
    }

    try {
        if (args.summary) {
            writeFileSync(args.summary, `${renderSummary(report)}\n`, 'utf-8')
        }
    } catch (error) {
        report.error = `写入摘要失败：${error instanceof Error ? error.message : String(error)}`
        log.error(`[runtime-surface] UNKNOWN：${report.error}`)
    }

    if (report.error) {
        return EXIT_UNKNOWN
    }
    return report.findings.length > 0 ? EXIT_FINDINGS : EXIT_CLEAN
}

if (isDirectExecution(import.meta.url)) {
    process.exitCode = await main(process.argv.slice(2))
}
