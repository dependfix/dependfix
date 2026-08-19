<script setup lang="ts">
// 定时计划管理：新建/编辑/删除/启用禁用/手动触发（cron 到点自动触发批量扫描）
import type { RepoView, ScheduleSelectorKind, ScheduleView } from '~/types/platform'

definePageMeta({
    middleware: 'auth',
})

const { t, d } = useI18n()

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

const selectorOptions = computed(() => [
    { label: t('schedules.selector.all'), value: 'all' },
    { label: t('schedules.selector.organization'), value: 'organization' },
    { label: t('schedules.selector.tag'), value: 'tag' },
    { label: t('schedules.selector.explicit'), value: 'explicit' },
])

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

const selectorLabel = (kind: string) =>
    selectorOptions.value.find((o) => o.value === kind)?.label ?? kind

const fetchSchedules = async () => {
    loading.value = true
    error.value = ''
    try {
        schedules.value = await $fetch<ScheduleView[]>('/api/schedules')
    } catch (e: any) {
        error.value = t('schedules.errors.loadFailed', { message: e?.data?.message ?? e?.message ?? t('common.errors.unknown') })
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
            throw new Error(t('schedules.errors.tagRequired'))
        }
        return JSON.stringify({ tag })
    }
    const ids = form.value.repositoryIds
    if (ids.length === 0) {
        throw new Error(t('schedules.errors.reposRequired'))
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
            success.value = t('schedules.success.updated')
        } else {
            await $fetch('/api/schedules', {
                method: 'POST',
                body: payload,
            })
            success.value = t('schedules.success.created')
        }
        dialogVisible.value = false
        await fetchSchedules()
    } catch (e: any) {
        error.value = t('schedules.errors.saveFailed', { message: e?.data?.message ?? e?.message ?? t('common.errors.unknown') })
    } finally {
        saving.value = false
    }
}

const remove = async (schedule: ScheduleView) => {
    error.value = ''
    try {
        await $fetch(`/api/schedules/${schedule.id}`, { method: 'DELETE' })
        success.value = t('schedules.success.deleted')
        await fetchSchedules()
    } catch (e: any) {
        error.value = t('schedules.errors.deleteFailed', { message: e?.data?.message ?? e?.message ?? t('common.errors.unknown') })
    }
}

const trigger = async (schedule: ScheduleView) => {
    error.value = ''
    triggering.value = schedule.id
    try {
        const result = await $fetch<{ batchRunId: string, repositoryCount: number }>(`/api/schedules/${schedule.id}/trigger`, { method: 'POST' })
        success.value = t('schedules.success.triggered', { count: result.repositoryCount })
        await fetchSchedules()
    } catch (e: any) {
        error.value = t('schedules.errors.triggerFailed', { message: e?.data?.message ?? e?.message ?? t('common.errors.unknown') })
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
        success.value = schedule.enabled ? t('schedules.success.disabled') : t('schedules.success.enabled')
        await fetchSchedules()
    } catch (e: any) {
        error.value = t('schedules.errors.operationFailed', { message: e?.data?.message ?? e?.message ?? t('common.errors.unknown') })
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
                <h2>{{ t('schedules.title') }}</h2>
                <p class="text-muted">
                    {{ t('schedules.subtitle') }}
                </p>
            </div>
            <Button
                icon="pi pi-plus"
                :label="t('schedules.newPlan')"
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
                    removable-sort
                    :empty-message="t('schedules.empty')"
                >
                    <Column
                        field="name"
                        :header="t('schedules.colName')"
                        sortable
                    />
                    <Column
                        field="cron"
                        :header="t('schedules.colCron')"
                        sortable
                    >
                        <template #body="{data}">
                            <code>{{ data.cron }}</code>
                            <small
                                v-if="data.timezone"
                                class="text-muted"
                            >{{ t('schedules.timezoneSuffix', {timezone: data.timezone}) }}</small>
                        </template>
                    </Column>
                    <Column
                        field="selectorKind"
                        :header="t('schedules.colStrategy')"
                        sortable
                    >
                        <template #body="{data}">
                            {{ selectorLabel(data.selectorKind) }}
                        </template>
                    </Column>
                    <Column
                        field="mode"
                        :header="t('schedules.colMode')"
                        sortable
                    >
                        <template #body="{data}">
                            <Tag :value="modeOptions.find((m) => m.value === data.mode)?.label ?? data.mode" />
                        </template>
                    </Column>
                    <Column :header="t('schedules.colStatus')">
                        <template #body="{data}">
                            <Tag
                                :value="data.enabled ? t('schedules.enabled') : t('schedules.disabled')"
                                :severity="data.enabled ? 'success' : 'warn'"
                            />
                        </template>
                    </Column>
                    <Column
                        field="lastTriggeredAt"
                        :header="t('schedules.colLastTriggered')"
                        sortable
                    >
                        <template #body="{data}">
                            {{ data.lastTriggeredAt ? d(new Date(data.lastTriggeredAt), 'long') : '—' }}
                        </template>
                    </Column>
                    <Column :header="t('schedules.colActions')" :style="{width: '220px'}">
                        <template #body="{data}">
                            <Button
                                icon="pi pi-play"
                                text
                                rounded
                                size="small"
                                :title="t('schedules.actionTrigger')"
                                :loading="triggering === data.id"
                                @click="trigger(data)"
                            />
                            <Button
                                :icon="data.enabled ? 'pi pi-pause' : 'pi pi-play-circle'"
                                text
                                rounded
                                size="small"
                                :title="data.enabled ? t('schedules.actionDisable') : t('schedules.actionEnable')"
                                @click="toggleEnabled(data)"
                            />
                            <Button
                                icon="pi pi-pencil"
                                text
                                rounded
                                size="small"
                                :aria-label="t('schedules.actionEdit')"
                                @click="openEdit(data)"
                            />
                            <Button
                                icon="pi pi-trash"
                                text
                                rounded
                                size="small"
                                severity="danger"
                                :aria-label="t('schedules.actionDelete')"
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
            :header="editingId ? t('schedules.dialogEditTitle') : t('schedules.dialogCreateTitle')"
            modal
            :draggable="false"
            :style="{width: '560px'}"
        >
            <form class="schedule-form" @submit.prevent="submit">
                <div class="schedule-form__field">
                    <label for="name">{{ t('schedules.fieldName') }}</label>
                    <InputText
                        id="name"
                        v-model="form.name"
                        :placeholder="t('schedules.fieldNamePlaceholder')"
                        fluid
                        required
                    />
                </div>
                <div class="schedule-form__field">
                    <label for="cron">{{ t('schedules.fieldCron') }}</label>
                    <InputText
                        id="cron"
                        v-model="form.cron"
                        placeholder="0 2 * * 1"
                        fluid
                        required
                    />
                    <small class="text-muted">
                        {{ t('schedules.fieldCronHint') }}
                    </small>
                </div>
                <div class="schedule-form__field">
                    <label for="timezone">{{ t('schedules.fieldTimezone') }}</label>
                    <InputText
                        id="timezone"
                        v-model="form.timezone"
                        :placeholder="t('schedules.fieldTimezonePlaceholder')"
                        fluid
                    />
                </div>
                <div class="schedule-form__field">
                    <label for="selectorKind">{{ t('schedules.fieldSelector') }}</label>
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
                    <label for="tag">{{ t('schedules.fieldTag') }}</label>
                    <InputText
                        id="tag"
                        v-model="form.tag"
                        :placeholder="t('schedules.fieldTagPlaceholder')"
                        fluid
                    />
                </div>
                <div
                    v-if="form.selectorKind === 'explicit'"
                    class="schedule-form__field"
                >
                    <label for="repositoryIds">{{ t('schedules.fieldRepos', {count: form.repositoryIds.length}) }}</label>
                    <MultiSelect
                        id="repositoryIds"
                        v-model="form.repositoryIds"
                        :options="repos"
                        option-label="name"
                        option-value="id"
                        filter
                        display="chip"
                        :placeholder="t('schedules.fieldReposPlaceholder')"
                        fluid
                    />
                    <small class="text-muted">
                        {{ t('schedules.fieldReposHint') }}
                    </small>
                </div>
                <div
                    v-if="form.selectorKind === 'organization'"
                    class="schedule-form__field"
                >
                    <small class="text-muted">
                        {{ t('schedules.orgHint') }}
                    </small>
                </div>

                <div class="schedule-form__row">
                    <div class="schedule-form__field">
                        <label for="mode">{{ t('schedules.fieldMode') }}</label>
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
                        <label for="severityThreshold">{{ t('schedules.fieldSeverity') }}</label>
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
                        <span>{{ t('schedules.enableTrigger') }}</span>
                        <InputSwitch v-model="form.enabled" />
                    </div>
                </div>

                <div class="schedule-form__actions">
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
