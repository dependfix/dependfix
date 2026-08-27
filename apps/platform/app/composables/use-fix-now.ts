import type { Ref } from 'vue'

/**
 * alerts 视图 "立即修复此仓库" 一键修复 composable（todo.md §M16.2 C66-D）。
 *
 * 业务语义：
 * - 用户在 alerts 详情 Sidebar 选中一个 report-only 的受影响运行
 * - 一键复用该 run_id（reuseScanRunId）触发 fix 模式扫描，跳过 createPendingScanRun
 * - 成功后跳转扫描历史（/scans?repository=xxx&run=xxx）查看 fix 进度
 *
 * 三态分离（与 alerts/batch-runs 同模式）：
 * - fixingRunId：当前正在触发修复的 run.id（按钮 loading 反馈，并发守卫防重复点击）
 * - fixError / fixSuccess：toast 状态，5s 自动清除
 */

interface FixableRunView {
    id: string
    repositoryId: string
    severityThreshold: string
}

export interface UseFixNowReturn {
    fixingRunId: Ref<string | null>
    fixError: Ref<string>
    fixSuccess: Ref<string>
    triggerFix: (run: FixableRunView) => Promise<void>
    resetMessages: () => void
}

export const useFixNow = (): UseFixNowReturn => {
    const { t } = useI18n()
    const fixingRunId = ref<string | null>(null)
    const fixError = ref('')
    const fixSuccess = ref('')

    watch(fixSuccess, (v) => {
        if (v) {
            setTimeout(() => {
                fixSuccess.value = ''
            }, 5000)
        }
    })
    watch(fixError, (v) => {
        if (v) {
            setTimeout(() => {
                fixError.value = ''
            }, 5000)
        }
    })

    const resetMessages = () => {
        fixError.value = ''
        fixSuccess.value = ''
    }

    /**
     * 触发一键修复。
     * - body 携带 mode: 'fix' + reuseScanRunId：服务端跳过 createPendingScanRun，
     *   直接以复用 run.id 进入 fix 流程；scan_result 数据复用 report-only run 的输出
     *   （无需重拉 Dependabot / pnpm audit 等外部告警源）
     * - 成功后跳转 /scans?repository=xxx&run=xxx，触发 scans.vue 内 mount 的
     *   `repo-history-dialog` query-key="run" 直接打开详情
     * - 失败：toast 错误信息（5s 自动清除）；不跳转
     */
    const triggerFix = async (run: FixableRunView) => {
        resetMessages()
        fixingRunId.value = run.id
        try {
            const res = await $fetch(`/api/repos/${run.repositoryId}/scan`, {
                method: 'POST',
                body: {
                    mode: 'fix',
                    severityThreshold: run.severityThreshold,
                    reuseScanRunId: run.id,
                },
            })
            fixSuccess.value = t('alerts.fixNow.success', { runId: (res as unknown as { id: string }).id.slice(0, 8) })
            await navigateTo(`/scans?repository=${run.repositoryId}&run=${run.id}`)
        } catch (e: any) {
            fixError.value = t('alerts.fixNow.failed', { message: e?.data?.message ?? e?.message ?? t('common.errors.unknown') })
        } finally {
            fixingRunId.value = null
        }
    }

    return { fixingRunId, fixError, fixSuccess, triggerFix, resetMessages }
}
