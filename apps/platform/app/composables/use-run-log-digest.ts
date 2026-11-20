import { computed, ref, watch, type Ref } from 'vue'
import { digestLogEntries, formatLogDigest, LOG_DIGEST_MAX_GROUPS, paginateDigest, type LogDigestEntry } from '#shared/log-digest'
import { downloadFile, downloadText } from '~/utils/download'

/**
 * 运行详情弹窗的日志「聚合 / 原始」两档（`run-detail-dialog` 与 `repo-history-dialog` 共用）。
 *
 * - 聚合档：客户端用 `#shared/log-digest` 计算（与未来 v1 `/runs/{id}/logs` 同源），复制 / 下载
 *   的文本可直接粘贴给 AI；
 * - 原始档：保持既有 `logsText` 与服务端 `/api/runs/{id}/logs` 附件，零回归；
 * - `logsDropped > 0` 时由 UI 提示「日志不是完整执行过程」。
 */

export type RunLogViewMode = 'digest' | 'raw'

/** 弹窗详情中与日志相关的字段（详情响应子集） */
export interface RunLogDetail {
    id?: string
    logs?: LogDigestEntry[]
    logsText?: string | null
    logsDropped?: number | null
}

export function useRunLogDigest(detail: Ref<RunLogDetail | null | undefined>) {
    const mode = ref<RunLogViewMode>('digest')
    // 切换到另一条 run 时回到默认聚合档（避免沿用上一条的「原始」选择）
    watch(() => detail.value?.id, () => {
        mode.value = 'digest'
    })
    const digest = computed(() => paginateDigest(digestLogEntries(detail.value?.logs ?? [], {
        droppedBefore: detail.value?.logsDropped ?? null,
    }), 1, LOG_DIGEST_MAX_GROUPS))
    const digestText = computed(() => formatLogDigest(digest.value))
    const droppedBefore = computed<number | null>(() => detail.value?.logsDropped ?? null)
    const hasDropped = computed(() => (droppedBefore.value ?? 0) > 0)
    const logText = computed(() => (
        mode.value === 'digest' ? digestText.value : (detail.value?.logsText ?? '')
    ))

    const copy = async (): Promise<void> => {
        if (!logText.value) {
            return
        }
        try {
            await navigator.clipboard.writeText(logText.value)
        } catch {
            // 降级方案（非安全上下文 / 权限被拒）
            const textarea = document.createElement('textarea')
            textarea.value = logText.value
            document.body.appendChild(textarea)
            textarea.select()
            document.execCommand('copy')
            document.body.removeChild(textarea)
        }
    }

    const download = async (): Promise<void> => {
        const runId = detail.value?.id
        if (!runId) {
            return
        }
        if (mode.value === 'digest') {
            downloadText(`run-${runId}-digest.txt`, digestText.value)
            return
        }
        await downloadFile(`/api/runs/${runId}/logs`, `run-${runId}.txt`)
    }

    return {
        mode,
        digestText,
        droppedBefore,
        hasDropped,
        logText,
        copy,
        download,
    }
}
