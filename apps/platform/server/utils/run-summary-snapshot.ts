// run-summary-snapshot.ts — 运行摘要快照（summaryJson）的单一构造入口。
//
// 摘要落库除了引擎的 RunSummary，还需带上「平台侧可见」的外联审计摘要：
// - `networkViolations`：被 deny-by-default 拦截的条数（引擎已写；这里兜底补齐）
// - `networkViolationTargets`：最多 20 条最小化目标（host[:port]，不含查询串），供运行详情 / 导出披露
// - `delivery`：自包含交付的 branch / commitSha（PR 地址仍走 runUrl 列）；无交付记录时不写
// - `deliverySkipCarriers`：基线红载体的可跳转链接（issue / 草稿 PR）；无载体时不写
// 不新增 DB 列（summary 是 JSON 快照），因此不触发 DB 契约清单变更。

import { redactNetworkTarget, type RunResult, type RunSummary } from '@dependfix/core'

/** 摘要里附带的外联目标（最小化：source / method / host）。 */
export interface RunSummaryNetworkTarget {
    source: string
    method: string
    target: string
}

/** 摘要里附带的交付记录（最小化：状态 / 执行方 / 分支 / 提交）。 */
export interface RunSummaryDelivery {
    status: string
    deliveredBy: string
    branch?: string
    commitSha?: string
}

/** 基线红交付载体的最小可跳转信息（运行详情链接用）。 */
export interface RunSummaryDeliverySkipCarrier {
    kind: 'issue' | 'draft-pr'
    number: number
    url: string
    repositories: string[]
}

export type RunSummarySnapshot = RunSummary & {
    networkViolationTargets?: RunSummaryNetworkTarget[]
    delivery?: RunSummaryDelivery
    deliverySkipCarriers?: RunSummaryDeliverySkipCarrier[]
}

/** 单次运行最多落库的外联目标条数（详情 / 导出的展示上限，完整列表仍在报告 JSON）。 */
const MAX_TARGETS = 20

/**
 * 构造落库的 summary 快照。
 *
 * 无违规时原样返回引擎摘要；有违规时补齐计数与最小化目标列表。
 */
export function buildRunSummarySnapshot(
    result: Pick<RunResult, 'summary' | 'networkViolations' | 'delivery' | 'deliverySkips'>,
): RunSummarySnapshot {
    const violations = result.networkViolations ?? []
    const delivery = result.delivery
        ? {
            status: result.delivery.status,
            deliveredBy: result.delivery.deliveredBy,
            ...(result.delivery.branch ? { branch: result.delivery.branch } : {}),
            ...(result.delivery.commitSha ? { commitSha: result.delivery.commitSha } : {}),
        }
        : undefined
    const deliverySkipCarriers: RunSummaryDeliverySkipCarrier[] = []
    for (const record of result.deliverySkips ?? []) {
        const { issue, draftPr } = record.carrier
        if (issue) {
            deliverySkipCarriers.push({
                kind: 'issue',
                number: issue.number,
                url: issue.htmlUrl,
                repositories: [...record.repositories],
            })
        } else if (draftPr) {
            deliverySkipCarriers.push({
                kind: 'draft-pr',
                number: draftPr.number,
                url: draftPr.htmlUrl,
                repositories: [...record.repositories],
            })
        }
    }
    if (violations.length === 0 && !delivery && deliverySkipCarriers.length === 0) {
        return result.summary
    }
    return {
        ...result.summary,
        ...(violations.length > 0 && {
            networkViolations: violations.length,
            networkViolationTargets: violations.slice(0, MAX_TARGETS).map((entry) => ({
                source: entry.source,
                method: entry.method,
                target: redactNetworkTarget(entry.target),
            })),
        }),
        ...(delivery && { delivery }),
        ...(deliverySkipCarriers.length > 0 && { deliverySkipCarriers }),
    }
}
