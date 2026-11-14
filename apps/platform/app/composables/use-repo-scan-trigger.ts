import { getCurrentScope, onScopeDispose, ref, type Ref } from 'vue'
import type { RepoView } from '~/types/platform'

/**
 * 仓库列表的单仓库扫描触发与状态轮询（自 repos.vue 拆出：页面行数治理 max-lines 800）。
 *
 * 语义与拆分前一致：
 * - 异步队列：POST 返回 `pending` → 每 2s 轮询 `/api/runs/{id}`（容器模式 10min / GitHub Action 30min 上限）
 * - 同步降级：请求内完成（`completed` / `failed` / `dispatched`）
 * - 去重合并（`merged`）：非执行失败，只提示合并语义，不轮询、不按失败呈现
 * - 组件卸载（或 effect scope 释放）后停止轮询，避免 SPA 导航离开后继续请求
 *
 * 依赖通过参数注入（不加载 Nuxt 运行时），便于单测覆盖各状态分支。
 */
export interface ScanTriggerResponse {
    id: string
    status: string
    runUrl: string | null
    merged?: { code: string, message: string }
    error?: { message?: string } | null
}

export interface ScanRunPollResult {
    status: string
    runUrl: string | null
    error?: { code?: string, message?: string } | null
}

export interface ScanTriggerBody {
    mode: string
    severityThreshold: string
    executorKind?: string
    aiEnabled: boolean
    aiTrigger: 'failure' | 'major' | 'both'
}

export type ScanPollResponse = { ok: true, run: ScanRunPollResult } | { ok: false }

export interface UseRepoScanTriggerOptions {
    /** i18n 文案解析 */
    t: (key: string, params?: Record<string, string | number>) => string
    /** POST `/api/repos/{id}/scan` */
    request: (repoId: string, body: ScanTriggerBody) => Promise<ScanTriggerResponse>
    /** GET `/api/runs/{id}`（`ok=false` 表示响应非 2xx） */
    poll: (runId: string) => Promise<ScanPollResponse>
    /** 扫描结束（或触发完成）后刷新列表 */
    refresh: () => Promise<void>
    /** 轮询间隔（默认 2000ms） */
    pollIntervalMs?: number
    /** 容器模式轮询上限（默认 10min） */
    pollTimeoutMs?: number
    /** GitHub Action 模式轮询上限（默认 30min） */
    actionPollTimeoutMs?: number
    sleep?: (ms: number) => Promise<void>
    now?: () => number
}

export interface UseRepoScanTriggerReturn {
    scanningId: Ref<string | null>
    scanError: Ref<string>
    scanMerged: Ref<string>
    scanSuccess: Ref<string>
    lastRunUrl: Ref<string | null>
    triggerScan: (
        repo: RepoView,
        mode: string,
        severity: string,
        aiEnabled?: boolean,
        aiTrigger?: 'failure' | 'major' | 'both',
    ) => Promise<void>
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export const useRepoScanTrigger = ({
    t,
    request,
    poll,
    refresh,
    pollIntervalMs = 2000,
    pollTimeoutMs = 10 * 60_000,
    actionPollTimeoutMs = 30 * 60_000,
    sleep = defaultSleep,
    now = Date.now,
}: UseRepoScanTriggerOptions): UseRepoScanTriggerReturn => {
    const scanningId = ref<string | null>(null)
    const scanError = ref('')
    const scanMerged = ref('')
    const scanSuccess = ref('')
    const lastRunUrl = ref<string | null>(null)

    /** 轮询取消标志：作用域释放（组件卸载）时置位，避免导航离开后继续轮询 */
    let pollCancelled = false
    if (getCurrentScope()) {
        onScopeDispose(() => {
            pollCancelled = true
        })
    }

    const pollRun = async (runId: string, executorKind: string) => {
        const startedAt = now()
        const timeout = executorKind === 'github-action' ? actionPollTimeoutMs : pollTimeoutMs
        while (!pollCancelled && now() - startedAt < timeout) {
            await sleep(pollIntervalMs)
            const response = await poll(runId)
            if (!response.ok) {
                scanError.value = t('repos.scanStatusQueryFailed')
                return
            }
            const run = response.run
            if (run.status === 'completed') {
                scanSuccess.value = t('repos.scanCompleted')
                return
            }
            if (run.status === 'failed') {
                // SCAN_PENDING_MERGED（去重合并）：非执行失败，走 warning 提示合并语义。
                // 防御分支（按测试规范 §6.5 登记）：异步合并已在立即响应阶段短路，本分支在生产不可达；
                // 保留以防后续轮询观测到被合并 run 的终态。
                if (run.error?.code === 'SCAN_PENDING_MERGED') {
                    scanSuccess.value = ''
                    scanMerged.value = t('common.scanTriggerMerged')
                } else {
                    scanError.value = t('repos.scanFailed', { message: run.error?.message ?? t('common.errors.unknown') })
                }
                return
            }
            if (run.status === 'dispatched') {
                lastRunUrl.value = run.runUrl
                scanSuccess.value = run.runUrl ? t('repos.scanDispatchedWithUrl') : t('repos.scanDispatched')
                return
            }
            // pending / running：继续轮询
        }
        if (!pollCancelled) {
            scanSuccess.value = t('repos.scanInProgress')
        }
    }

    const triggerScan = async (
        repo: RepoView,
        mode: string,
        severity: string,
        aiEnabled: boolean = false,
        aiTrigger: 'failure' | 'major' | 'both' = 'both',
    ) => {
        pollCancelled = false
        scanError.value = ''
        scanMerged.value = ''
        scanSuccess.value = ''
        lastRunUrl.value = null
        scanningId.value = repo.id
        // B 模式（GitHub Action）异步队列下由 worker 后台执行（不再同步挂起 30 分钟）
        if (repo.executorKind === 'github-action') {
            scanSuccess.value = t('repos.scanTriggering')
        }
        try {
            const runData = await request(repo.id, {
                mode,
                severityThreshold: severity,
                executorKind: repo.executorKind === 'github-action' ? 'github-action' : undefined,
                aiEnabled,
                aiTrigger,
            })
            if (runData.merged) {
                // 去重合并：本次触发未真正执行 → 只提示合并语义，清掉异步预置的「正在触发…」
                scanSuccess.value = ''
                scanMerged.value = t('common.scanTriggerMerged')
            } else if (runData.status === 'pending') {
                scanSuccess.value = t('repos.scanQueued')
                await pollRun(runData.id, repo.executorKind ?? 'container')
            } else if (runData.status === 'dispatched') {
                lastRunUrl.value = runData.runUrl
                scanSuccess.value = runData.runUrl ? t('repos.scanDispatchedWithUrl') : t('repos.scanDispatched')
            } else if (runData.status === 'completed') {
                scanSuccess.value = t('repos.scanCompleted')
            } else {
                scanError.value = t('repos.scanFailed', { message: runData.error?.message ?? t('common.errors.unknown') })
            }
            await refresh()
        } catch (e: any) {
            scanError.value = t('repos.errors.triggerFailed', { message: e?.data?.message ?? e?.message ?? t('common.errors.unknown') })
        } finally {
            scanningId.value = null
        }
    }

    return { scanningId, scanError, scanMerged, scanSuccess, lastRunUrl, triggerScan }
}
