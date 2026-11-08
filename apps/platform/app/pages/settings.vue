<script setup lang="ts">
// 个人设置：资料（姓名/头像）、修改密码、修改邮箱、绑定账号状态、语言偏好
// 全部操作走 better-auth 原生端点（/api/auth/*，经 authClient 封装），不自建代理 API
import { Check, Lock, Mail, X } from '@lucide/vue'
import { authClient } from '~/utils/auth-client'
import { resolveScanDefaults, type ScanMode, type ScanSeverity } from '~/composables/use-scan-preferences'
import { scanModeOptions as buildScanModeOptions, scanSeverityOptions as buildScanSeverityOptions } from '~/utils/scan-options'

definePageMeta({
    middleware: 'auth',
})

// 语言偏好：选择即 setLocale 写 i18n_locale cookie，与导航栏切换器联动
const { locale, setLocale, locales, t } = useI18n()
// caomei Select 的 `update:modelValue` 载荷为 OptionValue | null | undefined，非字符串载荷直接忽略
const switchLocale = async (code: string | number | null | undefined) => {
    if (typeof code !== 'string') return
    await setLocale(code as typeof locale.value)
}

// 扫描偏好（设备级 localStorage：显式默认 > 上次选择 > 硬编码兜底；见 use-scan-preferences.ts）
// 「未设置」用哨兵值（caomei SelectItem 不接受空串 value），选中哨兵即清除该维度的显式默认
const SCAN_PREFERENCE_AUTO = '__auto__'
const scanPreferences = useScanPreferences()
const scanDefaultModeValue = computed(() => scanPreferences.preferences.value.defaultMode ?? SCAN_PREFERENCE_AUTO)
const scanDefaultSeverityValue = computed(() => scanPreferences.preferences.value.defaultSeverity ?? SCAN_PREFERENCE_AUTO)
const scanModeOptions = computed(() => [
    { label: t('settings.scanDefaultAuto'), value: SCAN_PREFERENCE_AUTO },
    ...buildScanModeOptions(t),
])
const scanSeverityOptions = computed(() => [
    { label: t('settings.scanDefaultAuto'), value: SCAN_PREFERENCE_AUTO },
    ...buildScanSeverityOptions(t),
])
const onScanDefaultModeChange = (value: string | number | null | undefined) => {
    if (typeof value !== 'string') return
    scanPreferences.setDefaults({ mode: value === SCAN_PREFERENCE_AUTO ? null : value as ScanMode })
}
const onScanDefaultSeverityChange = (value: string | number | null | undefined) => {
    if (typeof value !== 'string') return
    scanPreferences.setDefaults({ severity: value === SCAN_PREFERENCE_AUTO ? null : value as ScanSeverity })
}
const resetScanPreferences = () => {
    scanPreferences.reset()
    success.value = t('settings.success.scanPreferencesReset')
}

/** 来源文案（显式默认 / 上次选择 / 系统兜底） */
const scanPreferenceSourceLabels = computed(() => ({
    default: t('settings.scanPreferenceSourceDefault'),
    last: t('settings.scanPreferenceSourceLast'),
    fallback: t('settings.scanPreferenceSourceFallback'),
}))

/** 当前生效默认（含来源），让设备级偏好的实际取值可见——否则「跟随上次选择」是隐式的 */
const scanEffectiveHint = computed(() => {
    const resolved = resolveScanDefaults(scanPreferences.preferences.value)
    const modeLabel = scanModeOptions.value.find((option) => option.value === resolved.mode)?.label ?? resolved.mode
    const severityLabel = scanSeverityOptions.value.find((option) => option.value === resolved.severity)?.label ?? resolved.severity
    const sources = scanPreferenceSourceLabels.value
    return t('settings.scanPreferencesEffective', {
        mode: modeLabel,
        modeSource: sources[resolved.modeSource],
        severity: severityLabel,
        severitySource: sources[resolved.severitySource],
    })
})

// 解绑账号二次确认（provider 由 CaomeiConfirmDialog 承接）
const confirm = useConfirm()

interface BoundAccount {
    id: string
    providerId: string
    accountId: string
    createdAt: string
}

const PROFILE_LABELS: Record<string, string> = {
    github: 'GitHub',
    google: 'Google',
    oidc: 'OIDC SSO',
}
const providerLabel = (providerId: string) => {
    if (providerId === 'credential') {
        return t('settings.credentialProvider')
    }
    return PROFILE_LABELS[providerId] ?? providerId
}

const { session } = useSession()
const accounts = ref<BoundAccount[]>([])
const loading = ref(true)
const error = ref('')
const success = ref('')

const nameForm = ref('')
const nameSaving = ref(false)

const passwordForm = ref({ currentPassword: '', newPassword: '', confirmPassword: '' })
const passwordSaving = ref(false)

const emailForm = ref('')
const emailSaving = ref(false)

const unlinkSaving = ref<{ id: string } | null>(null)

const fetchAccounts = async () => {
    error.value = ''
    try {
        const { data, error: accountError } = await authClient.listAccounts()
        if (accountError) {
            error.value = t('settings.errors.loadFailed', { message: accountError.message ?? t('common.errors.unknown') })
            return
        }
        // 仅展示第三方绑定账号（credential = 邮箱密码，不属于"绑定账号"管理范围）
        accounts.value = (data ?? [])
            .filter((a) => a.providerId !== 'credential')
            .map((a) => ({
                id: a.id,
                providerId: a.providerId,
                accountId: a.accountId,
                createdAt: typeof a.createdAt === 'string' ? a.createdAt : a.createdAt.toISOString(),
            }))
    } catch (e: any) {
        error.value = t('settings.errors.loadFailed', { message: e?.message ?? t('common.errors.unknown') })
    }
}

onMounted(async () => {
    loading.value = true
    nameForm.value = session.value?.user?.name ?? ''
    emailForm.value = session.value?.user?.email ?? ''
    await fetchAccounts()
    loading.value = false
})

const saveName = async () => {
    const trimmedName = nameForm.value.trim()
    // better-auth updateUser 的 name 仅接受 string（不支持 null 清空语义），
    // 空值视为未修改并提示，避免"保存成功但值未变"误导
    if (!trimmedName) {
        error.value = t('settings.errors.nameRequired')
        return
    }
    nameSaving.value = true
    error.value = ''
    try {
        const { error: updateError } = await authClient.updateUser({
            name: trimmedName,
        })
        if (updateError) {
            error.value = t('settings.errors.saveFailed', { message: updateError.message ?? t('common.errors.unknown') })
            return
        }
        success.value = t('settings.success.profileUpdated')
        await refreshNuxtData()
    } catch (e: any) {
        error.value = t('settings.errors.saveFailed', { message: e?.message ?? t('common.errors.unknown') })
    } finally {
        nameSaving.value = false
    }
}

const changePassword = async () => {
    error.value = ''
    if (passwordForm.value.newPassword !== passwordForm.value.confirmPassword) {
        error.value = t('settings.errors.passwordMismatch')
        return
    }
    passwordSaving.value = true
    try {
        const { error: changeError } = await authClient.changePassword({
            currentPassword: passwordForm.value.currentPassword,
            newPassword: passwordForm.value.newPassword,
            revokeOtherSessions: true,
        })
        if (changeError) {
            error.value = t('settings.errors.changeFailed', { message: changeError.message ?? t('common.errors.unknown') })
            return
        }
        success.value = t('settings.success.passwordChanged')
        passwordForm.value = { currentPassword: '', newPassword: '', confirmPassword: '' }
    } catch (e: any) {
        error.value = t('settings.errors.changeFailed', { message: e?.message ?? t('common.errors.unknown') })
    } finally {
        passwordSaving.value = false
    }
}

const changeEmail = async () => {
    error.value = ''
    emailSaving.value = true
    try {
        const { error: changeError } = await authClient.changeEmail({
            newEmail: emailForm.value.trim(),
        })
        if (changeError) {
            error.value = t('settings.errors.changeFailed', { message: changeError.message ?? t('common.errors.unknown') })
            return
        }
        success.value = t('settings.success.emailChanged')
        await refreshNuxtData()
    } catch (e: any) {
        error.value = t('settings.errors.changeFailed', { message: e?.message ?? t('common.errors.unknown') })
    } finally {
        emailSaving.value = false
    }
}

const unlink = async (account: BoundAccount) => {
    if (!await confirm.open({
        title: t('settings.confirm.unlinkAccount', { provider: providerLabel(account.providerId) }),
        tone: 'danger',
    })) {
        return
    }
    error.value = ''
    unlinkSaving.value = { id: account.id }
    try {
        const { error: unlinkError } = await authClient.unlinkAccount({
            accountId: account.accountId,
        })
        if (unlinkError) {
            error.value = t('settings.errors.unlinkFailed', { message: unlinkError.message ?? t('common.errors.unknown') })
            return
        }
        success.value = t('settings.success.unlinked', { provider: providerLabel(account.providerId) })
        await fetchAccounts()
    } catch (e: any) {
        error.value = t('settings.errors.unlinkFailed', { message: e?.message ?? t('common.errors.unknown') })
    } finally {
        unlinkSaving.value = null
    }
}

const toastMessage = computed(() => success.value)
let toastTimer: ReturnType<typeof setTimeout> | null = null
watch(toastMessage, (v) => {
    if (toastTimer) {
        clearTimeout(toastTimer)
    }
    if (v) {
        toastTimer = setTimeout(() => {
            success.value = ''
        }, 3000)
    }
})
onUnmounted(() => {
    if (toastTimer) {
        clearTimeout(toastTimer)
    }
})

/**
 * 加载当前 Organization id。
 * 通过 GET /api/organizations/current 端点推断（单组织模型下恒为默认组织）。
 * ai-config-form 组件挂在 settings 页面，依赖 organizationId 作为 props 加载。
 */
const currentOrganizationId = ref<string | null>(null)
const loadCurrentOrganization = async () => {
    try {
        const data = await $fetch<{ id: string }>('/api/organizations/current')
        currentOrganizationId.value = data.id
    } catch {
        currentOrganizationId.value = null
    }
}
onMounted(loadCurrentOrganization)

interface NotificationPreferenceRow {
    category: 'security_critical' | 'security_high' | 'run_failure' | 'run_completed' | 'weekly_digest'
    enabled: boolean
    editable: boolean
    reason?: 'viewer' | 'org_disabled' | 'mandatory'
}

// 当前运行限制（只读）：全局生效值与封顶值，来自只读端点（禁止前端硬编码默认分钟数）
interface ExecutionLimitsView {
    executionTimeoutMs: number
    maxExecutionTimeoutMs: number
    verifyCommandTimeoutMs: number
    installTimeoutMs: number
    cloneTimeoutMs: number
}

const requestFetch = useRequestFetch()
const { data: executionLimits } = await useAsyncData<ExecutionLimitsView | null>(
    'settings-execution-limits',
    async () => {
        try {
            return await requestFetch<ExecutionLimitsView>('/api/settings/execution-limits')
        } catch {
            return null
        }
    },
    { default: () => null },
)

/** 毫秒 → 分钟文案（只读展示；非整分钟保留一位小数） */
const toMinutesLabel = (ms: number | undefined): string => {
    if (ms === undefined) {
        return '—'
    }
    const minutes = ms / 60000
    return Number.isInteger(minutes) ? `${minutes}` : `${minutes.toFixed(1)}`
}

const executionLimitRows = computed(() => [
    { key: 'execution', label: t('settings.executionLimits.execution'), value: toMinutesLabel(executionLimits.value?.executionTimeoutMs), unit: t('settings.executionLimits.minuteUnit') },
    { key: 'ceiling', label: t('settings.executionLimits.ceiling'), value: toMinutesLabel(executionLimits.value?.maxExecutionTimeoutMs), unit: t('settings.executionLimits.minuteUnit') },
    { key: 'verify', label: t('settings.executionLimits.verifyCommand'), value: toMinutesLabel(executionLimits.value?.verifyCommandTimeoutMs), unit: t('settings.executionLimits.minuteUnit') },
    { key: 'install', label: t('settings.executionLimits.install'), value: toMinutesLabel(executionLimits.value?.installTimeoutMs), unit: t('settings.executionLimits.minuteUnit') },
    { key: 'clone', label: t('settings.executionLimits.clone'), value: toMinutesLabel(executionLimits.value?.cloneTimeoutMs), unit: t('settings.executionLimits.minuteUnit') },
])

const notificationPreferences = ref<NotificationPreferenceRow[]>([])
const notificationChannelAvailable = ref(true)
const notificationDeploymentEnabled = ref(true)
const notificationLoading = ref(true)
const notificationSaving = ref(false)

const NOTIFICATION_CATEGORY_LABELS: Record<NotificationPreferenceRow['category'], string> = {
    security_critical: 'settings.notifications.securityCritical',
    security_high: 'settings.notifications.securityHigh',
    run_failure: 'settings.notifications.runFailure',
    run_completed: 'settings.notifications.runCompleted',
    weekly_digest: 'settings.notifications.weeklyDigest',
}

const notificationCategoryLabel = (category: NotificationPreferenceRow['category']) =>
    t(NOTIFICATION_CATEGORY_LABELS[category])

const notificationReason = (row: NotificationPreferenceRow) => {
    if (row.reason === 'viewer') {
        return t('settings.notifications.viewer')
    }
    if (row.reason === 'org_disabled') {
        return t('settings.notifications.orgDisabled')
    }
    if (row.reason === 'mandatory') {
        return t('settings.notifications.mandatoryHint')
    }
    return ''
}

const loadNotificationPreferences = async () => {
    notificationLoading.value = true
    try {
        const data = await $fetch<{
            categories: NotificationPreferenceRow[]
            channelAvailable: boolean
            deploymentEnabled: boolean
        }>('/api/notification-preferences')
        notificationPreferences.value = data.categories
        notificationChannelAvailable.value = data.channelAvailable
        notificationDeploymentEnabled.value = data.deploymentEnabled
    } catch (e: any) {
        error.value = t('settings.notifications.loadFailed', { message: e?.data?.message ?? e?.message ?? t('common.errors.unknown') })
    } finally {
        notificationLoading.value = false
    }
}

const onNotificationToggle = (row: NotificationPreferenceRow, enabled: boolean) => {
    void updateNotificationPreference(row, enabled)
}

const updateNotificationPreference = async (row: NotificationPreferenceRow, enabled: boolean) => {
    if (!row.editable || notificationSaving.value) {
        return
    }
    notificationSaving.value = true
    error.value = ''
    try {
        const data = await $fetch<{ categories: NotificationPreferenceRow[] }>('/api/notification-preferences', {
            method: 'PATCH',
            body: { preferences: { [row.category]: enabled } },
        })
        notificationPreferences.value = data.categories
        success.value = t('settings.notifications.saved')
    } catch (e: any) {
        error.value = t('settings.notifications.saveFailed', { message: e?.data?.message ?? e?.message ?? t('common.errors.unknown') })
    } finally {
        notificationSaving.value = false
    }
}

onMounted(loadNotificationPreferences)

// 扫描偏好为设备级（localStorage）：挂载后再读，避免 SSR 首帧与客户端值不一致
onMounted(() => {
    scanPreferences.refresh()
})
</script>

<template>
    <div class="settings">
        <div class="settings__header">
            <div>
                <h2>{{ t('settings.title') }}</h2>
                <p class="text-muted">
                    {{ t('settings.subtitle') }}
                </p>
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

        <div v-if="!loading" class="settings__grid">
            <CaomeiCard :title="t('settings.profileCard')">
                <form class="settings-form" @submit.prevent="saveName">
                    <div class="settings-form__field">
                        <label for="name">{{ t('settings.displayName') }}</label>
                        <CaomeiInput
                            id="name"
                            v-model="nameForm"
                            :placeholder="t('settings.displayNamePlaceholder')"
                            required
                        />
                    </div>
                    <div class="settings-form__field">
                        <label>{{ t('settings.emailLabel') }}</label>
                        <div class="text-muted">
                            {{ session?.user?.email }}
                        </div>
                        <small class="text-muted">{{ t('settings.emailHint') }}</small>
                    </div>
                    <div class="settings-form__field">
                        <label>{{ t('settings.roleLabel') }}</label>
                        <CaomeiTag tone="neutral">
                            {{ session?.user?.role ?? 'viewer' }}
                        </CaomeiTag>
                    </div>
                    <CaomeiButton
                        type="submit"
                        :loading="nameSaving"
                    >
                        <template #icon>
                            <CaomeiIcon :icon="Check" />
                        </template>
                        {{ t('settings.saveProfile') }}
                    </CaomeiButton>
                </form>
            </CaomeiCard>

            <CaomeiCard :title="t('settings.passwordCard')">
                <form class="settings-form" @submit.prevent="changePassword">
                    <div class="settings-form__field">
                        <label for="currentPassword">{{ t('settings.currentPassword') }}</label>
                        <CaomeiPassword
                            id="currentPassword"
                            v-model="passwordForm.currentPassword"
                            :placeholder="t('settings.currentPasswordPlaceholder')"
                            required
                        />
                    </div>
                    <div class="settings-form__field">
                        <label for="newPassword">{{ t('settings.newPassword') }}</label>
                        <CaomeiPassword
                            id="newPassword"
                            v-model="passwordForm.newPassword"
                            :placeholder="t('settings.newPasswordPlaceholder')"
                            required
                        />
                    </div>
                    <div class="settings-form__field">
                        <label for="confirmPassword">{{ t('settings.confirmNewPassword') }}</label>
                        <CaomeiPassword
                            id="confirmPassword"
                            v-model="passwordForm.confirmPassword"
                            :placeholder="t('settings.confirmNewPasswordPlaceholder')"
                            required
                        />
                    </div>
                    <CaomeiButton
                        type="submit"
                        :loading="passwordSaving"
                    >
                        <template #icon>
                            <CaomeiIcon :icon="Lock" />
                        </template>
                        {{ t('settings.changePassword') }}
                    </CaomeiButton>
                    <small class="text-muted">{{ t('settings.passwordChangedHint') }}</small>
                </form>
            </CaomeiCard>

            <CaomeiCard :title="t('settings.emailCard')">
                <form class="settings-form" @submit.prevent="changeEmail">
                    <div class="settings-form__field">
                        <label for="newEmail">{{ t('settings.newEmail') }}</label>
                        <CaomeiInput
                            id="newEmail"
                            v-model="emailForm"
                            type="email"
                            placeholder="you@example.com"
                            required
                        />
                    </div>
                    <CaomeiButton
                        type="submit"
                        :loading="emailSaving"
                    >
                        <template #icon>
                            <CaomeiIcon :icon="Mail" />
                        </template>
                        {{ t('settings.changeEmail') }}
                    </CaomeiButton>
                    <small class="text-muted">{{ t('settings.emailChangedHint') }}</small>
                </form>
            </CaomeiCard>

            <CaomeiCard :title="t('settings.accountsCard')">
                <div v-if="accounts.length" class="settings-accounts">
                    <div
                        v-for="account in accounts"
                        :key="account.id"
                        class="settings-accounts__item"
                    >
                        <div>
                            <CaomeiTag tone="neutral">
                                {{ providerLabel(account.providerId) }}
                            </CaomeiTag>
                            <small class="text-muted">{{ account.accountId }}</small>
                        </div>
                        <CaomeiButton
                            variant="ghost"
                            rounded
                            size="sm"
                            tone="danger"
                            :loading="unlinkSaving?.id === account.id"
                            :label="t('settings.unlink')"
                            :title="t('settings.unlink')"
                            @click="unlink(account)"
                        >
                            <template #icon>
                                <CaomeiIcon :icon="X" />
                            </template>
                        </CaomeiButton>
                    </div>
                </div>
                <p v-else class="text-muted">
                    {{ t('settings.noAccounts') }}
                </p>
                <small class="text-muted">{{ t('settings.accountsHint') }}</small>
            </CaomeiCard>

            <CaomeiCard :title="t('settings.languageCard')">
                <div class="settings-form__field">
                    <label for="language">{{ t('settings.languageLabel') }}</label>
                    <CaomeiSelect
                        id="language"
                        :model-value="locale"
                        :options="locales"
                        option-label="name"
                        option-value="code"
                        @update:model-value="switchLocale"
                    />
                    <small class="text-muted">{{ t('settings.languageHint') }}</small>
                </div>
            </CaomeiCard>

            <CaomeiCard :title="t('settings.scanPreferencesCard')">
                <div class="settings-form">
                    <div class="settings-form__field">
                        <label for="scanDefaultMode">{{ t('settings.scanDefaultMode') }}</label>
                        <CaomeiSelect
                            id="scanDefaultMode"
                            :model-value="scanDefaultModeValue"
                            :options="scanModeOptions"
                            option-label="label"
                            option-value="value"
                            @update:model-value="onScanDefaultModeChange"
                        />
                    </div>
                    <div class="settings-form__field">
                        <label for="scanDefaultSeverity">{{ t('settings.scanDefaultSeverity') }}</label>
                        <CaomeiSelect
                            id="scanDefaultSeverity"
                            :model-value="scanDefaultSeverityValue"
                            :options="scanSeverityOptions"
                            option-label="label"
                            option-value="value"
                            @update:model-value="onScanDefaultSeverityChange"
                        />
                    </div>
                    <CaomeiButton
                        tone="neutral"
                        variant="ghost"
                        @click="resetScanPreferences"
                    >
                        <template #icon>
                            <CaomeiIcon :icon="X" />
                        </template>
                        {{ t('settings.scanPreferencesReset') }}
                    </CaomeiButton>
                    <small class="text-muted">{{ t('settings.scanPreferencesHint') }}</small>
                    <small class="text-muted">{{ scanEffectiveHint }}</small>
                </div>
            </CaomeiCard>

            <CaomeiCard :title="t('settings.executionLimits.card')">
                <div class="settings-form">
                    <div
                        v-for="row in executionLimitRows"
                        :key="row.key"
                        class="settings-form__field"
                    >
                        <label>{{ row.label }}</label>
                        <small class="text-muted">{{ row.value }} {{ row.unit }}</small>
                    </div>
                    <small class="text-muted">{{ t('settings.executionLimits.hint') }}</small>
                </div>
            </CaomeiCard>

            <CaomeiCard :title="t('settings.notifications.card')">
                <div v-if="notificationLoading" class="text-muted">
                    {{ t('common.empty.loading') }}
                </div>
                <div v-else class="settings-form">
                    <div class="settings-form__field">
                        <label>{{ t('settings.notifications.platformIncident') }}</label>
                        <small class="text-muted">{{ t('settings.notifications.platformIncidentHint') }}</small>
                    </div>
                    <div
                        v-for="row in notificationPreferences"
                        :key="row.category"
                        class="settings-notifications__row"
                    >
                        <div>
                            <label :for="`notification-${row.category}`">{{ notificationCategoryLabel(row.category) }}</label>
                            <small v-if="notificationReason(row)" class="text-muted">{{ notificationReason(row) }}</small>
                            <small v-if="row.category === 'weekly_digest'" class="text-muted">
                                {{ t('settings.notifications.weeklyDigestHint') }}
                            </small>
                        </div>
                        <CaomeiSwitch
                            :id="`notification-${row.category}`"
                            :model-value="row.enabled"
                            :disabled="!row.editable || notificationSaving"
                            @update:model-value="value => onNotificationToggle(row, value)"
                        />
                    </div>
                    <small class="text-muted">{{ t('settings.notifications.hint') }}</small>
                    <small v-if="!notificationChannelAvailable" class="text-muted">
                        {{ t('settings.notifications.channelUnavailable') }}
                    </small>
                    <small v-if="!notificationDeploymentEnabled" class="text-muted">
                        {{ t('settings.notifications.deploymentDisabled') }}
                    </small>
                </div>
            </CaomeiCard>

            <ai-config-form
                v-if="currentOrganizationId"
                :organization-id="currentOrganizationId"
            />
        </div>
        <p v-else class="text-muted">
            {{ t('common.empty.loading') }}
        </p>
    </div>
</template>

<style lang="scss" scoped>
.settings {
    &__header {
        margin-bottom: $space-5;
    }

    &__header h2 {
        margin: 0 0 $space-1;
    }

    &__header p {
        margin: 0;
        font-size: $font-size-sm;
    }

    &__grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
        gap: $space-4;
    }
}

.settings-form {
    display: flex;
    flex-direction: column;
    gap: $space-4;

    &__field {
        @include field-stack;

        label {
            font-size: $font-size-sm;
            font-weight: 500;
        }
    }
}

.settings-accounts {
    display: flex;
    flex-direction: column;
    gap: $space-2;

    &__item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: $space-3;
        padding: $space-2 0;
        border-bottom: 1px solid var(--caomei-color-border);

        div {
            display: flex;
            align-items: center;
            gap: $space-2;
        }
    }
}

.settings-notifications {
    &__row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: $space-3;
        padding: $space-2 0;
        border-bottom: 1px solid var(--caomei-color-border);

        div {
            display: flex;
            flex-direction: column;
            gap: $space-1;
        }
    }
}
</style>
