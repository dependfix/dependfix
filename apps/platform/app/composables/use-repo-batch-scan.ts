import type { Ref } from 'vue'
import { DEFAULT_SCAN_MODE, DEFAULT_SCAN_SEVERITY } from './use-scan-preferences'
import type { RepoView } from '~/types/platform'

/**
 * repos 页批量扫描 composable（自 repos.vue 拆出以控制单文件行数）。
 *
 * 业务语义：勾选多仓库 → POST `/api/repos/batch-scan` → 跳转批量运行页查看进度与聚合结果。
 * - 乐观关闭：提交前立即关闭 dialog，避免用户感知"点了不关"（同步模式几百毫秒不易察觉，
 *   异步模式返回前用户会看到 dialog 持续 spinning + 滞留）；失败时回滚 dialog + 显示错误。
 * - `selectedRows` 由页面持有（表格勾选绑定），composable 只读取其 id 列表。
 * - `mode` / `severity` 默认值走设备级扫描偏好（显式默认 > 上次选择 > 硬编码兜底），
 *   提交时记录「上次选择」；见 `use-scan-preferences.ts`。
 */
export interface UseRepoBatchScanReturn {
    batchDialogVisible: Ref<boolean>
    batchSubmitting: Ref<boolean>
    batchError: Ref<string>
    batchMode: Ref<string>
    batchSeverityThreshold: Ref<string>
    openBatchScan: () => void
    submitBatchScan: () => Promise<void>
}

export const useRepoBatchScan = (
    selectedRows: Ref<RepoView[]>,
    onSuccess: (message: string) => void,
): UseRepoBatchScanReturn => {
    const { t } = useI18n()
    const scanPreferences = useScanPreferences()
    const batchDialogVisible = ref(false)
    const batchSubmitting = ref(false)
    const batchError = ref('')
    const batchMode = ref<string>(DEFAULT_SCAN_MODE)
    const batchSeverityThreshold = ref<string>(DEFAULT_SCAN_SEVERITY)

    const openBatchScan = () => {
        if (!selectedRows.value.length) {
            return
        }
        batchError.value = ''
        // 默认值：设备级偏好（显式默认 > 上次选择 > 硬编码兜底）
        const defaults = scanPreferences.resolveDefaults()
        batchMode.value = defaults.mode
        batchSeverityThreshold.value = defaults.severity
        batchDialogVisible.value = true
    }

    const submitBatchScan = async () => {
        batchSubmitting.value = true
        batchError.value = ''
        batchDialogVisible.value = false
        // 记录「上次选择」（设备级偏好；下次打开批量弹窗作为默认值来源之一）
        scanPreferences.rememberChoice(batchMode.value, batchSeverityThreshold.value)
        try {
            const result = await $fetch<{ batchRunId: string, repositoryCount: number }>('/api/repos/batch-scan', {
                method: 'POST',
                body: {
                    repositoryIds: selectedRows.value.map((r) => r.id),
                    mode: batchMode.value,
                    severityThreshold: batchSeverityThreshold.value,
                },
            })
            onSuccess(t('repos.success.batchTriggered', { count: result.repositoryCount }))
            await navigateTo('/batch-runs')
        } catch (e: any) {
            // 失败时回滚 dialog + 显示错误（用户可重试或修改后再次提交）
            batchDialogVisible.value = true
            batchError.value = t('repos.errors.batchFailed', { message: e?.data?.message ?? e?.message ?? t('common.errors.unknown') })
        } finally {
            batchSubmitting.value = false
        }
    }

    return { batchDialogVisible, batchSubmitting, batchError, batchMode, batchSeverityThreshold, openBatchScan, submitBatchScan }
}
