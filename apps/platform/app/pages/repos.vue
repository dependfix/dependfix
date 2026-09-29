<script setup lang="ts">
// 仓库管理：列表 + 添加/编辑/删除
import { Check, List, Pencil, Play, Plus, RotateCcwClock, Trash, Upload } from '@lucide/vue'
import type { DataTableColumn } from 'caomei-ui'
import type { RepoView } from '~/types/platform'

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

const fetchData = async () => {
    loading.value = true
    error.value = ''
    try {
        const [repoRes, credRes] = await Promise.all([
            $fetch('/api/repos'),
            $fetch('/api/credentials'),
        ])
        repos.value = repoRes as RepoView[]
        credentials.value = credRes as { id: string, name: string, type: string }[]
    } catch (e: any) {
        error.value = t('repos.errors.loadFailed', { message: e?.data?.message ?? e?.message ?? t('common.errors.unknown') })
    } finally {
        loading.value = false
    }
}

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
    success.value = editingRepo.value ? t('repos.success.updated') : t('repos.success.added')
    await fetchData()
}

/** 表单保存失败：按页面既有错误展示口径包装（与 loadFailed / deleteFailed 同模式） */
const onRepoFormFailed = (message: string) => {
    error.value = t('repos.errors.saveFailed', { message })
}

const remove = async (repo: RepoView) => {
    error.value = ''
    try {
        await $fetch(`/api/repos/${repo.id}`, { method: 'DELETE' })
        success.value = t('repos.success.deleted')
        await fetchData()
    } catch (e: any) {
        error.value = t('repos.errors.deleteFailed', { message: e?.data?.message ?? e?.message ?? t('common.errors.unknown') })
    }
}

const repoDisplay = (repo: RepoView) => `${repo.owner}/${repo.name}`

// 扫描触发（异步队列：入队立即返回 + 轮询状态；同步降级：请求内完成）
const scanningId = ref<string | null>(null)
const scanError = ref('')
const scanSuccess = ref('')
const lastRunUrl = ref<string | null>(null)

/** 轮询扫描状态（间隔 2s；容器模式 10min / B 模式 30min 上限，超时提示去历史查看） */
const pollTimeoutMs = 10 * 60_000
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** 轮询取消标志：组件卸载时置位，避免 SPA 导航离开后继续轮询 */
let pollCancelled = false

const pollRun = async (runId: string, executorKind: string) => {
    const startedAt = Date.now()
    const timeout = executorKind === 'github-action' ? 30 * 60_000 : pollTimeoutMs
    while (!pollCancelled && Date.now() - startedAt < timeout) {
        await sleep(2000)
        // 原生 fetch（$fetch 对动态 URL 的路由类型推断递归过深；同源请求自动携带会话 cookie）
        const response = await fetch(`/api/runs/${runId}`)
        if (!response.ok) {
            scanError.value = t('repos.scanStatusQueryFailed')
            return
        }
        const run = await response.json() as { status: string, runUrl: string | null, error?: { code?: string, message?: string } | null }
        if (run.status === 'completed') {
            scanSuccess.value = t('repos.scanCompleted')
            return
        }
        if (run.status === 'failed') {
            // SCAN_PENDING_MERGED（去重合并，与 ServerErrorCode 口径对齐）：非执行失败，提示合并语义而非"扫描失败"
            scanError.value = run.error?.code === 'SCAN_PENDING_MERGED'
                ? (run.error.message ?? t('repos.scanDuplicate'))
                : t('repos.scanFailed', { message: run.error?.message ?? t('common.errors.unknown') })
            return
        }
        if (run.status === 'dispatched') {
            lastRunUrl.value = run.runUrl
            scanSuccess.value = run.runUrl ? t('repos.scanDispatchedWithUrl') : t('repos.scanDispatched')
            return
        }
        // pending / running：继续轮询
    }
    if (!pollCancelled) {
        scanSuccess.value = t('repos.scanInProgress')
    }
}

onUnmounted(() => {
    pollCancelled = true
})

const triggerScan = async (
    repo: RepoView,
    mode: string,
    severity: string,
    aiEnabled: boolean = false,
    aiTrigger: 'failure' | 'major' | 'both' = 'both',
) => {
    pollCancelled = false
    scanError.value = ''
    scanSuccess.value = ''
    lastRunUrl.value = null
    scanningId.value = repo.id
    // B 模式（GitHub Action）异步队列下由 worker 后台执行（不再同步挂起 30 分钟）
    if (repo.executorKind === 'github-action') {
        scanSuccess.value = t('repos.scanTriggering')
    }
    try {
        const run = await $fetch(`/api/repos/${repo.id}/scan`, {
            method: 'POST',
            body: {
                mode,
                severityThreshold: severity,
                executorKind: repo.executorKind === 'github-action' ? 'github-action' : undefined,
                aiEnabled,
                aiTrigger,
            },
        })
        const runData = run as unknown as { id: string, status: string, runUrl: string | null }
        if (runData.status === 'pending') {
            // 队列模式：已入队，轮询状态
            scanSuccess.value = t('repos.scanQueued')
            await pollRun(runData.id, repo.executorKind ?? 'container')
        } else if (runData.status === 'dispatched') {
            lastRunUrl.value = runData.runUrl
            scanSuccess.value = runData.runUrl ? t('repos.scanDispatchedWithUrl') : t('repos.scanDispatched')
        } else if (runData.status === 'completed') {
            scanSuccess.value = t('repos.scanCompleted')
        } else {
            scanError.value = t('repos.scanFailed', { message: (run as { error?: { message?: string } }).error?.message ?? t('common.errors.unknown') })
        }
        await fetchData()
    } catch (e: any) {
        scanError.value = t('repos.errors.triggerFailed', { message: e?.data?.message ?? e?.message ?? t('common.errors.unknown') })
    } finally {
        scanningId.value = null
    }
}

const toastMessage = computed(() => success.value)
watch(toastMessage, (v) => {
    if (v) {
        setTimeout(() => {
            success.value = ''
        }, 3000)
    }
})

// 扫描模式/严重级别选项（批量 + 单仓库 Dialog 共享）
const modeOptions = computed(() => [
    { label: t('common.scanMode.reportOnly'), value: 'report-only' },
    { label: t('common.scanMode.fix'), value: 'fix' },
    { label: t('common.scanMode.fixAndPr'), value: 'fix-and-pr' },
])

const severityOptions = computed(() => [
    { label: 'Critical', value: 'critical' },
    { label: 'High', value: 'high' },
    { label: 'Medium', value: 'medium' },
    { label: t('common.severity.all'), value: 'all' },
])

// 单仓库扫描配置 Dialog state
const scanConfigDialogVisible = ref(false)
const scanConfigRepo = ref<RepoView | null>(null)
const scanConfigMode = ref('report-only')
const scanConfigSeverity = ref('high')
// AI 研判 override state（AI 集成设计见 ../design/governance/platform-ai-integration.md）：
// 默认从仓库级 aiEnabled / aiTrigger 继承；用户可在 Dialog 中临时 override（不写回 repo）
const scanConfigAiEnabled = ref(false)
const scanConfigAiTrigger = ref<'failure' | 'major' | 'both'>('both')
const scanConfigHasOrgAiKey = ref(false)

const openScanConfig = (repo: RepoView) => {
    scanConfigRepo.value = repo
    scanConfigMode.value = 'report-only'
    scanConfigSeverity.value = 'high'
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
    void triggerScan(
        repo,
        scanConfigMode.value,
        scanConfigSeverity.value,
        scanConfigAiEnabled.value,
        scanConfigAiTrigger.value,
    )
}

// 批量扫描（勾选多仓库 → 跳转批量运行页）；状态与提交逻辑见 use-repo-batch-scan.ts
const selectedRows = ref<RepoView[]>([])

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
            <CaomeiDataTable
                :data="repos"
                :columns="columns"
                row-key="id"
                selection-mode="multiple"
                :selection="selectedRows"
                striped
                :empty-text="t('repos.empty')"
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
            @failed="onRepoFormFailed"
        />

        <import-repos-dialog
            v-model:visible="importDialogVisible"
            :credentials="credentials"
            @imported="fetchData"
        />

        <CaomeiDialog
            v-model:open="batchDialogVisible"
            :title="t('repos.batchHeader', {count: selectedRows.length})"
            modal
            :style="{width: '480px'}"
        >
            <div class="batch-form">
                <CaomeiMessage
                    v-if="batchError"
                    tone="danger"
                    :closable="false"
                >
                    {{ batchError }}
                </CaomeiMessage>
                <div class="batch-form__repos">
                    <span
                        v-for="repo in selectedRows"
                        :key="repo.id"
                        class="batch-form__repo"
                    >
                        {{ repoDisplay(repo) }}
                    </span>
                </div>
                <div class="batch-form__row">
                    <div class="batch-form__field">
                        <label for="batchMode">{{ t('repos.batchMode') }}</label>
                        <CaomeiSelect
                            id="batchMode"
                            v-model="batchMode"
                            :options="modeOptions"
                            option-label="label"
                            option-value="value"
                        />
                    </div>
                    <div class="batch-form__field">
                        <label for="batchSeverity">{{ t('repos.batchSeverity') }}</label>
                        <CaomeiSelect
                            id="batchSeverity"
                            v-model="batchSeverityThreshold"
                            :options="severityOptions"
                            option-label="label"
                            option-value="value"
                        />
                    </div>
                </div>
                <div class="batch-form__actions">
                    <CaomeiButton
                        variant="ghost"
                        tone="neutral"
                        @click="batchDialogVisible = false"
                    >
                        {{ t('common.actions.cancel') }}
                    </CaomeiButton>
                    <CaomeiButton
                        :loading="batchSubmitting"
                        @click="submitBatchScan"
                    >
                        <template #icon>
                            <CaomeiIcon :icon="Play" />
                        </template>
                        {{ t('repos.batchStart') }}
                    </CaomeiButton>
                </div>
            </div>
        </CaomeiDialog>

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

    &__header-actions {
        display: flex;
        align-items: center;
        gap: $space-2;
    }
}

.repo-form {
    display: flex;
    flex-direction: column;
    gap: $space-4;

    &__row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: $space-3;
    }

    &__field {
        display: flex;
        flex-direction: column;
        gap: $space-1;

        label {
            font-size: $font-size-sm;
            font-weight: 500;
        }
    }

    &__actions {
        display: flex;
        justify-content: flex-end;
        gap: $space-2;
        margin-top: $space-2;
    }
}

.repos__tags {
    display: flex;
    flex-wrap: wrap;
    gap: $space-1;
}

.batch-form {
    display: flex;
    flex-direction: column;
    gap: $space-4;

    &__repos {
        display: flex;
        flex-wrap: wrap;
        gap: $space-1;
        max-height: 120px;
        overflow-y: auto;
    }

    &__repo {
        font-size: $font-size-sm;
        background-color: rgba($color-primary, 0.08);
        border-radius: $radius-sm;
        padding: $space-1 $space-2;
    }

    &__row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: $space-3;
    }

    &__field {
        display: flex;
        flex-direction: column;
        gap: $space-1;

        label {
            font-size: $font-size-sm;
            font-weight: 500;
        }
    }

    &__actions {
        display: flex;
        justify-content: flex-end;
        gap: $space-2;
        margin-top: $space-2;
    }
}
</style>
