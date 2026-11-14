<script setup lang="ts">
/**
 * 仓库列表的搜索 / 筛选工具栏（自 repos.vue 拆出：页面行数治理 max-lines 800）。
 *
 * 纯展示组件：筛选状态与其派生结果由页面经 `use-repo-filters` 持有，
 * 这里只负责控件渲染与 `reset` 事件上抛（不改写状态所有权）。
 * 布局骨架复用 `filter-bar` / `filter-field`（与批量运行页同源）。
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
const asFilterValue = (value: string | number | null | undefined) => (value === null || value === undefined) ? 'all' : String(value)
</script>

<template>
    <filter-bar
        :active="active"
        :reset-label="t('repos.filterReset')"
        @reset="emit('reset')"
    >
        <filter-field
            :label="t('repos.filterSearch')"
            for-id="repos-filter-search"
            grow
            muted
        >
            <CaomeiInput
                id="repos-filter-search"
                :model-value="searchQuery"
                :placeholder="t('repos.filterSearchPlaceholder')"
                @update:model-value="emit('update:searchQuery', $event)"
            />
        </filter-field>
        <filter-field
            :label="t('repos.colExecutor')"
            for-id="repos-filter-executor"
            muted
        >
            <CaomeiSelect
                id="repos-filter-executor"
                :model-value="executorKind"
                :options="executorOptions"
                option-label="label"
                option-value="value"
                @update:model-value="emit('update:executorKind', asFilterValue($event))"
            />
        </filter-field>
        <filter-field
            :label="t('repos.colPackageManager')"
            for-id="repos-filter-package-manager"
            muted
        >
            <CaomeiSelect
                id="repos-filter-package-manager"
                :model-value="packageManager"
                :options="packageManagerOptions"
                option-label="label"
                option-value="value"
                @update:model-value="emit('update:packageManager', asFilterValue($event))"
            />
        </filter-field>
        <filter-field
            :label="t('repos.colCredential')"
            for-id="repos-filter-credential"
            muted
        >
            <CaomeiSelect
                id="repos-filter-credential"
                :model-value="credentialId"
                :options="credentialOptions"
                option-label="label"
                option-value="value"
                @update:model-value="emit('update:credentialId', asFilterValue($event))"
            />
        </filter-field>
    </filter-bar>
</template>
