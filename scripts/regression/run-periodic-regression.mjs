/**
 * run-periodic-regression.mjs
 * 周期性回归检查脚本
 *
 * 执行周期性回归检查，覆盖测试、安全、文档、i18n、lint、typecheck 等维度。
 * 支持 weekly、pre-release、phase-close 等 profile。
 *
 * 用法:
 *   pnpm regression:weekly
 *   pnpm regression:pre-release
 *   pnpm regression:phase-close
 *
 * 选项:
 *   --profile=<profile>  回归检查配置文件（weekly/pre-release/phase-close）
 *   --dry-run            仅显示将要执行的命令，不实际执行
 *   --mode=<mode>        失败处理模式（warn/error，默认 error）
 */

import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { DOC_GATES } from '../run-doc-gates.mjs'
import { isDirectExecution, parseCliOptions } from '../shared/cli.mjs'
import {
    resolveRegressionWindowPath,
    upsertRegressionWindowEntry,
} from '../shared/regression-window.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..', '..')

/**
 * 文档与治理门禁步骤（与 release.yml / test.yml 同集合，单点声明在 run-doc-gates.mjs）。
 * 每次调用返回新对象：三个 profile 共享同一批 step 引用时，后续按 profile 覆写
 * `required` / `timeoutBudget` 会串味。
 */
function buildDocGateSteps() {
    return DOC_GATES.map((gate) => ({
        command: 'pnpm',
        commandArgs: ['run', gate],
        label: gate,
        required: true,
        timeoutBudget: '10m',
    }))
}

/**
 * 回归日志窗口限制配置
 */
export const LOG_WINDOW_LIMITS = {
    maxEntries: 8,
    maxLines: 400,
}

/**
 * 不参与记录计数的标题集合
 */
const NON_RECORD_HEADINGS = new Set([
    '当前窗口与索引',
    '维护规则',
    '归档规则',
])

/**
 * 创建 pnpm 步骤配置
 * @param {string} label - 步骤标签
 * @param {string} script - pnpm 脚本名称
 * @param {object} [options={}] - 选项
 * @param {boolean} [options.required=true] - 是否为必需步骤
 * @param {string} [options.timeoutBudget='10m'] - 超时预算
 * @returns {object} 步骤配置对象
 */
function createPnpmStep(label, script, options = {}) {
    return {
        command: 'pnpm',
        commandArgs: ['run', script],
        label,
        required: options.required ?? true,
        timeoutBudget: options.timeoutBudget ?? '10m',
    }
}

/**
 * 提取嵌套失败标签
 * @param {string} output - 命令输出
 * @param {string} label - 步骤标签
 * @returns {string|null} 嵌套失败标签或 null
 */
function extractNestedFailureLabel(output, label) {
    const normalizedOutput = typeof output === 'string' ? output : ''

    // 可以根据需要添加特定步骤的失败提取逻辑
    return null
}

/**
 * 解析回归失败摘要
 * @param {object} result - 执行结果
 * @returns {string} 失败摘要
 */
export function resolveRegressionFailureSummary(result) {
    const nestedFailureLabel = extractNestedFailureLabel(result.output, result.label)

    if (nestedFailureLabel) {
        return `${result.label} failed -> ${nestedFailureLabel}`
    }

    return `${result.label} failed`
}

/**
 * registry 故障特征（pnpm / npm 网络层失败文本）。
 *
 * `security:audit-deps` 带 `--ignore-registry-errors`：registry 不可达时命令会以 exit 0 结束，
 * 只看退出码会把「没查成」当成「查过且干净」（假绿）。命中特征且**没有审计结论行**时结果记为
 * UNKNOWN + 可见告警；`ignore-registry-errors` 是开关名而非故障信号——`pnpm run` 会把整条命令
 * 回显进输出，把它当特征会让每次真实执行都命中（本批审计实测的 over-match）。
 */
const REGISTRY_FAILURE_PATTERNS = [
    /ERR_PNPM_META_FETCH_FAIL/u,
    /ERR_PNPM_FETCH_5\d\d/u,
    /ERR_SOCKET_TIMEOUT/u,
    /ETIMEDOUT/u,
    /ECONNREFUSED/u,
    /ECONNRESET/u,
    /EAI_AGAIN/u,
    /ENOTFOUND/u,
    /fetch failed/iu,
]

/**
 * 审计结论证据行（pnpm audit 成功/失败都会输出；缺失即「没查成」）
 */
const AUDIT_RESULT_PATTERNS = [
    /\d+ vulnerabilit/iu,
    /No known vulnerabilities/iu,
]

/** 需要「结论未知」判定的步骤（联网取数、退出码不可信的步骤） */
const INDETERMINATE_STEP_LABELS = new Set(['security:audit-deps'])

/**
 * ANSI 转义序列（强制着色时结论行被包裹，需先剥离再匹配）。
 * 用 `new RegExp` 构造而不是字面量：`no-control-regex` 规则不接受源码里直接出现的控制字符。
 */
const ANSI_ESCAPE_PATTERN = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'gu')

/**
 * 剥离 pnpm 的命令回显行（`$ pnpm run …` / `> …`）。
 *
 * 回显里含脚本的完整命令行（包括 `--ignore-registry-errors` 这类开关名）；特征匹配必须在
 * 剥离后做，否则「开关名」会被当成「故障信号」，把真实审计失败误判为结论未知。
 * @param {string} output - 原始输出
 * @returns {string} 剥离回显后的输出
 */
function stripCommandEcho(output) {
    return output
        // 强制着色（FORCE_COLOR / CI 着色）时结论行被 ANSI 包裹，先剥离转义序列再匹配
        .replace(ANSI_ESCAPE_PATTERN, '')
        .split(/\r?\n/u)
        .filter((line) => !/^\s*[$>] /u.test(line))
        .join('\n')
}

/**
 * 判定步骤是否「未取得结论」（unknown）而非通过 / 失败。
 *
 * 仅对 `INDETERMINATE_STEP_LABELS` 内的步骤生效：
 * - 有审计结论行（如 `N vulnerabilities found`）→ 结论可判定，按退出码走失败 / 通过；
 * - 无审计结论行 + 退出码非 0 且带 registry 网络特征 → 未知（registry 挂了，没查成）；
 * - 退出码 0 但缺审计结论行 → 未知（`--ignore-registry-errors` 吞掉了 registry 故障）。
 * @param {object} result - 执行结果
 * @returns {string|null} 未知原因；null 表示结论可判定
 */
export function detectIndeterminateReason(result) {
    if (result.skipped || !INDETERMINATE_STEP_LABELS.has(result.label)) {
        return null
    }

    const rawOutput = typeof result.output === 'string' ? result.output : ''
    const output = stripCommandEcho(rawOutput)
    const registryPattern = REGISTRY_FAILURE_PATTERNS.find((pattern) => pattern.test(output))
    const hasAuditResult = AUDIT_RESULT_PATTERNS.some((pattern) => pattern.test(output))

    // 有结论行 → 以结论为准（真实漏洞 / 干净都属「已判定」），不因日志里的网络噪音降级
    if (hasAuditResult) {
        return null
    }

    if (!result.ok) {
        return registryPattern
            ? `registry 不可达（${registryPattern.source}），审计未取得结论`
            : null
    }

    return registryPattern
        ? `registry 不可达（${registryPattern.source}），命令以 exit 0 吞掉故障`
        : '输出缺少审计结论行，无法判定依赖是否干净'
}

/**
 * 周期性回归检查配置文件
 */
export const PERIODIC_REGRESSION_PROFILES = {
    weekly: {
        archivePolicy: 'warn',
        executionFrequency: '每周一次',
        key: 'weekly',
        title: '周级周期性回归',
        triggerCondition: '每周固定治理窗口，或质量债、文档漂移、依赖风险出现连续积压时执行。',
        responsibilityBoundary: [
            '主责: @full-stack-master 或当前值班开发者执行脚本入口。',
            '审计: @code-auditor 仅对 blocker / warning 结论做 Review Gate 复核，不替代命令执行。',
            '证据: 结果摘要写入 artifacts/regression/current.md（gitignored，CI 上传），不写入 docs/。',
        ],
        steps: [
            createPnpmStep('test:coverage', 'test:coverage', { timeoutBudget: '30m' }),
            createPnpmStep('security:audit-deps', 'security:audit-deps', { timeoutBudget: '10m' }),
            ...buildDocGateSteps(),
            createPnpmStep('lint:check', 'lint:check', { timeoutBudget: '10m' }),
            createPnpmStep('lint:css:check', 'lint:css:check', { timeoutBudget: '10m' }),
            createPnpmStep('typecheck', 'typecheck', { timeoutBudget: '10m' }),
            createPnpmStep('build', 'build', { timeoutBudget: '10m' }),
        ],
    },
    'pre-release': {
        archivePolicy: 'warn',
        executionFrequency: '每次发版前',
        key: 'pre-release',
        title: '发版前周期性回归',
        triggerCondition: '准备执行 release、打 tag 或合并需要发布的收口变更前执行。',
        responsibilityBoundary: [
            '主责: @full-stack-master 负责跑完整发版前回归入口并确认结果。',
            '审计: @code-auditor 对 release blocker 结论做放行或退回判断。',
            '证据: 结果摘要写入 artifacts/regression/current.md，引用 artifacts/review-gate/ 证据，不复制第二份正文。',
        ],
        steps: [
            createPnpmStep('test:coverage', 'test:coverage', { timeoutBudget: '30m' }),
            createPnpmStep('security:audit-deps', 'security:audit-deps', { timeoutBudget: '10m' }),
            ...buildDocGateSteps(),
            createPnpmStep('lint:check', 'lint:check', { timeoutBudget: '10m' }),
            createPnpmStep('lint:css:check', 'lint:css:check', { timeoutBudget: '10m' }),
            createPnpmStep('typecheck', 'typecheck', { timeoutBudget: '10m' }),
            createPnpmStep('build', 'build', { timeoutBudget: '10m' }),
            createPnpmStep('verify:changelog', 'verify:changelog', { timeoutBudget: '10m' }),
        ],
    },
    'phase-close': {
        archivePolicy: 'block',
        executionFrequency: '阶段收口前',
        key: 'phase-close',
        title: '阶段收口前周期性回归',
        triggerCondition: 'todo 主线接近收口、准备归档当前阶段，或需要形成当前阶段放行结论时执行。',
        responsibilityBoundary: [
            '主责: @full-stack-master 执行阶段收口前回归并补齐 Review Gate 证据。',
            '审计: @code-auditor 必须给出 Pass / Reject 结论；若存在 blocker 不得宣称阶段可归档。',
            '文档: @documentation-specialist / @todo-manager 仅在本轮通过后更新 todo、归档与 roadmap 状态；结果摘要写入 artifacts/regression/current.md（不进入 docs/）。',
        ],
        steps: [
            createPnpmStep('test:coverage', 'test:coverage', { timeoutBudget: '30m' }),
            createPnpmStep('security:audit-deps', 'security:audit-deps', { timeoutBudget: '10m' }),
            ...buildDocGateSteps(),
            createPnpmStep('lint:check', 'lint:check', { timeoutBudget: '10m' }),
            createPnpmStep('lint:css:check', 'lint:css:check', { timeoutBudget: '10m' }),
            createPnpmStep('typecheck', 'typecheck', { timeoutBudget: '10m' }),
            createPnpmStep('build', 'build', { timeoutBudget: '10m' }),
            createPnpmStep('verify:changelog', 'verify:changelog', { timeoutBudget: '10m' }),
        ],
    },
}

/**
 * 解析回归检查配置文件
 * @param {string} profile - 配置文件名称
 * @returns {object} 配置文件对象
 */
export function resolveRegressionProfile(profile) {
    const nextProfile = PERIODIC_REGRESSION_PROFILES[profile]

    if (!nextProfile) {
        throw new Error(`Unsupported regression profile: ${profile}`)
    }

    return nextProfile
}

/**
 * 评估回归日志窗口健康状态
 * @param {string} content - 日志文件内容
 * @returns {object} 窗口健康状态评估结果
 */
export function assessRegressionLogWindow(content) {
    const lines = content.split('\n')
    const recordHeadings = lines
        .filter((line) => line.startsWith('## '))
        .map((line) => line.slice(3).trim())
        .filter((heading) => !NON_RECORD_HEADINGS.has(heading))

    const reasons = []

    if (lines.length > LOG_WINDOW_LIMITS.maxLines) {
        reasons.push(`活动日志当前 ${lines.length} 行，超过 ${LOG_WINDOW_LIMITS.maxLines} 行窗口`)
    }

    if (recordHeadings.length > LOG_WINDOW_LIMITS.maxEntries) {
        reasons.push(`活动日志当前 ${recordHeadings.length} 条记录，超过 ${LOG_WINDOW_LIMITS.maxEntries} 条窗口`)
    }

    return {
        entryCount: recordHeadings.length,
        lineCount: lines.length,
        recordHeadings,
        reasons,
        shouldArchive: reasons.length > 0,
    }
}

/**
 * 汇总回归检查结果
 * @param {object} options - 选项
 * @param {boolean} [options.dryRun=false] - 是否为 dry-run 模式
 * @param {object} options.logHealth - 日志窗口健康状态
 * @param {object} options.profile - 配置文件对象
 * @param {Array} options.results - 执行结果数组
 * @returns {object} 汇总结果
 */
export function summarizeRegressionRun({ dryRun = false, logHealth, profile, results }) {
    const blockers = []
    const warnings = []
    const indeterminate = []

    for (const result of results) {
        if (result.indeterminate) {
            indeterminate.push(result.label)
            warnings.push(`${result.label} 结论未知（${result.indeterminateReason}）`)
            continue
        }

        if (result.ok || result.skipped) {
            continue
        }

        const summary = resolveRegressionFailureSummary(result)
        if (result.required) {
            blockers.push(summary)
        } else {
            warnings.push(summary)
        }
    }

    if (logHealth.shouldArchive) {
        const archiveSummary = `regression-log window exceeded: ${logHealth.reasons.join('；')}`
        if (profile.archivePolicy === 'block') {
            blockers.push(archiveSummary)
        } else {
            warnings.push(archiveSummary)
        }
    }

    let conclusion = 'Pass'
    if (dryRun) {
        conclusion = blockers.length > 0 ? 'Reject' : 'Prepared'
    } else if (blockers.length > 0) {
        conclusion = 'Reject'
    }

    return {
        blockers,
        conclusion,
        indeterminate,
        warnings,
    }
}

/**
 * 构建回归检查证据文档
 * @param {object} options - 选项
 * @returns {string} 证据文档内容
 */
export function buildEvidence({ artifactJsonPath, artifactMarkdownPath, dryRun = false, logHealth, mode, profile, projectRoot = repoRoot, results, summary }) {
    const lines = [
        `# Review Gate Record — ${profile.key} periodic regression`,
        '',
        `- 范围: ${profile.title}`,
        `- 调度入口: pnpm regression:${profile.key}`,
        '- 关联 Todo: 周期性回归检查',
        '- 改动类型: 周期性回归 / 质量门 / 文档同步 / 调度编排',
        `- 风险等级: ${profile.key === 'weekly' ? '中' : '高'}`,
        `- 记录路径: ${path.relative(projectRoot, artifactMarkdownPath)}`,
        `- JSON 摘要: ${path.relative(projectRoot, artifactJsonPath)}`,
        `- 执行时间: ${new Date().toISOString()}`,
        `- 模式: ${mode}`,
        `- dry-run: ${dryRun ? '是' : '否'}`,
        '',
        '## 调度口径',
        '',
        `- 触发条件: ${profile.triggerCondition}`,
        `- 执行频率: ${profile.executionFrequency}`,
        '- 责任边界:',
    ]

    for (const item of profile.responsibilityBoundary) {
        lines.push(`  - ${item}`)
    }

    lines.push('')
    lines.push('## 已执行命令')
    lines.push('')

    for (const result of results) {
        const commandText = [result.command, ...result.commandArgs].join(' ')
        let status = 'FAIL'
        if (result.skipped) {
            status = 'DRY RUN'
        } else if (result.indeterminate) {
            status = 'UNKNOWN'
        } else if (result.ok) {
            status = 'PASS'
        }
        lines.push(`- ${commandText}`)
        lines.push(`  - 结果: ${status}`)
        lines.push(`  - timeout budget: ${result.timeoutBudget}`)

        if (result.indeterminate) {
            lines.push(`  - 未知原因: ${result.indeterminateReason}`)
        }

        if (!result.ok && !result.skipped) {
            const nestedFailureLabel = extractNestedFailureLabel(result.output, result.label)

            if (nestedFailureLabel) {
                lines.push(`  - 失败定位: ${nestedFailureLabel}`)
            }
        }
    }

    lines.push('')
    lines.push('## 回归日志窗口')
    lines.push('')
    lines.push(`- 当前活动日志: ${logHealth.lineCount} 行 / ${logHealth.entryCount} 条记录`)
    lines.push(`- 滚动归档阈值: ${LOG_WINDOW_LIMITS.maxLines} 行或 ${LOG_WINDOW_LIMITS.maxEntries} 条记录`)
    lines.push(`- 归档判定: ${logHealth.shouldArchive ? '需要滚动归档' : '窗口健康'}`)
    if (logHealth.reasons.length > 0) {
        for (const reason of logHealth.reasons) {
            lines.push(`  - ${reason}`)
        }
    }

    lines.push('')
    lines.push('## Review Gate')
    lines.push('')
    lines.push(`- 结论: ${summary.conclusion}`)
    lines.push(`- blocker 数量: ${summary.blockers.length}`)
    lines.push(`- warning 数量: ${summary.warnings.length}`)
    const indeterminateLabels = summary.indeterminate ?? []
    if (indeterminateLabels.length > 0) {
        lines.push(`- 结论未知步骤: ${indeterminateLabels.length}（${indeterminateLabels.join('，')}）——不冒充通过，也不升级为 blocker`)
    }
    lines.push('- blocker 规则:')
    lines.push('  - 任一 required 命令失败直接升级为 blocker。')
    lines.push(`  - 阶段收口前 profile 在活动日志超过 ${LOG_WINDOW_LIMITS.maxLines} 行或 ${LOG_WINDOW_LIMITS.maxEntries} 条记录时，归档未完成即视为 blocker。`)
    lines.push('  - 结论未知（UNKNOWN，如 registry 不可达导致审计未取得结论）不升级为 blocker，但必须作为 warning 可见。')

    lines.push('')
    lines.push('## Findings')
    lines.push('')
    lines.push('### blocker')
    if (summary.blockers.length === 0) {
        lines.push('- 无')
    } else {
        for (const blocker of summary.blockers) {
            lines.push(`- ${blocker}`)
        }
    }

    lines.push('')
    lines.push('### warning')
    if (summary.warnings.length === 0) {
        lines.push('- 无')
    } else {
        for (const warning of summary.warnings) {
            lines.push(`- ${warning}`)
        }
    }

    lines.push('')
    lines.push('## 记录落点')
    lines.push('')
    lines.push('- 本轮结果摘要写入 artifacts/regression/current.md（不进入 docs/）。')
    lines.push('- 当活动日志超过窗口时，先滚动迁移旧记录到 artifacts/regression/archive/。')
    lines.push('- 不新增第二套周期性回归正文文档；artifact 仅作为引用证据。')
    lines.push('')

    return lines.join('\n')
}

/**
 * 格式化发现列表
 * @param {Array} items - 发现项列表
 * @returns {string} 格式化后的字符串
 */
function formatFindingList(items) {
    return items.length > 0 ? items.join('；') : '无'
}

/**
 * 解析门禁严重程度
 * @param {object} summary - 汇总结果
 * @returns {string} 严重程度
 */
function resolveGateSeverity(summary) {
    if (summary.blockers.length > 0) {
        return 'blocker'
    }

    if (summary.warnings.length > 0) {
        return 'warning'
    }

    return 'none'
}

/**
 * 格式化回归结果状态
 * @param {object} result - 执行结果
 * @returns {string} 状态字符串
 */
function formatRegressionResultStatus(result) {
    if (result.skipped) {
        return 'DRY RUN'
    }

    if (result.indeterminate) {
        return 'UNKNOWN'
    }

    return result.ok ? 'PASS' : 'FAIL'
}

/**
 * 格式化未覆盖边界
 * @param {boolean} dryRun - 是否为 dry-run 模式
 * @param {object} logHealth - 日志窗口健康状态
 * @returns {string} 未覆盖边界描述
 */
function formatUncoveredBoundary(dryRun, logHealth) {
    if (dryRun) {
        return '本轮为 dry-run，仅验证编排与回填，不代表真实回归执行结果。'
    }

    if (logHealth.shouldArchive) {
        return formatFindingList(logHealth.reasons)
    }

    return '无新增未覆盖边界。'
}

/**
 * 构建回归日志窗口条目
 * @param {object} options - 选项
 * @returns {object} 回归日志窗口条目
 */
export function buildRegressionWindowEntry({
    artifactJsonPath,
    artifactMarkdownPath,
    dateStr,
    dryRun = false,
    logHealth,
    profile,
    projectRoot = repoRoot,
    results,
    summary,
}) {
    // artifact 落在 .gitignore 排除的 artifacts/ 下，只能以仓库相对路径引用；
    // 一旦写成 markdown 链接，check-docs 会因"链接目标被 .gitignore 排除（CI 中不存在）"拦下
    const artifactMarkdownRelative = path.relative(projectRoot, artifactMarkdownPath).split(path.sep).join('/')
    const artifactJsonRelative = path.relative(projectRoot, artifactJsonPath).split(path.sep).join('/')
    const executedSummary = results
        .map((result) => `${result.label}=${formatRegressionResultStatus(result)}`)
        .join('，')

    return {
        body: [
            `- 执行入口: \`pnpm regression:${profile.key}${dryRun ? ' -- --dry-run' : ''}\``,
            `- 证据 artifact: \`${artifactMarkdownRelative}\` / \`${artifactJsonRelative}\`（本地生成，不入 Git；CI 见 run artifacts）`,
            `- 结果摘要: \`${summary.conclusion}\`；blocker=${summary.blockers.length}，warning=${summary.warnings.length}，结论未知=${(summary.indeterminate ?? []).length}${(summary.indeterminate ?? []).length > 0 ? `（${summary.indeterminate.join('，')}）` : ''}。`,
            `- 已执行验证: ${executedSummary || '无'}`,
            `- 回归窗口: ${logHealth.lineCount} 行 / ${logHealth.entryCount} 条，归档判定=${logHealth.shouldArchive ? '需要滚动归档' : '窗口健康'}。`,
            `- Review Gate: \`${summary.conclusion}\` / \`${resolveGateSeverity(summary)}\`；主要问题=${formatFindingList(summary.blockers.length > 0 ? summary.blockers : summary.warnings)}。`,
            `- 未覆盖边界: ${formatUncoveredBoundary(dryRun, logHealth)}`,
        ].join('\n'),
        id: `periodic-regression:${profile.key}:${dateStr}`,
        title: `${dateStr} ${profile.title}（自动回填）`,
    }
}

/**
 * 格式化持续时间
 * @param {number} durationMs - 持续时间（毫秒）
 * @returns {string} 格式化后的持续时间
 */
function formatDuration(durationMs) {
    return `${(durationMs / 1000).toFixed(1)}s`
}

/**
 * 执行命令
 * @param {object} step - 步骤配置
 * @returns {Promise<object>} 执行结果
 */
async function runCommand(step) {
    return await new Promise((resolve) => {
        const start = Date.now()
        const isWin = process.platform === 'win32'
        const spawnCommand = isWin ? 'cmd.exe' : step.command
        const spawnArgs = isWin
            ? ['/d', '/s', '/c', [step.command, ...step.commandArgs].join(' ')]
            : step.commandArgs
        const chunks = []

        const child = spawn(spawnCommand, spawnArgs, {
            cwd: repoRoot,
            env: process.env,
            stdio: ['inherit', 'pipe', 'pipe'],
        })

        child.stdout.on('data', (data) => {
            process.stdout.write(data)
            chunks.push(data)
        })
        child.stderr.on('data', (data) => {
            process.stderr.write(data)
            chunks.push(data)
        })

        child.on('error', (error) => {
            resolve({
                ...step,
                durationMs: Date.now() - start,
                ok: false,
                output: error.message,
                skipped: false,
            })
        })

        child.on('exit', (code) => {
            resolve({
                ...step,
                durationMs: Date.now() - start,
                ok: code === 0,
                output: Buffer.concat(chunks).toString('utf8').trim(),
                skipped: false,
            })
        })
    })
}

/**
 * 写入证据文件
 * @param {object} options - 选项
 * @returns {Promise<object>} 包含 artifact 路径的对象
 */
async function writeArtifacts({ artifactDirectory, evidence, profile, summary, results, logHealth }) {
    await mkdir(artifactDirectory, { recursive: true })
    await writeFile(profile.artifactMarkdownPath, evidence, 'utf8')
    await writeFile(profile.artifactJsonPath, JSON.stringify({
        profile: profile.key,
        generatedAt: new Date().toISOString(),
        logHealth,
        results: results.map((result) => ({
            command: result.command,
            commandArgs: result.commandArgs,
            durationMs: result.durationMs ?? 0,
            indeterminate: result.indeterminate ?? false,
            indeterminateReason: result.indeterminateReason ?? null,
            label: result.label,
            ok: result.ok,
            required: result.required,
            skipped: result.skipped ?? false,
            timeoutBudget: result.timeoutBudget,
        })),
        summary,
    }, null, 2), 'utf8')

    return {
        artifactJsonPath: profile.artifactJsonPath,
        artifactMarkdownPath: profile.artifactMarkdownPath,
    }
}

/**
 * 执行周期性回归检查
 * @param {object} [options={}] - 选项
 * @returns {Promise<object>} 执行结果
 */
export async function runPeriodicRegression(options = {}) {
    const projectRoot = options.projectRoot ?? repoRoot
    const regressionLogPath = resolveRegressionWindowPath(projectRoot)
    const artifactDirectory = path.join(projectRoot, 'artifacts', 'review-gate')
    const profile = resolveRegressionProfile(options.profile)
    const dateStr = new Date().toISOString().slice(0, 10)
    const artifactBaseName = `${dateStr}-${profile.key}-regression`
    const resolvedProfile = {
        ...profile,
        artifactJsonPath: path.join(artifactDirectory, `${artifactBaseName}.json`),
        artifactMarkdownPath: path.join(artifactDirectory, `${artifactBaseName}.md`),
    }
    const logContent = await (async () => {
        // CI 首跑 / 清理 artifacts 后 current.md 不存在：初始化空窗口，避免 ENOENT 阻断整轮回归。
        await mkdir(path.dirname(regressionLogPath), { recursive: true })
        try {
            return await readFile(regressionLogPath, 'utf8')
        } catch (error) {
            if (error?.code !== 'ENOENT') {
                throw error
            }
            return '# 周期性回归日志窗口\n'
        }
    })()
    const logHealth = assessRegressionLogWindow(logContent)
    const results = []

    console.info(`\n${'─'.repeat(60)}`)
    console.info(`  dependfix - ${resolvedProfile.title}`)
    console.info(`  profile: ${resolvedProfile.key}  |  mode: ${options.mode}`)
    console.info(`  dry-run: ${options.dryRun ? '是' : '否'}`)
    console.info(`  trigger: ${resolvedProfile.triggerCondition}`)
    console.info(`${'─'.repeat(60)}\n`)

    for (const step of resolvedProfile.steps) {
        console.info(`▶ [${step.label}] timeout budget ${step.timeoutBudget}`)

        if (options.dryRun) {
            console.info(`  DRY RUN  ${[step.command, ...step.commandArgs].join(' ')}`)
            results.push({
                ...step,
                durationMs: 0,
                ok: true,
                skipped: true,
            })
            continue
        }

        const result = await runCommand(step)
        const indeterminateReason = detectIndeterminateReason(result)
        const markedResult = indeterminateReason
            ? { ...result, indeterminate: true, indeterminateReason }
            : result
        results.push(markedResult)
        let statusText = 'FAIL'
        if (markedResult.indeterminate) {
            statusText = 'UNKNOWN'
        } else if (result.ok) {
            statusText = 'PASS'
        }
        console.info(`  ${statusText}  ${step.label} (${formatDuration(result.durationMs)})`)
        if (markedResult.indeterminate) {
            console.warn(`  [periodic-regression] ${step.label} 结论未知：${markedResult.indeterminateReason}`)
        }

        // 结论未知（如 registry 不可达）已降级为 warning，不触发 blocker 短路
        if (!result.ok && !markedResult.indeterminate && step.required && options.mode === 'error') {
            console.error(`\n[periodic-regression] blocker: ${step.label} failed.`)
            break
        }
    }

    const summary = summarizeRegressionRun({
        dryRun: options.dryRun,
        logHealth,
        profile: resolvedProfile,
        results,
    })

    const evidence = buildEvidence({
        artifactJsonPath: resolvedProfile.artifactJsonPath,
        artifactMarkdownPath: resolvedProfile.artifactMarkdownPath,
        dryRun: options.dryRun,
        logHealth,
        mode: options.mode,
        profile: resolvedProfile,
        projectRoot,
        results,
        summary,
    })
    const artifacts = await writeArtifacts({
        artifactDirectory,
        evidence,
        profile: resolvedProfile,
        results,
        summary,
        logHealth,
    })

    await upsertRegressionWindowEntry(buildRegressionWindowEntry({
        artifactJsonPath: resolvedProfile.artifactJsonPath,
        artifactMarkdownPath: resolvedProfile.artifactMarkdownPath,
        dateStr,
        dryRun: options.dryRun,
        logHealth,
        profile: resolvedProfile,
        projectRoot,
        results,
        summary,
    }), {
        projectRoot,
    })

    console.info(`\nReview Gate: ${summary.conclusion}`)
    console.info(`Artifacts: ${path.relative(projectRoot, artifacts.artifactMarkdownPath)}, ${path.relative(projectRoot, artifacts.artifactJsonPath)}`)

    if (summary.conclusion === 'Reject' && options.mode === 'error') {
        process.exit(1)
    }

    return {
        artifacts,
        logHealth,
        profile: resolvedProfile,
        results,
        summary,
    }
}

/**
 * 主函数
 */
async function main() {
    const options = parseCliOptions(process.argv, {
        defaults: {
            dryRun: false,
            mode: 'error',
            profile: null,
        },
        flags: {
            '--dry-run': { key: 'dryRun' },
        },
        values: {
            '--mode': {
                allowedValues: ['warn', 'error'],
                invalidMessage: (value) => `[periodic-regression] Unsupported mode: ${value}`,
                key: 'mode',
            },
            '--profile': {
                allowedValues: Object.keys(PERIODIC_REGRESSION_PROFILES),
                invalidMessage: (value) => `[periodic-regression] Unsupported profile: ${value}`,
                key: 'profile',
            },
        },
    })

    if (!options.profile) {
        throw new Error('[periodic-regression] Missing required --profile option')
    }

    await runPeriodicRegression(options)
}

if (isDirectExecution(import.meta.url)) {
    try {
        await main()
    } catch (error) {
        console.error(error instanceof Error ? error.message : String(error))
        process.exit(1)
    }
}
