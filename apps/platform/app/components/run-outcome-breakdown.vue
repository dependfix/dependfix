<script setup lang="ts">
import {
    skippedBreakdown,
    skippedTotal,
    totalDiscoveredAlerts,
    truncatedBreakdown,
    truncatedTotal,
    unfixedAlerts,
} from '~/utils/run-view'

const props = defineProps<{
    summary: Record<string, unknown> | null
}>()

const { t } = useI18n()

const total = computed(() => totalDiscoveredAlerts(props.summary))
const unfixed = computed(() => unfixedAlerts(props.summary))
const skipped = computed(() => skippedTotal(props.summary))
const truncated = computed(() => truncatedTotal(props.summary))
const skippedRows = computed(() => skippedBreakdown(props.summary))
const truncatedRows = computed(() => truncatedBreakdown(props.summary))

/** 有未修复 / 跳过 / 截断时都要给出构成：仅「无写入」不足以说明告警处置结果。 */
const show = computed(() => unfixed.value > 0 || skipped.value > 0 || truncated.value > 0)

const severityLabel = (key: string) => key === 'other'
    ? t('runs.breakdown.other')
    : key.charAt(0).toUpperCase() + key.slice(1)

const severityTone = (key: string) => {
    switch (key) {
        case 'critical':
            return 'danger' as const
        case 'high':
            return 'warning' as const
        case 'medium':
            return 'primary' as const
        default:
            return 'neutral' as const
    }
}

const reasonLabel = (key: string) => {
    const keys: Record<string, string> = {
        'subdirectory-manifest': 'runs.breakdown.reason.subdirectoryManifest',
        'cross-major': 'runs.breakdown.reason.crossMajor',
        'not-fixable': 'runs.breakdown.reason.notFixable',
        'override-protected': 'runs.breakdown.reason.overrideProtected',
        'repeated-failure': 'runs.breakdown.reason.repeatedFailure',
        'peer-only': 'runs.breakdown.reason.peerOnly',
        other: 'runs.breakdown.other',
    }
    return t(keys[key] ?? 'runs.breakdown.other')
}
</script>

<template>
    <section v-if="show" class="run-outcome-breakdown">
        <div
            v-if="total > 0"
            class="run-outcome-breakdown__headline"
            :title="t('runs.breakdown.headlineHint')"
        >
            {{ t('runs.breakdown.headline', {unfixed, total}) }}
            <span v-if="truncated > 0"> · {{ t('runs.breakdown.truncatedNotEvaluated', {count: truncated}) }}</span>
            <span v-if="skipped > 0"> · {{ t('runs.breakdown.skippedShort', {count: skipped}) }}</span>
        </div>
        <div v-if="truncatedRows.length > 0" class="run-outcome-breakdown__group">
            <span class="run-outcome-breakdown__label">{{ t('runs.breakdown.truncatedBySeverity') }}</span>
            <CaomeiTag
                v-for="row in truncatedRows"
                :key="row.key"
                :tone="severityTone(row.key)"
            >
                {{ severityLabel(row.key) }} {{ row.count }}
            </CaomeiTag>
        </div>
        <div v-if="skippedRows.length > 0" class="run-outcome-breakdown__group">
            <span class="run-outcome-breakdown__label">{{ t('runs.breakdown.skippedByReason') }}</span>
            <CaomeiTag
                v-for="row in skippedRows"
                :key="row.key"
                tone="neutral"
            >
                {{ reasonLabel(row.key) }} {{ row.count }}
            </CaomeiTag>
        </div>
    </section>
</template>

<style lang="scss" scoped>
.run-outcome-breakdown {
    display: flex;
    flex-direction: column;
    gap: $space-2;
    margin: $space-3 0;
    padding: $space-3;
    background: var(--caomei-color-bg-elevated);
    border-radius: $radius-sm;

    &__headline {
        font-size: $font-size-sm;
        font-weight: 600;
    }

    &__group {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: $space-2;
        font-size: $font-size-sm;
    }

    &__label {
        color: $color-text-muted;
    }
}
</style>
