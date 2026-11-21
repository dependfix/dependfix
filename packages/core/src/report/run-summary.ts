// run-summary.ts — `RunSummary`（汇总统计）与其空值工厂。
//
// 从 `types.ts` 迁出：该文件已贴 max-lines 上限（新增基线短路 / 命令级 OOM 字段时触顶），
// 汇总类型与工厂同批增长没有收益；消费者仍经 `@dependfix/core` 同名导出，导入面不变。
import type { NetworkAuditInjectionStatus } from './network-audit'
import type { AlertsSkippedByReason, AlertsTruncatedBySeverity, VerificationsSkippedByReason } from './types'

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
    /**
     * 命令级 OOM 次数（验证 / 安装命令被 OOM 杀死；按**命令实例**计——同命令多仓 / 多次各计一次，
     * 与运行级 `oomKilled` 分层）。
     *
     * > 0 时报告与平台详情须按「命令级 OOM」披露，不得写成「运行 OOM 终止」；
     * 命令级 OOM 不改变运行失败率（失败率看运行终态与 `verificationBlocking`）。
     */
    commandOomKills: number
    /**
     * 命令级 OOM 的命令名（去重后最多 10 条，是 `commandOomKills` 的**样本子集**：
     * 同一命令在多个仓库 / 多次失败时计数增加而名单不变；旧 summaryJson 缺失时为空）。
     */
    commandOomCommands?: string[]
    /**
     * 修复前基线链被短路的**命令数**（run 级合计，按命令计而非按仓库计）。
     *
     * > 0 表示这些命令没有基线读数（安装命令已判红 → 后续命令不再采样）：
     * 报告与平台详情必须显示为「未采样」，不得折叠成验证通过或「已确认既有失败」。
     */
    baselineSkippedCommands: number
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
     * 口径见 [pr-delivery-closure-history.md §16](../../../../docs/design/governance/pr-delivery-closure-history.md#_16-m51-4-基线红-安装失败的交付降级-2026-10-30)。
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
    /** 本次运行从执行子进程环境中过滤掉的平台密钥类变量个数（只记个数，不含键名）。 */
    envFilteredKeys?: number
    /** 审计代理注入状态（`injected` / `existing-proxy` / `disabled` / `unavailable`）。 */
    networkAuditInjection?: NetworkAuditInjectionStatus
}


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
        commandOomKills: 0,
        baselineSkippedCommands: 0,
        prsOpened: 0,
        prsSkippedByFingerprint: 0,
        prsClosedAfterFailure: 0,
        checksTimedOut: 0,
        deliverySkipped: 0,
        deliverySkipIssues: 0,
        deliverySkipDraftPrs: 0,
    }
}

