import type { NormalizedSecurityAlert, AlertSeverity } from '../alerts'
import type { CiAlignmentRecord } from './ci-alignment'
import type { CheckAttribution } from './check-attribution'
import type { AlertFixOutcome } from './alert-outcomes'
import type { NetworkAuditEntry } from './network-audit'
import type { RunDelivery } from './run-delivery'

/**
 * 跳过原因枚举（`alertsSkippedByReason` 的 key）。
 *
 * 新增累加点必须先在此登记，保证 `sum(alertsSkippedByReason) === alertsSkipped`
 * （旧 summaryJson 缺分组字段时由展示层回退为「其他 / 未分类」）。
 */
export const SKIP_REASONS = [
    'subdirectory-manifest',
    'cross-major',
    'not-fixable',
    'override-protected',
    'repeated-failure',
    'peer-only',
] as const

export type SkipReason = (typeof SKIP_REASONS)[number]

/**
 * 验证被主动跳过原因（`RepositoryResult.verificationSkipped`）。
 *
 * - `budget`：运行预算不足，终验未执行
 * - `no-write`：本次运行对该仓库没有任何写操作（有告警但无可执行修复），后验证无对象
 *
 * 两者都表示「未验证」：不得渲染成验证通过，也不记 `VERIFICATION_FAILED`。
 * 对交付的影响不同：`budget` 表示「改动未验证」→ 阻断整次运行的交付；
 * `no-write` 表示「无改动可验证」→ 该仓库没有交付内容，不阻断同一运行内其他仓库。
 */
export const VERIFICATION_SKIP_REASONS = ['budget', 'no-write'] as const

export type VerificationSkipReason = (typeof VERIFICATION_SKIP_REASONS)[number]

/** 按原因分组的验证跳过计数；缺失 key 等价于 0。 */
export type VerificationsSkippedByReason = Partial<Record<VerificationSkipReason, number>>

/** 验证跳过原因文案表（穷举，新增原因时编译失败提醒补文案；平台 UI 用 i18n 同义键）。 */
const VERIFICATION_SKIP_REASON_TEXT: Record<VerificationSkipReason, string> = {
    budget: 'run budget exhausted',
    'no-write': 'no writes (verification not needed)',
}

/** 验证跳过原因的人类可读文案（报告 / 日志）。 */
export const formatVerificationSkipReason = (reason: VerificationSkipReason): string =>
    VERIFICATION_SKIP_REASON_TEXT[reason]

/** 按原因分组的跳过计数；缺失 key 等价于 0。 */
export type AlertsSkippedByReason = Partial<Record<SkipReason, number>>

/** 按严重级别分组的截断计数；缺失 key 等价于 0。 */
export type AlertsTruncatedBySeverity = Partial<Record<AlertSeverity, number>>

/**
 * 告警数据源。
 * - `github-dependabot`：GitHub Dependabot alerts API（默认）
 * - `pnpm-audit`：本地 `pnpm audit --json`（无 token 回退）
 */
export type AlertSourceKind = 'github-dependabot' | 'pnpm-audit'

/**
 * 报告级运行配置（RuntimeConfig 脱敏子集，不含 githubToken）。
 */
export interface RunReportConfig {
    mode: string
    severityThreshold: string
    repositories: string[]
    dryRun: boolean
    createPullRequest: boolean
    maxAlertsPerRepository: number
    alertSource: AlertSourceKind
    /** 是否同时拉取 Code Scanning alerts（与 Dependabot 并行源） */
    codeScanningEnabled?: boolean
    /** 是否同时拉取 Code Quality findings（与 Dependabot 并行源） */
    codeQualityEnabled?: boolean
}

/**
 * 汇总统计。
 */
export interface RunSummary {
    repositoriesScanned: number
    alertsFound: number
    alertsFixable: number
    alertsFixed: number
    /**
     * 未修复告警数（告警级，非 action 级）。
     *
     * 由 `allAlerts` 逐条经 `isAlertFixedByActions` 判定后计算：
     * `found − fixedAlerts − converged`。不能直接用 `alertsFixed`（成功 action 数）做减法——
     * 同包多 GHSA / 多推荐版本可能只产生一个代表 action，却同时修复多条告警。
     * 旧 summaryJson 缺失时消费方回退到 `found − alertsFixed − alertsConverged`（近似值）。
     */
    alertsUnfixed: number
    alertsFailed: number
    /**
     * 跳过（不可自动修复 / 需人工处理：非 fixable、子目录 manifest、降级风险等）。
     * 与 `alertsConverged`（已收敛，无需升级）语义分离。
     */
    alertsSkipped: number
    /**
     * 按原因分组的跳过计数（不含截断）。
     * 新 run 满足 `sum(values) === alertsSkipped`；旧 summaryJson 缺失时展示层回退总数。
     */
    alertsSkippedByReason: AlertsSkippedByReason
    /**
     * 已收敛：当前锁定版本已 >= 推荐版本（或 lockfile 已无脆弱实例），
     * 无需升级。从 alertsSkipped 拆分，避免混合语义。
     */
    alertsConverged: number
    /**
     * 环境性失败事件数（不归因目标仓库）：安装被信号杀死 / 超时 / 静默非零退出等。
     *
     * 与 `alertsFailed` 语义分离——后者归因本次修复，本字段只用于「结果可见性」：
     * 运行即使 `completed`，也可据此提示「环境性失败 N」而不把仓库判为失败。
     * 计数口径为 `FixError.category === 'ENVIRONMENT_ERROR'` 的审计条目数；`lockfile-repair` 与升级链
     * （成员 / 常规分组 / 拆组逐包 / 跨线 / 多版本 / 合批）的安装失败均已接入该归类
     * （判据与消费点见 docs/design/modules/dependency-fixer-records.md §12.16）。
     */
    environmentalFailures: number
    /** 因 maxAlertsPerRepository 截断的告警数（收尾审查遗留：截断明细进报告） */
    alertsTruncated: number
    /**
     * 按严重级别分组的截断计数。
     * 新 run 满足 `sum(values) === alertsTruncated`；旧 summaryJson 缺失时展示层回退总数。
     */
    alertsTruncatedBySeverity: AlertsTruncatedBySeverity
    /**
     * 未启用 alerts 功能的仓库数（如 Dependabot alerts 未开启）。
     * 语义：预期状态而非失败，不计入 allErrors / 不影响 exitCode。
     */
    reposWithAlertsDisabled: number
    lockfileRepairs: number
    verificationsPassed: number
    verificationsFailed: number
    /**
     * 验证被跳过的仓库数（预算不足 / 0 写入）。
     *
     * 不计入失败、不回滚；`verificationSkippedByReason` 给出按原因分组计数
     * （`budget` 阻断交付，`no-write` 无交付内容）。
     */
    verificationsSkipped: number
    /** 按原因分组的验证跳过计数；旧 summaryJson 缺失时展示层回退总数。 */
    verificationSkippedByReason: VerificationsSkippedByReason
    /** 本次运行创建的 PR 数（fix-and-pr 恒为 0 或 1） */
    prsOpened: number
    /** 因内容指纹相同被跳过的 PR 数（已有同内容 PR） */
    prsSkippedByFingerprint: number
    /** PR check 回环中因归因 `self_caused` 被关闭的 PR 数（需显式 `--close-failed-pr`） */
    prsClosedAfterFailure: number
    /** PR check 等待超预算（per-PR / per-run）次数 */
    checksTimedOut: number
    /**
     * 交付被跳过的仓库数（修复后安装仍为既有失败 → 有修复但不交付）。
     *
     * 非 0 表示「有修复产出、但没有交付」，消费方（平台 run 列表 / 详情）应展示
     * 「交付跳过」而不是把 `alertsFixed = 0` / 无 PR 误读为「没有告警」。
     * 口径见 [pr-delivery-closure.md §16](../../../../docs/design/governance/pr-delivery-closure.md)。
     */
    deliverySkipped: number
    /** 交付降级载体新建的 issue 数（`issue` 档；命中既有 issue 不新建，不计） */
    deliverySkipIssues: number
    /** 交付降级载体创建的草稿 PR 数（`draft` 档；同时计入 `prsOpened`） */
    deliverySkipDraftPrs: number
    /** 本次运行拦截的非白名单外联数（缺失按 0；> 0 时运行详情 / 导出必须披露，不得写成「验证通过」）。 */
    networkViolations?: number
    /** 本次运行记录的外联审计条数（含白名单命中；用于「allowlist 命中摘要」）。 */
    networkAudited?: number
}

/**
 * 仓库维度汇总。
 */
export interface RepositoryResult {
    repository: string
    defaultBranch: string
    alertsCount: number
    fixable: number
    fixed: number
    failed: number
    lockfileRepaired: boolean
    verificationPassed?: boolean
    /**
     * 是否存在**本次改动引入**的验证失败（决定是否回滚交付）。
     *
     * - `undefined`：未做验证（dry-run / 未走修复链路）
     * - `false`：**不存在本次改动引入的失败**（链路可能全绿，也可能只剩既有基线失败）→ 不触发回滚
     * - `true`：存在基线中不存在的新失败 → 交付门禁回滚
     *
     * 与 `verificationPassed`（修复后是否**全部**命令通过，原始口径）分工：
     * `verificationPassed === false && verificationBlocking === false` 表示
     * 「链路未全绿，但失败均为既有基线，未归因本次改动」。
     *
     * 预算跳过终验时置 `true` 但**不回滚**（门禁据 `verificationSkipped` 分流）：
     * 语义是「不能确认可交付」，不是「存在本次引入的失败」。
     * 0 写入跳过（`no-write`）时置 `false`：工作区保持 pristine，没有可归因的失败，
     * 该仓库也没有交付内容，因此不阻断同一运行内其他仓库的交付。
     */
    verificationBlocking?: boolean
    /**
     * 验证被**主动跳过**的原因。
     *
     * 与 `verificationPassed === undefined` 的分工：后者是「未验证」（dry-run / 未走修复链），
     * 本字段显式说明「验证本应运行，但被预算或 0 写入跳过」——不得把该仓库渲染成「验证通过」；
     * 跳过**不写** `VERIFICATION_FAILED`，也不把跳过折叠为「通过」。
     * 是否阻断交付取决于是跳过原因：`budget` 阻断（`verificationBlocking=true`，改动未验证），
     * `no-write` 不阻断（`verificationBlocking=false`，无改动可交付）。
     */
    verificationSkipped?: VerificationSkipReason
    durationMs: number
}

/**
 * 家族锁步记录（仅 `type === 'dependency-upgrade'` 且本次按家族规则写盘时存在）。
 *
 * 见 [pr-delivery-closure.md §4](../../../../docs/design/governance/pr-delivery-closure.md#4-m481-家族锁步升级)：
 * 同一次修复内同一生态成员保持同一条版本线；`skipped` 承载 `familyMemberSkipped`
 * （不在 manifest / 协议声明无法改写的成员），不参与写盘也不阻断。
 */
export interface FixActionFamily {
    /** 家族标识（`vitest` / `typescript-eslint` / `jest` / `react`） */
    id: string
    /** 本次随族写盘的成员（含触发包） */
    members: string[]
    /** 家族中存在但未写盘的成员（familyMemberSkipped） */
    skipped: string[]
}

/**
 * 验证命令来源。
 *
 * - `default`：引擎默认验证链（`DEFAULT_VERIFY_COMMANDS`）
 * - `repo-config`：仓库级自定义链（CLI `--commands` / Action `commands` / 平台 `verifyCommands`）
 * - `ci-mirror`：`--mirror-ci-scripts` 追加的目标仓库 CI 独有脚本
 */
export type VerificationCommandSource = 'default' | 'repo-config' | 'ci-mirror'

/**
 * 修复动作记录（DependencyFixResult / LockfileRepairResult / VerificationResult 的扁平化表示）。
 */
export interface FixAction {
    type: 'dependency-upgrade' | 'lockfile-repair' | 'verification' | 'branch-cleanup' | 'code-scanning-fix'
    repository: string
    target: string
    fromVersion?: string
    toVersion?: string
    isMajor?: boolean
    success: boolean
    error?: string
    /** 家族锁步记录（仅按家族规则写盘的动作携带） */
    family?: FixActionFamily
    /**
     * 仅 `type === 'verification'` 时有意义：该失败在**修复前的基线采样**中即已存在
     * （目标仓库本就为红，如长期失败的测试套件）→ 不归因本次改动，交付门禁不据此回滚。
     */
    preExisting?: boolean
    /**
     * 仅 `type === 'verification'` 时有意义：该命令来自默认链 / 仓库自定义链 / CI 镜像脚本。
     * 报告据此逐条标注来源（同一次运行可能混有三种来源）。
     */
    commandSource?: VerificationCommandSource
    /**
     * 仅失败动作有意义：该失败为**环境性安装失败**
     * （信号终止 / 超时 / 无 stderr 诊断：无法归因目标仓库）→ 不计入「本次改动引入的失败」
     * （与 `preExisting` 验证失败同族的非归因口径）。`type === 'lockfile-repair'` 与
     * `type === 'dependency-upgrade'`（常规分组 / 拆组逐包 / 跨线 / 成员）都可能携带。
     */
    environmentalFailure?: boolean
    strategy?: string
    durationMs?: number
    diff?: string
    /**
     * 仅 `type === 'lockfile-repair'` 时有意义：本次修复是否**实际改写**了锁文件。
     *
     * 与 `noOp` 互斥组合表达三种收尾结论：`success + changed`（修复生效）、
     * `success + noOp`（复检通过 / 已合规）、`!success`（前置失败或策略失败）。
     */
    changed?: boolean
    /**
     * 标记"无需修改"（code-scanning 修复时文件已合规）。
     * 不计入 fixed/failed 统计（summary 与 repoResults 口径一致）。
     */
    noOp?: boolean
    /**
     * code-scanning 修复的目标文件（告警 manifestPath，相对路径）。
     * 用于告警级修复状态关联（同 ruleId 多实例区分）。
     */
    filePath?: string
    /**
     * 本次动作实际写盘的相对路径（AI patch 可改多文件；仅成功且非 noOp 的动作携带）。
     * 交付提交按「固定白名单 ∪ 声明路径」收集，未声明的已跟踪改动会被拒绝提交。
     * 相对工作目录，POSIX 或平台分隔符均可（提交侧统一归一化）。
     */
    changedPaths?: string[]
}

/**
 * 错误记录。
 */
export interface FixError {
    repository: string
    target?: string
    stage: 'fetch' | 'filter' | 'fix' | 'repair' | 'verify' | 'report'
    category?: string
    message: string
    /**
     * 告警源标识（仅 stage='fetch' + category='FETCH_FAILED' 时存在）：
     * 标识本次失败的具体源（'dependabot' | 'code-scanning' | 'code-quality' | 'pnpm-audit'），
     * 便于 CLI / 平台 UI 输出部分源失败的分组汇总（per-source 错误隔离）。
     */
    source?: string
}

/**
 * AI 研判用量聚合（run 级；每次成功调用累计）。
 * 成本估算仅当全部调用的模型均有单价数据时输出（无单价 → undefined）。
 */
export interface AiUsageAggregate {
    /** 成功调用次数（provider 正常返回；失败调用不计入） */
    calls: number
    inputTokens: number
    outputTokens: number
    totalTokens: number
    /** 估算成本（USD，公开定价推算，仅供参考）；模型无单价数据时为 undefined */
    estimatedCostUsd?: number
}

/**
 * 供应链信号警示（路径 A"合法包被投毒"合入前人工确认的关键依据）：
 * 本次新增/升级的包带 lifecycle scripts 且已被目标仓库 `allowBuilds` /
 * `onlyBuiltDependencies` 批准——脚本会在目标仓库安装时真实执行。
 */
export interface SupplyChainWarning {
    /** 目标仓库（owner/repo 或 local） */
    repository: string
    /** 包名 */
    packageName: string
    /** 升级后的版本（该版本在目标仓库将被安装并可能执行脚本） */
    version: string
    /** lifecycle 脚本类型（install / preinstall / postinstall 中的已存在项） */
    scriptTypes: string[]
}

/**
 * 报告顶层容器。
 */
export interface RunResult {
    runId: string
    startedAt: string
    finishedAt: string
    config: RunReportConfig
    summary: RunSummary
    repositories: RepositoryResult[]
    alerts: NormalizedSecurityAlert[]
    actions: FixAction[]
    errors: FixError[]
    /** AI 研判用量聚合（仅 --ai 开启且实际调用时存在） */
    aiUsage?: AiUsageAggregate
    /** 供应链信号警示区（本次升级包带脚本且被批准；空 = 不渲染） */
    supplyChainWarnings?: SupplyChainWarning[]
    /**
     * alerts 功能未启用记录（方案 A：未启用 ≠ 失败，单列展示）。
     * 仅在有仓库未启用 alerts 时存在；空/undefined = 不渲染。
     */
    alertsDisabled?: AlertsDisabledRecord[]
    /**
     * 验证链与目标仓库 CI 口径对齐记录（按仓库；仅在实际执行验证链后存在）。
     *
     * 只描述**命令口径**（本次执行集 vs 默认分支 workflow 可识别命令集），
     * 不预测 / 不承诺目标仓库 CI 结果；解析与降级口径见
     * [verification-ci-alignment.md](../../../../docs/design/governance/verification-ci-alignment.md)。
     */
    ciAlignment?: CiAlignmentRecord[]
    /**
     * 告警级修复结果（按告警逐条；仅本次运行有结论时存在）。
     *
     * 消费方是平台 `ScanResult.fixStatus` 回写：`converged` 使本地已满足的告警退出
     * 「未修复」明细（`security_critical` / `security_high` / 周报），`success` / `failed` /
     * `skipped` 同样可回写。只列出有结论的告警——**缺键即 `not-tried`**（存量 run 无该字段，
     * 行为与引入前一致）。匹配键与推导优先级见
     * [data-model.md](../../../../docs/design/modules/data-model.md)。
     */
    alertOutcomes?: AlertFixOutcome[]
    /**
     * 同告警尝试记录（按告警逐条；仅 fix-and-pr 模式且参与尝试计数时存在）。
     *
     * 记录「本次运行对该尝试键的处置」：正常尝试 / 达到上限跳过 / `--retry-failed` 人工强制。
     * 尝试键与计数口径见 [pr-delivery-closure.md §6](../../../../docs/design/governance/pr-delivery-closure.md)。
     */
    attemptTracking?: RepeatedAttemptRecord[]
    /**
     * PR 创建后的 check 回环结果（仅 `--wait-pr-checks` 且实际创建 / 命中 PR 时存在）。
     *
     * CLI / Action 侧单次运行内等待，不跨进程续等；轮询与预算口径见
     * [pr-delivery-closure.md §8](../../../../docs/design/governance/pr-delivery-closure.md)。
     */
    prCheckWatch?: PrCheckWatchReport
    /**
     * 交付跳过记录（修复后安装仍为既有失败 → 有修复但不交付）。
     *
     * 记录受影响仓库、命中命令与降级载体；`skip` 档只有记录（无载体），`issue` / `draft`
     * 档带载体编号。口径见
     * [pr-delivery-closure.md §16](../../../../docs/design/governance/pr-delivery-closure.md)。
     */
    deliverySkips?: DeliverySkipRecord[]
    /**
     * 执行期外联审计记录（安装链 / 验证链 / 交付命令共用的运行级审计）。
     *
     * 仅记录方法与目标（host / URL），不含请求 / 响应体；`violation` 标记 deny-by-default
     * 拦截的非白名单外联。形状与引擎 `runners/network-audit` 同源，平台据此在运行详情与导出披露。
     */
    networkAudit?: NetworkAuditEntry[]
    /** 非白名单外联（`networkAudit` 的子集；非空即不得把该仓库写成「成功」） */
    networkViolations?: NetworkAuditEntry[]
    /**
     * 修复交付结果（仅 fix / fix-and-pr 模式记录；report-only 无交付概念，字段缺省）。
     *
     * 引擎在**执行进程内**完成交付时（沙箱自包含）由引擎写入；容器路径由平台接管，
     * 引擎只写 `{ deliveredBy: 'platform', status: 'none' }`，平台据此避免二次交付。
     * 消费方：平台执行器映射 `runUrl` / `prNumber`、失败清理与运行详情披露。
     */
    delivery?: RunDelivery
}

/**
 * 基线红的交付降级档位（`DEPENDFIX_ON_BASELINE_RED`）。
 *
 * - `skip`：默认，仅日志 + 报告记录（行为与引入前逐字一致）
 * - `issue`：按失败指纹开 issue（关闭后不重开）
 * - `draft`：照常提交并创建草稿 PR（CI 预期因既有失败为红）
 */
export type BaselineRedDelivery = 'skip' | 'issue' | 'draft'

/** 交付降级的载体（一个 run 至多一个）。 */
export interface DeliverySkipCarrier {
    /** 触发生效的档位（`skip` 时无载体字段） */
    mode: BaselineRedDelivery
    /** `issue` 档：命中的既有 issue 或本次新建（`created` 区分） */
    issue?: { number: number, htmlUrl: string, created: boolean, fingerprint: string }
    /** `draft` 档：本次创建的草稿 PR */
    draftPr?: { number: number, htmlUrl: string }
}

/** 交付跳过记录（run 级；修复后安装仍为既有失败）。 */
export interface DeliverySkipRecord {
    /** 受影响仓库（`owner/repo`） */
    repositories: string[]
    /** 命中的安装命令（去重，保持执行顺序；报告与 issue 正文引用） */
    failingCommands: string[]
    /** 降级载体 */
    carrier: DeliverySkipCarrier
}

/**
 * 同告警尝试记录的处置状态。
 *
 * - `attempt`：本次为第 1 / 2 次尝试（正常执行）
 * - `forced`：达到上限但 `--retry-failed` 强制再试（报告标注「人工强制」）
 * - `skipped`：达到上限跳过（`FixAction.noOp` + `alertsSkippedByReason['repeated-failure']`）
 */
export type RepeatedAttemptStatus = 'attempt' | 'forced' | 'skipped'

/**
 * 同告警尝试记录。
 *
 * 尝试键 = `source / packageName / targetVersion / planStrategy` 的摘要（16 位 hex），
 * 命名空间隐含于仓库作用域（键本身不含 repo）；`attempt` = 同键已关闭 PR 数 + 1。
 */
export interface RepeatedAttemptRecord {
    repository: string
    packageName: string
    /** 尝试键（16 位 hex） */
    key: string
    /** 本次尝试序号（同键已关闭 PR 数 + 1；上限 2 次，第 3 次起跳过） */
    attempt: number
    status: RepeatedAttemptStatus
}

/**
 * PR check 回环的终态。
 *
 * - `passed`：全部 check 完成且至少一条成功、无失败
 * - `failed`：存在失败 check（`attribution` 为聚合归因）
 * - `cancelled`：全部完成但没有任何成功（均为 cancelled / skipped / neutral）
 * - `no_ci_detected`：宽限期后仍未观测到任何 check（**绝不**判 passed）
 * - `timeout`：per-PR / per-run 预算耗尽，结果未判定（PR 保留）
 */
export type PrCheckWatchState = 'passed' | 'failed' | 'cancelled' | 'no_ci_detected' | 'timeout'

/** 回环中记录的失败 check 摘要（评论与报告共用，最多 5 条）。 */
export interface PrCheckFailureSummary {
    name: string
    /** check 详情页 URL（可空） */
    url?: string
    attribution: CheckAttribution
}

/** 单个 PR 的 check 回环结果。 */
export interface PrCheckWatchAttempt {
    pr: {
        number: number
        htmlUrl: string
    }
    state: PrCheckWatchState
    /** `failed` 时的聚合归因（混合归因 → `unknown`） */
    attribution?: CheckAttribution
    /** 是否由 dependfix 关闭（仅 `failed` + `self_caused` + 显式开关） */
    closed: boolean
    /** 是否已发表评论（failed / timeout 且非 dry-run） */
    commented: boolean
    /** 轮询次数 */
    polls: number
    /** 实际等待时长（毫秒） */
    durationMs: number
    /** 失败 check 摘要 */
    failedChecks?: PrCheckFailureSummary[]
    /** 未判定 / 降级原因（timeout / no_ci_detected / API 错误 / 评论关闭失败） */
    reason?: string
    /** 评论失败原因（不改变 PR 状态） */
    commentError?: string
    /** 关闭失败原因（不改变运行结论） */
    closeError?: string
}

/** 一次运行的 PR check 回环汇总。 */
export interface PrCheckWatchReport {
    attempts: PrCheckWatchAttempt[]
    /** per-run 总预算是否耗尽（后续 PR 不再等待） */
    runBudgetExhausted: boolean
}

/**
 * alerts 功能未启用记录。
 *
 * 与 FixError 的区别：未启用是**预期状态**（仓库设置未开启 Dependabot alerts），
 * 不是获取失败；不计入 errors / 不触发 exitCode 非 0，仅在报告单列展示。
 */
export interface AlertsDisabledRecord {
    /** 目标仓库（owner/repo） */
    repository: string
    /** 告警源标识（`dependabot` / `code-scanning` / `code-quality`） */
    source: string
    /** 原始提示文案（GitHub API 返回的 message，如 "Dependabot alerts are disabled for this repository."） */
    message: string
}

/** 按严重级别聚合的统计。 */
export interface SeverityBreakdown {
    critical: SeverityRow
    high: SeverityRow
    medium: SeverityRow
    low: SeverityRow
}

interface SeverityRow {
    found: number
    fixable: number
    fixed: number
    failed: number
}

/** 按仓库分组的动作。 */
export interface RepositoryActions {
    repository: string
    alerts: NormalizedSecurityAlert[]
    actions: FixAction[]
}

/**
 * 从告警列表中计算按严重级别的聚合。
 * @param alerts 告警列表
 * @param actions 修复动作（用于精确 fixed 判定，见 {@link isAlertFixedByActions}）
 */
export function aggregateSeverity(
    alerts: NormalizedSecurityAlert[],
    actions: FixAction[],
): SeverityBreakdown {
    const empty = (): SeverityRow => ({ found: 0, fixable: 0, fixed: 0, failed: 0 })

    const breakdown: Record<AlertSeverity, SeverityRow> = {
        critical: empty(),
        high: empty(),
        medium: empty(),
        low: empty(),
        unknown: empty(),
    }

    for (const alert of alerts) {
        const row = breakdown[alert.severity] ?? breakdown.unknown
        row.found++
        if (alert.fixable) {
            row.fixable++
        }
        if (isAlertFixedByActions(alert, actions)) {
            row.fixed++
        }
    }

    return {
        critical: breakdown.critical,
        high: breakdown.high,
        medium: breakdown.medium,
        low: breakdown.low,
    }
}

/**
 * 精确判定单条告警是否已被修复（防跨线误标，2026-08-06 复盘 PR #28）。
 *
 * - Code Scanning：既有规则 `repo/ruleId@filePath` 匹配（success && !noOp）
 * - 依赖升级：存在同仓库同包的**成功** action，且其升级目标中存在
 *   **与推荐版本同 major 且 >= 推荐版本**的目标（{@link parseRangeTargets}）。
 *   推荐版本为空时回退包级匹配（兼容无推荐场景）。
 *
 * 与包级匹配（buildFixedKeys）的区别：包级匹配会把同包所有告警标 fixed，
 * 包括"推荐版本需要跨大版本升级"（如 5.x 实例的告警推荐 6.4.3 而只升到 5.4.21，
 * 或同包其他线的目标 8.2.1 掩盖 5.x 实例未修复）的未真正修复告警——
 * 本函数按"同 major 版本满足"判定，杜绝该误标。
 */
export function isAlertFixedByActions(
    alert: NormalizedSecurityAlert,
    actions: readonly FixAction[],
): boolean {
    // Code Scanning：实例维度
    if (alert.source === 'code-scanning') {
        const csKey = `${alert.repository}/${alert.ruleId}@${alert.manifestPath}`
        return actions.some((a) => (
            a.success
            && !a.noOp
            && a.type === 'code-scanning-fix'
            && `${a.repository}/${a.target}@${a.filePath ?? ''}` === csKey
        ))
    }

    // Code Quality：所有 findings 均 `fixable: false`、`recommendedVersion: ''`；
    // 不可被 dependency-upgrade action 误标为 fixed（同名 packageName 与 Dependabot 重叠时
    // 走包级匹配兜底会错误返回 true）。首版统一不可修复。
    if (alert.source === 'code-quality') {
        return false
    }

    // 依赖升级：版本满足判定
    const upgradeActions = actions.filter((a) => (
        a.success
        && !a.noOp
        && a.type === 'dependency-upgrade'
        && a.repository === alert.repository
        && a.target === alert.packageName
    ))
    if (upgradeActions.length === 0) {
        return false
    }

    // 推荐版本为空（无修复版本信息）→ 包级匹配兜底（有成功升级即视为处理）
    if (!alert.recommendedVersion) {
        return true
    }

    // 逐目标判定：存在一个升级目标 >= 推荐版本 **且 major 相同**。
    // major 匹配要求杜绝跨线误标：5.x 实例的告警推荐 6.4.3 而目标只有 8.2.1
    // （或 5.4.21）时——目标 major 8（或 5）≠ 推荐 major 6 → 不标 fixed
    // （PR #28 复盘；"max of targets" 会被同包其他线目标掩盖，故用逐目标判定）
    const recommendedMajor = parseMajorVersion(alert.recommendedVersion)
    return upgradeActions.some((a) => parseRangeTargets([a.toVersion]).some((t) => (
        parseMajorVersion(t) === recommendedMajor
        && compareVersions(t, alert.recommendedVersion as string) >= 0
    )))
}

/**
 * 解析升级目标 range 中出现的全部版本（含版本化覆盖多目标）。
 * - `^5.4.21` / `~5.4.21` / `>=5.4.21` / `5.4.21` → `['5.4.21']`
 * - `5.4.21, 6.4.3` → `['5.4.21', '6.4.3']`
 * - 无有效版本 → `[]`
 */
export function parseRangeTargets(ranges: Array<string | undefined>): string[] {
    const targets: string[] = []
    for (const range of ranges) {
        if (!range) {
            continue
        }
        for (const part of range.split(',')) {
            const bare = part.trim().replace(/^[\^~>=<\s]+/, '')
            const match = /^\d+\.\d+\.\d+/.exec(bare)
            if (match) {
                targets.push(match[0])
            }
        }
    }
    return targets
}

/**
 * 简单三段版本比较（core 无 semver 依赖；语义与 cli compareSemver 对齐：
 * 缺失段补 0，pre-release 忽略）。非法版本按 0.0.0 处理。
 */
export function compareVersions(a: string, b: string): number {
    const pa = parseVersion(a)
    const pb = parseVersion(b)
    for (let i = 0; i < 3; i++) {
        if (pa[i] !== pb[i]) {
            return pa[i] < pb[i] ? -1 : 1
        }
    }
    return 0
}

function parseVersion(v: string): [number, number, number] {
    const match = /^(\d+)\.(\d+)\.(\d+)/.exec(v.trim())
    if (!match) {
        return [0, 0, 0]
    }
    return [Number(match[1]), Number(match[2]), Number(match[3])]
}

/** 大版本号（非法版本按 0）。 */
function parseMajorVersion(v: string): number {
    return parseVersion(v)[0]
}

/**
 * 按仓库分组告警和动作。
 */
export function groupByRepository(
    alerts: NormalizedSecurityAlert[],
    actions: FixAction[],
    repoResults: RepositoryResult[],
): RepositoryActions[] {
    const repoMap = new Map<string, RepositoryActions>()

    for (const rr of repoResults) {
        repoMap.set(rr.repository, { repository: rr.repository, alerts: [], actions: [] })
    }
    for (const alert of alerts) {
        const entry = repoMap.get(alert.repository)
        if (entry) {
            entry.alerts.push(alert)
        }
    }
    for (const action of actions) {
        const entry = repoMap.get(action.repository)
        if (entry) {
            entry.actions.push(action)
        }
    }

    return [...repoMap.values()]
}

/**
 * 生成告警的唯一键（用于固定集合追踪）。
 */
export function alertKey(alert: NormalizedSecurityAlert): string {
    return `${alert.repository}/${alert.packageName}@${alert.recommendedVersion}`
}

/**
 * 从动作列表构建已修复告警键集合（单一事实源，markdown 报告与 PR body 共用）。
 *
 * - 依赖升级：`repo/pkg`（**包级**匹配——同包多条 GHSA 告警推荐版本各异，
 *   action 的 toVersion 是统一目标（版本化 overrides 甚至多目标逗号分隔），
 *   按版本精确匹配必然漏列；包级匹配与 markdown 明细表口径一致）
 * - Code Scanning：`repo/ruleId@filePath`（实例维度，同规则多文件区分；noOp 动作不算修复）
 */
export function buildFixedKeys(actions: FixAction[]): Set<string> {
    return new Set(
        actions
            .filter((a) => a.success && !a.noOp && (a.type === 'dependency-upgrade' || a.type === 'code-scanning-fix'))
            .map((a) => a.type === 'code-scanning-fix' && a.filePath
                ? `${a.repository}/${a.target}@${a.filePath}`
                : `${a.repository}/${a.target}`),
    )
}

/**
 * 格式化耗时。
 */
export function formatDuration(ms: number): string {
    if (ms < 1000) {
        return '< 1s'
    }
    if (ms < 60_000) {
        return `${Math.round(ms / 1000)}s`
    }

    const totalSeconds = Math.round(ms / 1000)
    const totalMinutes = Math.floor(totalSeconds / 60)
    const remainingSeconds = totalSeconds % 60

    if (totalMinutes < 60) {
        return remainingSeconds > 0 ? `${totalMinutes}m ${remainingSeconds}s` : `${totalMinutes}m`
    }

    const totalHours = Math.floor(totalMinutes / 60)
    const remainingMinutes = totalMinutes % 60
    return remainingMinutes > 0 ? `${totalHours}h ${remainingMinutes}m` : `${totalHours}h`
}

/**
 * 动作类型到展示标签的映射。
 */
export function actionTypeLabel(type: FixAction['type']): string {
    switch (type) {
        case 'dependency-upgrade': return 'dependency-upgrade'
        case 'lockfile-repair': return 'lockfile-repair'
        case 'verification': return 'verification'
        case 'branch-cleanup': return 'branch-cleanup'
        case 'code-scanning-fix': return 'code-scanning-fix'
    }
}

/**
 * 成功/失败图标。
 */
export function statusIcon(success: boolean): string {
    return success ? '✅' : '❌'
}

/**
 * 创建空的 RunSummary。
 */
export function createEmptyRunSummary(): RunSummary {
    return {
        repositoriesScanned: 0,
        alertsFound: 0,
        alertsFixable: 0,
        alertsFixed: 0,
        alertsUnfixed: 0,
        alertsFailed: 0,
        alertsSkipped: 0,
        alertsSkippedByReason: {},
        alertsConverged: 0,
        environmentalFailures: 0,
        alertsTruncated: 0,
        alertsTruncatedBySeverity: {},
        reposWithAlertsDisabled: 0,
        lockfileRepairs: 0,
        verificationsPassed: 0,
        verificationsFailed: 0,
        verificationsSkipped: 0,
        verificationSkippedByReason: {},
        prsOpened: 0,
        prsSkippedByFingerprint: 0,
        prsClosedAfterFailure: 0,
        checksTimedOut: 0,
        deliverySkipped: 0,
        deliverySkipIssues: 0,
        deliverySkipDraftPrs: 0,
    }
}

export type { NetworkAuditEntry, NetworkAuditSource } from './network-audit'
export type { RunDelivery, RunDeliveryActor, RunDeliveryStatus } from './run-delivery'
