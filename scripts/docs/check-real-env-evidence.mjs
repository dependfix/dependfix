/**
 * check-real-env-evidence.mjs —— G3 真实环境矩阵的证据模板生成与字段校验
 *
 * 背景：1.0 门槛 G3 要求 G3.0–G3.9 各留一条真实环境证据，但实跑依赖外部资源
 * （OAuth / IdP / staging / 测试仓 / AI Key）。本脚本负责两件事：
 * 1. `--init`：为每条路径生成证据模板（`artifacts/real-env/<path>.md`，gitignored）；
 * 2. 默认：校验已有证据文件的 frontmatter 字段完整性与状态一致性，缺字段 / 引用文件
 *    不存在 / 状态与字段不匹配即失败——避免「只写一句通过」的伪证据。
 *
 * 口径见 [真实环境矩阵指南](../../docs/guide/real-env-matrix.md)：`pending` 只代表模板，
 * 不得据此判定 G3 通过；`passed` 必须带可复核的命令、执行人、环境与证据文件。
 *
 * 用法：
 *   pnpm check:real-env                       # 校验 artifacts/real-env 下的证据（无目录 = 未开始）
 *   pnpm check:real-env --init                # 生成缺失的模板（已存在则跳过）
 *   pnpm check:real-env --require=G3.1,G3.8   # 额外要求这些路径为 passed（发布前门禁用）
 *   pnpm check:real-env --require-all         # 要求 G3.0–G3.9 全部 passed
 *   pnpm check:real-env --json                # 机器可读报告
 *
 * 退出码：0 通过 / 1 校验失败或未满足 --require / 2 参数错误。
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { parse as parseYaml } from 'yaml'
import { isDirectExecution, parseCliOptions } from '../shared/cli.mjs'

// path.resolve 去掉 URL 形态带来的尾分隔符——否则 `${repoRoot}${path.sep}` 会变成 `//`，
// 让所有仓库内相对路径都被判成「越界」（真实证据恒失败）。
const repoRoot = path.resolve(fileURLToPath(new URL('../..', import.meta.url)))
export const DEFAULT_DIR = 'artifacts/real-env'

/** G3 路径清单（唯一权威；指南与台账引用同一编号）。 */
export const REAL_ENV_PATHS = [
    'G3.0', 'G3.1', 'G3.2', 'G3.3', 'G3.4', 'G3.5', 'G3.6', 'G3.7', 'G3.8', 'G3.9',
]
export const STATUSES = ['pending', 'partial', 'passed', 'blocked', 'failed']

/** 每条路径的下一次动作（模板里直接可执行，避免空模板）。 */
const NEXT_ACTIONS = {
    'G3.0': '准备 GitHub OAuth App 与 IdP OIDC client（Google 凭据暂不可用——无可用 Google 账号，跳过并待补测），按指南 G3.0 跑 GitHub / OIDC 各一次并回填截图与会话字段',
    'G3.1': '用只读 token 对测试仓跑一次 report-only，回填告警数与 MD / JSON 报告路径',
    'G3.2': '用可写测试仓跑一次 fix-and-pr，回填分支 / commit / PR URL 与验证链输出',
    'G3.3': '在消费者测试仓配置 Action 并 workflow_dispatch，回填 run id / 日志 / PR',
    'G3.4': '在 staging 触发一次真实扫描与一次定时触发，回填 run id 与状态流转',
    'G3.5': '用真实凭据触发 PR Check polling 与一次邮件投递，回填落库记录与邮件原文（脱敏）',
    'G3.6': '在 Claude / Copilot / Cursor 任一客户端配置 MCP Server，回填 tool 调用记录',
    'G3.7': '安装 Agent Skill 并完成一次对话式修复，回填安装输出与 PR',
    'G3.8': '按指南复核 @latest 安装 / Docker 多架构与 health / 0.5.x→1.0 升级（0.7.0 仅作中间验证；本地预演已作为 partial 证据）',
    'G3.9': '准备 2 家 AI provider 的 Key 与预算（单次 ≤ ¥20），按 5 场景各跑一次并回填费用',
}

/**
 * 各状态必须提供的字段。
 *
 * 差异是刻意的：`pending` 只是模板（只需下一步动作）；`blocked` 已尝试但被外部资源挡住，
 * 因此要阻塞原因 / 重试条件而**不**要求 evidence；`partial` / `passed` / `failed` 必须有
 * 可复核的 `evidence`——不要为了「统一」把 blocked 也要求 evidence。
 */
const REQUIRED_FIELDS = {
    pending: ['path', 'status', 'next_action'],
    blocked: ['path', 'status', 'executed_at', 'operator', 'environment', 'commands', 'result', 'blocked_reason', 'retry_condition'],
    partial: ['path', 'status', 'executed_at', 'operator', 'environment', 'commands', 'evidence', 'result'],
    passed: ['path', 'status', 'executed_at', 'operator', 'environment', 'commands', 'evidence', 'result'],
    failed: ['path', 'status', 'executed_at', 'operator', 'environment', 'commands', 'evidence', 'result'],
}

const isNonEmptyString = (value) => typeof value === 'string' && value.trim() !== ''

/**
 * 证据路径解析：绝对路径原样使用（便于 CI / 临时目录），相对路径相对仓库根且不得越界。
 *
 * @returns {string|null} 绝对路径；越出仓库根时返回 null
 */
export function resolveEvidencePath(value) {
    const resolved = path.resolve(repoRoot, value)
    if (!path.isAbsolute(value) && !isInsideRepo(resolved)) {
        return null
    }
    return resolved
}

/** 绝对路径是否落在仓库内（干净检出可复核）。 */
export function isInsideRepo(absolutePath) {
    // Windows 盘符大小写 / 分隔符形态不一致会让前缀比较失配；只影响 warning 判定，
    // 但归一化后比较可避免「仓库内绝对路径被判仓外」的假告警。
    const normalize = (value) => {
        const resolved = path.resolve(value)
        return process.platform === 'win32' ? resolved.toLowerCase() : resolved
    }
    const target = normalize(absolutePath)
    const root = normalize(repoRoot)
    return target === root || target.startsWith(`${root}${path.sep}`)
}

/** 证据必须是真实存在且非空的文件。 */
const defaultEvidenceExists = (value) => {
    const absolute = resolveEvidencePath(value)
    if (!absolute) {
        return false
    }
    try {
        const stat = statSync(absolute)
        return stat.isFile() && stat.size > 0
    } catch {
        return false
    }
}
const isStringArray = (value) => Array.isArray(value) && value.length > 0 && value.every(isNonEmptyString)

/** 参数错误（退出码 2）。 */
export class CliUsageError extends Error {}

/** 解析 CLI 参数。 */
export function parseCli(argv = process.argv) {
    return parseCliOptions(argv, {
        defaults: { dir: DEFAULT_DIR, init: false, initForce: false, requireAll: false, requirePaths: [], json: false, checkFiles: true },
        flags: {
            '--init': { key: 'init', value: true },
            '--init-force': { key: 'initForce', value: true },
            '--require-all': { key: 'requireAll', value: true },
            '--no-check-files': { key: 'checkFiles', value: false },
            '--json': { key: 'json', value: true },
            '--help': { key: 'help', value: true },
        },
        values: {
            '--dir': { key: 'dir' },
            '--require': {
                key: 'requirePaths',
                parse: (raw) => {
                    const paths = raw.split(',').map((item) => item.trim()).filter(Boolean)
                    if (paths.length === 0) {
                        throw new CliUsageError('--require 不能为空（形如 --require=G3.1,G3.8）')
                    }
                    return paths
                },
            },
        },
    })
}

/** 拆分 frontmatter 与正文（无 frontmatter 返回 null）。 */
export function splitFrontmatter(text) {
    const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text)
    if (!match) {
        return null
    }
    return { frontmatter: match[1], body: match[2] }
}

/**
 * 校验单份证据（纯函数，便于单测）。
 *
 * @param {{file: string, expectedPath: string, text: string, fileExists?: (p: string) => boolean}} input
 * @returns {{ problems: string[], meta: object, warnings: string[] }} 问题列表（空 = 通过）与解析结果
 */
export function validateEvidence({ file, expectedPath, text, fileExists = defaultEvidenceExists }) {
    const problems = []
    const warnings = []
    const parts = splitFrontmatter(text ?? '')
    if (!parts) {
        return { problems: [`${file}：缺少 YAML frontmatter（以 --- 包裹的字段块）`], meta: {}, warnings }
    }
    let meta
    try {
        meta = parseYaml(parts.frontmatter) ?? {}
    } catch (error) {
        return { problems: [`${file}：frontmatter 不是合法 YAML（${error instanceof Error ? error.message : String(error)}）`], meta: {}, warnings }
    }
    const status = meta.status
    if (!STATUSES.includes(status)) {
        problems.push(`${file}：status 必须是 ${STATUSES.join(' / ')} 之一，收到 ${String(status)}`)
        return { problems, meta, warnings }
    }
    if (!REAL_ENV_PATHS.includes(meta.path)) {
        problems.push(`${file}：path 必须是 G3.0–G3.9 之一，收到 ${String(meta.path)}`)
    } else if (meta.path !== expectedPath) {
        problems.push(`${file}：path=${meta.path} 与文件名 ${expectedPath} 不一致`)
    }

    for (const field of REQUIRED_FIELDS[status]) {
        const value = meta[field]
        const ok = field === 'commands' || field === 'evidence'
            ? isStringArray(value)
            : isNonEmptyString(value)
        if (!ok) {
            let reason = '不能为空'
            if (field === 'commands' || field === 'evidence') {
                reason = '不能为空（需非空字符串数组）'
            } else if (field === 'executed_at' && value !== undefined && value !== null) {
                reason = '需为字符串形式的 ISO 时间'
            }
            problems.push(`${file}：status=${status} 时 ${field} ${reason}`)
        }
    }

    if (isNonEmptyString(meta.executed_at)) {
        const value = meta.executed_at
        const year = Number(value.slice(0, 4))
        const isIso = /^\d{4}-\d{2}-\d{2}T/.test(value)
        if (!isIso || Number.isNaN(Date.parse(value)) || year < 2000 || year > 2100) {
            problems.push(`${file}：executed_at 需为 2000–2100 年间的 ISO 时间（形如 2026-11-01T10:00:00+08:00），收到 ${value}`)
        }
    }
    if (Array.isArray(meta.resources) && !meta.resources.every((item) => typeof item === 'string')) {
        problems.push(`${file}：resources 必须是字符串数组`)
    }

    // 证据必须是真实存在且非空的文件：只写路径不落文件 / 指目录属伪证据。
    // `check_files: false` 与 `--no-check-files` 是迁移逃生阀，跳过时必须在报告里留 warning（不得静默）。
    if (Array.isArray(meta.evidence)) {
        const skipFileCheck = meta.check_files === false
        if (skipFileCheck) {
            warnings.push(`${file}：frontmatter 声明 check_files: false，已跳过证据存在性校验（不得作为通过依据）`)
        }
        for (const item of meta.evidence) {
            if (!isNonEmptyString(item) || skipFileCheck) {
                continue
            }
            if (!fileExists(item)) {
                problems.push(`${file}：证据文件不存在或不是非空文件（相对路径须落在仓库根内）：${item}`)
                continue
            }
            const absolute = resolveEvidencePath(item)
            if (absolute && path.isAbsolute(item) && !isInsideRepo(absolute)) {
                warnings.push(`${file}：证据位于仓库外（${item}），干净检出无法复核，发布说明不得引用`)
            }
        }
    }
    return { problems, meta, warnings }
}

/** 生成单条路径的模板文本。 */
export function renderTemplate(realEnvPath) {
    return `---
path: ${realEnvPath}
status: pending
executed_at: ''
operator: ''
environment: ''
resources: []
commands: []
evidence: []
result: ''
next_action: ${NEXT_ACTIONS[realEnvPath]}
---

## 步骤

（按 ${realEnvPath} 最小可执行命令执行；命令写入 frontmatter 的 commands）

## 输出

（粘贴关键输出或截图路径；证据文件写入 evidence，且必须真实存在）

## 备注

（阻塞原因 / 重试条件写进 frontmatter 的 blocked_reason / retry_condition）
`
}

/** 在目录中生成缺失模板（已存在默认跳过）。 */
export function initTemplates({ dir, force = false }) {
    const absolute = path.isAbsolute(dir) ? dir : path.join(repoRoot, dir)
    mkdirSync(absolute, { recursive: true })
    const created = []
    const skipped = []
    for (const realEnvPath of REAL_ENV_PATHS) {
        const file = path.join(absolute, `${realEnvPath}.md`)
        if (existsSync(file) && !force) {
            skipped.push(realEnvPath)
            continue
        }
        writeFileSync(file, renderTemplate(realEnvPath), 'utf8')
        created.push(realEnvPath)
    }
    return { dir: absolute, created, skipped }
}

/** 列出目录中的证据文件（按路径排序；忽略非 .md）。 */
export function listEvidenceFiles({ dir }) {
    const absolute = path.isAbsolute(dir) ? dir : path.join(repoRoot, dir)
    if (!existsSync(absolute)) {
        return { dir: absolute, files: [] }
    }
    const files = readdirSync(absolute)
        .filter((name) => name.endsWith('.md'))
        .sort()
        .map((name) => ({ name, file: path.join(absolute, name), expectedPath: name.replace(/\.md$/, '') }))
    return { dir: absolute, files }
}

/**
 * 目录级校验（可注入文件读取，便于单测）。
 *
 * @returns {{ok: boolean, found: string[], problems: string[], warnings: string[], missingRequired: string[], pending: string[], statusByPath: Record<string, string>}}
 */
export function checkEvidenceDir({ dir, requirePaths = [], requireAll = false, readFile = (p) => readFileSync(p, 'utf8'), checkFiles = true }) {
    const { files } = listEvidenceFiles({ dir })
    const problems = []
    const warnings = []
    const found = []
    const statusByPath = new Map()
    for (const item of files) {
        const text = readFile(item.file)
        const result = validateEvidence({
            file: item.name,
            expectedPath: item.expectedPath,
            text,
            fileExists: checkFiles ? defaultEvidenceExists : () => true,
        })
        problems.push(...result.problems)
        warnings.push(...result.warnings)
        const meta = result.meta ?? {}
        if (REAL_ENV_PATHS.includes(meta.path) && !found.includes(meta.path)) {
            found.push(meta.path)
            statusByPath.set(meta.path, meta.status)
        }
    }

    const required = requireAll ? REAL_ENV_PATHS : requirePaths
    const missingRequired = required.filter((realEnvPath) => statusByPath.get(realEnvPath) !== 'passed')
    const pending = [...statusByPath.entries()]
        .filter(([, status]) => status === 'pending')
        .map(([realEnvPath]) => realEnvPath)

    return {
        ok: problems.length === 0 && missingRequired.length === 0,
        found,
        problems,
        warnings,
        missingRequired,
        pending,
        statusByPath: Object.fromEntries(statusByPath),
    }
}

const HELP_TEXT = `
check:real-env —— G3 真实环境证据的模板生成与字段校验

用法：
  pnpm check:real-env                      校验 ${DEFAULT_DIR} 下的证据
  pnpm check:real-env --init               生成缺失模板（已存在跳过）
  pnpm check:real-env --require=G3.8       要求指定路径为 passed
  pnpm check:real-env --require-all        要求 G3.0–G3.9 全部 passed
  pnpm check:real-env --json               机器可读报告

说明：默认目录不存在 = 尚未开始（exit 0）；一旦存在证据文件，字段缺失 / 证据文件
不存在 / 状态与字段不匹配即 exit 1。pending 只代表模板，不代表 G3 通过。
`.trim()

/** 主流程。 */
export function main(argv = process.argv, { log = console.log, error = console.error, readFile } = {}) {
    let options
    try {
        options = parseCli(argv)
    } catch (failure) {
        error(`[check:real-env] ${failure instanceof Error ? failure.message : String(failure)}`)
        return 2
    }
    if (options.help) {
        log(HELP_TEXT)
        return 0
    }
    const unknown = options.requirePaths.filter((realEnvPath) => !REAL_ENV_PATHS.includes(realEnvPath))
    if (unknown.length > 0) {
        error(`[check:real-env] 未知路径：${unknown.join(', ')}（可选 ${REAL_ENV_PATHS.join(' / ')}）`)
        return 2
    }

    if (options.init) {
        try {
            const result = initTemplates({ dir: options.dir, force: options.initForce })
            if (options.json) {
                log(JSON.stringify({ ok: true, ...result, problems: [] }, null, 2))
            } else {
                log(`[check:real-env] 模板目录 ${result.dir}：新建 ${result.created.length} 个 / 跳过 ${result.skipped.length} 个`)
                if (result.created.length > 0) {
                    log(`  新建：${result.created.join(', ')}`)
                }
            }
            return 0
        } catch (failure) {
            const message = `生成模板失败：${failure instanceof Error ? failure.message : String(failure)}`
            if (options.json) {
                log(JSON.stringify({ ok: false, dir: options.dir, created: [], skipped: [], problems: [message] }, null, 2))
            } else {
                error(`[check:real-env] ${message}`)
            }
            return 1
        }
    }

    let report
    try {
        report = checkEvidenceDir({
            dir: options.dir,
            requirePaths: options.requirePaths,
            requireAll: options.requireAll,
            checkFiles: options.checkFiles,
            ...(readFile ? { readFile } : {}),
        })
    } catch (failure) {
        // 目录不可读 / 实为文件等 IO 错误：不留 Node 栈；--json 时仍给机器可读结果
        const message = `读取证据目录失败：${failure instanceof Error ? failure.message : String(failure)}`
        if (options.json) {
            log(JSON.stringify({ ok: false, found: [], problems: [message], warnings: [], missingRequired: [], pending: [], statusByPath: {} }, null, 2))
        } else {
            error(`[check:real-env] ${message}`)
        }
        return 1
    }
    if (!options.checkFiles) {
        report.warnings.unshift('--no-check-files 已启用：跳过全部证据存在性校验（不得作为通过依据）')
    }

    if (options.json) {
        log(JSON.stringify(report, null, 2))
    } else {
        const summary = report.found.length === 0
            ? `未找到证据（${path.isAbsolute(options.dir) ? options.dir : path.join(repoRoot, options.dir)}）——模板可用 --init 生成`
            : `已找到 ${report.found.length} 条：${report.found.map((p) => `${p}=${report.statusByPath[p]}`).join(' / ')}`
        log(`[check:real-env] ${summary}`)
        for (const problem of report.problems) {
            log(`  FAIL ${problem}`)
        }
        for (const warning of report.warnings) {
            log(`  WARN ${warning}`)
        }
        if (report.missingRequired.length > 0) {
            log(`  FAIL 未达成 required：${report.missingRequired.join(', ')}`)
        }
        if (report.pending.length > 0) {
            log(`  INFO pending（仅模板，不构成 G3 证据）：${report.pending.join(', ')}`)
        }
        const hasRequirements = options.requireAll || options.requirePaths.length > 0
        log(report.ok
            ? `[check:real-env] ${hasRequirements ? 'OK（required 已满足）' : `字段校验 OK（不代表 G3 通过；pending ${report.pending.length} 条）`}`
            : '[check:real-env] FAIL')
    }
    return report.ok ? 0 : 1
}

/* v8 ignore start -- CLI 入口守卫：进程级副作用不可在单测内触发（与其它脚本同惯例） */
if (isDirectExecution(import.meta.url)) {
    process.exitCode = main()
}
/* v8 ignore stop */
