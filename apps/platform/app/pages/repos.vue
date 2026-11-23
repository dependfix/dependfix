<script setup lang="ts">
// 仓库管理：列表 + 添加/编辑/删除
import { Check, List, Pencil, Play, Plus, RotateCcwClock, Trash, Upload } from '@lucide/vue'
import type { DataTableColumn } from 'caomei-ui'
import type { RepoView } from '~/types/platform'
import { useTablePagination } from '~/composables/use-table-pagination'
import { useRepoFilters } from '~/composables/use-repo-filters'
import { useRepoScanTrigger, type ScanRunPollResult, type ScanTriggerResponse } from '~/composables/use-repo-scan-trigger'
import { DEFAULT_SCAN_MODE, DEFAULT_SCAN_SEVERITY } from '~/composables/use-scan-preferences'
import { scanModeOptions, scanSeverityOptions } from '~/utils/scan-options'

definePageMeta({
    middleware: 'auth',
})

const { t, d } = useI18n()

const loading = ref(true)
const repos = ref<RepoView[]>([])
const credentials = ref<{ id: string, name: string, type: string }[]>([])
/** 仓库表单弹窗可见性 + 编辑对象（null = 新增；字段状态与提交逻辑内聚在 repo-form-dialog 子组件） */
const repoDialogVisible = ref(false)
const editingRepo = ref<RepoView | null>(null)
const error = ref('')
const success = ref('')

// 全局默认分支（nuxt.config runtimeConfig.public.defaultBranch，可用 DEFAULT_BRANCH 覆盖）
const config = useRuntimeConfig()
const defaultBranch = (config.public.defaultBranch as string) || 'main'

// 批量扫描 / 行选择：`selectedRows` 是独立集合，刷新后按 id 重映射（见 use-repo-selection）
const selectedRows = ref<RepoView[]>([])

/** 每页条数候选与默认值（caomei DataTable 内建分页） */
const ROWS_PER_PAGE = 10
const ROWS_PER_PAGE_OPTIONS = [10, 25, 50]

/**
 * 分页状态（受控）：编辑保存后保留当前页码与每页条数，新增 / 删除 / 批量导入回到第 1 页。
 * 刷新期间抑制 `@tanstack` 自动回首页，详见 `use-table-pagination`。
 */
const {
    page: currentPage,
    rows: rowsPerPage,
    onPageChange,
    onRowsChange,
    reset: resetToFirstPage,
    withRefresh,
} = useTablePagination({
    totalRows: () => filteredRepos.value.length,
    initialRows: ROWS_PER_PAGE,
})

const fetchData = () => withRefresh(async () => {
    loading.value = true
    error.value = ''
    try {
        const [repoRes, credRes] = await Promise.all([
            $fetch('/api/repos'),
            $fetch('/api/credentials'),
        ])
        repos.value = repoRes as RepoView[]
        // 刷新生成新对象：按 id 把已选集合映射过去，避免「计数仍在、勾选态消失」
        selectedRows.value = remapSelectionById(selectedRows.value, repos.value)
        // 仓库关联凭据只能是 GitHub 凭据；provider 日志富化 token（vercel-token / cloudflare-token）
        // 属组织级只读配置，不参与仓库关联（见 pr-build-deploy-signals.md §3.12）
        const repositoryCredentialTypes = new Set(['classic-pat', 'fine-grained-pat', 'github-app'])
        credentials.value = (credRes as { id: string, name: string, type: string }[])
            .filter((credential) => repositoryCredentialTypes.has(credential.type))
    } catch (e: any) {
        error.value = t('repos.errors.loadFailed', { message: e?.data?.message ?? e?.message ?? t('common.errors.unknown') })
    } finally {
        loading.value = false
    }
})

onMounted(fetchData)

const openCreate = () => {
    editingRepo.value = null
    repoDialogVisible.value = true
}

const openEdit = (repo: RepoView) => {
    editingRepo.value = repo
    repoDialogVisible.value = true
}

/** 表单保存成功：刷新列表 + 按新增/编辑展示成功提示（表单状态由子组件负责重置） */
const onRepoFormSaved = async () => {
    const isCreate = !editingRepo.value
    success.value = isCreate ? t('repos.success.added') : t('repos.success.updated')
    if (isCreate) {
        resetToFirstPage()
    }
    await fetchData()
}

const remove = async (repo: RepoView) => {
    error.value = ''
    try {
        await $fetch(`/api/repos/${repo.id}`, { method: 'DELETE' })
        success.value = t('repos.success.deleted')
        resetToFirstPage()
        await fetchData()
    } catch (e: any) {
        error.value = t('repos.errors.deleteFailed', { message: e?.data?.message ?? e?.message ?? t('common.errors.unknown') })
    }
}

/** 批量导入等同新增：回到第 1 页查看新导入结果 */
const onReposImported = async () => {
    resetToFirstPage()
    await fetchData()
}

// 扫描触发（异步队列：入队立即返回 + 轮询状态；同步降级：请求内完成）
// 状态机与轮询抽出到 `use-repo-scan-trigger`（页面行数治理）
/** 动态路径以 `string` 返回：避免 `$fetch` 对模板字面量做路由类型推断时递归过深（Nuxt 4 已知问题） */
const scanEndpoint = (repoId: string): string => `/api/repos/${repoId}/scan`

const { scanningId, scanError, scanMerged, scanSuccess, lastRunUrl, triggerScan } = useRepoScanTrigger({
    t,
    request: async (repoId, body) => {
        const run = await $fetch(scanEndpoint(repoId), { method: 'POST', body })
        return run as unknown as ScanTriggerResponse
    },
    poll: async (runId) => {
        // 原生 fetch（$fetch 对动态 URL 的路由类型推断递归过深；同源请求自动携带会话 cookie）
        const response = await fetch(`/api/runs/${runId}`)
        if (!response.ok) {
            return { ok: false }
        }
        return { ok: true, run: await response.json() as ScanRunPollResult }
    },
    refresh: fetchData,
})

const toastMessage = computed(() => success.value)
watch(toastMessage, (v) => {
    if (v) {
        setTimeout(() => {
            success.value = ''
        }, 3000)
    }
})

// 扫描模式/严重级别选项（批量 + 单仓库 Dialog + 设置页共享；标签口径单一事实源见 utils/scan-options.ts）
const modeOptions = computed(() => scanModeOptions(t))

const severityOptions = computed(() => scanSeverityOptions(t))

// 单仓库扫描配置 Dialog state
const scanConfigDialogVisible = ref(false)
const scanConfigRepo = ref<RepoView | null>(null)
// 扫描偏好（设备级：显式默认 > 上次选择 > 硬编码兜底；见 use-scan-preferences.ts）
// 打开弹窗时解析当前生效默认；提交时记录「上次选择」
const scanPreferences = useScanPreferences()
const scanConfigMode = ref<string>(DEFAULT_SCAN_MODE)
const scanConfigSeverity = ref<string>(DEFAULT_SCAN_SEVERITY)
// AI 研判 override state（AI 集成设计见 ../design/governance/platform-ai-integration.md）：
// 默认从仓库级 aiEnabled / aiTrigger 继承；用户可在 Dialog 中临时 override（不写回 repo）
const scanConfigAiEnabled = ref(false)
const scanConfigAiTrigger = ref<'failure' | 'major' | 'both'>('both')
const scanConfigHasOrgAiKey = ref(false)

const openScanConfig = (repo: RepoView) => {
    scanConfigRepo.value = repo
    // 默认值：设备级偏好（显式默认 > 上次选择 > report-only / high 兜底）
    const defaults = scanPreferences.resolveDefaults()
    scanConfigMode.value = defaults.mode
    scanConfigSeverity.value = defaults.severity
    // 默认值：继承仓库级 aiEnabled / aiTrigger；Organization Key 状态由 fetchData 期间缓存的 hasOrgAiKey 提供
    scanConfigAiEnabled.value = repo.aiEnabled
    scanConfigAiTrigger.value = repo.aiTrigger
    scanConfigDialogVisible.value = true
    // 异步加载 Organization AI Key 状态（影响 AI override 面板是否禁用）
    void loadOrgAiKey()
}

/** 加载 Organization AI Key 状态（用于 scan-config-dialog AI override 面板禁用判定） */
const loadOrgAiKey = async () => {
    try {
        const data = await $fetch<{ hasAiApiKey: boolean }>('/api/organizations/current')
        scanConfigHasOrgAiKey.value = data.hasAiApiKey
    } catch {
        scanConfigHasOrgAiKey.value = false
    }
}

const submitScanConfig = () => {
    const repo = scanConfigRepo.value
    if (!repo) return
    scanConfigDialogVisible.value = false
    // 记录「上次选择」（设备级偏好；下次打开弹窗作为默认值来源之一）
    scanPreferences.rememberChoice(scanConfigMode.value, scanConfigSeverity.value)
    void triggerScan(
        repo,
        scanConfigMode.value,
        scanConfigSeverity.value,
        scanConfigAiEnabled.value,
        scanConfigAiTrigger.value,
    )
}

// 批量扫描（勾选多仓库 → 跳转批量运行页）；状态与提交逻辑见 use-repo-batch-scan.ts

/**
 * 行选择受控回写：提供 `selection` 时 caomei 进入受控模式，不回写则勾选无效
 * （等价迁移前的 `v-model:selection`）。
 * emit 载荷类型为 `T | T[] | null`（multiple 模式运行时恒为数组），此处做最小窄化，
 * 不改动 `selectedRows` 的下游语义（批量扫描按钮启用条件 / 批量操作请求体）。
 */
const onSelectionChange = (rows: RepoView | RepoView[] | null) => {
    selectedRows.value = Array.isArray(rows) ? rows : rows ? [rows] : []
}
const {
    batchDialogVisible,
    batchSubmitting,
    batchError,
    batchMode,
    batchSeverityThreshold,
    openBatchScan,
    submitBatchScan,
} = useRepoBatchScan(selectedRows, (message) => {
    success.value = message
})

// ===== 批量导入（子组件 `import-repos-dialog` 承载；visible 由本页控制）=====
const importDialogVisible = ref(false)

// ===== 列表筛选 / 搜索 / 分页（客户端实现；服务端 `/api/repos` 契约不变）=====
// 评估结论（用户 2026-10-10）：客户端筛选 + 客户端分页——`/api/repos` 返回全量，无需后端分页参数。
// 搜索 / 筛选状态与派生结果见 `use-repo-filters`（含与行选择的交互口径）。
const {
    searchQuery,
    filters: repoFilters,
    executorFilterOptions,
    packageManagerFilterOptions,
    credentialFilterOptions,
    hasActiveFilter: hasActiveRepoFilter,
    reset: resetRepoFilters,
    filteredRepos,
} = useRepoFilters({ repos, credentials, t })

const reposEmptyText = computed(() => (
    hasActiveRepoFilter.value ? t('repos.emptyFiltered') : t('repos.empty')
))

// 跨页全选：表头保持上游「当前页」语义，「全部筛选结果」由选择栏承载（状态与动作见组合式）
const { allFilteredSelected, selectAllFiltered, clearSelection } = useRepoSelection(selectedRows, () => filteredRepos.value)

/**
 * 列定义（caomei DataTable 用 `columns` 数组 + `#cell-{key}` 插槽替代迁移前的 `<Column>`）。
 * - `key` 即排序字段（`field` 语义并入 `key`）；`actions` 等非排序列用语义名保证唯一 key
 * - 行选择列由 `selection-mode="multiple"` 内建渲染，不再需要迁移前的 `<Column selection-mode>`
 */
const columns = computed<DataTableColumn<RepoView>[]>(() => [
    { key: 'owner', header: t('repos.colOwner'), sortable: true },
    { key: 'name', header: t('repos.colRepo'), sortable: true },
    { key: 'tags', header: t('repos.colTags') },
    { key: 'defaultBranch', header: t('repos.colDefaultBranch') },
    { key: 'packageManager', header: t('repos.colPackageManager'), sortable: true },
    // 凭据列：宽度约束 + 不折行（「未关联」等短值在窄列下曾折行；长凭据名保持单行、由自适应布局撑开列）
    { key: 'credentialName', header: t('repos.colCredential'), width: '104px', bodyClass: 'repos__col-credential' },
    { key: 'executorKind', header: t('repos.colExecutor'), sortable: true },
    { key: 'actions', header: t('repos.colActions'), width: '230px' },
])

</script>

<template>
    <div class="repos">
        <div class="repos__header">
            <div>
                <h2>{{ t('repos.title') }}</h2>
                <p class="text-muted">
                    {{ t('repos.subtitle') }}
                </p>
            </div>
            <div class="repos__header-actions">
                <CaomeiButton
                    tone="neutral"
                    @click="importDialogVisible = true"
                >
                    <template #icon>
                        <CaomeiIcon :icon="Upload" />
                    </template>
                    {{ t('repos.import') }}
                </CaomeiButton>
                <CaomeiButton
                    tone="neutral"
                    :disabled="!selectedRows.length"
                    :badge="selectedRows.length ? String(selectedRows.length) : undefined"
                    badge-tone="danger"
                    :title="t('repos.batchScanTitle')"
                    @click="openBatchScan"
                >
                    <template #icon>
                        <CaomeiIcon :icon="List" />
                    </template>
                    {{ t('repos.batchScan') }}
                </CaomeiButton>
                <CaomeiButton @click="openCreate">
                    <template #icon>
                        <CaomeiIcon :icon="Plus" />
                    </template>
                    {{ t('repos.addRepo') }}
                </CaomeiButton>
            </div>
        </div>

        <!-- 列表筛选 / 搜索（客户端；服务端 `/api/repos` 契约不变） -->
        <repo-filter-bar
            v-model:search-query="searchQuery"
            v-model:executor-kind="repoFilters.executorKind"
            v-model:package-manager="repoFilters.packageManager"
            v-model:credential-id="repoFilters.credentialId"
            :executor-options="executorFilterOptions"
            :package-manager-options="packageManagerFilterOptions"
            :credential-options="credentialFilterOptions"
            :active="hasActiveRepoFilter"
            @reset="resetRepoFilters"
        />

        <CaomeiMessage
            v-if="error"
            tone="danger"
            :closable="false"
        >
            {{ error }}
        </CaomeiMessage>
        <CaomeiMessage
            v-if="success"
            tone="success"
            :closable="false"
        >
            {{ success }}
        </CaomeiMessage>
        <CaomeiMessage
            v-if="scanError"
            tone="danger"
            :closable="false"
        >
            {{ scanError }}
        </CaomeiMessage>
        <CaomeiMessage
            v-if="scanMerged"
            tone="warning"
            :closable="false"
        >
            {{ scanMerged }}
        </CaomeiMessage>
        <CaomeiMessage
            v-if="scanSuccess"
            tone="success"
            :closable="false"
        >
            {{ scanSuccess }}
            <a
                v-if="lastRunUrl"
                :href="lastRunUrl"
                target="_blank"
                rel="noopener noreferrer"
            >
                {{ t('repos.openRunPage') }}
            </a>
        </CaomeiMessage>

        <CaomeiCard v-if="!loading">
            <repo-selection-bar
                v-if="filteredRepos.length || selectedRows.length"
                :selected="selectedRows.length"
                :total="filteredRepos.length"
                :all-selected="allFilteredSelected"
                @select-all="selectAllFiltered"
                @clear="clearSelection"
            />
            <CaomeiDataTable
                :data="filteredRepos"
                :columns="columns"
                row-key="id"
                selection-mode="multiple"
                :selection="selectedRows"
                striped
                :paginator="true"
                :rows="rowsPerPage"
                :rows-per-page-options="ROWS_PER_PAGE_OPTIONS"
                :page="currentPage"
                :empty-text="reposEmptyText"
                @update:page="onPageChange"
                @update:rows="onRowsChange"
                @update:selection="onSelectionChange"
            >
                <template #cell-tags="{row}">
                    <div v-if="row.tags?.length" class="repos__tags">
                        <CaomeiTag
                            v-for="tag in row.tags"
                            :key="tag"
                            tone="primary"
                            rounded
                        >
                            {{ tag }}
                        </CaomeiTag>
                    </div>
                    <span v-else class="text-muted">—</span>
                </template>
                <template #cell-defaultBranch="{row}">
                    {{ row.defaultBranch }}
                </template>
                <template #cell-packageManager="{row}">
                    <CaomeiTag tone="neutral">
                        {{ row.packageManager }}
                    </CaomeiTag>
                </template>
                <template #cell-credentialName="{row}">
                    <span v-if="row.credentialName">{{ row.credentialName }}</span>
                    <span v-else class="text-muted">{{ t('repos.notLinked') }}</span>
                </template>
                <template #cell-executorKind="{row}">
                    <CaomeiTag>{{ row.executorKind === 'github-action' ? t('repos.githubAction') : row.executorKind === 'sandbox' ? t('repos.sandboxContainer') : t('repos.platformContainer') }}</CaomeiTag>
                </template>
                <template #cell-actions="{row}">
                    <CaomeiButton
                        variant="ghost"
                        rounded
                        size="sm"
                        :loading="scanningId === row.id"
                        :label="t('repos.actionTriggerScan')"
                        :title="t('repos.actionTriggerScan')"
                        @click="openScanConfig(row)"
                    >
                        <template #icon>
                            <CaomeiIcon :icon="Play" />
                        </template>
                    </CaomeiButton>
                    <CaomeiButton
                        variant="ghost"
                        rounded
                        size="sm"
                        :label="t('repos.actionScanHistory')"
                        :title="t('repos.actionScanHistory')"
                        @click="navigateTo(`/scans?repository=${row.id}`)"
                    >
                        <template #icon>
                            <CaomeiIcon :icon="RotateCcwClock" />
                        </template>
                    </CaomeiButton>
                    <CaomeiButton
                        variant="ghost"
                        rounded
                        size="sm"
                        :label="t('repos.actionEdit')"
                        @click="openEdit(row)"
                    >
                        <template #icon>
                            <CaomeiIcon :icon="Pencil" />
                        </template>
                    </CaomeiButton>
                    <CaomeiButton
                        variant="ghost"
                        rounded
                        size="sm"
                        tone="danger"
                        :label="t('repos.actionDelete')"
                        @click="remove(row)"
                    >
                        <template #icon>
                            <CaomeiIcon :icon="Trash" />
                        </template>
                    </CaomeiButton>
                </template>
            </CaomeiDataTable>
        </CaomeiCard>
        <p v-else class="text-muted">
            {{ t('common.empty.loading') }}
        </p>

        <repo-form-dialog
            v-model:visible="repoDialogVisible"
            :repo="editingRepo"
            :credentials="credentials"
            :default-branch="defaultBranch"
            @saved="onRepoFormSaved"
        />

        <import-repos-dialog
            v-model:visible="importDialogVisible"
            :credentials="credentials"
            @imported="onReposImported"
        />

        <repo-batch-scan-dialog
            v-model:visible="batchDialogVisible"
            v-model:mode="batchMode"
            v-model:severity="batchSeverityThreshold"
            :repos="selectedRows"
            :submitting="batchSubmitting"
            :error="batchError"
            :mode-options="modeOptions"
            :severity-options="severityOptions"
            @submit="submitBatchScan"
        />

        <scan-config-dialog
            v-model:visible="scanConfigDialogVisible"
            v-model:mode="scanConfigMode"
            v-model:severity="scanConfigSeverity"
            v-model:ai-enabled="scanConfigAiEnabled"
            v-model:ai-trigger="scanConfigAiTrigger"
            :repo="scanConfigRepo"
            :mode-options="modeOptions"
            :severity-options="severityOptions"
            :has-org-ai-key="scanConfigHasOrgAiKey"
            @submit="submitScanConfig"
        />
        <!-- `repo-history-dialog` 不再在此挂载：历史入口改为跳转 /scans?repository=xxx，
             详情 dialog 由 scans.vue 内 mount 的 `<repo-history-dialog query-key="run" />` 兜底 -->
    </div>
</template>

<style lang="scss" scoped>
.repos {
    // 凭据列单元格不折行（配合 columns 的 width 约束；长凭据名单行显示，列宽由自适应布局撑开）
    :deep(.repos__col-credential) {
        white-space: nowrap;
    }

    &__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: $space-5;

        h2 {
            margin: 0 0 $space-1;
        }

        p {
            margin: 0;
            font-size: $font-size-sm;
        }
    }

    // 列表筛选 / 搜索工具栏样式随组件迁至 `repo-filter-bar.vue`
    &__header-actions {
        display: flex;
        align-items: center;
        gap: $space-2;
    }
}

.repos__tags {
    display: flex;
    flex-wrap: wrap;
    gap: $space-1;
}
</style>
