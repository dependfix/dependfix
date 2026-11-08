<script setup lang="ts">
// 仓库新增 / 编辑表单弹窗（自 repos.vue 拆出：页面行数治理 max-lines 800；
// 与 scan-config-dialog / import-repos-dialog 同模式——父组件只持有 visible / 编辑对象）。
// 表单状态与提交逻辑内聚在组件内；保存成功 emit `saved`（父组件刷新列表 + 成功提示），
// 保存失败 emit `failed`（父组件按 repos.errors.saveFailed 包装后展示）。
import { Check } from '@lucide/vue'
import type { PRCheckFocusView, RepoView } from '~/types/platform'

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
    failed: [message: string]
}>()

const { t } = useI18n()

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
    /** 自定义验证命令（多行文本，一行一条；提交时拆分为数组，空行忽略 → 空数组走默认链） */
    verifyCommands: string
    /** PR Check 关注集（逗号 / 换行分隔的文本；提交时拆分为数组，空 = 该维度不限） */
    focusProviders: string
    focusNames: string
    /** 关注集来源类型（空数组 = 不限） */
    focusKinds: string[]
    /** 执行预算（分钟文本；空 = 继承全局。库内毫秒，前端展示 / 输入一律分钟） */
    executionTimeoutMinutes: string
    verifyCommandTimeoutMinutes: string
    installTimeoutMinutes: string
    cloneTimeoutMinutes: string
    /** 跨大版本升级授权（默认关闭） */
    allowMajorUpgrade: boolean
}

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
    note: '',
    tags: [],
    verifyCommands: '',
    focusProviders: '',
    focusNames: '',
    focusKinds: [],
    executionTimeoutMinutes: '',
    verifyCommandTimeoutMinutes: '',
    installTimeoutMinutes: '',
    cloneTimeoutMinutes: '',
    allowMajorUpgrade: false,
})

const form = ref<RepoForm>(emptyForm())
const saving = ref(false)
/** 编辑存量 sandbox 仓库时为 true：表单已自动改为 container，并提示保存后迁移 */
const sandboxMigrated = ref(false)

/** 执行方式选项：sandbox 入口 2026-10-27 起临时关闭（真实执行未闭环），保留 disabled 项显示存量值 */
const executorOptions = computed(() => [
    { label: t('repos.platformContainer'), value: 'container' },
    { label: t('repos.githubAction'), value: 'github-action' },
    { label: t('repos.sandboxContainerUnavailable'), value: 'sandbox', disabled: true },
])

/** 关注集来源类型选项（显式键逐一列出：与 pr-checks.vue 同口径，避免动态 i18n 键绕过缺词门禁） */
const focusKindOptions = computed(() => [
    { value: 'check', label: t('repos.focusKind.check') },
    { value: 'status', label: t('repos.focusKind.status') },
    { value: 'deployment', label: t('repos.focusKind.deployment') },
])

/** 毫秒 → 分钟文本（空 = 继承）；整分钟才回填，非整分钟按四舍五入展示 */
const toMinutes = (ms: number | null | undefined): string => (ms ? String(Math.round(ms / 60000)) : '')

/** 分钟文本 → 毫秒（空 / 非数 / 非正 → null = 继承） */
const toMilliseconds = (minutes: string): number | null => {
    const value = Number.parseFloat(minutes.trim())
    if (!Number.isFinite(value) || value <= 0) {
        return null
    }
    return Math.round(value * 60000)
}

/** 已覆盖项数（折叠行摘要） */
const coveredLimitCount = computed(() => [
    form.value.executionTimeoutMinutes,
    form.value.verifyCommandTimeoutMinutes,
    form.value.installTimeoutMinutes,
    form.value.cloneTimeoutMinutes,
].filter((value) => value.trim() !== '').length)

/** 全局生效值（「继承全局」占位的唯一来源；禁止前端硬编码默认分钟数） */
const requestFetch = useRequestFetch()
const { data: executionLimitsDefaults } = await useAsyncData<{
    executionTimeoutMs: number
    maxExecutionTimeoutMs: number
    verifyCommandTimeoutMs: number
    installTimeoutMs: number
    cloneTimeoutMs: number
} | null>('repo-form-execution-limits', async () => {
    if (!props.visible) {
        return null
    }
    try {
        // 显式泛型规避 $fetch 路由类型推断的栈深限制（与 repos.vue 同模式）
        return await requestFetch<{
            executionTimeoutMs: number
            maxExecutionTimeoutMs: number
            verifyCommandTimeoutMs: number
            installTimeoutMs: number
            cloneTimeoutMs: number
        }>('/api/settings/execution-limits')
    } catch {
        return null
    }
}, { default: () => null })

const placeholderFor = (ms: number | undefined): string =>
    (executionLimitsDefaults.value && ms !== undefined ? `${Math.round(ms / 60000)}` : '')

/** 表单关注集 → 请求体（三维全空归一为 null = 不启用；服务端仍会做 trim / 去重 / 小写规范化） */
const buildFocusPayload = (): PRCheckFocusView | null => {
    const providers = splitFocusList(form.value.focusProviders)
    const names = splitFocusList(form.value.focusNames)
    const kinds = form.value.focusKinds.filter(isFocusKind)
    return providers.length > 0 || names.length > 0 || kinds.length > 0
        ? { providers, names, kinds }
        : null
}

/**
 * 打开时按「编辑对象 / 新增」重置表单——父组件只切换 visible 与 repo，
 * 组件自身保证每次打开都是干净状态（不留上一次的半截输入）。
 */
watch(() => props.visible, (open) => {
    if (!open) {
        return
    }
    const repo = props.repo
    const wasSandbox = repo?.executorKind === 'sandbox'
    sandboxMigrated.value = wasSandbox
    form.value = repo
        ? {
                owner: repo.owner,
                name: repo.name,
                defaultBranch: repo.defaultBranch,
                packageManager: repo.packageManager as RepoForm['packageManager'],
                credentialId: repo.credentialId,
                actionWorkflowFile: repo.actionWorkflowFile ?? '',
                // 存量 sandbox 仓库：入口已关闭，打开即迁移为 container（保存后生效；扫描侧另有强制降级兜底）
                executorKind: wasSandbox ? 'container' : repo.executorKind as RepoForm['executorKind'],
                note: repo.note ?? '',
                tags: [...(repo.tags ?? [])],
                verifyCommands: (repo.verifyCommands ?? []).join('\n'),
                focusProviders: (repo.prCheckFocus?.providers ?? []).join(', '),
                focusNames: (repo.prCheckFocus?.names ?? []).join(', '),
                focusKinds: [...(repo.prCheckFocus?.kinds ?? [])],
                executionTimeoutMinutes: toMinutes(repo.executionTimeoutMs),
                verifyCommandTimeoutMinutes: toMinutes(repo.verifyCommandTimeoutMs),
                installTimeoutMinutes: toMinutes(repo.installTimeoutMs),
                cloneTimeoutMinutes: toMinutes(repo.cloneTimeoutMs),
                allowMajorUpgrade: repo.allowMajorUpgrade === true,
            }
        : emptyForm()
})

const onClose = () => {
    emit('update:visible', false)
}

const submit = async () => {
    saving.value = true
    try {
        const payload = {
            ...form.value,
            actionWorkflowFile: form.value.actionWorkflowFile.trim() || null,
            note: form.value.note.trim() || null,
            tags: form.value.tags.length > 0 ? form.value.tags : null,
            // 多行文本 → 命令数组（按行拆分 + 去空白 + 丢弃空行；空数组 = 走引擎默认验证链）
            verifyCommands: form.value.verifyCommands
                .split('\n')
                .map((line) => line.trim())
                .filter(Boolean),
            prCheckFocus: buildFocusPayload(),
            executionTimeoutMs: toMilliseconds(form.value.executionTimeoutMinutes),
            verifyCommandTimeoutMs: toMilliseconds(form.value.verifyCommandTimeoutMinutes),
            installTimeoutMs: toMilliseconds(form.value.installTimeoutMinutes),
            cloneTimeoutMs: toMilliseconds(form.value.cloneTimeoutMinutes),
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
    } catch (e: any) {
        emit('failed', e?.data?.message ?? e?.message ?? t('common.errors.unknown'))
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
            <div class="repo-form__row">
                <div class="repo-form__field">
                    <label for="owner">{{ t('repos.fieldOwner') }}</label>
                    <CaomeiInput
                        id="owner"
                        v-model="form.owner"
                        placeholder="github-owner"
                        required
                    />
                </div>
                <div class="repo-form__field">
                    <label for="name">{{ t('repos.fieldName') }}</label>
                    <CaomeiInput
                        id="name"
                        v-model="form.name"
                        placeholder="repo-name"
                        required
                    />
                </div>
            </div>
            <div class="repo-form__row">
                <div class="repo-form__field">
                    <label for="defaultBranch">{{ t('repos.fieldDefaultBranch') }}</label>
                    <CaomeiInput
                        id="defaultBranch"
                        v-model="form.defaultBranch"
                    />
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
                    />
                    <small v-if="sandboxMigrated" class="text-muted">{{ t('repos.sandboxMigratedNotice') }}</small>
                </div>
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
                />
                <small class="text-muted">{{ t('repos.fieldWorkflowFileHint') }}</small>
            </div>
            <div class="repo-form__field">
                <label for="verifyCommands">{{ t('repos.fieldVerifyCommands') }}</label>
                <CaomeiTextarea
                    id="verifyCommands"
                    v-model="form.verifyCommands"
                    :rows="3"
                    :placeholder="t('repos.fieldVerifyCommandsPlaceholder')"
                />
                <small class="text-muted">{{ t('repos.fieldVerifyCommandsHint') }}</small>
            </div>
            <details class="repo-form__limits">
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
                        <label for="executionTimeoutMinutes">{{ t('repos.executionTimeout') }}</label>
                        <CaomeiInput
                            id="executionTimeoutMinutes"
                            v-model="form.executionTimeoutMinutes"
                            inputmode="numeric"
                            :placeholder="placeholderFor(executionLimitsDefaults?.executionTimeoutMs)"
                        />
                        <small class="text-muted">{{ t('repos.executionTimeoutHint') }}</small>
                    </div>
                    <div class="repo-form__field">
                        <label for="verifyCommandTimeoutMinutes">{{ t('repos.verifyCommandTimeout') }}</label>
                        <CaomeiInput
                            id="verifyCommandTimeoutMinutes"
                            v-model="form.verifyCommandTimeoutMinutes"
                            inputmode="numeric"
                            :placeholder="placeholderFor(executionLimitsDefaults?.verifyCommandTimeoutMs)"
                        />
                    </div>
                    <div class="repo-form__field">
                        <label for="installTimeoutMinutes">{{ t('repos.installTimeout') }}</label>
                        <CaomeiInput
                            id="installTimeoutMinutes"
                            v-model="form.installTimeoutMinutes"
                            inputmode="numeric"
                            :placeholder="placeholderFor(executionLimitsDefaults?.installTimeoutMs)"
                        />
                    </div>
                    <div class="repo-form__field">
                        <label for="cloneTimeoutMinutes">{{ t('repos.cloneTimeout') }}</label>
                        <CaomeiInput
                            id="cloneTimeoutMinutes"
                            v-model="form.cloneTimeoutMinutes"
                            inputmode="numeric"
                            :placeholder="placeholderFor(executionLimitsDefaults?.cloneTimeoutMs)"
                        />
                    </div>
                </div>
                <small class="text-muted">{{ t('repos.executionLimitsHint') }}</small>
            </details>
            <div class="repo-form__field">
                <label for="allowMajorUpgrade">{{ t('repos.allowMajorUpgrade') }}</label>
                <CaomeiSwitch
                    id="allowMajorUpgrade"
                    v-model="form.allowMajorUpgrade"
                />
                <small class="text-muted">{{ t('repos.allowMajorUpgradeHint') }}</small>
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
                    />
                </div>
                <div class="repo-form__field">
                    <label for="focusNames">{{ t('repos.fieldPrCheckFocusNames') }}</label>
                    <CaomeiInput
                        id="focusNames"
                        v-model="form.focusNames"
                        :placeholder="t('repos.fieldPrCheckFocusNamesPlaceholder')"
                    />
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
                    />
                </div>
                <small class="text-muted">{{ t('repos.fieldPrCheckFocusHint') }}</small>
            </div>
            <div class="repo-form__field">
                <label for="note">{{ t('repos.fieldNote') }}</label>
                <CaomeiTextarea
                    id="note"
                    v-model="form.note"
                    :rows="2"
                />
            </div>
            <div class="repo-form__field">
                <label for="tags">{{ t('repos.fieldTags') }}</label>
                <CaomeiTagsInput
                    id="tags"
                    v-model="form.tags"
                    :placeholder="t('repos.fieldTagsPlaceholder')"
                />
                <small class="text-muted">{{ t('repos.fieldTagsHint') }}</small>
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
