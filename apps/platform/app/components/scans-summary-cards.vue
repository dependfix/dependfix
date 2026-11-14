<script setup lang="ts">
/**
 * 扫描页顶部 4 块汇总卡片（自 scans.vue 拆出：页面行数治理 max-lines 800）。
 *
 * 纯展示组件：数据由页面从 `/api/scan-history/summary` 派生后传入。
 */
defineProps<{
    runs: number
    totalAlerts: number
    totalFixed: number
    /** 统计窗口最近一次扫描时间（ISO，null = 窗口内无运行） */
    lastRunAt: string | null
}>()

const { t, d } = useI18n()
</script>

<template>
    <div class="scans__summary">
        <CaomeiCard class="scans__stat">
            <div class="scans__stat-value">
                {{ runs }}
            </div>
            <div class="scans__stat-label text-muted">
                {{ t('scans.summary.totalRuns') }}
            </div>
        </CaomeiCard>
        <CaomeiCard class="scans__stat">
            <div class="scans__stat-value">
                {{ totalAlerts }}
            </div>
            <div class="scans__stat-label text-muted">
                {{ t('scans.summary.totalAlerts') }}
            </div>
        </CaomeiCard>
        <CaomeiCard class="scans__stat">
            <div class="scans__stat-value">
                {{ totalFixed }}
            </div>
            <div class="scans__stat-label text-muted">
                {{ t('scans.summary.totalFixed') }}
            </div>
        </CaomeiCard>
        <CaomeiCard class="scans__stat">
            <div class="scans__stat-value scans__stat-value--sm">
                {{ lastRunAt ? d(new Date(lastRunAt), 'short') : '—' }}
            </div>
            <div class="scans__stat-label text-muted">
                {{ t('scans.summary.lastRunAt') }}
            </div>
        </CaomeiCard>
    </div>
</template>

<style lang="scss" scoped>
.scans__summary {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: $space-4;
    margin-bottom: $space-5;
}

.scans__stat-value {
    font-size: $font-size-xl;
    font-weight: 600;
    color: var(--caomei-color-primary);

    &--sm {
        font-size: $font-size-base;
        font-weight: 500;
    }
}

.scans__stat-label {
    margin-top: $space-1;
    font-size: $font-size-sm;
}

@media (width <= 900px) {
    .scans__summary {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }
}
</style>
