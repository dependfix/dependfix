<script setup lang="ts">
/**
 * 沙箱启动降级横幅（degraded + sandbox_unavailable）。
 *
 * 在运行详情两个入口（`run-detail-dialog` / `repo-history-dialog`）复用，保证原因文案、
 * 处置说明与文档链接只有一处实现；仅展示服务端记录的 message，不自行推断原因。
 */
defineProps<{
    /** 服务端 errorJson.message（含结构化原因与自动降级说明） */
    message: string
}>()

const { t } = useI18n()

/** 沙箱启用与排障文档（与 run-detail / repo-history 同源） */
const SANDBOX_DOCS_URL = 'https://github.com/dependfix/dependfix/blob/master/docs/guide/quick-start.md'
</script>

<template>
    <CaomeiMessage
        tone="warning"
        :closable="false"
    >
        <strong>{{ t('runs.sandboxDegradedTitle') }}</strong>
        <p class="sandbox-degraded__message">
            {{ message }}
        </p>
        <p class="sandbox-degraded__hint text-muted">
            {{ t('runs.sandboxDegradedHint') }}
        </p>
        <a
            :href="SANDBOX_DOCS_URL"
            target="_blank"
            rel="noopener noreferrer"
        >
            {{ t('runs.sandboxDocsLink') }}
        </a>
    </CaomeiMessage>
</template>

<style lang="scss" scoped>
.sandbox-degraded__message {
    margin: $space-1 0 0;
    overflow-wrap: anywhere;
}

.sandbox-degraded__hint {
    margin: $space-1 0;
    font-size: $font-size-sm;
}
</style>
