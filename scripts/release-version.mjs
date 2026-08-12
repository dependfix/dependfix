/**
 * release-version.mjs —— 版本提升执行器（替代 changeset version）
 *
 * 消费 release-plan.md（由 release:plan 生成，可人工 review/修正 bump 级别），
 * 完成版本提升：
 * - 依赖传导：复刻 changesets updateInternalDependencies: patch 语义——被依赖方
 *   bump 后，所有（直接/间接）依赖它的发布包至少 patch 跟随并重新发布，
 *   保证 npm registry 上依赖方的依赖范围指向新版本。
 *   **关键简化**：各包依赖范围均为 `workspace:*`，pnpm publish 发布时自动替换
 *   为实际版本，因此本脚本不改写依赖范围字段，只负责版本提升。
 * - 版本写回：更新各包 package.json 的 version 字段（UTF8 无 BOM），
 *   其余字段原样保留（JSON.parse/stringify 保持 key 顺序；缩进与末尾换行
 *   跟随原文件——.editorconfig 约定 package.json 为 2 空格、无末尾换行）。
 *
 * 用法：
 *   pnpm release:version            # 消费 release-plan.md，写回版本并删除计划文件
 *   pnpm release:version --dry-run  # 仅预览变更（版本计算 + 传导），不写回
 *   pnpm release:version --force    # 跳过"工作区干净"检查（版本写回前默认要求
 *                                   # 工作区除 release-plan.md 外无未提交变更）
 *
 * 前置：release-plan.md 必须存在（先运行 pnpm release:plan）；
 *       preMajor（0.x）规则已由 release:plan 推导时定好，此处按计划级别直接递增。
 */
import { execSync } from 'node:child_process'
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { PUBLISHABLE_PACKAGES } from './packages.config.mjs'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const PLAN_FILE = join(repoRoot, 'release-plan.md')

const BUMP_RANK = { patch: 1, minor: 2, major: 3 }
const VALID_BUMPS = new Set(Object.keys(BUMP_RANK))

/** 发布包名集合（校验计划文件中的包名） */
const KNOWN_PKGS = new Set(PUBLISHABLE_PACKAGES.map((p) => p.pkg))

/** 计划文件 frontmatter 解析：`'pkg': bump` 每行一个（沿用 changeset 单引号风格） */
const PLAN_LINE = /^\s*'([^']+)':\s*(patch|minor|major)\s*$/

/**
 * 解析 release-plan.md 内容。
 * @returns {{ plan: Map<string, string>, summary: string }}
 * @throws 计划文件缺 frontmatter、含未知包名或非法 bump 时抛错（错误语义明确）
 */
export function parsePlan(content) {
    // 闭合 `---` 前的换行可省略（容忍空 frontmatter：`---\n---`），由后续包条目校验兜底
    const match = /^---\r?\n([\s\S]*?)\r?\n?---\r?\n?([\s\S]*)$/.exec(content)
    if (!match) {
        throw new Error('release-plan.md 缺少 frontmatter（--- 起始块），格式无效')
    }
    const plan = new Map()
    for (const line of match[1].split(/\r?\n/)) {
        if (!line.trim()) {
            continue
        }
        const m = PLAN_LINE.exec(line)
        if (!m) {
            throw new Error(`release-plan.md frontmatter 行格式无效: ${line}`)
        }
        const [, pkg, bump] = m
        if (!KNOWN_PKGS.has(pkg)) {
            throw new Error(`release-plan.md 包含未知发布包: ${pkg}（须在 packages.config.mjs 登记）`)
        }
        plan.set(pkg, bump)
    }
    if (plan.size === 0) {
        throw new Error('release-plan.md frontmatter 无任何包条目')
    }
    return { plan, summary: match[2].trim() }
}

/**
 * semver 版本递增（仅支持 x.y.z 纯数字，无预发布后缀场景）。
 * @example incVersion('0.2.0', 'minor') → '0.3.0'
 */
export function incVersion(version, bump) {
    if (!VALID_BUMPS.has(bump)) {
        throw new Error(`非法 bump 级别: ${bump}`)
    }
    const parts = version.split('.')
    if (parts.length !== 3 || parts.some((p) => !/^\d+$/.test(p))) {
        throw new Error(`无法递增的版本号: ${version}（期望 x.y.z 纯数字）`)
    }
    const [major, minor, patch] = parts.map(Number)
    switch (bump) {
        case 'patch':
            return `${major}.${minor}.${patch + 1}`
        case 'minor':
            return `${major}.${minor + 1}.0`
        case 'major':
            return `${major + 1}.0.0`
    }
}

/**
 * 构建反向依赖图：发布包 pkg → 直接依赖它的发布包集合。
 * 只统计 dependencies 中的 workspace:* 引用（devDependencies 不传导）。
 * readDeps 注入（便于测试）：(pkgPath) => Record<string, string>
 */
export function buildDepGraph(packages, readDeps) {
    const pkgToPath = new Map(packages.map((p) => [p.pkg, p.path]))
    const graph = new Map(packages.map((p) => [p.pkg, new Set()]))
    for (const p of packages) {
        const deps = readDeps(p.path) ?? {}
        for (const [name, range] of Object.entries(deps)) {
            if (range.startsWith('workspace:') && pkgToPath.has(name)) {
                graph.get(name).add(p.pkg)
            }
        }
    }
    return graph
}

/**
 * 依赖传导闭包：初始计划之外的包，凡（直接/间接）依赖计划内或已传导包，
 * 至少 patch 跟随（updateInternalDependencies: patch 语义）。
 * 已在计划内的包保持原计划级别（传导不降级）。
 * @returns {Map<string, string>} pkg → 最终 bump 级别
 */
export function computeBumps(plan, depGraph) {
    const result = new Map(plan)
    const queue = [...plan.keys()]
    while (queue.length > 0) {
        const pkg = queue.shift()
        for (const dep of depGraph.get(pkg) ?? []) {
            const current = result.get(dep)
            if (!current || BUMP_RANK.patch > BUMP_RANK[current]) {
                result.set(dep, 'patch')
                queue.push(dep)
            }
        }
    }
    return result
}

/** 渲染变更摘要（每行 `pkg: from → to (bump，来源)`）；planned 为计划内包集合 */
export function renderSummary(bumps, versionOf, planned) {
    const lines = []
    for (const [pkg, bump] of bumps) {
        const source = planned.has(pkg) ? '计划' : '传导'
        lines.push(`  ${pkg}: ${versionOf(pkg)} → ${incVersion(versionOf(pkg), bump)} (${bump}，${source})`)
    }
    return lines.join('\n')
}

function git(args) {
    return execSync(`git ${args}`, { cwd: repoRoot, encoding: 'utf8' }).trim()
}

/** 工作区干净检查：除 release-plan.md 外无未提交变更（版本写回前防御） */
function ensureCleanWorkspace() {
    const dirty = git('status --porcelain')
        .split('\n')
        .filter((line) => line && !line.trim().endsWith('release-plan.md'))
    if (dirty.length > 0) {
        throw new Error(
            `工作区存在未提交变更，版本写回可能污染发布提交：\n${dirty.join('\n')}\n请先提交或使用 --force 跳过检查`,
        )
    }
}

/**
 * 序列化写回内容：保持原文件的缩进与末尾换行风格，避免格式化重排
 * （.editorconfig 约定 package.json 为 2 空格缩进、无末尾换行；检测不到
 * 缩进时回退 2 空格）。
 * @param {object} pkgJson 写回的对象（version 已更新）
 * @param {string} raw 原文件内容
 * @returns {string} 写回文本
 */
export function serializePkgJson(pkgJson, raw) {
    const indent = raw.match(/\n( +)"/)?.[1] ?? '  '
    const trailing = raw.endsWith('\n') ? '\n' : ''
    return JSON.stringify(pkgJson, null, indent) + trailing
}

export function main() {
    const dryRun = process.argv.includes('--dry-run')
    const force = process.argv.includes('--force')
    const pkgPath = new Map(PUBLISHABLE_PACKAGES.map((p) => [p.pkg, p.path]))

    let content
    try {
        content = readFileSync(PLAN_FILE, 'utf8')
    } catch (err) {
        if (err?.code === 'ENOENT') {
            console.error('未找到 release-plan.md，请先运行 pnpm release:plan')
            process.exit(1)
        }
        throw err
    }

    const { plan, summary } = parsePlan(content)
    const depGraph = buildDepGraph(PUBLISHABLE_PACKAGES, (path) =>
        JSON.parse(readFileSync(join(repoRoot, path, 'package.json'), 'utf8')).dependencies,
    )
    const bumps = computeBumps(plan, depGraph)
    const versionOf = (pkg) =>
        JSON.parse(readFileSync(join(repoRoot, pkgPath.get(pkg), 'package.json'), 'utf8')).version

    console.log(`消费 release-plan.md：${[...plan.entries()].map(([p, b]) => `${p} ${b}`).join('，')}`)
    console.log(`版本变更：\n${renderSummary(bumps, versionOf, new Set(plan.keys()))}`)
    if (summary) {
        console.log(`summary：${summary}`)
    }

    if (dryRun) {
        console.log('dry-run 完成，未写回任何版本')
        return
    }
    if (!force) {
        ensureCleanWorkspace()
    }
    for (const [pkg, bump] of bumps) {
        const file = join(repoRoot, pkgPath.get(pkg), 'package.json')
        const raw = readFileSync(file, 'utf8')
        const pkgJson = JSON.parse(raw)
        pkgJson.version = incVersion(pkgJson.version, bump)
        // 保持原缩进与行尾风格写回（不重排格式，UTF8 无 BOM）
        writeFileSync(file, serializePkgJson(pkgJson, raw), 'utf8')
    }
    unlinkSync(PLAN_FILE)
    console.log(`已更新 ${bumps.size} 个包版本，release-plan.md 已删除`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main()
}
