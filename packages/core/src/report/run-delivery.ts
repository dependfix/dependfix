// run-delivery.ts — 交付结果契约（RunResult.delivery）。
//
// 单一事实源：引擎在进程内完成 push / PR 时写 branch / commitSha / prUrl；
// 平台据此映射 runUrl / PR 与失败清理，不做命名推测。

/** 交付进度：none=未交付；pushed=分支已推送；pr-created=PR 已创建或复用。 */
export type RunDeliveryStatus = 'none' | 'pushed' | 'pr-created'

/** 交付执行方：engine=执行进程内自包含完成；platform=平台接管；none=未交付。 */
export type RunDeliveryActor = 'engine' | 'platform' | 'none'

/**
 * 交付结果（branch / commit / PR 的单一事实源）。
 *
 * - `status: 'pushed'` 时 `branch` 必有：交付失败清理只按该字段删分支，绝不推测命名
 * - `pr-created` 时 `prUrl` 必有；`prNumber` 可选（GitHub 路径恒有）
 * - 失败清理只处理 `dependfix/` 前缀分支，默认分支不在清理范围
 */
export interface RunDelivery {
    deliveredBy: RunDeliveryActor
    status: RunDeliveryStatus
    /** 修复分支名（`pushed` / `pr-created` 时存在；fix 直推时为当前分支） */
    branch?: string
    /** 本次交付的提交 SHA（HEAD） */
    commitSha?: string
    /** 交付 PR 地址（`pr-created` 时存在） */
    prUrl?: string
    /** 交付 PR 编号（`pr-created` 且来源为 GitHub 时存在） */
    prNumber?: number
}
