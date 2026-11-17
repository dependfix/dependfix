// run-summary.ts — `RunSummary` 的空值工厂。
//
// 从 `types.ts` 迁出：该文件已贴 max-lines 上限（新增基线短路字段时触顶），工厂函数与
// 类型声明同批增长没有收益；消费者仍经 `@dependfix/core` 同名导出，导入面不变。
import type { RunSummary } from './types'

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

