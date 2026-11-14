<script setup lang="ts">
/**
 * 仓库列表的搜索 / 筛选工具栏（自 repos.vue 拆出：页面行数治理 max-lines 800）。
 *
 * 纯展示组件：筛选状态与其派生结果由页面经 `use-repo-filters` 持有，
 * 这里只负责控件渲染与 `reset` 事件上抛（不改写状态所有权）。
 */
import type { RepoFilterOption } from '~/composables/use-repo-filters'

defineProps<{
    searchQuery: string
    executorKind: string
    packageManager: string
    credentialId: string
    executorOptions: RepoFilterOption[]
    packageManagerOptions: RepoFilterOption[]
    credentialOptions: RepoFilterOption[]
    /** 是否存在生效中的搜索 / 筛选（控制「重置」按钮可见性） */
    active: boolean
}>()

const emit = defineEmits<{
    'update:searchQuery': [value: string]
    'update:executorKind': [value: string]
    'update:packageManager': [value: string]
    'update:credentialId': [value: string]
    reset: []
}>()

const { t } = useI18n()

/**
 * caomei Select 的 `update:modelValue` 载荷为 `OptionValue | null | undefined`
 * （字符串或数字），本页筛选值恒为字符串：这里做最小窄化，避免把 null 写入筛选态。
 */
const asFilterValue = (value: string | number | null | undefined) => String(value ?? '')
</script>

<template>
    <section class="repos__filters">
        <div class="repos__filter-field repos__filter-field--search">
            <label for="repos-filter-search">{{ t('repos.filterSearch') }}</label>
            <CaomeiInput
                id="repos-filter-search"
                :model-value="searchQuery"
                :placeholder="t('repos.filterSearchPlaceholder')"
                @update:model-value="emit('update:searchQuery', $event)"
            />
        </div>
        <div class="repos__filter-field">
            <label for="repos-filter-executor">{{ t('repos.colExecutor') }}</label>
            <CaomeiSelect
                id="repos-filter-executor"
                :model-value="executorKind"
                :options="executorOptions"
                option-label="label"
                option-value="value"
                @update:model-value="emit('update:executorKind', asFilterValue($event))"
            />
        </div>
        <div class="repos__filter-field">
            <label for="repos-filter-package-manager">{{ t('repos.colPackageManager') }}</label>
            <CaomeiSelect
                id="repos-filter-package-manager"
                :model-value="packageManager"
                :options="packageManagerOptions"
                option-label="label"
                option-value="value"
                @update:model-value="emit('update:packageManager', asFilterValue($event))"
            />
        </div>
        <div class="repos__filter-field">
            <label for="repos-filter-credential">{{ t('repos.colCredential') }}</label>
            <CaomeiSelect
                id="repos-filter-credential"
                :model-value="credentialId"
                :options="credentialOptions"
                option-label="label"
                option-value="value"
                @update:model-value="emit('update:credentialId', asFilterValue($event))"
            />
        </div>
        <CaomeiButton
            v-if="active"
            tone="neutral"
            size="sm"
            class="repos__filter-reset"
            @click="emit('reset')"
        >
            {{ t('repos.filterReset') }}
        </CaomeiButton>
    </section>
</template>

<style lang="scss" scoped>
// 列表筛选 / 搜索工具栏（客户端筛选与分页，服务端契约不变）
.repos__filters {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: $space-3;
    margin-bottom: $space-4;
}

.repos__filter-field {
    display: flex;
    flex-direction: column;
    gap: $space-1;
    min-width: 160px;

    label {
        font-size: $font-size-sm;
        color: $color-text-muted;
    }
}

.repos__filter-field--search {
    flex: 1 1 220px;
    max-width: 320px;
}

.repos__filter-reset {
    margin-bottom: 1px;
}
</style>
