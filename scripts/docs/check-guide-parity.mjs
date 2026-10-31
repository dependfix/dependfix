/**
 * check-guide-parity.mjs —— 中英指南「事实平价」机检。
 *
 * 背景：`docs/i18n/en-US/guide/{configuration,quick-start}.md` 是 `docs/guide/` 的镜像，
 * 长期靠人工同步：zh 侧新增配置项 / CLI 参数 / Action 输入后，en 侧静默落后（历史上
 * configuration 整节「环境变量」缺失、quick-start 少 23 个 CLI 参数）。译文措辞无法机检，
 * 但**键位**（env 变量 / CLI 参数 / Action 输入）与**章节骨架**（H2 / H3 数量）可以。
 *
 * 约定：
 * - 平价方向是 `en ⊇ zh`（en 可以多出面向英文读者的小节，如 Exit codes / Next steps）
 * - 只比较键位集合，不比较说明文字（措辞差异属翻译范畴）
 * - 差异一律失败；确属 zh 专有的键位须登记到 `EXEMPTIONS` 并写明理由
 *
 * 用法：
 *   node scripts/docs/check-guide-parity.mjs                 # 全量检查，输出差异明细
 *   node scripts/docs/check-guide-parity.mjs --json          # 机读
 *   node scripts/docs/check-guide-parity.mjs --root=<dir>    # 自测用：改读指定根下的夹具
 */
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getCliArgs, isDirectExecution } from '../shared/cli.mjs'
import { fenceMask } from './md-scan.mjs'

/** 指南对（zh 事实源 → en 镜像）与各自要比对的键位类别 */
export const GUIDE_PAIRS = [
    { id: 'configuration', zh: 'docs/guide/configuration.md', en: 'docs/i18n/en-US/guide/configuration.md', kinds: ['env'] },
    { id: 'quick-start', zh: 'docs/guide/quick-start.md', en: 'docs/i18n/en-US/guide/quick-start.md', kinds: ['env', 'flag', 'action-input'] },
]

/**
 * 豁免项：确属 zh 专有、en 不应对等出现的键位。
 * 每条必须写明理由与移除条件，否则平价门禁会一直误报。
 */
export const EXEMPTIONS = {
    // 当前无豁免项：zh 侧所有键位都应与 en 镜像对等。
    // 新增豁免时形如：'quick-start:flag:--history': 'en 侧该能力未发布，随 1.0 同步后移除',
}

/** Action 输入表格的定位标题（zh / en 两侧各一） */
const ACTION_INPUT_HEADINGS = {
    zh: 'Action 输入参数',
    en: 'Action inputs',
}

/** 本脚本自身的仓库根（CLI 与单测同口径，避免 process.cwd() 依赖） */
const SCRIPT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

/**
 * 中英 H2 标题映射：zh 事实源的每个 H2 必须有对应的 en H2。
 * 只比数量时「删一节 + 加一节」可蒙混过关（曾被审计实测），因此显式登记映射；
 * zh 侧标题改名时这里会 fail-closed（提示映射过期），不会静默失效。
 */
export const HEADING_PAIRS = {
    configuration: [
        ['配置来源（按优先级）', 'Configuration sources (by priority)'],
        ['全部配置项', 'All configuration items'],
        ['GitHub 认证 Token 权限映射', 'GitHub auth token permission mapping'],
        ['配置文件示例', 'Config file'],
        ['环境变量', 'Environment variables'],
        ['平台配置（apps/platform）', 'Platform configuration (apps/platform)'],
    ],
    'quick-start': [
        ['前置要求', 'Prerequisites'],
        ['安装', 'Installation'],
        ['基本使用', 'Basic Usage'],
        ['GitHub Action 使用', 'GitHub Action usage'],
        ['安全注意事项', 'Security considerations'],
        ['CLI 参数', 'CLI flags'],
        ['报告', 'Reports'],
        ['GitHub App 配置（M18.3 接入）', 'GitHub App configuration (M18.3)'],
    ],
}

const FLAG_RE = /(?<![-\w])--[a-z][a-z0-9-]*/g
/** 全量 `UPPER_SNAKE`（至少一个下划线） */
const ENV_RE = /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g

/**
 * 常量名 denylist：`UPPER_SNAKE` 会把代码常量（如 `PRE_EXISTING_FAILURE`）当成环境变量抓进来。
 * 当前两篇指南的常量集完全一致（zh-only = 0），故清单为空；一旦某常量只在 zh / en 一侧出现，
 * 先确认它是不是环境变量，不是则登记到这里（附一句为什么）。
 */
const ENV_DENYLIST = new Set([])
const HEADING_RE = /^(#{2,3})\s+(.+)$/

/** 移除行内代码与代码块后再取标题（避免把示例里的 `#` 当标题） */
function proseLines(content) {
    const lines = content.split(/\r?\n/)
    const mask = fenceMask(lines)
    return lines.filter((line, idx) => !mask[idx]).map((line) => line.replace(/`[^`]*`/g, ''))
}

/**
 * 统计指定层级的标题数（不含代码块内）。
 * 标题文本无法跨语言比对，故平价以「数量不少于」为判据（en 允许追加小节）。
 */
export function countHeadings(content, level) {
    const prefix = '#'.repeat(level)
    return proseLines(content).filter((line) => {
        const m = line.match(HEADING_RE)
        return m !== null && m[1] === prefix
    }).length
}

/** 列出某层级的标题文本（跳过代码块） */
export function headingTitles(content, level) {
    const prefix = '#'.repeat(level)
    return proseLines(content)
        .map((line) => line.match(HEADING_RE))
        .filter((m) => m !== null && m[1] === prefix)
        .map((m) => m[2].trim())
}

/**
 * 提取 CLI 参数集合（`--flag` 形态）。
 * 键位通常写在反引号里、env 示例写在代码块里，故两类提取都直接扫原文，不做行内代码剥离。
 */
export function extractFlags(content) {
    return new Set(content.match(FLAG_RE) ?? [])
}

/** 提取环境变量集合（全量 UPPER_SNAKE，扣除常量 denylist） */
export function extractEnvVars(content) {
    return new Set((content.match(ENV_RE) ?? []).filter((token) => !ENV_DENYLIST.has(token)))
}

/**
 * 提取某标题之后第一张表格的首列键位（Action 输入 / CLI 参数表）。
 * 表格结束条件：出现非表格行。
 */
export function extractTableKeys(content, heading) {
    const lines = content.split(/\r?\n/)
    const mask = fenceMask(lines)
    const start = lines.findIndex((line, idx) => !mask[idx] && new RegExp(`^#{2,3}\\s+${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`).test(line))
    if (start < 0) {
        return new Set()
    }
    const keys = new Set()
    let inTable = false
    for (let i = start + 1; i < lines.length; i++) {
        if (mask[i]) {
            continue
        }
        const line = lines[i]
        if (/^#{1,6}\s/.test(line)) {
            break
        }
        if (/^\s*\|/.test(line)) {
            inTable = true
            const first = line.split('|')[1]?.trim() ?? ''
            if (!first || /^:?-+:?$/.test(first) || first === '参数' || first === 'Action input' || first === 'Input') {
                continue
            }
            const key = first.replace(/`/g, '').trim()
            if (key) {
                keys.add(key)
            }
            continue
        }
        if (inTable && line.trim() === '') {
            break
        }
    }
    return keys
}

/** 从内容中取出某一类键位集合 */
export function extractKeys(content, kind) {
    switch (kind) {
        case 'flag':
            return extractFlags(content)
        case 'env':
            return extractEnvVars(content)
        case 'action-input':
            return extractTableKeys(content, ACTION_INPUT_HEADINGS.zh)
        case 'action-input-en':
            return extractTableKeys(content, ACTION_INPUT_HEADINGS.en)
        default:
            throw new Error(`unknown kind: ${kind}`)
    }
}

/**
 * 计算某对指南的平价差异。
 * @returns {{ id: string, missing: Array<{ kind: string, key: string }>, headingGaps: Array<{ level: number, zh: number, en: number }> }}
 */
export function comparePair(pair, readFile) {
    const zh = readFile(pair.zh)
    const en = readFile(pair.en)
    const errors = []
    const missing = []
    const missingExemptions = []
    const usedExemptions = new Set()

    for (const kind of pair.kinds) {
        const enKind = kind === 'action-input' ? 'action-input-en' : kind
        const zhKeys = extractKeys(zh, kind)
        const enKeys = extractKeys(en, enKind)
        // fail-closed：声明了这一类却在 zh 侧取不到键位，说明标题改名或表格缺失，
        // 静默通过等于把门禁关掉
        if (zhKeys.size === 0) {
            errors.push(`${kind}: zh 侧未提取到任何键位（标题改名或表格缺失？请同步脚本的定位标题）`)
            continue
        }
        for (const key of [...zhKeys].sort()) {
            if (enKeys.has(key)) {
                continue
            }
            const exemptionKey = `${pair.id}:${kind}:${key}`
            if (EXEMPTIONS[exemptionKey]) {
                usedExemptions.add(exemptionKey)
                continue
            }
            missing.push({ kind, key })
        }
    }

    // H2 标题映射：zh 的每个 H2 必须落在 en 的对应小节上（数量相等拦不住「删一节加一节」）
    const zhH2 = headingTitles(zh, 2)
    const enH2 = headingTitles(en, 2)
    const headingMapGaps = []
    const headingPairs = HEADING_PAIRS[pair.id]
    if (!headingPairs || headingPairs.length === 0) {
        errors.push(`H2 映射未登记: 请为 ${pair.id} 在 HEADING_PAIRS 中列出 zh→en 标题对（否则只比数量，可被「删一节加一节」绕过）`)
    }
    for (const [zhTitle, enTitle] of headingPairs ?? []) {
        if (!zhH2.includes(zhTitle)) {
            errors.push(`H2 映射过期: zh 侧已无「${zhTitle}」，请更新 HEADING_PAIRS`)
            continue
        }
        if (!enH2.includes(enTitle)) {
            headingMapGaps.push({ zh: zhTitle, en: enTitle })
        }
    }

    const headingGaps = [2, 3]
        .map((level) => ({ level, zh: countHeadings(zh, level), en: countHeadings(en, level) }))
        .filter((gap) => gap.en < gap.zh)

    return { id: pair.id, errors, missing, headingGaps, headingMapGaps, missingExemptions, usedExemptions }
}

/** 检查豁免表自身的健康度：键必须能解析、理由必须非空、且当前确实仍有缺口 */
export function auditExemptions(results) {
    const problems = []
    for (const [key, reason] of Object.entries(EXEMPTIONS)) {
        if (key.split(':').length !== 3) {
            problems.push(`豁免键格式应为 guide:kind:key: ${key}`)
        }
        if (typeof reason !== 'string' || reason.trim().length < 4) {
            problems.push(`豁免缺少可用理由: ${key}`)
        }
    }
    const used = new Set(results.flatMap((r) => [...r.usedExemptions]))
    for (const key of Object.keys(EXEMPTIONS)) {
        if (!used.has(key)) {
            problems.push(`豁免未被命中（缺口已消失，应删除）: ${key}`)
        }
    }
    return problems
}

/** 全量检查（读取仓库根下的指南对） */
export function checkGuideParity(repoRoot) {
    return GUIDE_PAIRS.map((pair) => comparePair(pair, (rel) => readFileSync(join(repoRoot, rel), 'utf8')))
}

if (isDirectExecution(import.meta.url)) {
    const args = getCliArgs()
    const json = args.includes('--json')
    // `--root=<dir>` 仅供自测：默认按脚本位置定位仓库根，避免依赖调用方 cwd
    const rootArg = args.find((a) => a.startsWith('--root='))
    const results = checkGuideParity(rootArg ? resolve(rootArg.slice('--root='.length)) : SCRIPT_ROOT)
    const exemptionProblems = auditExemptions(results)
    const failed = results.filter((r) => r.errors.length > 0 || r.missing.length > 0
        || r.headingGaps.length > 0 || r.headingMapGaps.length > 0)

    if (json) {
        console.log(JSON.stringify({ results, exemptionProblems }, null, 2))
    } else {
        for (const result of results) {
            if (result.errors.length === 0 && result.missing.length === 0
                && result.headingGaps.length === 0 && result.headingMapGaps.length === 0) {
                console.log(`[check-guide-parity] OK: ${result.id}`)
                continue
            }
            console.error(`[check-guide-parity] FAIL: ${result.id}`)
            for (const message of result.errors) {
                console.error(`  - ${message}`)
            }
            for (const gap of result.headingMapGaps) {
                console.error(`  - 缺少 H2 小节：「${gap.zh}」→ 期望 en「${gap.en}」`)
            }
            for (const gap of result.headingGaps) {
                console.error(`  - H${gap.level} 数量不足：zh ${gap.zh} / en ${gap.en}`)
            }
            for (const item of result.missing) {
                console.error(`  - 缺少 ${item.kind}: ${item.key}`)
            }
        }
        for (const problem of exemptionProblems) {
            console.error(`[check-guide-parity] 豁免表问题: ${problem}`)
        }
    }

    if (failed.length > 0 || exemptionProblems.length > 0) {
        process.exit(1)
    }
}
