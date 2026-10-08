<script setup lang="ts">
// 定时计划管理：新建/编辑/删除/启用禁用/手动触发（cron 到点自动触发批量扫描）
import { Check, CirclePlay, Pause, Pencil, Play, Plus, Trash } from '@lucide/vue'
import type { DataTableColumn } from 'caomei-ui'
import type { RepoView, ScheduleSelectorKind, ScheduleView } from '~/types/platform'
import { previewCron } from '~/utils/cron-preview'
import { scanModeOptions, scanSeverityOptions } from '~/utils/scan-options'

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
/** 浏览器解析的 IANA 时区（时区选择框默认选项 + cron 预览 fallback） */
const browserTimezone = ref('')

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

// 模式 / 严重级别选项复用 utils/scan-options 单一事实源（与扫描弹窗、设置页默认值口径一致，
// 避免多处漂移；抽取边界见 docs/standards/platform.md §7.3）
const modeOptions = computed(() => scanModeOptions(t))

const severityOptions = computed(() => scanSeverityOptions(t))

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
    browserTimezone.value = Intl.DateTimeFormat().resolvedOptions().timeZone
    await Promise.all([fetchSchedules(), fetchRepos()])
})

/** Intl.supportedValuesOf('timeZone') 时区列表（运行时探测，旧 Node 不可用时兜底） */
const timezoneOptions = computed<string[]>(() => {
    let list: string[]
    try {
        list = Intl.supportedValuesOf('timeZone')
    } catch {
        // 兜底：旧 Node 不支持 supportedValuesOf 时仅给常用 UTC + 服务器常见时区
        list = ['UTC', 'Asia/Shanghai', 'Asia/Tokyo', 'Asia/Singapore', 'Europe/London', 'America/New_York']
    }
    // 浏览器时区插到首位（用户易识别）；仅当浏览器时区存在且不在首位时重排
    const browser = browserTimezone.value
    if (!browser) {
        return list
    }
    const idx = list.indexOf(browser)
    if (idx <= 0) {
        return idx === -1 ? [browser, ...list] : list
    }
    return [browser, ...list.slice(0, idx), ...list.slice(idx + 1)]
})

/** cron 实时预览：随 form.cron / form.timezone 变更重算，复用 server 已依赖的 cron-parser 5.x */
const cronPreview = computed(() => previewCron(form.value.cron, {
    timezone: form.value.timezone.trim() || null,
    count: 3,
}))

/** 按 IANA 时区格式化 cron 触发时间（不跟随 i18n locale —— cron 时区是独立的时序维度） */
function formatCronPreviewDate(date: Date): string {
    const tz = form.value.timezone.trim() || browserTimezone.value || undefined
    try {
        return new Intl.DateTimeFormat(undefined, {
            timeZone: tz,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
        }).format(date)
    } catch {
        // 兜底：IANA 时区非法时退回浏览器本地
        return new Intl.DateTimeFormat(undefined, {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
        }).format(date)
    }
}

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

/**
 * 列定义（caomei DataTable 用 `columns` 数组 + `#cell-{key}` 插槽替代迁移前的 `<Column>`）。
 * `key` 即排序字段（原 `field`），非排序列（status / actions）取语义唯一 key。
 */
const columns = computed<DataTableColumn<ScheduleView>[]>(() => [
    { key: 'name', header: t('schedules.colName'), sortable: true },
    { key: 'cron', header: t('schedules.colCron'), sortable: true },
    { key: 'selectorKind', header: t('schedules.colStrategy'), sortable: true },
    { key: 'mode', header: t('schedules.colMode'), sortable: true },
    { key: 'status', header: t('schedules.colStatus') },
    { key: 'lastTriggeredAt', header: t('schedules.colLastTriggered'), sortable: true },
    { key: 'actions', header: t('schedules.colActions'), width: '220px' },
])

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
            <CaomeiButton @click="openCreate">
                <template #icon>
                    <CaomeiIcon :icon="Plus" />
                </template>
                {{ t('schedules.newPlan') }}
            </CaomeiButton>
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

        <CaomeiCard v-if="!loading">
            <CaomeiDataTable
                :data="schedules"
                :columns="columns"
                row-key="id"
                striped
                :empty-text="t('schedules.empty')"
            >
                <template #cell-cron="{row}">
                    <code>{{ row.cron }}</code>
                    <small
                        v-if="row.timezone"
                        class="text-muted"
                    >{{ t('schedules.timezoneSuffix', {timezone: row.timezone}) }}</small>
                </template>
                <template #cell-selectorKind="{row}">
                    {{ selectorLabel(row.selectorKind) }}
                </template>
                <template #cell-mode="{row}">
                    <CaomeiTag>{{ modeOptions.find((m) => m.value === row.mode)?.label ?? row.mode }}</CaomeiTag>
                </template>
                <template #cell-status="{row}">
                    <CaomeiTag :tone="row.enabled ? 'success' : 'warning'">
                        {{ row.enabled ? t('schedules.enabled') : t('schedules.disabled') }}
                    </CaomeiTag>
                </template>
                <template #cell-lastTriggeredAt="{row}">
                    {{ row.lastTriggeredAt ? d(new Date(row.lastTriggeredAt), 'long') : '—' }}
                </template>
                <template #cell-actions="{row}">
                    <CaomeiButton
                        variant="ghost"
                        rounded
                        size="sm"
                        :label="t('schedules.actionTrigger')"
                        :title="t('schedules.actionTrigger')"
                        :loading="triggering === row.id"
                        @click="trigger(row)"
                    >
                        <template #icon>
                            <CaomeiIcon :icon="Play" />
                        </template>
                    </CaomeiButton>
                    <CaomeiButton
                        variant="ghost"
                        rounded
                        size="sm"
                        :label="row.enabled ? t('schedules.actionDisable') : t('schedules.actionEnable')"
                        :title="row.enabled ? t('schedules.actionDisable') : t('schedules.actionEnable')"
                        @click="toggleEnabled(row)"
                    >
                        <template #icon>
                            <CaomeiIcon :icon="row.enabled ? Pause : CirclePlay" />
                        </template>
                    </CaomeiButton>
                    <CaomeiButton
                        variant="ghost"
                        rounded
                        size="sm"
                        :label="t('schedules.actionEdit')"
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
                        :label="t('schedules.actionDelete')"
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

        <CaomeiDialog
            v-model:open="dialogVisible"
            :title="editingId ? t('schedules.dialogEditTitle') : t('schedules.dialogCreateTitle')"
            modal
            :style="{width: '560px'}"
        >
            <form class="schedule-form" @submit.prevent="submit">
                <div class="schedule-form__field">
                    <label for="name">{{ t('schedules.fieldName') }}</label>
                    <CaomeiInput
                        id="name"
                        v-model="form.name"
                        :placeholder="t('schedules.fieldNamePlaceholder')"
                        required
                    />
                </div>
                <div class="schedule-form__field">
                    <label for="cron">{{ t('schedules.fieldCron') }}</label>
                    <CaomeiInput
                        id="cron"
                        v-model="form.cron"
                        placeholder="0 2 * * 1"
                        :invalid="!!cronPreview.errorKey"
                        required
                    />
                    <small class="text-muted">
                        {{ t('schedules.fieldCronHint') }}
                    </small>
                    <!-- cron 实时预览（合法=next 3 次触发时间；非法=错误提示；空=无显示） -->
                    <section
                        v-if="cronPreview.isValid && cronPreview.nextRuns"
                        :aria-label="t('schedules.cronPreviewTitle')"
                    >
                        <ul class="schedule-form__cron-preview">
                            <li
                                v-for="(date, idx) in cronPreview.nextRuns"
                                :key="idx"
                                class="text-success"
                            >
                                {{ formatCronPreviewDate(date) }}
                            </li>
                        </ul>
                    </section>
                    <small
                        v-else-if="cronPreview.errorKey && cronPreview.errorKey !== 'empty'"
                        class="text-danger"
                    >
                        {{ t(`schedules.cronInvalid.${cronPreview.errorKey}`) }}
                    </small>
                </div>
                <div class="schedule-form__field">
                    <label for="timezone">{{ t('schedules.fieldTimezone') }}</label>
                    <!-- 时区取值必须来自 IANA 列表：AutoComplete 的 strict 模式拒绝自由文本写入 -->
                    <CaomeiAutoComplete
                        id="timezone"
                        v-model="form.timezone"
                        :options="timezoneOptions"
                        :placeholder="t('schedules.fieldTimezonePlaceholder')"
                        :empty-label="t('schedules.timezoneEmpty')"
                        strict
                    />
                    <small class="text-muted">
                        {{ t('schedules.timezoneHint', {default: browserTimezone}) }}
                    </small>
                </div>
                <div class="schedule-form__field">
                    <label for="selectorKind">{{ t('schedules.fieldSelector') }}</label>
                    <CaomeiSelect
                        id="selectorKind"
                        v-model="form.selectorKind"
                        :options="selectorOptions"
                        option-label="label"
                        option-value="value"
                    />
                </div>

                <div
                    v-if="form.selectorKind === 'tag'"
                    class="schedule-form__field"
                >
                    <label for="tag">{{ t('schedules.fieldTag') }}</label>
                    <CaomeiInput
                        id="tag"
                        v-model="form.tag"
                        :placeholder="t('schedules.fieldTagPlaceholder')"
                    />
                </div>
                <div
                    v-if="form.selectorKind === 'explicit'"
                    class="schedule-form__field"
                >
                    <label for="repositoryIds">{{ t('schedules.fieldRepos', {count: form.repositoryIds.length}) }}</label>
                    <CaomeiMultiSelect
                        id="repositoryIds"
                        v-model="form.repositoryIds"
                        :options="repos"
                        option-label="name"
                        option-value="id"
                        :placeholder="t('schedules.fieldReposPlaceholder')"
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
                        <CaomeiSelect
                            id="mode"
                            v-model="form.mode"
                            :options="modeOptions"
                            option-label="label"
                            option-value="value"
                        />
                    </div>
                    <div class="schedule-form__field">
                        <label for="severityThreshold">{{ t('schedules.fieldSeverity') }}</label>
                        <CaomeiSelect
                            id="severityThreshold"
                            v-model="form.severityThreshold"
                            :options="severityOptions"
                            option-label="label"
                            option-value="value"
                        />
                    </div>
                </div>
                <div class="schedule-form__field">
                    <div class="schedule-form__switch">
                        <span>{{ t('schedules.enableTrigger') }}</span>
                        <CaomeiSwitch v-model="form.enabled" />
                    </div>
                </div>

                <div class="schedule-form__actions">
                    <CaomeiButton
                        tone="neutral"
                        variant="ghost"
                        @click="closeDialog"
                    >
                        {{ t('common.actions.cancel') }}
                    </CaomeiButton>
                    <CaomeiButton
                        type="submit"
                        :loading="saving"
                    >
                        <template #icon>
                            <CaomeiIcon :icon="Check" />
                        </template>
                        {{ t('common.actions.save') }}
                    </CaomeiButton>
                </div>
            </form>
        </CaomeiDialog>
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
        @include field-stack;
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

    // cron 预览列表重置（避免浏览器默认 list-style / margin 干扰布局）
    &__cron-preview {
        list-style: none;
        padding-left: 0;
        margin: $space-1 0 0;
        font-size: $font-size-sm;
    }
}
</style>
