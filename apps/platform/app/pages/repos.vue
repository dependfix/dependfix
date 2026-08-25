<script setup lang="ts">
// 仓库管理：列表 + 添加/编辑/删除
import type { RepoView } from '~/types/platform'

definePageMeta({
    middleware: 'auth',
})

const { t, d } = useI18n()

interface RepoForm {
    owner: string
    name: string
    defaultBranch: string
    packageManager: 'pnpm' | 'npm' | 'yarn'
    credentialId: string | null
    actionWorkflowFile: string
    executorKind: 'container' | 'github-action' | 'sandbox'
    note: string
    tags: string[]
}

const loading = ref(true)
const saving = ref(false)
const repos = ref<RepoView[]>([])
const credentials = ref<{ id: string, name: string, type: string }[]>([])
const dialogVisible = ref(false)
const editingId = ref<string | null>(null)
const error = ref('')
const success = ref('')

// 全局默认分支（nuxt.config runtimeConfig.public.defaultBranch，可用 DEFAULT_BRANCH 覆盖）
const config = useRuntimeConfig()
const defaultBranch = (config.public.defaultBranch as string) || 'main'

const emptyForm = (): RepoForm => ({
    owner: '',
    name: '',
    defaultBranch,
    packageManager: 'pnpm',
    credentialId: null,
    actionWorkflowFile: '',
    executorKind: 'container',
    note: '',
    tags: [],
})

const form = ref<RepoForm>(emptyForm())

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
    editingId.value = null
    form.value = emptyForm()
    dialogVisible.value = true
}

const openEdit = (repo: RepoView) => {
    editingId.value = repo.id
    form.value = {
        owner: repo.owner,
        name: repo.name,
        defaultBranch: repo.defaultBranch,
        packageManager: repo.packageManager as RepoForm['packageManager'],
        credentialId: repo.credentialId,
        actionWorkflowFile: repo.actionWorkflowFile ?? '',
        executorKind: repo.executorKind as RepoForm['executorKind'],
        note: repo.note ?? '',
        tags: [...(repo.tags ?? [])],
    }
    dialogVisible.value = true
}

const closeDialog = () => {
    dialogVisible.value = false
    editingId.value = null
}

const submit = async () => {
    saving.value = true
    error.value = ''
    try {
        const payload = {
            ...form.value,
            actionWorkflowFile: form.value.actionWorkflowFile.trim() || null,
            note: form.value.note.trim() || null,
            tags: form.value.tags.length > 0 ? form.value.tags : null,
        }
        if (editingId.value) {
            await $fetch(`/api/repos/${editingId.value}`, {
                method: 'PUT',
                body: payload,
            })
            success.value = t('repos.success.updated')
        } else {
            await $fetch('/api/repos', {
                method: 'POST',
                body: payload,
            })
            success.value = t('repos.success.added')
        }
        dialogVisible.value = false
        await fetchData()
    } catch (e: any) {
        error.value = t('repos.errors.saveFailed', { message: e?.data?.message ?? e?.message ?? t('common.errors.unknown') })
    } finally {
        saving.value = false
    }
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
            // duplicate_scan（去重合并）：非执行失败，提示合并语义而非"扫描失败"
            scanError.value = run.error?.code === 'duplicate_scan'
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

const triggerScan = async (repo: RepoView, mode: string, severity: string) => {
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

// 扫描模式/严重级别选项（批量 + 单仓库 Dialog 共享，见 docs/plan/todo.md §PR2 C52）
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

// 单仓库扫描配置 Dialog state（见 docs/plan/todo.md §PR2 C52）
const scanConfigDialogVisible = ref(false)
const scanConfigRepo = ref<RepoView | null>(null)
const scanConfigMode = ref('report-only')
const scanConfigSeverity = ref('high')

const openScanConfig = (repo: RepoView) => {
    scanConfigRepo.value = repo
    scanConfigMode.value = 'report-only'
    scanConfigSeverity.value = 'high'
    scanConfigDialogVisible.value = true
}

const submitScanConfig = () => {
    const repo = scanConfigRepo.value
    if (!repo) return
    scanConfigDialogVisible.value = false
    void triggerScan(repo, scanConfigMode.value, scanConfigSeverity.value)
}

// 批量扫描（勾选多仓库 → 跳转批量运行页）
const selectedRows = ref<RepoView[]>([])
const batchDialogVisible = ref(false)
const batchSubmitting = ref(false)
const batchError = ref('')
const batchMode = ref('report-only')
const batchSeverityThreshold = ref('high')

const openBatchScan = () => {
    if (!selectedRows.value.length) return
    batchError.value = ''
    batchMode.value = 'report-only'
    batchSeverityThreshold.value = 'high'
    batchDialogVisible.value = true
}

/** 批量触发：POST /api/repos/batch-scan → 跳转批量运行页查看进度与聚合结果
 * 乐观关闭：提交前立即关闭 dialog，避免用户感知"点了不关"——同步模式下几百毫秒用户不易察觉，
 * 异步模式下 /api/repos/batch-scan 返回前用户看到的是 dialog 持续 spinning + 滞留期间；
 * 失败时回滚 dialog + 显示错误 */
const submitBatchScan = async () => {
    batchSubmitting.value = true
    batchError.value = ''
    batchDialogVisible.value = false
    try {
        const result = await $fetch<{ batchRunId: string, repositoryCount: number }>('/api/repos/batch-scan', {
            method: 'POST',
            body: {
                repositoryIds: selectedRows.value.map((r) => r.id),
                mode: batchMode.value,
                severityThreshold: batchSeverityThreshold.value,
            },
        })
        success.value = t('repos.success.batchTriggered', { count: result.repositoryCount })
        await navigateTo('/batch-runs')
    } catch (e: any) {
        // 失败时回滚 dialog + 显示错误（用户可重试或修改后再次提交）
        batchDialogVisible.value = true
        batchError.value = t('repos.errors.batchFailed', { message: e?.data?.message ?? e?.message ?? t('common.errors.unknown') })
    } finally {
        batchSubmitting.value = false
    }
}

// ===== 批量导入（子组件 ImportReposDialog 承载；visible 由本页控制）=====
const importDialogVisible = ref(false)

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
                <Button
                    icon="pi pi-upload"
                    :label="t('repos.import')"
                    severity="secondary"
                    @click="importDialogVisible = true"
                />
                <Button
                    icon="pi pi-list"
                    :label="t('repos.batchScan')"
                    severity="secondary"
                    :disabled="!selectedRows.length"
                    :badge="selectedRows.length ? String(selectedRows.length) : undefined"
                    badge-class="p-badge-danger"
                    :title="t('repos.batchScanTitle')"
                    @click="openBatchScan"
                />
                <Button
                    icon="pi pi-plus"
                    :label="t('repos.addRepo')"
                    @click="openCreate"
                />
            </div>
        </div>

        <Message
            v-if="error"
            severity="error"
            :closable="false"
        >
            {{ error }}
        </Message>
        <Message
            v-if="success"
            severity="success"
            :closable="false"
        >
            {{ success }}
        </Message>
        <Message
            v-if="scanError"
            severity="error"
            :closable="false"
        >
            {{ scanError }}
        </Message>
        <Message
            v-if="scanSuccess"
            severity="success"
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
        </Message>

        <Card v-if="!loading">
            <template #content>
                <DataTable
                    v-model:selection="selectedRows"
                    :value="repos"
                    data-key="id"
                    striped-rows
                    size="small"
                    removable-sort
                    :empty-message="t('repos.empty')"
                >
                    <Column selection-mode="multiple" header-style="{width: '3rem'}" />
                    <Column
                        field="owner"
                        :header="t('repos.colOwner')"
                        sortable
                    />
                    <Column
                        field="name"
                        :header="t('repos.colRepo')"
                        sortable
                    />
                    <Column :header="t('repos.colTags')">
                        <template #body="{data}">
                            <div v-if="data.tags?.length" class="repos__tags">
                                <Tag
                                    v-for="tag in data.tags"
                                    :key="tag"
                                    :value="tag"
                                    severity="info"
                                    rounded
                                />
                            </div>
                            <span v-else class="text-muted">—</span>
                        </template>
                    </Column>
                    <Column :header="t('repos.colDefaultBranch')">
                        <template #body="{data}">
                            {{ data.defaultBranch }}
                        </template>
                    </Column>
                    <Column
                        field="packageManager"
                        :header="t('repos.colPackageManager')"
                        sortable
                    >
                        <template #body="{data}">
                            <Tag :value="data.packageManager" severity="secondary" />
                        </template>
                    </Column>
                    <Column :header="t('repos.colCredential')">
                        <template #body="{data}">
                            <span v-if="data.credentialName">{{ data.credentialName }}</span>
                            <span v-else class="text-muted">{{ t('repos.notLinked') }}</span>
                        </template>
                    </Column>
                    <Column
                        field="executorKind"
                        :header="t('repos.colExecutor')"
                        sortable
                    >
                        <template #body="{data}">
                            <Tag :value="data.executorKind === 'github-action' ? t('repos.githubAction') : data.executorKind === 'sandbox' ? t('repos.sandboxContainer') : t('repos.platformContainer')" />
                        </template>
                    </Column>
                    <Column :header="t('repos.colActions')" :style="{width: '230px'}">
                        <template #body="{data}">
                            <Button
                                icon="pi pi-play"
                                text
                                rounded
                                size="small"
                                :loading="scanningId === data.id"
                                :aria-label="t('repos.actionTriggerScan')"
                                :title="t('repos.actionTriggerScan')"
                                @click="openScanConfig(data)"
                            />
                            <Button
                                icon="pi pi-history"
                                text
                                rounded
                                size="small"
                                :aria-label="t('repos.actionScanHistory')"
                                :title="t('repos.actionScanHistory')"
                                @click="navigateTo({path: '/repos', query: {history: data.id}})"
                            />
                            <Button
                                icon="pi pi-pencil"
                                text
                                rounded
                                size="small"
                                :aria-label="t('repos.actionEdit')"
                                @click="openEdit(data)"
                            />
                            <Button
                                icon="pi pi-trash"
                                text
                                rounded
                                size="small"
                                severity="danger"
                                :aria-label="t('repos.actionDelete')"
                                @click="remove(data)"
                            />
                        </template>
                    </Column>
                </DataTable>
            </template>
        </Card>
        <p v-else class="text-muted">
            {{ t('common.empty.loading') }}
        </p>

        <Dialog
            v-model:visible="dialogVisible"
            :header="editingId ? t('repos.dialogEditTitle') : t('repos.dialogAddTitle')"
            modal
            :draggable="false"
            :style="{width: '520px'}"
        >
            <form class="repo-form" @submit.prevent="submit">
                <div class="repo-form__row">
                    <div class="repo-form__field">
                        <label for="owner">{{ t('repos.fieldOwner') }}</label>
                        <InputText
                            id="owner"
                            v-model="form.owner"
                            placeholder="github-owner"
                            fluid
                            required
                        />
                    </div>
                    <div class="repo-form__field">
                        <label for="name">{{ t('repos.fieldName') }}</label>
                        <InputText
                            id="name"
                            v-model="form.name"
                            placeholder="repo-name"
                            fluid
                            required
                        />
                    </div>
                </div>
                <div class="repo-form__row">
                    <div class="repo-form__field">
                        <label for="defaultBranch">{{ t('repos.fieldDefaultBranch') }}</label>
                        <InputText
                            id="defaultBranch"
                            v-model="form.defaultBranch"
                            fluid
                        />
                    </div>
                    <div class="repo-form__field">
                        <label for="packageManager">{{ t('repos.fieldPackageManager') }}</label>
                        <Select
                            id="packageManager"
                            v-model="form.packageManager"
                            :options="['pnpm', 'npm', 'yarn']"
                            fluid
                        />
                    </div>
                </div>
                <div class="repo-form__row">
                    <div class="repo-form__field">
                        <label for="credentialId">{{ t('repos.fieldCredential') }}</label>
                        <Select
                            id="credentialId"
                            v-model="form.credentialId"
                            :options="credentials"
                            option-label="name"
                            option-value="id"
                            :show-clear="true"
                            :placeholder="t('repos.notLinked')"
                            fluid
                        />
                    </div>
                    <div class="repo-form__field">
                        <label for="executorKind">{{ t('repos.fieldExecutor') }}</label>
                        <Select
                            id="executorKind"
                            v-model="form.executorKind"
                            :options="[
                                {label: t('repos.platformContainer'), value: 'container'},
                                {label: t('repos.githubAction'), value: 'github-action'},
                                {label: t('repos.sandboxContainer'), value: 'sandbox'}
                            ]"
                            option-label="label"
                            option-value="value"
                            fluid
                        />
                    </div>
                </div>
                <div
                    v-if="form.executorKind === 'github-action'"
                    class="repo-form__field"
                >
                    <label for="actionWorkflowFile">{{ t('repos.fieldWorkflowFile') }}</label>
                    <InputText
                        id="actionWorkflowFile"
                        v-model="form.actionWorkflowFile"
                        placeholder=".github/workflows/security-auto-fix.yml"
                        fluid
                    />
                    <small class="text-muted">{{ t('repos.fieldWorkflowFileHint') }}</small>
                </div>
                <div class="repo-form__field">
                    <label for="note">{{ t('repos.fieldNote') }}</label>
                    <Textarea
                        id="note"
                        v-model="form.note"
                        rows="2"
                        fluid
                    />
                </div>
                <div class="repo-form__field">
                    <label for="tags">{{ t('repos.fieldTags') }}</label>
                    <Chips
                        id="tags"
                        v-model="form.tags"
                        :placeholder="t('repos.fieldTagsPlaceholder')"
                        fluid
                    />
                    <small class="text-muted">{{ t('repos.fieldTagsHint') }}</small>
                </div>

                <div class="repo-form__actions">
                    <Button
                        :label="t('common.actions.cancel')"
                        severity="secondary"
                        text
                        @click="closeDialog"
                    />
                    <Button
                        type="submit"
                        :label="t('common.actions.save')"
                        icon="pi pi-check"
                        :loading="saving"
                    />
                </div>
            </form>
        </Dialog>

        <ImportReposDialog
            v-model:visible="importDialogVisible"
            :credentials="credentials"
            @imported="fetchData"
        />

        <Dialog
            v-model:visible="batchDialogVisible"
            :header="t('repos.batchHeader', {count: selectedRows.length})"
            modal
            :draggable="false"
            :style="{width: '480px'}"
        >
            <div class="batch-form">
                <Message
                    v-if="batchError"
                    severity="error"
                    :closable="false"
                >
                    {{ batchError }}
                </Message>
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
                        <Select
                            id="batchMode"
                            v-model="batchMode"
                            :options="modeOptions"
                            option-label="label"
                            option-value="value"
                            fluid
                        />
                    </div>
                    <div class="batch-form__field">
                        <label for="batchSeverity">{{ t('repos.batchSeverity') }}</label>
                        <Select
                            id="batchSeverity"
                            v-model="batchSeverityThreshold"
                            :options="severityOptions"
                            option-label="label"
                            option-value="value"
                            fluid
                        />
                    </div>
                </div>
                <div class="batch-form__actions">
                    <Button
                        :label="t('common.actions.cancel')"
                        severity="secondary"
                        text
                        @click="batchDialogVisible = false"
                    />
                    <Button
                        :label="t('repos.batchStart')"
                        icon="pi pi-play"
                        :loading="batchSubmitting"
                        @click="submitBatchScan"
                    />
                </div>
            </div>
        </Dialog>

        <ScanConfigDialog
            v-model:visible="scanConfigDialogVisible"
            v-model:mode="scanConfigMode"
            v-model:severity="scanConfigSeverity"
            :repo="scanConfigRepo"
            :mode-options="modeOptions"
            :severity-options="severityOptions"
            @submit="submitScanConfig"
        />

        <RepoHistoryDialog />
    </div>
</template>

<style lang="scss" scoped>
.repos {
    &__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: $space-5;
        h2 { margin: 0 0 $space-1; }
        p { margin: 0; font-size: $font-size-sm; }
    }
    &__header-actions { display: flex; align-items: center; gap: $space-2; }
}

.repo-form {
    display: flex;
    flex-direction: column;
    gap: $space-4;
    &__row { display: grid; grid-template-columns: 1fr 1fr; gap: $space-3; }
    &__field { display: flex; flex-direction: column; gap: $space-1;
        label { font-size: $font-size-sm; font-weight: 500; }
    }
    &__actions { display: flex; justify-content: flex-end; gap: $space-2; margin-top: $space-2; }
}

.repos__tags { display: flex; flex-wrap: wrap; gap: $space-1; }

.batch-form {
    display: flex;
    flex-direction: column;
    gap: $space-4;
    &__repos { display: flex; flex-wrap: wrap; gap: $space-1; max-height: 120px; overflow-y: auto; }
    &__repo { font-size: $font-size-sm; background-color: rgba($color-primary, 0.08); border-radius: $radius-sm; padding: $space-1 $space-2; }
    &__row { display: grid; grid-template-columns: 1fr 1fr; gap: $space-3; }
    &__field { display: flex; flex-direction: column; gap: $space-1;
        label { font-size: $font-size-sm; font-weight: 500; }
    }
    &__actions { display: flex; justify-content: flex-end; gap: $space-2; margin-top: $space-2; }
}
</style>
