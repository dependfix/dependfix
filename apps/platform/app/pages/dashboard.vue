<script setup lang="ts">
// 仪表板：仓库数/告警数（按严重级别）/已修复数/最近扫描
const { session } = useSession()

definePageMeta({
    middleware: 'auth',
})

interface DashboardStats {
    repositoryCount: number
    alertsTotal: number
    severityCounts: Record<string, number>
    fixedCount: number
    latestRun: {
        id: string
        repository: string | null
        status: string
        startedAt: string | null
        finishedAt: string | null
    } | null
}

const loading = ref(true)
const error = ref('')
const stats = ref<DashboardStats | null>(null)

const fetchStats = async () => {
    loading.value = true
    error.value = ''
    try {
        const res = await $fetch('/api/dashboard/stats')
        stats.value = res as DashboardStats
    } catch (e: any) {
        error.value = `加载失败：${e?.data?.message ?? e?.message ?? '未知错误'}`
    } finally {
        loading.value = false
    }
}

onMounted(fetchStats)

const severityTagSeverity = (severity: string) => {
    switch (severity) {
        case 'critical':
            return 'danger'
        case 'high':
            return 'warn'
        case 'medium':
            return 'info'
        default:
            return 'secondary'
    }
}
</script>

<template>
    <div class="dashboard">
        <h2>仪表板</h2>
        <p class="text-muted">
            欢迎回来，{{ session?.user?.email }}
        </p>

        <Message
            v-if="error"
            severity="error"
            :closable="false"
        >
            {{ error }}
        </Message>

        <template v-if="!loading && stats">
            <div class="dashboard__stats">
                <Card class="dashboard__stat">
                    <template #content>
                        <div class="dashboard__stat-value">
                            {{ stats.repositoryCount }}
                        </div>
                        <div class="dashboard__stat-label text-muted">
                            仓库数
                        </div>
                    </template>
                </Card>
                <Card class="dashboard__stat">
                    <template #content>
                        <div class="dashboard__stat-value">
                            {{ stats.alertsTotal }}
                        </div>
                        <div class="dashboard__stat-label text-muted">
                            告警数
                        </div>
                    </template>
                </Card>
                <Card class="dashboard__stat">
                    <template #content>
                        <div class="dashboard__stat-value">
                            {{ stats.fixedCount }}
                        </div>
                        <div class="dashboard__stat-label text-muted">
                            已修复
                        </div>
                    </template>
                </Card>
                <Card class="dashboard__stat">
                    <template #content>
                        <div class="dashboard__stat-value dashboard__stat-value--sm">
                            {{ stats.latestRun?.repository ?? '—' }}
                        </div>
                        <div class="dashboard__stat-label text-muted">
                            最近扫描
                        </div>
                    </template>
                </Card>
            </div>

            <div class="dashboard__severity">
                <h3>告警按严重级别</h3>
                <div class="dashboard__severity-row">
                    <span
                        v-for="severity in ['critical', 'high', 'medium', 'low', 'unknown']"
                        :key="severity"
                        class="dashboard__severity-item"
                    >
                        <Tag :value="severity" :severity="severityTagSeverity(severity)" />
                        <span class="dashboard__severity-count">
                            {{ stats.severityCounts[severity] ?? 0 }}
                        </span>
                    </span>
                </div>
            </div>
        </template>
        <p v-else-if="loading" class="text-muted">
            加载中…
        </p>
    </div>
</template>

<style lang="scss" scoped>
.dashboard {
    &__stats {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: $space-4;
        margin-top: $space-5;
    }

    &__stat-value {
        font-size: 1.75rem;
        font-weight: 700;

        &--sm {
            font-size: 1.125rem;
        }
    }

    &__stat-label {
        font-size: $font-size-sm;
        margin-top: $space-1;
    }

    &__severity {
        margin-top: $space-6;
    }

    &__severity-row {
        display: flex;
        gap: $space-4;
        margin-top: $space-3;
    }

    &__severity-item {
        display: flex;
        align-items: center;
        gap: $space-2;
    }

    &__severity-count {
        font-size: $font-size-lg;
        font-weight: 600;
    }
}
</style>
