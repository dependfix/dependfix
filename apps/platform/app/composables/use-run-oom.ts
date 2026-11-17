// use-run-oom.ts — 运行详情 OOM 分层展示状态（命令级 vs 运行级）。
//
// 从 `run-detail-dialog.vue` 抽出：该 SFC 已贴 max-lines 上限，且分层判定（命令级已归因时
// 不单列运行级、failed 运行两类并列）是纯派生逻辑，抽成 composable 后可在别处复用 / 单测。
import { computed, type Ref } from 'vue'
import { commandOomCommands, commandOomKills, isRunResultMissing } from '../utils/run-view'

/** OOM 分层所需的运行详情最小切片（避免依赖完整 DTO 造成耦合）。 */
export interface RunOomView {
    status: string
    oomKilled?: boolean | null
    summary?: Record<string, unknown> | null
    resource?: { degradedReason?: string | null } | null
    /** 失败错误（`execution_timeout` 会让结果视为缺失 → 命令级行不可见，抑制条件须与可见性同源） */
    error?: { code?: string | null } | null
}

export function useRunOom(detail: Ref<RunOomView | null>) {
    /** 命令级 OOM 次数（按命令实例计）与命令名摘要（正文内可见，最多 10 条） */
    const commandOomCount = computed(() => commandOomKills(detail.value?.summary ?? null))
    const commandOomText = computed(() => commandOomCommands(detail.value?.summary ?? null).join('、'))
    const commandOomVisible = computed(() => (
        Boolean(detail.value && !isRunResultMissing(detail.value)) && commandOomCount.value > 0
    ))
    /** 运行级 OOM：completed + 命令级已归因时不单列（cgroup 计数可由命令解释）；failed 两类并列 */
    const runLevelOomVisible = computed(() => {
        const current = detail.value
        if (!current) {
            return false
        }
        // 抑制条件与「命令级行真的可见」同源：结果缺失（如 execution_timeout）时命令级行不渲染，
        // 此时不得抑制运行级行，否则两行同时消失
        if (commandOomVisible.value && current.status === 'completed') {
            return false
        }
        return typeof current.oomKilled === 'boolean' || Boolean(current.resource?.degradedReason)
    })

    return { commandOomCount, commandOomText, commandOomVisible, runLevelOomVisible }
}
