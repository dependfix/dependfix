<script setup lang="ts">
// PR Check 失败详情：provider 原生构建日志尾部 / 不可用原因
// （数据由服务端 `PRCheck.providerLogsJson` 解析后传入；null 时父组件不渲染本组件）
import { providerLogReasonI18nKey } from '~/utils/pr-check-style'

interface ProviderLogsView {
    available: boolean
    provider: string
    tail?: string
    truncated?: boolean
    reason?: string
    status?: number
    fetchedAt: string
}

defineProps<{
    logs: ProviderLogsView
}>()

const { t } = useI18n()
</script>

<template>
    <div class="provider-logs">
        <div class="provider-logs__head">
            <span class="provider-logs__title">{{ t('prChecks.providerLogsTitle') }}</span>
            <CaomeiTag tone="neutral">
                {{ logs.provider }}
            </CaomeiTag>
            <span class="provider-logs__meta">
                {{ t('prChecks.providerLogsFetchedAt', {time: new Date(logs.fetchedAt).toLocaleString()}) }}
            </span>
            <small v-if="logs.available && logs.truncated" class="text-muted">
                {{ t('prChecks.providerLogsTruncated') }}
            </small>
        </div>
        <pre
            v-if="logs.available && logs.tail"
            class="provider-logs__tail"
        >{{ logs.tail }}</pre>
        <p v-else class="provider-logs__empty">
            <template v-if="logs.available">
                {{ t('prChecks.providerLogsEmpty') }}
            </template>
            <template v-else>
                {{ t('prChecks.providerLogsUnavailable') }} · {{ t(providerLogReasonI18nKey(logs.reason)) }}
                <span v-if="logs.status">（HTTP {{ logs.status }}）</span>
            </template>
        </p>
    </div>
</template>

<style lang="scss" scoped>
.provider-logs {
    margin-top: $space-3;
    padding-top: $space-2;
    border-top: 1px dashed $color-border;

    &__head {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: $space-2;
        margin-bottom: $space-2;
    }

    &__title {
        font-weight: 600;
    }

    &__meta {
        font-size: $font-size-sm;
        color: $color-text-muted;
    }

    &__tail {
        max-height: 240px;
        margin: 0;
        padding: $space-2;
        overflow: auto;
        background: var(--caomei-color-bg-elevated);
        border-radius: $radius-sm;
        font-size: $font-size-sm;
        white-space: pre-wrap;
        word-break: break-all;
    }

    &__empty {
        margin: 0;
        font-size: $font-size-sm;
        color: $color-text-muted;
    }
}
</style>
