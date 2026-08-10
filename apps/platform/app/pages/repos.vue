<script setup lang="ts">
// 仓库管理：列表 + 添加/编辑/删除
import type { RepoView } from '~/types/platform'

definePageMeta({
    middleware: 'auth',
})

interface RepoForm {
    owner: string
    name: string
    defaultBranch: string
    packageManager: 'pnpm' | 'npm' | 'yarn'
    credentialId: string | null
    actionWorkflowFile: string
    executorKind: 'container' | 'github-action'
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
        error.value = `加载失败：${e?.data?.message ?? e?.message ?? '未知错误'}`
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
            success.value = '仓库已更新'
        } else {
            await $fetch('/api/repos', {
                method: 'POST',
                body: payload,
            })
            success.value = '仓库已添加'
        }
        dialogVisible.value = false
        await fetchData()
    } catch (e: any) {
        error.value = `保存失败：${e?.data?.message ?? e?.message ?? '未知错误'}`
    } finally {
        saving.value = false
    }
}

const remove = async (repo: RepoView) => {
    error.value = ''
    try {
        await $fetch(`/api/repos/${repo.id}`, { method: 'DELETE' })
        success.value = '仓库已删除'
        await fetchData()
    } catch (e: any) {
        error.value = `删除失败：${e?.data?.message ?? e?.message ?? '未知错误'}`
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
            scanError.value = '扫描状态查询失败，可在扫描历史中查看'
            return
        }
        const run = await response.json() as { status: string, runUrl: string | null, error?: { code?: string, message?: string } | null }
        if (run.status === 'completed') {
            scanSuccess.value = '扫描完成，可在扫描历史中查看结果'
            return
        }
        if (run.status === 'failed') {
            // duplicate_scan（去重合并）：非执行失败，提示合并语义而非"扫描失败"
            scanError.value = run.error?.code === 'duplicate_scan'
                ? (run.error.message ?? '该仓库已有进行中的扫描任务')
                : `扫描失败：${run.error?.message ?? '未知错误'}`
            return
        }
        if (run.status === 'dispatched') {
            lastRunUrl.value = run.runUrl
            scanSuccess.value = run.runUrl ? '已触发 GitHub Action 扫描，点击下方链接查看运行' : '已触发 GitHub Action 扫描（可在扫描历史中查看）'
            return
        }
        // pending / running：继续轮询
    }
    if (!pollCancelled) {
        scanSuccess.value = '扫描仍在进行，可在扫描历史中查看进度'
    }
}

onUnmounted(() => {
    pollCancelled = true
})

const triggerScan = async (repo: RepoView) => {
    pollCancelled = false
    scanError.value = ''
    scanSuccess.value = ''
    lastRunUrl.value = null
    scanningId.value = repo.id
    // B 模式（GitHub Action）异步队列下由 worker 后台执行（不再同步挂起 30 分钟）
    if (repo.executorKind === 'github-action') {
        scanSuccess.value = '正在触发 GitHub Action 扫描（后台执行，可在扫描历史查看进度）…'
    }
    try {
        const run = await $fetch(`/api/repos/${repo.id}/scan`, {
            method: 'POST',
            body: {
                mode: 'report-only',
                severityThreshold: 'high',
                executorKind: repo.executorKind === 'github-action' ? 'github-action' : undefined,
            },
        })
        const runData = run as unknown as { id: string, status: string, runUrl: string | null }
        if (runData.status === 'pending') {
            // 队列模式：已入队，轮询状态
            scanSuccess.value = '扫描任务已入队，正在等待执行…'
            await pollRun(runData.id, repo.executorKind ?? 'container')
        } else if (runData.status === 'dispatched') {
            lastRunUrl.value = runData.runUrl
            scanSuccess.value = runData.runUrl ? '已触发 GitHub Action 扫描，点击下方链接查看运行' : '已触发 GitHub Action 扫描（可在扫描历史中查看）'
        } else if (runData.status === 'completed') {
            scanSuccess.value = '扫描完成，可在扫描历史中查看结果'
        } else {
            scanError.value = `扫描失败：${(run as { error?: { message?: string } }).error?.message ?? '未知错误'}`
        }
        await fetchData()
    } catch (e: any) {
        scanError.value = `触发失败：${e?.data?.message ?? e?.message ?? '未知错误'}`
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

// ===== 批量扫描（勾选多仓库 → 一次触发 → 跳转批量运行页）=====
const selectedRows = ref<RepoView[]>([])
const batchDialogVisible = ref(false)
const batchSubmitting = ref(false)
const batchError = ref('')
const batchMode = ref('report-only')
const batchSeverityThreshold = ref('high')

const batchModeOptions = [
    { label: '仅报告', value: 'report-only' },
    { label: '修复', value: 'fix' },
    { label: '修复并建 PR', value: 'fix-and-pr' },
]

const batchSeverityOptions = [
    { label: 'Critical', value: 'critical' },
    { label: 'High', value: 'high' },
    { label: 'Medium', value: 'medium' },
    { label: '全部', value: 'all' },
]

const openBatchScan = () => {
    if (!selectedRows.value.length) {
        return
    }
    batchError.value = ''
    batchMode.value = 'report-only'
    batchSeverityThreshold.value = 'high'
    batchDialogVisible.value = true
}

/** 批量触发：POST /api/repos/batch-scan → 跳转批量运行页查看进度与聚合结果 */
const submitBatchScan = async () => {
    batchSubmitting.value = true
    batchError.value = ''
    try {
        const result = await $fetch<{ batchRunId: string, repositoryCount: number }>('/api/repos/batch-scan', {
            method: 'POST',
            body: {
                repositoryIds: selectedRows.value.map((r) => r.id),
                mode: batchMode.value,
                severityThreshold: batchSeverityThreshold.value,
            },
        })
        batchDialogVisible.value = false
        success.value = `已触发批量扫描（${result.repositoryCount} 个仓库），正在打开批量运行页…`
        await navigateTo('/batch-runs')
    } catch (e: any) {
        batchError.value = `批量扫描失败：${e?.data?.message ?? e?.message ?? '未知错误'}`
    } finally {
        batchSubmitting.value = false
    }
}

// ===== 批量导入（从 GitHub 仓库列表选中多个）=====
interface ImportableRepo {
    id: number
    name: string
    fullName: string
    owner: string
    private: boolean
    defaultBranch: string
    description: string | null
    imported: boolean
}

const importDialogVisible = ref(false)
const importLoading = ref(false)
const importSaving = ref(false)
const importCredentials = ref<{ id: string, name: string }[]>([])
const importCredentialId = ref<string | null>(null)
const importableRepos = ref<ImportableRepo[]>([])
const selectedRepos = ref<ImportableRepo[]>([])

/** 可勾选仓库（排除已导入项；全选/计数均基于此集合） */
const selectableRepos = computed(() => importableRepos.value.filter((r) => !r.imported))
const importError = ref('')
const importSuccess = ref('')

const openImportDialog = async () => {
    importDialogVisible.value = true
    importError.value = ''
    importSuccess.value = ''
    selectedRepos.value = []
    importableRepos.value = []
    // 加载凭据列表供选择
    try {
        const creds = await $fetch('/api/credentials')
        importCredentials.value = creds as { id: string, name: string }[]
        if (importCredentials.value.length === 1) {
            importCredentialId.value = importCredentials.value[0]!.id
            await loadImportable()
        }
    } catch (e: any) {
        importError.value = `加载凭据失败：${e?.data?.message ?? e?.message ?? '未知错误'}`
    }
}

const loadImportable = async () => {
    if (!importCredentialId.value) {
        importableRepos.value = []
        return
    }
    importLoading.value = true
    importError.value = ''
    try {
        const res = await $fetch('/api/repos/importable', {
            query: { credentialId: importCredentialId.value },
        })
        importableRepos.value = res as ImportableRepo[]
        // 自动勾选未导入的仓库
        selectedRepos.value = importableRepos.value.filter((r) => !r.imported)
    } catch (e: any) {
        importError.value = `拉取仓库失败：${e?.data?.message ?? e?.message ?? '未知错误'}`
    } finally {
        importLoading.value = false
    }
}

const submitImport = async () => {
    if (!selectedRepos.value.length) {
        importError.value = '请至少选择一个仓库'
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
            },
        })
        const data = res as { imported: number, skipped: number }
        importSuccess.value = `批量导入完成：新增 ${data.imported} 个，跳过已存在 ${data.skipped} 个`
        await fetchData()
        await loadImportable()
    } catch (e: any) {
        importError.value = `批量导入失败：${e?.data?.message ?? e?.message ?? '未知错误'}`
    } finally {
        importSaving.value = false
    }
}
</script>

<template>
    <div class="repos">
        <div class="repos__header">
            <div>
                <h2>仓库管理</h2>
                <p class="text-muted">
                    管理扫描目标仓库与执行配置
                </p>
            </div>
            <div class="repos__header-actions">
                <Button
                    icon="pi pi-upload"
                    label="批量导入"
                    severity="secondary"
                    @click="openImportDialog"
                />
                <Button
                    icon="pi pi-list"
                    label="批量扫描"
                    severity="secondary"
                    :disabled="!selectedRows.length"
                    :badge="selectedRows.length ? String(selectedRows.length) : undefined"
                    badge-class="p-badge-danger"
                    title="勾选多个仓库后批量触发扫描"
                    @click="openBatchScan"
                />
                <Button
                    icon="pi pi-plus"
                    label="添加仓库"
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
                打开运行页
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
                    :empty-message="'暂无仓库，点击右上角添加'"
                >
                    <Column selection-mode="multiple" header-style="{width: '3rem'}" />
                    <Column field="owner" header="Owner" />
                    <Column field="name" header="仓库" />
                    <Column header="标签">
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
                    <Column header="默认分支">
                        <template #body="{data}">
                            {{ data.defaultBranch }}
                        </template>
                    </Column>
                    <Column header="包管理器">
                        <template #body="{data}">
                            <Tag :value="data.packageManager" severity="secondary" />
                        </template>
                    </Column>
                    <Column header="凭据">
                        <template #body="{data}">
                            <span v-if="data.credentialName">{{ data.credentialName }}</span>
                            <span v-else class="text-muted">未关联</span>
                        </template>
                    </Column>
                    <Column header="执行方式">
                        <template #body="{data}">
                            <Tag :value="data.executorKind === 'github-action' ? 'GitHub Action' : '平台容器'" />
                        </template>
                    </Column>
                    <Column header="操作" :style="{width: '230px'}">
                        <template #body="{data}">
                            <Button
                                icon="pi pi-play"
                                text
                                rounded
                                size="small"
                                :loading="scanningId === data.id"
                                :disabled="scanningId !== null && scanningId !== data.id"
                                aria-label="触发扫描"
                                title="触发扫描"
                                @click="triggerScan(data)"
                            />
                            <Button
                                icon="pi pi-history"
                                text
                                rounded
                                size="small"
                                aria-label="扫描历史"
                                title="扫描历史"
                                @click="navigateTo(`/repos/${data.id}/runs`)"
                            />
                            <Button
                                icon="pi pi-pencil"
                                text
                                rounded
                                size="small"
                                aria-label="编辑"
                                @click="openEdit(data)"
                            />
                            <Button
                                icon="pi pi-trash"
                                text
                                rounded
                                size="small"
                                severity="danger"
                                aria-label="删除"
                                @click="remove(data)"
                            />
                        </template>
                    </Column>
                </DataTable>
            </template>
        </Card>
        <p v-else class="text-muted">
            加载中…
        </p>

        <Dialog
            v-model:visible="dialogVisible"
            :header="editingId ? '编辑仓库' : '添加仓库'"
            modal
            :style="{width: '520px'}"
        >
            <form class="repo-form" @submit.prevent="submit">
                <div class="repo-form__row">
                    <div class="repo-form__field">
                        <label for="owner">Owner *</label>
                        <InputText
                            id="owner"
                            v-model="form.owner"
                            placeholder="github-owner"
                            fluid
                            required
                        />
                    </div>
                    <div class="repo-form__field">
                        <label for="name">仓库名 *</label>
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
                        <label for="defaultBranch">默认分支</label>
                        <InputText
                            id="defaultBranch"
                            v-model="form.defaultBranch"
                            fluid
                        />
                    </div>
                    <div class="repo-form__field">
                        <label for="packageManager">包管理器</label>
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
                        <label for="credentialId">关联凭据</label>
                        <Select
                            id="credentialId"
                            v-model="form.credentialId"
                            :options="credentials"
                            option-label="name"
                            option-value="id"
                            :show-clear="true"
                            placeholder="未关联"
                            fluid
                        />
                    </div>
                    <div class="repo-form__field">
                        <label for="executorKind">执行方式</label>
                        <Select
                            id="executorKind"
                            v-model="form.executorKind"
                            :options="[
                                {label: '平台容器', value: 'container'},
                                {label: 'GitHub Action', value: 'github-action'}
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
                    <label for="actionWorkflowFile">Action workflow 文件</label>
                    <InputText
                        id="actionWorkflowFile"
                        v-model="form.actionWorkflowFile"
                        placeholder=".github/workflows/security-auto-fix.yml"
                        fluid
                    />
                    <small class="text-muted">目标仓库内 workflow 路径（GitHub Action 执行方式必填）</small>
                </div>
                <div class="repo-form__field">
                    <label for="note">备注</label>
                    <Textarea
                        id="note"
                        v-model="form.note"
                        rows="2"
                        fluid
                    />
                </div>
                <div class="repo-form__field">
                    <label for="tags">标签</label>
                    <Chips
                        id="tags"
                        v-model="form.tags"
                        placeholder="输入标签后回车（如 frontend / critical），用于定时计划按标签选择"
                        fluid
                    />
                    <small class="text-muted">定时计划可按标签批量选择仓库；留空不设置</small>
                </div>

                <div class="repo-form__actions">
                    <Button
                        label="取消"
                        severity="secondary"
                        text
                        @click="closeDialog"
                    />
                    <Button
                        type="submit"
                        label="保存"
                        icon="pi pi-check"
                        :loading="saving"
                    />
                </div>
            </form>
        </Dialog>

        <Dialog
            v-model:visible="importDialogVisible"
            header="批量导入仓库"
            modal
            :style="{width: '680px'}"
        >
            <div class="import-form">
                <div class="import-form__row">
                    <div class="import-form__field">
                        <label for="importCredential">GitHub 凭据</label>
                        <Select
                            id="importCredential"
                            v-model="importCredentialId"
                            :options="importCredentials"
                            option-label="name"
                            option-value="id"
                            placeholder="选择凭据"
                            :loading="importLoading"
                            fluid
                            @change="loadImportable"
                        />
                    </div>
                    <Button
                        icon="pi pi-refresh"
                        text
                        rounded
                        aria-label="刷新仓库列表"
                        title="刷新仓库列表"
                        :disabled="!importCredentialId || importLoading"
                        @click="loadImportable"
                    />
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
                    加载中…
                </div>
                <div v-else-if="importableRepos.length" class="import-form__list">
                    <div class="import-form__list-actions">
                        <label>
                            <Checkbox
                                :model-value="selectedRepos.length === selectableRepos.length && selectableRepos.length > 0"
                                :binary="true"
                                @update:model-value="(v: boolean) => selectedRepos = v ? [...selectableRepos] : []"
                            />
                            全选（{{ selectableRepos.length }}）
                        </label>
                        <span class="text-muted">已选 {{ selectedRepos.length }} 个</span>
                    </div>
                    <div
                        v-for="repo in importableRepos"
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
                                {{ repo.private ? '私有' : '公开' }} · {{ repo.defaultBranch }}
                                <template v-if="repo.imported"> · 已导入</template>
                            </small>
                        </div>
                        <Tag
                            v-if="repo.imported"
                            value="已存在"
                            severity="secondary"
                        />
                    </div>
                </div>
                <p v-else-if="!importLoading && importCredentialId" class="text-muted">
                    未获取到仓库列表（凭据无权访问或没有匹配仓库）
                </p>
                <p v-else class="text-muted">
                    请先选择 GitHub 凭据
                </p>

                <div class="import-form__actions">
                    <Button
                        label="取消"
                        severity="secondary"
                        text
                        @click="importDialogVisible = false"
                    />
                    <Button
                        label="导入所选"
                        icon="pi pi-check"
                        :loading="importSaving"
                        :disabled="!selectedRepos.length"
                        @click="submitImport"
                    />
                </div>
            </div>
        </Dialog>

        <Dialog
            v-model:visible="batchDialogVisible"
            :header="`批量扫描（${selectedRows.length} 个仓库）`"
            modal
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
                        <label for="batchMode">扫描模式</label>
                        <Select
                            id="batchMode"
                            v-model="batchMode"
                            :options="batchModeOptions"
                            option-label="label"
                            option-value="value"
                            fluid
                        />
                    </div>
                    <div class="batch-form__field">
                        <label for="batchSeverity">严重级别阈值</label>
                        <Select
                            id="batchSeverity"
                            v-model="batchSeverityThreshold"
                            :options="batchSeverityOptions"
                            option-label="label"
                            option-value="value"
                            fluid
                        />
                    </div>
                </div>
                <div class="batch-form__actions">
                    <Button
                        label="取消"
                        severity="secondary"
                        text
                        @click="batchDialogVisible = false"
                    />
                    <Button
                        label="开始扫描"
                        icon="pi pi-play"
                        :loading="batchSubmitting"
                        @click="submitBatchScan"
                    />
                </div>
            </div>
        </Dialog>
    </div>
</template>

<style lang="scss" scoped>
.repos {
    &__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: $space-5;
    }

    &__header h2 {
        margin: 0 0 $space-1;
    }

    &__header p {
        margin: 0;
        font-size: $font-size-sm;
    }

    &__header-actions {
        display: flex;
        align-items: center;
        gap: $space-2;
    }
}

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
    }

    &__field label {
        font-size: $font-size-sm;
        font-weight: 500;
    }

    &__list {
        display: flex;
        flex-direction: column;
        gap: $space-1;
        max-height: 360px;
        overflow-y: auto;
        border: 1px solid $color-border;
        border-radius: $radius-sm;
        padding: $space-2;

        @include dark-mode {
            border-color: $color-border-dark;
        }
    }

    &__list-actions {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: $space-1 $space-2 $space-2;
        border-bottom: 1px solid $color-border;
        font-size: $font-size-sm;

        @include dark-mode {
            border-bottom-color: $color-border-dark;
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
    }

    &__field label {
        font-size: $font-size-sm;
        font-weight: 500;
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
    }

    &__field label {
        font-size: $font-size-sm;
        font-weight: 500;
    }

    &__actions {
        display: flex;
        justify-content: flex-end;
        gap: $space-2;
        margin-top: $space-2;
    }
}
</style>
