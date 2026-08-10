<script setup lang="ts">
// 定时计划管理：新建/编辑/删除/启用禁用/手动触发（cron 到点自动触发批量扫描）
import type { RepoView, ScheduleSelectorKind, ScheduleView } from '~/types/platform'

definePageMeta({
    middleware: 'auth',
})

interface ScheduleForm {
    name: string
    cron: string
    timezone: string
    selectorKind: ScheduleSelectorKind
    tag: string
    repositoryIds: string[]
    mode: string
    severityThreshold: string
    enabled: boolean
}

const loading = ref(true)
const saving = ref(false)
const triggering = ref<string | null>(null)
const schedules = ref<ScheduleView[]>([])
const repos = ref<RepoView[]>([])
const dialogVisible = ref(false)
const editingId = ref<string | null>(null)
const error = ref('')
const success = ref('')

const emptyForm = (): ScheduleForm => ({
    name: '',
    cron: '0 2 * * 1',
    timezone: '',
    selectorKind: 'all',
    tag: '',
    repositoryIds: [],
    mode: 'report-only',
    severityThreshold: 'high',
    enabled: true,
})

const form = ref<ScheduleForm>(emptyForm())

const selectorOptions = [
    { label: '全部仓库', value: 'all' },
    { label: '按组织', value: 'organization' },
    { label: '按标签', value: 'tag' },
    { label: '手动指定', value: 'explicit' },
]

const modeOptions = [
    { label: '仅报告', value: 'report-only' },
    { label: '修复', value: 'fix' },
    { label: '修复并建 PR', value: 'fix-and-pr' },
]

const severityOptions = [
    { label: 'Critical', value: 'critical' },
    { label: 'High', value: 'high' },
    { label: 'Medium', value: 'medium' },
    { label: '全部', value: 'all' },
]

const selectorLabel = (kind: string) =>
    selectorOptions.find((o) => o.value === kind)?.label ?? kind

const fetchSchedules = async () => {
    loading.value = true
    error.value = ''
    try {
        schedules.value = await $fetch<ScheduleView[]>('/api/schedules')
    } catch (e: any) {
        error.value = `加载失败：${e?.data?.message ?? e?.message ?? '未知错误'}`
    } finally {
        loading.value = false
    }
}

const fetchRepos = async () => {
    try {
        repos.value = await $fetch<RepoView[]>('/api/repos')
    } catch {
        // 仓库加载失败不阻塞计划列表（仅 explicit 策略多选用到）
    }
}

onMounted(async () => {
    await Promise.all([fetchSchedules(), fetchRepos()])
})

const parseSelectorData = (schedule: ScheduleView): { tag?: string, repositoryIds?: string[] } => {
    if (!schedule.selectorJson) {
        return {}
    }
    try {
        return JSON.parse(schedule.selectorJson)
    } catch {
        return {}
    }
}

const openCreate = () => {
    editingId.value = null
    form.value = emptyForm()
    dialogVisible.value = true
}

const openEdit = (schedule: ScheduleView) => {
    editingId.value = schedule.id
    const data = parseSelectorData(schedule)
    form.value = {
        name: schedule.name,
        cron: schedule.cron,
        timezone: schedule.timezone ?? '',
        selectorKind: schedule.selectorKind,
        tag: data.tag ?? '',
        repositoryIds: data.repositoryIds ?? [],
        mode: schedule.mode,
        severityThreshold: schedule.severityThreshold,
        enabled: schedule.enabled,
    }
    dialogVisible.value = true
}

const closeDialog = () => {
    dialogVisible.value = false
    editingId.value = null
}

/** 按 selectorKind 组装 selectorJson（all 不传；校验失败抛错给表单提示） */
const buildSelectorJson = (): string | null => {
    const kind = form.value.selectorKind
    if (kind === 'all') {
        return null
    }
    if (kind === 'organization') {
        return JSON.stringify({ organizationId: 'current' })
    }
    if (kind === 'tag') {
        const tag = form.value.tag.trim()
        if (!tag) {
            throw new Error('按标签策略需要填写标签')
        }
        return JSON.stringify({ tag })
    }
    const ids = form.value.repositoryIds
    if (ids.length === 0) {
        throw new Error('手动指定策略需要至少选择一个仓库')
    }
    return JSON.stringify({ repositoryIds: ids })
}

const submit = async () => {
    saving.value = true
    error.value = ''
    try {
        const payload = {
            name: form.value.name,
            cron: form.value.cron,
            timezone: form.value.timezone.trim() || null,
            selectorKind: form.value.selectorKind,
            selectorJson: buildSelectorJson(),
            mode: form.value.mode,
            severityThreshold: form.value.severityThreshold,
            enabled: form.value.enabled,
        }
        if (editingId.value) {
            await $fetch(`/api/schedules/${editingId.value}`, {
                method: 'PATCH',
                body: payload,
            })
            success.value = '定时计划已更新'
        } else {
            await $fetch('/api/schedules', {
                method: 'POST',
                body: payload,
            })
            success.value = '定时计划已创建'
        }
        dialogVisible.value = false
        await fetchSchedules()
    } catch (e: any) {
        error.value = `保存失败：${e?.data?.message ?? e?.message ?? '未知错误'}`
    } finally {
        saving.value = false
    }
}

const remove = async (schedule: ScheduleView) => {
    error.value = ''
    try {
        await $fetch(`/api/schedules/${schedule.id}`, { method: 'DELETE' })
        success.value = '定时计划已删除'
        await fetchSchedules()
    } catch (e: any) {
        error.value = `删除失败：${e?.data?.message ?? e?.message ?? '未知错误'}`
    }
}

const trigger = async (schedule: ScheduleView) => {
    error.value = ''
    triggering.value = schedule.id
    try {
        const result = await $fetch<{ batchRunId: string, repositoryCount: number }>(`/api/schedules/${schedule.id}/trigger`, { method: 'POST' })
        success.value = `已触发批量扫描（${result.repositoryCount} 个仓库），可在批量运行页查看进度`
        await fetchSchedules()
    } catch (e: any) {
        error.value = `触发失败：${e?.data?.message ?? e?.message ?? '未知错误'}`
    } finally {
        triggering.value = null
    }
}

const toggleEnabled = async (schedule: ScheduleView) => {
    error.value = ''
    try {
        await $fetch(`/api/schedules/${schedule.id}`, {
            method: 'PATCH',
            body: { enabled: !schedule.enabled },
        })
        success.value = schedule.enabled ? '定时计划已禁用' : '定时计划已启用'
        await fetchSchedules()
    } catch (e: any) {
        error.value = `操作失败：${e?.data?.message ?? e?.message ?? '未知错误'}`
    }
}

const toastMessage = computed(() => success.value)
watch(toastMessage, (v) => {
    if (v) {
        setTimeout(() => {
            success.value = ''
        }, 4000)
    }
})
</script>

<template>
    <div class="schedules">
        <div class="schedules__header">
            <div>
                <h2>定时计划</h2>
                <p class="text-muted">
                    cron 到点自动触发批量扫描（异步队列 / 无 Redis 时降级进程内调度）
                </p>
            </div>
            <Button
                icon="pi pi-plus"
                label="新建计划"
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

        <Card v-if="!loading">
            <template #content>
                <DataTable
                    :value="schedules"
                    striped-rows
                    size="small"
                    :empty-message="'暂无定时计划，点击右上角新建'"
                >
                    <Column field="name" header="名称" />
                    <Column header="cron 表达式">
                        <template #body="{data}">
                            <code>{{ data.cron }}</code>
                            <small
                                v-if="data.timezone"
                                class="text-muted"
                            >（{{ data.timezone }}）</small>
                        </template>
                    </Column>
                    <Column header="仓库策略">
                        <template #body="{data}">
                            {{ selectorLabel(data.selectorKind) }}
                        </template>
                    </Column>
                    <Column header="模式">
                        <template #body="{data}">
                            <Tag :value="modeOptions.find((m) => m.value === data.mode)?.label ?? data.mode" />
                        </template>
                    </Column>
                    <Column header="状态">
                        <template #body="{data}">
                            <Tag
                                :value="data.enabled ? '已启用' : '已禁用'"
                                :severity="data.enabled ? 'success' : 'warn'"
                            />
                        </template>
                    </Column>
                    <Column header="最近触发">
                        <template #body="{data}">
                            {{ data.lastTriggeredAt ? new Date(data.lastTriggeredAt).toLocaleString() : '—' }}
                        </template>
                    </Column>
                    <Column header="操作" :style="{width: '220px'}">
                        <template #body="{data}">
                            <Button
                                icon="pi pi-play"
                                text
                                rounded
                                size="small"
                                title="手动触发一次"
                                :loading="triggering === data.id"
                                @click="trigger(data)"
                            />
                            <Button
                                :icon="data.enabled ? 'pi pi-pause' : 'pi pi-play-circle'"
                                text
                                rounded
                                size="small"
                                :title="data.enabled ? '禁用' : '启用'"
                                @click="toggleEnabled(data)"
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
            :header="editingId ? '编辑定时计划' : '新建定时计划'"
            modal
            :style="{width: '560px'}"
        >
            <form class="schedule-form" @submit.prevent="submit">
                <div class="schedule-form__field">
                    <label for="name">计划名称 *</label>
                    <InputText
                        id="name"
                        v-model="form.name"
                        placeholder="如 每周一凌晨扫描"
                        fluid
                        required
                    />
                </div>
                <div class="schedule-form__field">
                    <label for="cron">cron 表达式 *</label>
                    <InputText
                        id="cron"
                        v-model="form.cron"
                        placeholder="0 2 * * 1"
                        fluid
                        required
                    />
                    <small class="text-muted">
                        5 段（分 时 日 月 周）或 6 段（含秒），如 <code>0 2 * * 1</code> = 每周一 02:00；建议间隔不小于 1 小时
                    </small>
                </div>
                <div class="schedule-form__field">
                    <label for="timezone">时区（可选）</label>
                    <InputText
                        id="timezone"
                        v-model="form.timezone"
                        placeholder="Asia/Shanghai，留空用服务器本地时区"
                        fluid
                    />
                </div>
                <div class="schedule-form__field">
                    <label for="selectorKind">仓库选择策略</label>
                    <Select
                        id="selectorKind"
                        v-model="form.selectorKind"
                        :options="selectorOptions"
                        option-label="label"
                        option-value="value"
                        fluid
                    />
                </div>

                <div
                    v-if="form.selectorKind === 'tag'"
                    class="schedule-form__field"
                >
                    <label for="tag">标签</label>
                    <InputText
                        id="tag"
                        v-model="form.tag"
                        placeholder="如 frontend（命中仓库的 tags 包含该标签）"
                        fluid
                    />
                </div>
                <div
                    v-if="form.selectorKind === 'explicit'"
                    class="schedule-form__field"
                >
                    <label for="repositoryIds">目标仓库（{{ form.repositoryIds.length }} 个）</label>
                    <MultiSelect
                        id="repositoryIds"
                        v-model="form.repositoryIds"
                        :options="repos"
                        option-label="name"
                        option-value="id"
                        filter
                        display="chip"
                        placeholder="选择仓库"
                        fluid
                    />
                    <small class="text-muted">
                        选项格式为仓库名，owner/name 见仓库列表
                    </small>
                </div>
                <div
                    v-if="form.selectorKind === 'organization'"
                    class="schedule-form__field"
                >
                    <small class="text-muted">
                        当前单组织模型下按组织选择等同全部仓库
                    </small>
                </div>

                <div class="schedule-form__row">
                    <div class="schedule-form__field">
                        <label for="mode">扫描模式</label>
                        <Select
                            id="mode"
                            v-model="form.mode"
                            :options="modeOptions"
                            option-label="label"
                            option-value="value"
                            fluid
                        />
                    </div>
                    <div class="schedule-form__field">
                        <label for="severityThreshold">严重级别阈值</label>
                        <Select
                            id="severityThreshold"
                            v-model="form.severityThreshold"
                            :options="severityOptions"
                            option-label="label"
                            option-value="value"
                            fluid
                        />
                    </div>
                </div>
                <div class="schedule-form__field">
                    <div class="schedule-form__switch">
                        <span>启用定时触发</span>
                        <InputSwitch v-model="form.enabled" />
                    </div>
                </div>

                <div class="schedule-form__actions">
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
.schedules {
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

.schedule-form {
    display: flex;
    flex-direction: column;
    gap: $space-4;

    &__field {
        display: flex;
        flex-direction: column;
        gap: $space-1;
    }

    &__field label {
        font-size: $font-size-sm;
        font-weight: 500;
    }

    &__row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: $space-3;
    }

    &__switch {
        display: flex;
        align-items: center;
        justify-content: space-between;
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
