<script setup lang="ts">
// 批量导入仓库弹窗（自 repos.vue 拆出：页面行数治理 max-lines 800）
// 父组件传入已加载的凭据列表；导入成功后 emit('imported') 通知刷新仓库列表。
// PR3 能力补全（docs/plan/todo.md §PR3）：
//   - 三维过滤（fork / visibility / 关键字），过滤切换保留已勾选项（基于 id）
//   - 后端缓存（5min TTL + LRU max=64 + 并发去重）+ 前端 PrimeVue Paginator 默认 pageSize=25
//   - 顶层 defaultCredentialId 提交时携带，导入的所有仓库写库带凭据
const props = defineProps<{
    visible: boolean
    credentials: { id: string, name: string }[]
}>()

const emit = defineEmits<{
    'update:visible': [value: boolean]
    imported: []
}>()

const { t } = useI18n()

interface ImportableRepo {
    id: number
    name: string
    fullName: string
    owner: string
    private: boolean
    fork: boolean
    archived: boolean
    defaultBranch: string
    description: string | null
    imported: boolean
}

interface ImportableResponse {
    repos: ImportableRepo[]
    total: number
    cachedAt: string
    fromCache: boolean
}

const dialogVisible = computed({
    get: () => props.visible,
    set: (v: boolean) => emit('update:visible', v),
})

const importLoading = ref(false)
const importSaving = ref(false)
const importCredentialId = ref<string | null>(null)
const importableRepos = ref<ImportableRepo[]>([])
const selectedRepos = ref<ImportableRepo[]>([])
// 三维过滤（默认 source-only / all / 空关键字；docs/plan/todo.md §PR3-1）
const forkFilter = ref<'source' | 'all'>('source')
const visibilityFilter = ref<'all' | 'public' | 'private'>('all')
const searchKeyword = ref('')
// 前端分页（默认 25，参考 PR3 用户决策避免单页过载；docs/plan/todo.md §PR3-2）
const pageSize = ref<number>(25)
const currentPage = ref(0)
// 默认关联凭据（docs/plan/todo.md §PR3-3）
const defaultCredentialId = ref<string | null>(null)
// 缓存提示（docs/plan/todo.md §PR3-2）
const lastCachedAt = ref<Date | null>(null)
const lastFromCache = ref(false)
const lastFreshRefreshed = ref(false)

/** 可勾选仓库（排除已导入项；全选/计数均基于此集合） */
const selectableRepos = computed(() => importableRepos.value.filter((r) => !r.imported))

/** 三维过滤后的候选（保留 selectedRepos 语义见下方 resetPage 注；docs/plan/todo.md §PR3-1） */
const filteredRepos = computed(() => {
    const keyword = searchKeyword.value.trim().toLowerCase()
    return importableRepos.value.filter((repo) => {
        if (forkFilter.value === 'source' && repo.fork) {
            return false
        }
        if (visibilityFilter.value === 'public' && repo.private) {
            return false
        }
        if (visibilityFilter.value === 'private' && !repo.private) {
            return false
        }
        if (keyword) {
            const haystack = `${repo.fullName}\n${repo.description ?? ''}`.toLowerCase()
            if (!haystack.includes(keyword)) {
                return false
            }
        }
        return true
    })
})

/** 过滤后可勾选（基于 filteredRepos，排除已导入） */
const selectableFilteredRepos = computed(() => filteredRepos.value.filter((r) => !r.imported))

/** 分页：当前页的仓库切片 */
const pageCount = computed(() => Math.max(1, Math.ceil(filteredRepos.value.length / pageSize.value)))
const pagedRepos = computed(() => {
    const start = currentPage.value * pageSize.value
    return filteredRepos.value.slice(start, start + pageSize.value)
})

/** 缓存时间距今分钟数（向上取整，至少 0） */
const cachedMinutesAgo = computed(() => {
    if (!lastCachedAt.value) {
        return 0
    }
    return Math.max(0, Math.ceil((Date.now() - lastCachedAt.value.getTime()) / 60000))
})

const importError = ref('')
const importSuccess = ref('')

// filter / pageSize / searchKeyword 变更时重置页码到第 1（docs/plan/todo.md §PR3-1 决策：保留 selectedRepos 但重置页码）
watch([forkFilter, visibilityFilter, searchKeyword, pageSize], () => {
    currentPage.value = 0
})

watch(() => props.visible, (v) => {
    if (!v) {
        return
    }
    importError.value = ''
    importSuccess.value = ''
    selectedRepos.value = []
    importableRepos.value = []
    forkFilter.value = 'source'
    visibilityFilter.value = 'all'
    searchKeyword.value = ''
    currentPage.value = 0
    defaultCredentialId.value = null
    lastCachedAt.value = null
    lastFromCache.value = false
    lastFreshRefreshed.value = false
    // 单凭据场景自动选中并加载可导入仓库
    if (props.credentials.length === 1) {
        importCredentialId.value = props.credentials[0]!.id
        void loadImportable()
    }
})

const loadImportable = async (options?: { fresh?: boolean }) => {
    if (!importCredentialId.value) {
        importableRepos.value = []
        return
    }
    importLoading.value = true
    importError.value = ''
    try {
        const res = await $fetch('/api/repos/importable', {
            query: {
                credentialId: importCredentialId.value,
                ...(options?.fresh ? { fresh: 'true' } : {}),
            },
        })
        const data = res as ImportableResponse
        importableRepos.value = data.repos
        lastCachedAt.value = new Date(data.cachedAt)
        lastFromCache.value = data.fromCache
        lastFreshRefreshed.value = !!options?.fresh
        // 默认不勾选任何仓库（docs/plan/todo.md §PR1-1 C48：避免手滑一次导入大量仓库）；用户需主动勾选或点全选按钮
        // 当前页码重置（filter 默认值在 watch 中已重置；这里防御一次）
        currentPage.value = 0
    } catch (e: any) {
        importError.value = t('repos.errors.repoFetchFailed', { message: e?.data?.message ?? e?.message ?? t('common.errors.unknown') })
    } finally {
        importLoading.value = false
    }
}

const submitImport = async () => {
    if (!selectedRepos.value.length) {
        importError.value = t('repos.errors.selectAtLeastOne')
        return
    }
    importSaving.value = true
    importError.value = ''
    importSuccess.value = ''
    try {
        const res = await $fetch('/api/repos/batch', {
            method: 'POST',
            body: {
                repos: selectedRepos.value.map((r) => ({
                    owner: r.owner,
                    name: r.name,
                    defaultBranch: r.defaultBranch,
                })),
                defaultCredentialId: defaultCredentialId.value,
            },
        })
        const data = res as { imported: number, skipped: number }
        importSuccess.value = t('repos.success.importDone', { imported: data.imported, skipped: data.skipped })
        emit('imported')
        // 清空已导入项选择，避免下次刷新列表后 selectedRepos 残留已 disabled 的旧数据
        // （docs/plan/todo.md §PR1-1 C48：修复删除自动勾选后必须主动清空，否则导入按钮仍可点产生误导）
        selectedRepos.value = []
        await loadImportable()
    } catch (e: any) {
        importError.value = t('repos.errors.importFailed', { message: e?.data?.message ?? e?.message ?? t('common.errors.unknown') })
    } finally {
        importSaving.value = false
    }
}
</script>

<template>
    <Dialog
        v-model:visible="dialogVisible"
        :header="t('repos.importTitle')"
        modal
        :draggable="false"
        :style="{width: '760px'}"
    >
        <div class="import-form">
            <div class="import-form__row">
                <div class="import-form__field">
                    <label for="importCredential">{{ t('repos.importCredential') }}</label>
                    <Select
                        id="importCredential"
                        v-model="importCredentialId"
                        :options="credentials"
                        option-label="name"
                        option-value="id"
                        :placeholder="t('repos.importCredentialPlaceholder')"
                        :loading="importLoading"
                        fluid
                        @change="() => loadImportable()"
                    />
                </div>
                <Button
                    icon="pi pi-refresh"
                    text
                    rounded
                    :aria-label="t('repos.importRefresh')"
                    :title="t('repos.importRefresh')"
                    :disabled="!importCredentialId || importLoading"
                    @click="loadImportable({fresh: true})"
                />
            </div>

            <!-- 默认关联凭据（与「拉取用凭据」并排显示，语义分离；docs/plan/todo.md §PR3-3 C50） -->
            <div class="import-form__field">
                <label for="importDefaultCredential">{{ t('repos.importDefaultCredential') }}</label>
                <Select
                    id="importDefaultCredential"
                    v-model="defaultCredentialId"
                    :options="credentials"
                    option-label="name"
                    option-value="id"
                    :placeholder="t('repos.importDefaultCredentialPlaceholder')"
                    fluid
                />
                <small class="text-muted">{{ t('repos.importDefaultCredentialHint') }}</small>
            </div>

            <Message
                v-if="importError"
                severity="error"
                :closable="false"
            >
                {{ importError }}
            </Message>
            <Message
                v-if="importSuccess"
                severity="success"
                :closable="false"
            >
                {{ importSuccess }}
            </Message>

            <div v-if="importLoading" class="text-muted">
                {{ t('common.empty.loading') }}
            </div>
            <template v-else-if="importableRepos.length">
                <!-- 三维过滤（docs/plan/todo.md §PR3-1 C46） -->
                <div class="import-form__filters">
                    <div class="import-form__filter">
                        <label>{{ t('repos.importFilterFork') }}</label>
                        <SelectButton
                            v-model="forkFilter"
                            :options="[
                                {label: t('repos.importFilterForkSource'), value: 'source'},
                                {label: t('repos.importFilterForkAll'), value: 'all'}
                            ]"
                            option-label="label"
                            option-value="value"
                        />
                    </div>
                    <div class="import-form__filter">
                        <label>{{ t('repos.importFilterVisibility') }}</label>
                        <SelectButton
                            v-model="visibilityFilter"
                            :options="[
                                {label: t('repos.importFilterVisibilityAll'), value: 'all'},
                                {label: t('repos.importFilterVisibilityPublic'), value: 'public'},
                                {label: t('repos.importFilterVisibilityPrivate'), value: 'private'}
                            ]"
                            option-label="label"
                            option-value="value"
                        />
                    </div>
                    <div class="import-form__filter import-form__filter--grow">
                        <label for="importSearch">{{ t('repos.importFilterSearch') }}</label>
                        <InputText
                            id="importSearch"
                            v-model="searchKeyword"
                            :placeholder="t('repos.importFilterSearchPlaceholder')"
                            fluid
                        />
                    </div>
                </div>

                <!-- 总数 + 缓存提示 + 全选计数（docs/plan/todo.md §PR3-2 C49） -->
                <div class="import-form__meta">
                    <span class="text-muted">
                        {{ t('repos.importPaginationTotalCount', {total: filteredRepos.length}) }}
                        <span v-if="lastCachedAt">·</span>
                        <span v-if="lastFromCache && !lastFreshRefreshed">{{ t('repos.importCachedAt', {minutes: cachedMinutesAgo}) }}</span>
                        <span v-else-if="lastFreshRefreshed">{{ t('repos.importFreshRefreshed') }}</span>
                    </span>
                    <label>
                        <Checkbox
                            :model-value="selectedRepos.length === selectableFilteredRepos.length && selectableFilteredRepos.length > 0"
                            :binary="true"
                            @update:model-value="(v: boolean) => selectedRepos = v ? [...selectableFilteredRepos] : []"
                        />
                        {{ t('repos.importSelectAll', {count: selectableFilteredRepos.length}) }}
                    </label>
                    <span class="text-muted">{{ t('repos.importSelectedCount', {count: selectedRepos.length}) }}</span>
                </div>

                <div class="import-form__list">
                    <div
                        v-for="repo in pagedRepos"
                        :key="repo.id"
                        class="import-form__item"
                    >
                        <Checkbox
                            :model-value="selectedRepos.some((r) => r.id === repo.id)"
                            :binary="true"
                            :disabled="repo.imported"
                            @update:model-value="(checked: boolean) => {
                                selectedRepos = checked
                                    ? [...selectedRepos, repo]
                                    : selectedRepos.filter((r) => r.id !== repo.id)
                            }"
                        />
                        <div class="import-form__item-info">
                            <span>{{ repo.fullName }}</span>
                            <small class="text-muted">
                                {{ repo.private ? t('repos.privateRepo') : t('repos.publicRepo') }} · {{ repo.defaultBranch }}
                                <template v-if="repo.fork"> · fork</template>
                                <template v-if="repo.archived"> · archived</template>
                                <template v-if="repo.imported"> · {{ t('repos.imported') }}</template>
                            </small>
                        </div>
                        <Tag
                            v-if="repo.imported"
                            :value="t('repos.exists')"
                            severity="secondary"
                        />
                    </div>
                </div>

                <!-- 分页器（默认 pageSize=25，可切 50/100；docs/plan/todo.md §PR3-2 C49） -->
                <Paginator
                    :rows="pageSize"
                    :total-records="filteredRepos.length"
                    :first="currentPage * pageSize"
                    :rows-per-page-options="[25, 50, 100]"
                    template="PrevPageLink CurrentPageReport NextPageLink RowsPerPageDropdown"
                    :current-page-report-template="t('repos.importPaginationPageInfo', {current: '{currentPage}', page: '{totalPages}'})"
                    @page="(e: { page: number, rows: number, first: number }) => {
                        currentPage = e.page
                        pageSize = e.rows
                    }"
                />
            </template>
            <p v-else-if="!importLoading && importCredentialId" class="text-muted">
                {{ t('repos.importNoRepos') }}
            </p>
            <p v-else class="text-muted">
                {{ t('repos.importSelectCredential') }}
            </p>

            <div class="import-form__actions">
                <Button
                    :label="t('common.actions.cancel')"
                    severity="secondary"
                    text
                    @click="dialogVisible = false"
                />
                <Button
                    :label="t('repos.importSelect')"
                    icon="pi pi-check"
                    :loading="importSaving"
                    :disabled="!selectedRepos.length"
                    @click="submitImport"
                />
            </div>
        </div>
    </Dialog>
</template>

<style lang="scss" scoped>
.import-form {
    display: flex;
    flex-direction: column;
    gap: $space-4;

    &__row {
        display: flex;
        align-items: center;
        gap: $space-2;
    }

    &__field {
        display: flex;
        flex-direction: column;
        gap: $space-1;
        flex: 1;

        label {
            font-size: $font-size-sm;
            font-weight: 500;
        }
    }

    &__filters {
        display: flex;
        align-items: flex-end;
        gap: $space-3;
        flex-wrap: wrap;

        label {
            font-size: $font-size-sm;
            font-weight: 500;
            margin-bottom: $space-1;
            display: block;
        }
    }

    &__filter {
        display: flex;
        flex-direction: column;
        min-width: 140px;

        &--grow {
            flex: 1;
            min-width: 200px;
        }
    }

    &__meta {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: $space-3;
        flex-wrap: wrap;
        padding: $space-1 $space-2;
        font-size: $font-size-sm;
    }

    &__list {
        display: flex;
        flex-direction: column;
        gap: $space-1;
        max-height: 320px;
        overflow-y: auto;
        border: 1px solid $color-border;
        border-radius: $radius-sm;
        padding: $space-2;

        @include dark-mode {
            border-color: $color-border-dark;
        }
    }

    &__item {
        display: flex;
        align-items: center;
        gap: $space-2;
        padding: $space-2;
        border-radius: $radius-sm;

        &:hover {
            background-color: rgba($color-primary, 0.05);
        }
    }

    &__item-info {
        display: flex;
        flex-direction: column;
        flex: 1;
        min-width: 0;
    }

    &__actions {
        display: flex;
        justify-content: flex-end;
        gap: $space-2;
        margin-top: $space-2;
    }
}
</style>
