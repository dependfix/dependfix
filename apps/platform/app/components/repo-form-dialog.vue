<script setup lang="ts">
// 仓库新增 / 编辑表单弹窗（与 scan-config-dialog 同模式：父组件只持有 visible / 编辑对象）。
// 表单状态与提交逻辑内聚；失败按 zod issues 映射到行内错误，未知失败回落弹窗顶部摘要。
import { Check } from '@lucide/vue'
import type { PRCheckFocusView, RepoView } from '~/types/platform'
import { formatDurationInput, parseDurationInput } from '~/utils/duration'

const props = defineProps<{
    visible: boolean
    /** 编辑对象（null = 新增） */
    repo: RepoView | null
    credentials: { id: string, name: string, type: string }[]
    /** 全局默认分支（nuxt runtimeConfig.public.defaultBranch，可用 DEFAULT_BRANCH 覆盖） */
    defaultBranch: string
}>()

const emit = defineEmits<{
    'update:visible': [value: boolean]
    saved: []
}>()

const { t } = useI18n()
/** 平台部署的新建仓库默认值（仅新增表单使用；编辑表单回显仓库自身存储值）。 */
const allowMajorUpgradeDefault = useRuntimeConfig().public.allowMajorUpgradeDefault === true

interface RepoForm {
    owner: string
    name: string
    defaultBranch: string
    packageManager: 'pnpm' | 'npm' | 'yarn'
    credentialId: string | null
    actionWorkflowFile: string
    executorKind: 'container' | 'github-action' | 'sandbox'
    /** 沙箱镜像（空 = 平台默认；仅 sandbox 执行方式显示） */
    sandboxImage: string
    note: string
    tags: string[]
    /** 自定义验证命令（多行文本，一行一条；提交时拆分为数组，空行忽略 → 空数组走默认链） */
    verifyCommands: string
    /** PR Check 关注集（逗号 / 换行分隔的文本；提交时拆分为数组，空 = 该维度不限） */
    focusProviders: string
    focusNames: string
    /** 关注集来源类型（空数组 = 不限） */
    focusKinds: string[]
    /** 执行预算（可读时长文本，如 30m / 1h；空 = 继承全局。库内仍存毫秒） */
    executionTimeout: string
    verifyCommandTimeout: string
    installTimeout: string
    cloneTimeout: string
    /** 跨大版本升级授权（默认关闭） */
    allowMajorUpgrade: boolean
}

/** 可定位错误的字段键（与表单控件一一对应；服务端 issues 的 path 映射到同一组键）。 */
type FieldKey = 'owner'
    | 'name'
    | 'defaultBranch'
    | 'actionWorkflowFile'
    | 'executorKind'
    | 'sandboxImage'
    | 'verifyCommands'
    | 'focusProviders'
    | 'focusNames'
    | 'focusKinds'
    | 'tags'
    | 'note'
    | 'executionTimeout'
    | 'verifyCommandTimeout'
    | 'installTimeout'
    | 'cloneTimeout'

/** 字段键 → 控件 id（聚焦首个错误字段用；与模板中的 id 保持一致）。 */
const FIELD_INPUT_IDS: Record<FieldKey, string> = {
    owner: 'owner',
    name: 'name',
    defaultBranch: 'defaultBranch',
    actionWorkflowFile: 'actionWorkflowFile',
    executorKind: 'executorKind',
    sandboxImage: 'sandboxImage',
    verifyCommands: 'verifyCommands',
    focusProviders: 'focusProviders',
    focusNames: 'focusNames',
    focusKinds: 'focusKinds',
    tags: 'tags',
    note: 'note',
    executionTimeout: 'executionTimeout',
    verifyCommandTimeout: 'verifyCommandTimeout',
    installTimeout: 'installTimeout',
    cloneTimeout: 'cloneTimeout',
}

/** 服务端 zod issue path 首段 → 表单字段键。 */
const ISSUE_PATH_FIELDS: Record<string, FieldKey> = {
    owner: 'owner',
    name: 'name',
    defaultBranch: 'defaultBranch',
    actionWorkflowFile: 'actionWorkflowFile',
    executorKind: 'executorKind',
    sandboxImage: 'sandboxImage',
    verifyCommands: 'verifyCommands',
    tags: 'tags',
    note: 'note',
    executionTimeoutMs: 'executionTimeout',
    verifyCommandTimeoutMs: 'verifyCommandTimeout',
    installTimeoutMs: 'installTimeout',
    cloneTimeoutMs: 'cloneTimeout',
}

/** `prCheckFocus.<维度>` → 表单字段键。 */
const ISSUE_FOCUS_FIELDS: Record<string, FieldKey> = {
    providers: 'focusProviders',
    names: 'focusNames',
    kinds: 'focusKinds',
}

/** 执行预算字段（校验失败时自动展开折叠区）。 */
const DURATION_FIELDS = new Set<FieldKey>([
    'executionTimeout',
    'verifyCommandTimeout',
    'installTimeout',
    'cloneTimeout',
])

/** 关注集来源类型选项（与 server/utils/pr-check-focus.ts 的 PR_CHECK_FOCUS_KINDS 同值域） */
const FOCUS_KINDS = ['check', 'status', 'deployment'] as const
type FocusKind = (typeof FOCUS_KINDS)[number]

const isFocusKind = (value: string): value is FocusKind =>
    (FOCUS_KINDS as readonly string[]).includes(value)

/** 文本 → 关注集条目数组（支持中英文逗号与换行；空项丢弃） */
const splitFocusList = (raw: string): string[] =>
    raw.split(/[\n,，]/u)
        .map((item) => item.trim())
        .filter(Boolean)

const emptyForm = (): RepoForm => ({
    owner: '',
    name: '',
    defaultBranch: props.defaultBranch,
    packageManager: 'pnpm',
    credentialId: null,
    actionWorkflowFile: '',
    executorKind: 'container',
    sandboxImage: '',
    note: '',
    tags: [],
    verifyCommands: '',
    focusProviders: '',
    focusNames: '',
    focusKinds: [],
    executionTimeout: '',
    verifyCommandTimeout: '',
    installTimeout: '',
    cloneTimeout: '',
    allowMajorUpgrade: allowMajorUpgradeDefault,
})

const form = ref<RepoForm>(emptyForm())
const saving = ref(false)
/** 行内字段错误（键与 {@link FieldKey} 对齐；空对象 = 无错误）。 */
const fieldErrors = ref<Partial<Record<FieldKey, string>>>({})
/** 弹窗顶部错误摘要（校验失败 / 未知保存失败；不再上抛页面）。 */
const formError = ref('')
/** 执行预算折叠区展开状态（错误定位到预算字段时自动展开）。 */
const limitsOpen = ref(false)

/** 执行方式选项：sandbox 仅 report-only 真实执行（fix 模式由编排层降级容器并留原因码） */
const executorOptions = computed(() => [
    { label: t('repos.platformContainer'), value: 'container' },
    { label: t('repos.githubAction'), value: 'github-action' },
    { label: t('repos.sandboxContainer'), value: 'sandbox' },
])

/** 关注集来源类型选项（显式键逐一列出：与 pr-checks.vue 同口径，避免动态 i18n 键绕过缺词门禁） */
const focusKindOptions = computed(() => [
    { value: 'check', label: t('repos.focusKind.check') },
    { value: 'status', label: t('repos.focusKind.status') },
    { value: 'deployment', label: t('repos.focusKind.deployment') },
])

/** 已覆盖项数（折叠行摘要） */
const coveredLimitCount = computed(() => [
    form.value.executionTimeout,
    form.value.verifyCommandTimeout,
    form.value.installTimeout,
    form.value.cloneTimeout,
].filter((value) => value.trim() !== '').length)

interface DurationBounds {
    minMs: number
    maxMs: number
}

interface ExecutionLimitsView {
    executionTimeoutMs: number
    maxExecutionTimeoutMs: number
    verifyCommandTimeoutMs: number
    installTimeoutMs: number
    cloneTimeoutMs: number
    bounds: {
        execution: DurationBounds
        verifyCommand: DurationBounds
        install: DurationBounds
        clone: DurationBounds
    }
}

/** 全局生效值与合法范围（「继承全局」占位 + 行内提示的唯一来源；前端不硬编码分钟数） */
const executionLimits = ref<ExecutionLimitsView | null>(null)
const requestFetch = useRequestFetch()
const loadExecutionLimits = async () => {
    try {
        executionLimits.value = await requestFetch<ExecutionLimitsView>('/api/settings/execution-limits')
    } catch {
        executionLimits.value = null
    }
}

const placeholderFor = (msValue: number | undefined): string =>
    executionLimits.value && msValue !== undefined ? formatDurationInput(msValue) : ''

/** 合法范围小字（执行上限显示动态封顶值，子项显示各自边界）。 */
const rangeHint = (bounds: DurationBounds | undefined): string => {
    if (!bounds) {
        return ''
    }
    return t('repos.durationRange', {
        min: formatDurationInput(bounds.minMs),
        max: formatDurationInput(bounds.maxMs),
    })
}

/** 表单关注集 → 请求体（三维全空归一为 null = 不启用；服务端仍会做 trim / 去重 / 小写规范化） */
const buildFocusPayload = (): PRCheckFocusView | null => {
    const providers = splitFocusList(form.value.focusProviders)
    const names = splitFocusList(form.value.focusNames)
    const kinds = form.value.focusKinds.filter(isFocusKind)
    return providers.length > 0 || names.length > 0 || kinds.length > 0
        ? { providers, names, kinds }
        : null
}

/** 服务端 issue path → 表单字段键（`prCheckFocus.providers[0]` 归到 providers）。 */
const resolveIssueField = (path: (string | number)[] | undefined): FieldKey | undefined => {
    if (!path || path.length === 0) {
        return undefined
    }
    const [first, second] = path
    if (first === 'prCheckFocus') {
        return typeof second === 'string' ? ISSUE_FOCUS_FIELDS[second] : undefined
    }
    return typeof first === 'string' ? ISSUE_PATH_FIELDS[first] : undefined
}

/** 展开执行预算折叠区（仅在错误落在时长字段时）。 */
const revealLimitsIfNeeded = (key: FieldKey) => {
    if (DURATION_FIELDS.has(key)) {
        limitsOpen.value = true
    }
}

/**
 * 聚焦首个错误字段：input / textarea / select / multi-select 的 id 落在可聚焦控件上；
 * tags 的 id 落在容器上，回退到容器内首个可聚焦元素（排除 tabindex="-1" 的删除按钮）。
 */
const focusField = (key: FieldKey) => {
    const element = document.getElementById(FIELD_INPUT_IDS[key])
    if (!element) {
        return
    }
    element.scrollIntoView({ block: 'center' })
    const selector = 'input, textarea, select, button:not([tabindex="-1"]), [tabindex]:not([tabindex="-1"])'
    const focusable = element.matches(selector)
        ? element
        : element.querySelector<HTMLElement>(selector)
    focusable?.focus()
}

const focusFirstError = (errors: Partial<Record<FieldKey, string>>) => {
    const firstKey = (Object.keys(errors) as FieldKey[])[0]
    if (!firstKey) {
        return
    }
    revealLimitsIfNeeded(firstKey)
    void nextTick(() => focusField(firstKey))
}

/** 客户端校验（必填 / 字符集 / 时长格式与边界）；服务端仍是最终裁决。 */
const validate = (): boolean => {
    const errors: Partial<Record<FieldKey, string>> = {}
    const owner = form.value.owner.trim()
    if (!owner) {
        errors.owner = t('repos.validation.ownerRequired')
    } else if (owner.length > 100) {
        errors.owner = t('repos.validation.ownerTooLong', { max: 100 })
    } else if (!/^[A-Za-z0-9_.-]+$/u.test(owner)) {
        errors.owner = t('repos.validation.ownerInvalid')
    }

    const name = form.value.name.trim()
    if (!name) {
        errors.name = t('repos.validation.nameRequired')
    } else if (name.length > 100) {
        errors.name = t('repos.validation.nameTooLong', { max: 100 })
    } else if (!/^[A-Za-z0-9_.-]+$/u.test(name)) {
        errors.name = t('repos.validation.nameInvalid')
    }

    const branch = form.value.defaultBranch.trim()
    if (!branch) {
        errors.defaultBranch = t('repos.validation.defaultBranchRequired')
    } else if (branch.length > 100) {
        errors.defaultBranch = t('repos.validation.defaultBranchTooLong', { max: 100 })
    }

    if (form.value.executorKind === 'github-action' && !form.value.actionWorkflowFile.trim()) {
        errors.actionWorkflowFile = t('repos.validation.workflowRequired')
    }

    const bounds = executionLimits.value?.bounds
    const parseDurationField = (key: FieldKey, raw: string, bound: DurationBounds | undefined): number | null => {
        const parsed = parseDurationInput(raw)
        if (parsed.status === 'empty') {
            return null
        }
        if (parsed.status === 'invalid' || parsed.ms === null) {
            errors[key] = t('repos.validation.durationInvalid')
            return null
        }
        if (bound && parsed.ms < bound.minMs) {
            errors[key] = t('repos.validation.durationTooSmall', { min: formatDurationInput(bound.minMs) })
            return null
        }
        if (bound && parsed.ms > bound.maxMs) {
            errors[key] = t('repos.validation.durationTooLarge', { max: formatDurationInput(bound.maxMs) })
            return null
        }
        return parsed.ms
    }

    const executionMs = parseDurationField('executionTimeout', form.value.executionTimeout, bounds?.execution)
    const childDurations: { key: FieldKey, ms: number | null, labelKey: string }[] = [
        { key: 'verifyCommandTimeout', ms: parseDurationField('verifyCommandTimeout', form.value.verifyCommandTimeout, bounds?.verifyCommand), labelKey: 'repos.verifyCommandTimeout' },
        { key: 'installTimeout', ms: parseDurationField('installTimeout', form.value.installTimeout, bounds?.install), labelKey: 'repos.installTimeout' },
        { key: 'cloneTimeout', ms: parseDurationField('cloneTimeout', form.value.cloneTimeout, bounds?.clone), labelKey: 'repos.cloneTimeout' },
    ]
    if (executionMs !== null) {
        for (const child of childDurations) {
            if (!errors[child.key] && child.ms !== null && child.ms > executionMs) {
                errors[child.key] = t('repos.validation.durationExceedsExecution', {
                    label: t(child.labelKey),
                    max: formatDurationInput(executionMs),
                })
            }
        }
    }

    fieldErrors.value = errors
    if (Object.keys(errors).length > 0) {
        formError.value = t('repos.errors.validationSummary')
        focusFirstError(errors)
        return false
    }
    formError.value = ''
    return true
}

/** 服务端保存失败 → 弹窗内展示；zod issues 优先映射到字段行内错误。 */
const applySaveError = (error: unknown) => {
    const body = (error as { data?: { message?: string, data?: { issues?: { path?: (string | number)[], message?: string }[] } } })?.data
    const issues = body?.data?.issues
    if (Array.isArray(issues) && issues.length > 0) {
        const errors: Partial<Record<FieldKey, string>> = {}
        const unmapped: string[] = []
        for (const issue of issues) {
            const key = resolveIssueField(issue.path)
            if (key && !errors[key]) {
                errors[key] = issue.message ?? t('common.errors.unknown')
            } else if (!key) {
                unmapped.push(issue.message ?? '')
            }
        }
        // 没有可定位字段（body 级 issue / 未知维度）时不能只提示「检查标红字段」——
        // 此时没有任何字段标红，需把服务端原因直接作为摘要展示。
        if (Object.keys(errors).length === 0) {
            formError.value = t('repos.errors.saveFailed', {
                message: unmapped.filter(Boolean).join('；') || t('common.errors.unknown'),
            })
            return
        }
        fieldErrors.value = errors
        formError.value = t('repos.errors.validationSummary')
        focusFirstError(errors)
        return
    }
    const message = body?.message ?? (error as { message?: string })?.message ?? t('common.errors.unknown')
    formError.value = t('repos.errors.saveFailed', { message })
}

/**
 * 打开时按「编辑对象 / 新增」重置表单——父组件只切换 visible 与 repo，
 * 组件自身保证每次打开都是干净状态（不留上一次的半截输入 / 错误）。
 */
watch(() => props.visible, (open) => {
    if (!open) {
        return
    }
    void loadExecutionLimits()
    fieldErrors.value = {}
    formError.value = ''
    limitsOpen.value = false
    const repo = props.repo
    form.value = repo
        ? {
                owner: repo.owner,
                name: repo.name,
                defaultBranch: repo.defaultBranch,
                packageManager: repo.packageManager as RepoForm['packageManager'],
                credentialId: repo.credentialId,
                actionWorkflowFile: repo.actionWorkflowFile ?? '',
                executorKind: repo.executorKind as RepoForm['executorKind'],
                sandboxImage: repo.sandboxImage ?? '',
                note: repo.note ?? '',
                tags: [...(repo.tags ?? [])],
                verifyCommands: (repo.verifyCommands ?? []).join('\n'),
                focusProviders: (repo.prCheckFocus?.providers ?? []).join(', '),
                focusNames: (repo.prCheckFocus?.names ?? []).join(', '),
                focusKinds: [...(repo.prCheckFocus?.kinds ?? [])],
                executionTimeout: formatDurationInput(repo.executionTimeoutMs),
                verifyCommandTimeout: formatDurationInput(repo.verifyCommandTimeoutMs),
                installTimeout: formatDurationInput(repo.installTimeoutMs),
                cloneTimeout: formatDurationInput(repo.cloneTimeoutMs),
                allowMajorUpgrade: repo.allowMajorUpgrade === true,
            }
        : emptyForm()
})

const onClose = () => {
    emit('update:visible', false)
}

const submit = async () => {
    if (saving.value || !validate()) {
        return
    }
    saving.value = true
    formError.value = ''
    try {
        // 显式构造提交体（不展开 form.value）：表单内的可读时长文本等仅用于展示，
        // 不得作为未知键扩大 PUT 面（设计口径见 repo-execution-limits.md §9.3）。
        const payload = {
            owner: form.value.owner.trim(),
            name: form.value.name.trim(),
            defaultBranch: form.value.defaultBranch.trim(),
            packageManager: form.value.packageManager,
            credentialId: form.value.credentialId,
            actionWorkflowFile: form.value.actionWorkflowFile.trim() || null,
            executorKind: form.value.executorKind,
            sandboxImage: form.value.sandboxImage.trim() || null,
            note: form.value.note.trim() || null,
            tags: form.value.tags.length > 0 ? form.value.tags : null,
            // 多行文本 → 命令数组（按行拆分 + 去空白 + 丢弃空行；空数组 = 走引擎默认验证链）
            verifyCommands: form.value.verifyCommands
                .split('\n')
                .map((line) => line.trim())
                .filter(Boolean),
            prCheckFocus: buildFocusPayload(),
            executionTimeoutMs: parseDurationInput(form.value.executionTimeout).ms,
            verifyCommandTimeoutMs: parseDurationInput(form.value.verifyCommandTimeout).ms,
            installTimeoutMs: parseDurationInput(form.value.installTimeout).ms,
            cloneTimeoutMs: parseDurationInput(form.value.cloneTimeout).ms,
            allowMajorUpgrade: form.value.allowMajorUpgrade,
        }
        if (props.repo) {
            await $fetch(`/api/repos/${props.repo.id}`, {
                method: 'PUT',
                body: payload,
            })
        } else {
            await $fetch('/api/repos', {
                method: 'POST',
                body: payload,
            })
        }
        emit('saved')
        onClose()
    } catch (error: unknown) {
        applySaveError(error)
    } finally {
        saving.value = false
    }
}
</script>

<template>
    <CaomeiDialog
        :open="props.visible"
        :title="repo ? t('repos.dialogEditTitle') : t('repos.dialogAddTitle')"
        modal
        :style="{width: '520px'}"
        @update:open="(v: boolean) => emit('update:visible', v)"
    >
        <form class="repo-form" @submit.prevent="submit">
            <CaomeiMessage
                v-if="formError"
                role="alert"
                tone="danger"
                :closable="false"
            >
                {{ formError }}
            </CaomeiMessage>
            <div class="repo-form__row">
                <div class="repo-form__field">
                    <label for="owner">{{ t('repos.fieldOwner') }}</label>
                    <CaomeiInput
                        id="owner"
                        v-model="form.owner"
                        placeholder="github-owner"
                        :invalid="!!fieldErrors.owner"
                    />
                    <small v-if="fieldErrors.owner" class="text-danger">{{ fieldErrors.owner }}</small>
                </div>
                <div class="repo-form__field">
                    <label for="name">{{ t('repos.fieldName') }}</label>
                    <CaomeiInput
                        id="name"
                        v-model="form.name"
                        placeholder="repo-name"
                        :invalid="!!fieldErrors.name"
                    />
                    <small v-if="fieldErrors.name" class="text-danger">{{ fieldErrors.name }}</small>
                </div>
            </div>
            <div class="repo-form__row">
                <div class="repo-form__field">
                    <label for="defaultBranch">{{ t('repos.fieldDefaultBranch') }}</label>
                    <CaomeiInput
                        id="defaultBranch"
                        v-model="form.defaultBranch"
                        :invalid="!!fieldErrors.defaultBranch"
                    />
                    <small v-if="fieldErrors.defaultBranch" class="text-danger">{{ fieldErrors.defaultBranch }}</small>
                </div>
                <div class="repo-form__field">
                    <label for="packageManager">{{ t('repos.fieldPackageManager') }}</label>
                    <CaomeiSelect
                        id="packageManager"
                        v-model="form.packageManager"
                        :options="[
                            {label: 'pnpm', value: 'pnpm'},
                            {label: 'npm', value: 'npm'},
                            {label: 'yarn', value: 'yarn'}
                        ]"
                        option-label="label"
                        option-value="value"
                    />
                </div>
            </div>
            <div class="repo-form__row">
                <div class="repo-form__field">
                    <label for="credentialId">{{ t('repos.fieldCredential') }}</label>
                    <CaomeiSelect
                        id="credentialId"
                        v-model="form.credentialId"
                        :options="credentials"
                        option-label="name"
                        option-value="id"
                        :show-clear="true"
                        :placeholder="t('repos.notLinked')"
                    />
                </div>
                <div class="repo-form__field">
                    <label for="executorKind">{{ t('repos.fieldExecutor') }}</label>
                    <CaomeiSelect
                        id="executorKind"
                        v-model="form.executorKind"
                        :options="executorOptions"
                        option-label="label"
                        option-value="value"
                        :invalid="!!fieldErrors.executorKind"
                    />
                    <small v-if="fieldErrors.executorKind" class="text-danger">{{ fieldErrors.executorKind }}</small>
                </div>
            </div>
            <div
                v-if="form.executorKind === 'sandbox'"
                class="repo-form__field"
            >
                <label for="sandboxImage">{{ t('repos.fieldSandboxImage') }}</label>
                <CaomeiInput
                    id="sandboxImage"
                    v-model="form.sandboxImage"
                    :placeholder="t('repos.fieldSandboxImagePlaceholder')"
                    :invalid="!!fieldErrors.sandboxImage"
                />
                <small v-if="fieldErrors.sandboxImage" class="text-danger">{{ fieldErrors.sandboxImage }}</small>
                <small v-else class="text-muted">{{ t('repos.fieldSandboxImageHint') }}</small>
            </div>
            <div
                v-if="form.executorKind === 'github-action'"
                class="repo-form__field"
            >
                <label for="actionWorkflowFile">{{ t('repos.fieldWorkflowFile') }}</label>
                <CaomeiInput
                    id="actionWorkflowFile"
                    v-model="form.actionWorkflowFile"
                    placeholder=".github/workflows/security-auto-fix.yml"
                    :invalid="!!fieldErrors.actionWorkflowFile"
                />
                <small v-if="fieldErrors.actionWorkflowFile" class="text-danger">{{ fieldErrors.actionWorkflowFile }}</small>
                <small v-else class="text-muted">{{ t('repos.fieldWorkflowFileHint') }}</small>
            </div>
            <div class="repo-form__field">
                <label for="verifyCommands">{{ t('repos.fieldVerifyCommands') }}</label>
                <CaomeiTextarea
                    id="verifyCommands"
                    v-model="form.verifyCommands"
                    :rows="3"
                    :placeholder="t('repos.fieldVerifyCommandsPlaceholder')"
                    :invalid="!!fieldErrors.verifyCommands"
                />
                <small v-if="fieldErrors.verifyCommands" class="text-danger">{{ fieldErrors.verifyCommands }}</small>
                <small v-else class="text-muted">{{ t('repos.fieldVerifyCommandsHint') }}</small>
            </div>
            <details
                class="repo-form__limits"
                :open="limitsOpen"
                @toggle="limitsOpen = ($event.target as HTMLDetailsElement).open"
            >
                <summary class="repo-form__limits-summary">
                    {{ t('repos.executionLimitsTitle') }}
                    <span class="text-muted">
                        {{ coveredLimitCount > 0
                            ? `${coveredLimitCount} ${t('repos.executionLimitsCoveredSuffix')}`
                            : t('repos.executionLimitsInheritAll') }}
                    </span>
                </summary>
                <div class="repo-form__limits-grid">
                    <div class="repo-form__field">
                        <label for="executionTimeout">{{ t('repos.executionTimeout') }}</label>
                        <CaomeiInput
                            id="executionTimeout"
                            v-model="form.executionTimeout"
                            :placeholder="placeholderFor(executionLimits?.executionTimeoutMs)"
                            :invalid="!!fieldErrors.executionTimeout"
                        />
                        <small v-if="fieldErrors.executionTimeout" class="text-danger">{{ fieldErrors.executionTimeout }}</small>
                        <small v-else class="text-muted">{{ rangeHint(executionLimits?.bounds.execution) }}</small>
                    </div>
                    <div class="repo-form__field">
                        <label for="verifyCommandTimeout">{{ t('repos.verifyCommandTimeout') }}</label>
                        <CaomeiInput
                            id="verifyCommandTimeout"
                            v-model="form.verifyCommandTimeout"
                            :placeholder="placeholderFor(executionLimits?.verifyCommandTimeoutMs)"
                            :invalid="!!fieldErrors.verifyCommandTimeout"
                        />
                        <small v-if="fieldErrors.verifyCommandTimeout" class="text-danger">{{ fieldErrors.verifyCommandTimeout }}</small>
                        <small v-else class="text-muted">{{ rangeHint(executionLimits?.bounds.verifyCommand) }}</small>
                    </div>
                    <div class="repo-form__field">
                        <label for="installTimeout">{{ t('repos.installTimeout') }}</label>
                        <CaomeiInput
                            id="installTimeout"
                            v-model="form.installTimeout"
                            :placeholder="placeholderFor(executionLimits?.installTimeoutMs)"
                            :invalid="!!fieldErrors.installTimeout"
                        />
                        <small v-if="fieldErrors.installTimeout" class="text-danger">{{ fieldErrors.installTimeout }}</small>
                        <small v-else class="text-muted">{{ rangeHint(executionLimits?.bounds.install) }}</small>
                    </div>
                    <div class="repo-form__field">
                        <label for="cloneTimeout">{{ t('repos.cloneTimeout') }}</label>
                        <CaomeiInput
                            id="cloneTimeout"
                            v-model="form.cloneTimeout"
                            :placeholder="placeholderFor(executionLimits?.cloneTimeoutMs)"
                            :invalid="!!fieldErrors.cloneTimeout"
                        />
                        <small v-if="fieldErrors.cloneTimeout" class="text-danger">{{ fieldErrors.cloneTimeout }}</small>
                        <small v-else class="text-muted">{{ rangeHint(executionLimits?.bounds.clone) }}</small>
                    </div>
                </div>
                <small class="repo-form__limits-hint text-muted">{{ t('repos.durationHint') }}</small>
                <small class="repo-form__limits-hint text-muted">{{ t('repos.executionLimitsHint') }}</small>
            </details>
            <div class="repo-form__field">
                <label for="allowMajorUpgrade">{{ t('repos.allowMajorUpgrade') }}</label>
                <CaomeiSwitch
                    id="allowMajorUpgrade"
                    v-model="form.allowMajorUpgrade"
                />
                <small class="text-muted">{{ t('repos.allowMajorUpgradeHint') }}</small>
                <small v-if="allowMajorUpgradeDefault && !props.repo" class="text-muted">{{ t('repos.allowMajorUpgradeDefaultOn') }}</small>
            </div>
            <div class="repo-form__focus">
                <div class="repo-form__focus-title">
                    {{ t('repos.fieldPrCheckFocus') }}
                </div>
                <div class="repo-form__field">
                    <label for="focusProviders">{{ t('repos.fieldPrCheckFocusProviders') }}</label>
                    <CaomeiInput
                        id="focusProviders"
                        v-model="form.focusProviders"
                        :placeholder="t('repos.fieldPrCheckFocusProvidersPlaceholder')"
                        :invalid="!!fieldErrors.focusProviders"
                    />
                    <small v-if="fieldErrors.focusProviders" class="text-danger">{{ fieldErrors.focusProviders }}</small>
                </div>
                <div class="repo-form__field">
                    <label for="focusNames">{{ t('repos.fieldPrCheckFocusNames') }}</label>
                    <CaomeiInput
                        id="focusNames"
                        v-model="form.focusNames"
                        :placeholder="t('repos.fieldPrCheckFocusNamesPlaceholder')"
                        :invalid="!!fieldErrors.focusNames"
                    />
                    <small v-if="fieldErrors.focusNames" class="text-danger">{{ fieldErrors.focusNames }}</small>
                </div>
                <div class="repo-form__field">
                    <label for="focusKinds">{{ t('repos.fieldPrCheckFocusKinds') }}</label>
                    <CaomeiMultiSelect
                        id="focusKinds"
                        v-model="form.focusKinds"
                        :options="focusKindOptions"
                        option-label="label"
                        option-value="value"
                        :placeholder="t('repos.fieldPrCheckFocusKindsPlaceholder')"
                        :invalid="!!fieldErrors.focusKinds"
                    />
                    <small v-if="fieldErrors.focusKinds" class="text-danger">{{ fieldErrors.focusKinds }}</small>
                </div>
                <small class="text-muted">{{ t('repos.fieldPrCheckFocusHint') }}</small>
            </div>
            <div class="repo-form__field">
                <label for="note">{{ t('repos.fieldNote') }}</label>
                <CaomeiTextarea
                    id="note"
                    v-model="form.note"
                    :rows="2"
                    :invalid="!!fieldErrors.note"
                />
                <small v-if="fieldErrors.note" class="text-danger">{{ fieldErrors.note }}</small>
            </div>
            <div class="repo-form__field">
                <label for="tags">{{ t('repos.fieldTags') }}</label>
                <CaomeiTagsInput
                    id="tags"
                    v-model="form.tags"
                    :placeholder="t('repos.fieldTagsPlaceholder')"
                    :invalid="!!fieldErrors.tags"
                />
                <small v-if="fieldErrors.tags" class="text-danger">{{ fieldErrors.tags }}</small>
                <small v-else class="text-muted">{{ t('repos.fieldTagsHint') }}</small>
            </div>

            <div class="repo-form__actions">
                <CaomeiButton
                    variant="ghost"
                    tone="neutral"
                    @click="onClose"
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
</template>

<style lang="scss" scoped>
/* 表单布局规则随组件内聚：本弹窗自 repos.vue 拆出时样式段留在父页的
   `<style scoped>` 内，scoped 不穿透子组件 → 规则整段失效（label 贴输入框、操作区落到左下）。
   此处为唯一归属地，父页不再保留同名规则。 */
.repo-form__limits {
    margin-top: 8px;
    padding: 8px 12px;
    border: 1px solid var(--caomei-color-border, #d4d4d8);
    border-radius: var(--caomei-radius-md, 8px);

    &-summary {
        cursor: pointer;
        font-weight: 600;
        display: flex;
        gap: 8px;
        align-items: baseline;
    }

    &-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px 16px;
        margin-top: 8px;
    }

    &-hint {
        display: block;
        margin-top: 4px;
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
        @include field-stack;

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

    &__focus {
        display: flex;
        flex-direction: column;
        gap: $space-3;
        padding-top: $space-3;
        border-top: 1px solid $color-border;
    }

    &__focus-title {
        font-size: $font-size-sm;
        font-weight: 600;
    }
}
</style>
