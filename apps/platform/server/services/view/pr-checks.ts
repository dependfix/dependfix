import type { SelectQueryBuilder } from 'typeorm'
import { sanitizeV1Text } from './text'
import type { PRCheck } from '#server/entities/pr-check'
import { toPRCheckView } from '#server/utils/pr-check-view'

/** PR Check 筛选（内部列表与 v1 共用；`all` 视为不过滤） */
export interface PRCheckFilters {
    repositoryId?: string
    conclusion?: string
    alertFiring?: boolean
}

export const applyPRCheckFilters = <T extends SelectQueryBuilder<PRCheck>>(
    qb: T,
    filters: PRCheckFilters,
): T => {
    if (filters.repositoryId && filters.repositoryId !== 'all') {
        qb.andWhere('prCheck.repositoryId = :repositoryId', { repositoryId: filters.repositoryId })
    }
    if (filters.conclusion) {
        qb.andWhere('prCheck.conclusion = :conclusion', { conclusion: filters.conclusion })
    }
    if (filters.alertFiring !== undefined) {
        qb.andWhere('prCheck.alertFiring = :alertFiring', { alertFiring: filters.alertFiring })
    }
    return qb
}

/** 稳定排序：createdAt DESC + 主键 DESC（同毫秒并列时保证分页稳定） */
export const applyPRCheckOrder = <T extends SelectQueryBuilder<PRCheck>>(qb: T): T => (
    qb.orderBy('prCheck.createdAt', 'DESC').addOrderBy('prCheck.id', 'DESC')
)

/** v1 PR Check 视图：自由文本清洗后复用内部视图 */
export const toPRCheckV1View = (row: PRCheck) => {
    const view = toPRCheckView(row)
    return {
        ...view,
        errorMessage: view.errorMessage ? sanitizeV1Text(view.errorMessage) : null,
        detailsUrl: view.detailsUrl ? sanitizeV1Text(view.detailsUrl) : null,
        signals: view.signals?.map((signal) => ({
            ...signal,
            name: sanitizeV1Text(signal.name),
            summary: signal.summary ? sanitizeV1Text(signal.summary) : null,
            targetUrl: signal.targetUrl ? sanitizeV1Text(signal.targetUrl) : null,
            logUrl: signal.logUrl ? sanitizeV1Text(signal.logUrl) : null,
        })) ?? null,
        failureSources: view.failureSources?.map((source) => ({
            ...source,
            name: sanitizeV1Text(source.name),
        })) ?? null,
    }
}
