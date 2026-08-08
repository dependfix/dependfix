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
}

const loading = ref(true)
const saving = ref(false)
const repos = ref<RepoView[]>([])
const credentials = ref<{ id: string, name: string, type: string }[]>([])
const dialogVisible = ref(false)
const editingId = ref<string | null>(null)
const error = ref('')
const success = ref('')

const emptyForm = (): RepoForm => ({
    owner: '',
    name: '',
    defaultBranch: 'main',
    packageManager: 'pnpm',
    credentialId: null,
    actionWorkflowFile: '',
    executorKind: 'container',
    note: '',
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

// 扫描触发（同步执行：请求内完成，loading 展示）
const scanningId = ref<string | null>(null)
const scanError = ref('')
const scanSuccess = ref('')
const lastRunUrl = ref<string | null>(null)

const triggerScan = async (repo: RepoView) => {
    scanError.value = ''
    scanSuccess.value = ''
    lastRunUrl.value = null
    scanningId.value = repo.id
    try {
        const run = await $fetch(`/api/repos/${repo.id}/scan`, {
            method: 'POST',
            body: {
                mode: 'report-only',
                severityThreshold: 'high',
                executorKind: repo.executorKind === 'github-action' ? 'github-action' : undefined,
            },
        })
        const runData = run as { id: string, status: string, runUrl: string | null }
        if (runData.status === 'dispatched') {
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
            <Button
                icon="pi pi-plus"
                label="添加仓库"
                @click="openCreate"
            />
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
                    :value="repos"
                    striped-rows
                    size="small"
                    :empty-message="'暂无仓库，点击右上角添加'"
                >
                    <Column field="owner" header="Owner" />
                    <Column field="name" header="仓库" />
                    <Column header="默认分支">
                        <template #body="{ data }">
                            {{ data.defaultBranch }}
                        </template>
                    </Column>
                    <Column header="包管理器">
                        <template #body="{ data }">
                            <Tag :value="data.packageManager" severity="secondary" />
                        </template>
                    </Column>
                    <Column header="凭据">
                        <template #body="{ data }">
                            <span v-if="data.credentialName">{{ data.credentialName }}</span>
                            <span v-else class="text-muted">未关联</span>
                        </template>
                    </Column>
                    <Column header="执行方式">
                        <template #body="{ data }">
                            <Tag :value="data.executorKind === 'github-action' ? 'GitHub Action' : '平台容器'" />
                        </template>
                    </Column>
                    <Column header="操作" :style="{ width: '230px' }">
                        <template #body="{ data }">
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
            :style="{ width: '520px' }"
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
                                { label: '平台容器', value: 'container' },
                                { label: 'GitHub Action', value: 'github-action' },
                            ]"
                            option-label="label"
                            option-value="value"
                            fluid
                        />
                    </div>
                </div>
                <div class="repo-form__field">
                    <label for="actionWorkflowFile">Action workflow 文件（B 模式）</label>
                    <InputText
                        id="actionWorkflowFile"
                        v-model="form.actionWorkflowFile"
                        placeholder=".github/workflows/security-auto-fix.yml"
                        fluid
                    />
                    <small class="text-muted">选择 GitHub Action 执行时必填（目标仓库内 workflow 路径）</small>
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
</style>
