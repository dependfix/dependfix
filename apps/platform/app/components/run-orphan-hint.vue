<script setup lang="ts">
// 孤儿运行无日志提示：stale cleanup 兜底把 run 标为 failed 时，若连一条执行日志都没有，
// 说明执行进程未走完收尾即被终止（SIGKILL / 容器被杀 / 宿主级 OOM）；日志只在收尾落库，
// 被杀时点（启动阶段 / 运行中段）无法定位。判定口径见 `~/utils/run-view.ts#isOrphanRunWithoutLogs`。
import { isOrphanRunWithoutLogs, type RunLogEvidenceView } from '~/utils/run-view'

const props = defineProps<{ run: RunLogEvidenceView }>()
const { t } = useI18n()
const visible = computed(() => isOrphanRunWithoutLogs(props.run))
</script>

<template>
    <p v-if="visible" class="text-muted">
        {{ t('runs.orphanNoLogsHint') }}
    </p>
</template>
