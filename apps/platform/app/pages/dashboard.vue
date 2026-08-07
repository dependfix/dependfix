<script setup lang="ts">
// 仪表板占位：统计卡片在告警视图落地后接入真实数据（任务归属见 `docs/plan/todo.md` §M6）
const { session } = useSession()

definePageMeta({
    middleware: 'auth',
})

const stats = computed(() => [
    { label: '仓库数', value: '--' },
    { label: '告警数', value: '--' },
    { label: '已修复', value: '--' },
    { label: '最近扫描', value: '--' },
])
</script>

<template>
    <div class="dashboard">
        <h2>仪表板</h2>
        <p class="text-muted">
            欢迎回来，{{ session?.user?.email }}。仓库与告警统计将在后续任务提供。
        </p>
        <div class="dashboard__stats">
            <Card
                v-for="stat in stats"
                :key="stat.label"
                class="dashboard__stat"
            >
                <template #content>
                    <div class="dashboard__stat-value">
                        {{ stat.value }}
                    </div>
                    <div class="dashboard__stat-label text-muted">
                        {{ stat.label }}
                    </div>
                </template>
            </Card>
        </div>
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
    }

    &__stat-label {
        font-size: $font-size-sm;
        margin-top: $space-1;
    }
}
</style>
