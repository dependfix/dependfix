<script setup lang="ts">
// 仓库新增 / 编辑表单弹窗（自 repos.vue 拆出：页面行数治理 max-lines 800；
// 与 scan-config-dialog / import-repos-dialog 同模式——父组件只持有 visible / 编辑对象）。
// 表单状态与提交逻辑内聚在组件内；保存成功 emit `saved`（父组件刷新列表 + 成功提示），
// 保存失败 emit `failed`（父组件按 repos.errors.saveFailed 包装后展示）。
import { Check } from '@lucide/vue'
import type { RepoView } from '~/types/platform'

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
}

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
})

const form = ref<RepoForm>(emptyForm())
const saving = ref(false)

/**
 * 打开时按「编辑对象 / 新增」重置表单——父组件只切换 visible 与 repo，
 * 组件自身保证每次打开都是干净状态（不留上一次的半截输入）。
 */
watch(() => props.visible, (open) => {
    if (!open) {
        return
    }
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
                note: repo.note ?? '',
                tags: [...(repo.tags ?? [])],
                verifyCommands: (repo.verifyCommands ?? []).join('\n'),
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
                        :options="[
                            {label: t('repos.platformContainer'), value: 'container'},
                            {label: t('repos.githubAction'), value: 'github-action'},
                            {label: t('repos.sandboxContainer'), value: 'sandbox'}
                        ]"
                        option-label="label"
                        option-value="value"
                    />
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
}
</style>
