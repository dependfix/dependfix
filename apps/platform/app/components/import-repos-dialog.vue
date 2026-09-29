<script setup lang="ts">
// 批量导入仓库弹窗（自 repos.vue 拆出：页面行数治理 max-lines 800）
// 父组件传入已加载的凭据列表；导入成功后 emit('imported') 通知刷新仓库列表。
// 能力补全：
//   - 四维过滤（fork / visibility / archived+disabled / 关键字），过滤切换保留已勾选项（基于 id）
//   - 后端缓存（5min TTL + LRU max=64 + 并发去重）+ 前端 Paginator 默认 pageSize=25
//   - 顶层 defaultCredentialId 提交时携带，导入的所有仓库写库带凭据
import { Check, RefreshCw } from '@lucide/vue'

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
    disabled: boolean
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

/** Resource owner（user 或 organization；单端点契约 include=owners） */
interface ResourceOwner {
    login: string
    type: 'User' | 'Organization'
    avatarUrl?: string
}

/** Resource owner 列表响应（单端点契约 include=owners） */
interface ResourceOwnerResponse {
    owners: ResourceOwner[]
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
// Resource owner 状态（personal + organizations）
const importableOwners = ref<ResourceOwner[]>([])
const importOwnerLogin = ref<string | null>(null)
const ownersLoading = ref(false)
const importableRepos = ref<ImportableRepo[]>([])
const selectedRepos = ref<ImportableRepo[]>([])
// 四维过滤（默认 source-only / all / 空关键字 / exclude archived+disabled）
const forkFilter = ref<'source' | 'all'>('source')
const visibilityFilter = ref<'all' | 'public' | 'private'>('all')
const searchKeyword = ref('')
// 第 4 维：archived/disabled 过滤（默认排除——只读仓库无法接收 push / 创建 PR）
const archivedFilter = ref<'exclude' | 'include'>('exclude')
// 前端分页（默认 25，避免单页过载）
const pageSize = ref<number>(25)
const currentPage = ref(0)
// 默认关联凭据
const defaultCredentialId = ref<string | null>(null)
// 缓存提示
const lastCachedAt = ref<Date | null>(null)
const lastFromCache = ref(false)
const lastFreshRefreshed = ref(false)

import { passesRepoFilter } from '../utils/import-repos-filter'

/** 四维过滤后的候选（保留 selectedRepos 语义，过滤变更仅重置页码） */
const filteredRepos = computed(() => {
    const keyword = searchKeyword.value.trim().toLowerCase()
    return importableRepos.value.filter((repo) =>
        passesRepoFilter(repo, {
            fork: forkFilter.value,
            visibility: visibilityFilter.value,
            archived: archivedFilter.value,
            keyword,
        }))
})

/** 过滤后可勾选（基于 filteredRepos，排除已导入） */
const selectableFilteredRepos = computed(() => filteredRepos.value.filter((r) => !r.imported))

/** 分页：当前页的仓库切片 */
const pageCount = computed(() => Math.max(1, Math.ceil(filteredRepos.value.length / pageSize.value)))
const pagedRepos = computed(() => {
    const start = currentPage.value * pageSize.value
    return filteredRepos.value.slice(start, start + pageSize.value)
})

/**
 * caomei Paginator 的 `page` 为 1 基，本页 `currentPage` 为 0 基：
 * 用 computed 做双向换算，保持下游分页切片（`currentPage * pageSize`）与重置逻辑不变。
 */
const paginatorPage = computed({
    get: () => currentPage.value + 1,
    set: (page: number) => {
        currentPage.value = page - 1
    },
})

/** 每页条数切换：caomei emit `update:items-per-page`（切档时会同步重推 page 以保持首行偏移） */
const onItemsPerPageChange = (value: number) => {
    pageSize.value = value
}

/** 缓存时间距今分钟数（向上取整，至少 0） */
const cachedMinutesAgo = computed(() => {
    if (!lastCachedAt.value) {
        return 0
    }
    return Math.max(0, Math.ceil((Date.now() - lastCachedAt.value.getTime()) / 60000))
})

/** Resource owner 类型 badge 标签（Personal / Organization） */
const ownerBadge = (login: string) => {
    const owner = importableOwners.value.find((o) => o.login === login)
    if (!owner) {
        return login
    }
    return owner.type === 'Organization' ? t('repos.importOwnerOrgBadge') : t('repos.importOwnerPersonalBadge')
}

/** owner type 对应 tag tone（Personal = success，Organization = primary） */
const ownerBadgeTone = (login: string): 'success' | 'primary' => {
    const owner = importableOwners.value.find((o) => o.login === login)
    return owner?.type === 'Organization' ? 'primary' : 'success'
}

const importError = ref('')
const importSuccess = ref('')

// filter / pageSize / searchKeyword 变更时重置页码到第 1（保留 selectedRepos 但重置页码）
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
    importableOwners.value = []
    importOwnerLogin.value = null
    forkFilter.value = 'source'
    visibilityFilter.value = 'all'
    searchKeyword.value = ''
    currentPage.value = 0
    defaultCredentialId.value = null
    lastCachedAt.value = null
    lastFromCache.value = false
    lastFreshRefreshed.value = false
    // 单凭据场景自动选中并加载 owner 列表
    if (props.credentials.length === 1) {
        importCredentialId.value = props.credentials[0]!.id
        void loadOwnersAndRepos()
    }
})

const loadImportable = async (options?: { fresh?: boolean }) => {
    if (!importCredentialId.value || !importOwnerLogin.value) {
        importableRepos.value = []
        return
    }
    importLoading.value = true
    importError.value = ''
    try {
        const res = await $fetch('/api/repos/importable', {
            query: {
                credentialId: importCredentialId.value,
                owner: importOwnerLogin.value,
                ...(options?.fresh ? { fresh: 'true' } : {}),
            },
        })
        const data = res as ImportableResponse
        importableRepos.value = data.repos
        lastCachedAt.value = new Date(data.cachedAt)
        lastFromCache.value = data.fromCache
        lastFreshRefreshed.value = !!options?.fresh
        // 默认不勾选任何仓库（避免手滑一次导入大量仓库）；用户需主动勾选或点全选按钮
        // 当前页码重置（filter 默认值在 watch 中已重置；这里防御一次）
        currentPage.value = 0
    } catch (e: any) {
        importError.value = t('repos.errors.repoFetchFailed', { message: e?.data?.message ?? e?.message ?? t('common.errors.unknown') })
    } finally {
        importLoading.value = false
    }
}

/**
 * 先加载 owner 列表，再根据 owner 加载仓库。
 * 凭据切换时调用：loadOwners 完成后默认选第一个 owner（personal 永远排第一），再触发 loadImportable。
 */
const loadOwnersAndRepos = async () => {
    if (!importCredentialId.value) {
        importableOwners.value = []
        importOwnerLogin.value = null
        return
    }
    ownersLoading.value = true
    try {
        const res = await $fetch('/api/repos/importable', {
            query: {
                credentialId: importCredentialId.value,
                include: 'owners',
            },
        })
        const data = res as ResourceOwnerResponse
        importableOwners.value = data.owners
        // 默认选第一个 owner（personal 排第一）
        if (data.owners.length > 0) {
            importOwnerLogin.value = data.owners[0]?.login ?? null
            await loadImportable()
        } else {
            importOwnerLogin.value = null
            importableRepos.value = []
        }
    } catch (e: any) {
        importError.value = t('repos.errors.ownersFetchFailed', { message: e?.data?.message ?? e?.message ?? t('common.errors.unknown') })
        importableOwners.value = []
        importOwnerLogin.value = null
    } finally {
        ownersLoading.value = false
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
        // （导入后必须主动清空已导入项选择，避免下次刷新列表后 selectedRepos 残留已 disabled 的旧数据：
        //   修复删除自动勾选后必须主动清空，否则导入按钮仍可点产生误导）
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
    <CaomeiDialog
        v-model:open="dialogVisible"
        :title="t('repos.importTitle')"
        modal
        :style="{width: '760px'}"
    >
        <div class="import-form">
            <div class="import-form__row">
                <div class="import-form__field">
                    <label for="importCredential">{{ t('repos.importCredential') }}</label>
                    <CaomeiSelect
                        id="importCredential"
                        v-model="importCredentialId"
                        :options="credentials"
                        option-label="name"
                        option-value="id"
                        :placeholder="t('repos.importCredentialPlaceholder')"
                        @update:model-value="() => loadOwnersAndRepos()"
                    />
                </div>
                <CaomeiButton
                    variant="ghost"
                    rounded
                    :aria-label="t('repos.importRefresh')"
                    :title="t('repos.importRefresh')"
                    :disabled="!importCredentialId || ownersLoading || importLoading"
                    @click="loadImportable({fresh: true})"
                >
                    <template #icon>
                        <CaomeiIcon :icon="RefreshCw" />
                    </template>
                </CaomeiButton>
            </div>

            <!-- Resource owner 选择器（凭据切换后由 loadOwnersAndRepos 填充）
                 caomei Select 无 `#value` 插槽，触发器仅显示 option-label（login），owner 类型 badge 仅在选项列表展示 -->
            <div class="import-form__field">
                <label for="importOwner">{{ t('repos.importOwner') }}</label>
                <CaomeiSelect
                    id="importOwner"
                    v-model="importOwnerLogin"
                    :options="importableOwners"
                    option-label="login"
                    option-value="login"
                    :placeholder="importCredentialId ? t('repos.importOwnerPlaceholder') : t('repos.importOwnerPlaceholder')"
                    :disabled="!importableOwners.length"
                    @update:model-value="() => loadImportable()"
                >
                    <template #option="{option}">
                        <span>{{ option.login }}</span>
                        <CaomeiTag
                            :tone="ownerBadgeTone(option.login)"
                            class="import-form__owner-badge"
                        >
                            {{ ownerBadge(option.login) }}
                        </CaomeiTag>
                    </template>
                </CaomeiSelect>
            </div>

            <!-- 默认关联凭据（与「拉取用凭据」并排显示，语义分离） -->
            <div class="import-form__field">
                <label for="importDefaultCredential">{{ t('repos.importDefaultCredential') }}</label>
                <CaomeiSelect
                    id="importDefaultCredential"
                    v-model="defaultCredentialId"
                    :options="credentials"
                    option-label="name"
                    option-value="id"
                    :placeholder="t('repos.importDefaultCredentialPlaceholder')"
                />
                <small class="text-muted">{{ t('repos.importDefaultCredentialHint') }}</small>
            </div>

            <CaomeiMessage
                v-if="importError"
                tone="danger"
                :closable="false"
            >
                {{ importError }}
            </CaomeiMessage>
            <CaomeiMessage
                v-if="importSuccess"
                tone="success"
                :closable="false"
            >
                {{ importSuccess }}
            </CaomeiMessage>

            <div v-if="importLoading" class="text-muted">
                {{ t('common.empty.loading') }}
            </div>
            <template v-else-if="importableRepos.length">
                <!-- 四维过滤 -->
                <div class="import-form__filters">
                    <div class="import-form__filter">
                        <label>{{ t('repos.importFilterFork') }}</label>
                        <CaomeiSelectButton
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
                        <CaomeiSelectButton
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
                    <div class="import-form__filter">
                        <label>{{ t('repos.importFilterArchived') }}</label>
                        <CaomeiSelectButton
                            v-model="archivedFilter"
                            :options="[
                                {label: t('repos.importFilterArchivedExclude'), value: 'exclude'},
                                {label: t('repos.importFilterArchivedInclude'), value: 'include'}
                            ]"
                            option-label="label"
                            option-value="value"
                        />
                    </div>
                    <div class="import-form__filter import-form__filter--grow">
                        <label for="importSearch">{{ t('repos.importFilterSearch') }}</label>
                        <CaomeiInput
                            id="importSearch"
                            v-model="searchKeyword"
                            :placeholder="t('repos.importFilterSearchPlaceholder')"
                        />
                    </div>
                </div>

                <!-- 总数 + 缓存提示 + 全选计数 -->
                <div class="import-form__meta">
                    <span class="text-muted">
                        {{ t('repos.importPaginationTotalCount', {total: filteredRepos.length}) }}
                        <span v-if="lastCachedAt">·</span>
                        <span v-if="lastFromCache && !lastFreshRefreshed">{{ t('repos.importCachedAt', {minutes: cachedMinutesAgo}) }}</span>
                        <span v-else-if="lastFreshRefreshed">{{ t('repos.importFreshRefreshed') }}</span>
                    </span>
                    <!-- 可见文案走 Checkbox 自带的 `text`（组件内部渲染关联 label）；
                         不能再套外层 `<label>`：caomei Checkbox 根元素是 `role="checkbox"` 的按钮，
                         不是原生 input，嵌套 label 无法点选 -->
                    <CaomeiCheckbox
                        :model-value="selectedRepos.length === selectableFilteredRepos.length && selectableFilteredRepos.length > 0"
                        :text="t('repos.importSelectAll', {count: selectableFilteredRepos.length})"
                        @update:model-value="(v) => selectedRepos = v === true ? [...selectableFilteredRepos] : []"
                    />
                    <span class="text-muted">{{ t('repos.importSelectedCount', {count: selectedRepos.length}) }}</span>
                </div>

                <div class="import-form__list">
                    <div
                        v-for="repo in pagedRepos"
                        :key="repo.id"
                        class="import-form__item"
                    >
                        <CaomeiCheckbox
                            :model-value="selectedRepos.some((r) => r.id === repo.id)"
                            :disabled="repo.imported"
                            @update:model-value="(checked) => {
                                selectedRepos = checked === true
                                    ? [...selectedRepos, repo]
                                    : selectedRepos.filter((r) => r.id !== repo.id)
                            }"
                        />
                        <div class="import-form__item-info">
                            <span>{{ repo.fullName }}</span>
                            <small class="text-muted">
                                {{ repo.private ? t('repos.privateRepo') : t('repos.publicRepo') }} · {{ repo.defaultBranch }}
                                <template v-if="repo.fork"> · fork</template>
                                <template v-if="repo.archived"> · archived</template><template v-if="repo.disabled"> · disabled</template>
                                <template v-if="repo.imported"> · {{ t('repos.imported') }}</template>
                            </small>
                        </div>
                        <CaomeiTag
                            v-if="repo.imported"
                            tone="neutral"
                        >
                            {{ t('repos.exists') }}
                        </CaomeiTag>
                    </div>
                </div>

                <!-- 分页器（默认 pageSize=25，可切 50/100）
                     CaomeiPaginator 的 `page` 为 1 基（经 `paginatorPage` 换算），页码报表由页面自渲染 `span` -->
                <div class="import-form__pagination">
                    <CaomeiPaginator
                        v-model:page="paginatorPage"
                        :total="filteredRepos.length"
                        :items-per-page="pageSize"
                        :rows-per-page-options="[25, 50, 100]"
                        @update:items-per-page="onItemsPerPageChange"
                    />
                    <span class="import-form__pagination-report">
                        {{ t('repos.importPaginationPageInfo', {current: paginatorPage, page: pageCount}) }}
                    </span>
                </div>
            </template>
            <p v-else-if="!importLoading && importCredentialId" class="text-muted">
                {{ t('repos.importNoRepos') }}
            </p>
            <p v-else class="text-muted">
                {{ t('repos.importSelectCredential') }}
            </p>

            <div class="import-form__actions">
                <CaomeiButton
                    variant="ghost"
                    tone="neutral"
                    @click="dialogVisible = false"
                >
                    {{ t('common.actions.cancel') }}
                </CaomeiButton>
                <CaomeiButton
                    :loading="importSaving"
                    :disabled="!selectedRepos.length"
                    @click="submitImport"
                >
                    <template #icon>
                        <CaomeiIcon :icon="Check" />
                    </template>
                    {{ t('repos.importSelect') }}
                </CaomeiButton>
            </div>
        </div>
    </CaomeiDialog>
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

    &__pagination {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: $space-3;
        flex-wrap: wrap;
    }

    // 页码报表（Paginator 无内建报表，由页面自渲染）
    &__pagination-report {
        font-size: $font-size-sm;
        color: $color-text-muted;
    }

    &__actions {
        display: flex;
        justify-content: flex-end;
        gap: $space-2;
        margin-top: $space-2;
    }
}
</style>
