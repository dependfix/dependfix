import type { PRCheck } from '#server/entities/pr-check'
import type { BuildFailureSource } from '#server/services/monitor/build-signals'
import type { UnifiedBuildSignal } from '#server/services/monitor/types'
import { matchesPRCheckFocus, parsePRCheckFocus } from '#server/utils/pr-check-focus'

/**
 * PRCheck API 视图（列表 / 详情共用单一事实源）。
 *
 * 存在理由：列表（`pr-checks/index.get.ts`）与详情（`pr-checks/[id].get.ts`）必须给出**同一契约**
 * —— 新增字段只改一处，避免两端漂移（历史教训：详情端点曾长期缺少 `repository` 字段）。
 *
 * 字段口径：
 * - `repository`：服务端解析的 `owner/name`（与 alerts / env-events / dashboard 同源口径；
 *   调用方须加载 `repository` 关系，否则回退 `null`）
 * - `overallStatus` / `signals` / `failureSources`：三源聚合字段；JSON 列解析，
 *   列值缺失或损坏时回退 `null`（不抛错）
 * - `prState`：PR 生命周期（`open` / `closed` / `merged` / `unknown`）
 * - `focusConfigured`：该仓库是否配置了 PR Check 告警关注集（`false` = 全量只报警不阻断）
 * - `signals[].focused`：该信号是否命中关注集（未配置时恒为 `true`）。未命中的信号仍返回
 *   （审计面），由前端标注「未关注」；`overallStatus` / `failureSources` 只反映命中项。
 */
export type PRCheckSignalView = Omit<UnifiedBuildSignal, 'observedAt'> & {
    observedAt: string
    /** 是否命中仓库关注集（未配置时恒 true） */
    focused: boolean
}

export type PRCheckFailureSourceView = BuildFailureSource

/** JSON 列安全解析（缺失 / 非 JSON / 非数组时回退 null，不抛错） */
const parseJsonArrayColumn = (value: string | null | undefined): unknown[] | null => {
    if (!value) {
        return null
    }
    try {
        const parsed: unknown = JSON.parse(value)
        return Array.isArray(parsed) ? parsed : null
    } catch {
        return null
    }
}

export const toPRCheckView = (row: PRCheck) => {
    // `repository` 关系是关注集标注的前置条件（列表端点 leftJoinAndSelect / 详情端点 relations 均已加载）；
    // 若调用方漏加载，`focusConfigured=false` 且全部信号 `focused=true` —— 属已知降级路径（`repository: null` 可作旁证）
    const focus = parsePRCheckFocus(row.repository?.prCheckFocus)
    // 元素级形态守卫：`signals_json` 合法但含非对象元素（脏数据）时丢弃该元素，避免解引用抛错阻塞整份列表
    const signals = (parseJsonArrayColumn(row.signalsJson) as Omit<PRCheckSignalView, 'focused'>[] | null)
        ?.filter((signal) => typeof signal === 'object' && signal !== null)
    return {
        id: row.id,
        repositoryId: row.repositoryId,
        // 防御分支：正常路径下 FK 非空 + CASCADE 不可达；调用方漏加载关系（未配 relations / leftJoinAndSelect）时命中并回退 null
        repository: row.repository ? `${row.repository.owner}/${row.repository.name}` : null,
        prNumber: row.prNumber,
        headSha: row.headSha,
        authorLogin: row.authorLogin,
        conclusion: row.conclusion,
        prState: row.prState,
        overallStatus: row.overallStatus,
        // 逐信号标注是否命中关注集：未配置时全为 true；未命中的信号仍在列表中（审计面）
        focusConfigured: focus !== null,
        signals: signals?.map((signal) => ({
            ...signal,
            focused: !focus || matchesPRCheckFocus(signal, focus),
        })) ?? null,
        failureSources: parseJsonArrayColumn(row.failureSourcesJson) as PRCheckFailureSourceView[] | null,
        checkRunId: row.checkRunId,
        detailsUrl: row.detailsUrl,
        errorMessage: row.errorMessage,
        alertFiring: row.alertFiring,
        acknowledgedAt: row.acknowledgedAt?.toISOString() ?? null,
        acknowledgedByUserId: row.acknowledgedByUserId,
        lastPolledAt: row.lastPolledAt.toISOString(),
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
    }
}

export type PRCheckView = ReturnType<typeof toPRCheckView>
