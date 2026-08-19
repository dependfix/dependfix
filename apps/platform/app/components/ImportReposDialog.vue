<script setup lang="ts">
// 批量导入仓库弹窗（自 repos.vue 拆出：页面行数治理 max-lines 800）
// 父组件传入已加载的凭据列表；导入成功后 emit('imported') 通知刷新仓库列表。
const props = defineProps<{
    visible: boolean
    credentials: { id: string, name: string }[]
}>()

const emit = defineEmits<{
    'update:visible': [value: boolean]
    imported: []
}>()

const { t } = useI18n()

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

const dialogVisible = computed({
    get: () => props.visible,
    set: (v: boolean) => emit('update:visible', v),
})

const importLoading = ref(false)
const importSaving = ref(false)
const importCredentialId = ref<string | null>(null)
const importableRepos = ref<ImportableRepo[]>([])
const selectedRepos = ref<ImportableRepo[]>([])

/** 可勾选仓库（排除已导入项；全选/计数均基于此集合） */
const selectableRepos = computed(() => importableRepos.value.filter((r) => !r.imported))
const importError = ref('')
const importSuccess = ref('')

watch(() => props.visible, (v) => {
    if (!v) {
        return
    }
    importError.value = ''
    importSuccess.value = ''
    selectedRepos.value = []
    importableRepos.value = []
    // 单凭据场景自动选中并加载可导入仓库
    if (props.credentials.length === 1) {
        importCredentialId.value = props.credentials[0]!.id
        void loadImportable()
    }
})

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
        // 默认不勾选任何仓库（见 docs/plan/todo.md §PR1 C48：避免手滑一次导入大量仓库）；用户需主动勾选或点全选按钮
    } catch (e: any) {
        importError.value = t('repos.errors.repoFetchFailed', { message: e?.data?.message ?? e?.message ?? t('common.errors.unknown') })
    } finally {
        importLoading.value = false
    }
}

const submitImport = async () => {
    if (!selectedRepos.value.length) {
        importError.value = t('repos.errors.selectAtLeastOne')
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
        importSuccess.value = t('repos.success.importDone', { imported: data.imported, skipped: data.skipped })
        emit('imported')
        // 清空已导入项选择，避免下次刷新列表后 selectedRepos 残留已 disabled 的旧数据
        // （PR1-1 C48 修复删除自动勾选后必须主动清空，否则导入按钮仍可点产生误导）
        selectedRepos.value = []
        await loadImportable()
    } catch (e: any) {
        importError.value = t('repos.errors.importFailed', { message: e?.data?.message ?? e?.message ?? t('common.errors.unknown') })
    } finally {
        importSaving.value = false
    }
}
</script>

<template>
    <Dialog
        v-model:visible="dialogVisible"
        :header="t('repos.importTitle')"
        modal
        :draggable="false"
        :style="{width: '680px'}"
    >
        <div class="import-form">
            <div class="import-form__row">
                <div class="import-form__field">
                    <label for="importCredential">{{ t('repos.importCredential') }}</label>
                    <Select
                        id="importCredential"
                        v-model="importCredentialId"
                        :options="credentials"
                        option-label="name"
                        option-value="id"
                        :placeholder="t('repos.importCredentialPlaceholder')"
                        :loading="importLoading"
                        fluid
                        @change="loadImportable"
                    />
                </div>
                <Button
                    icon="pi pi-refresh"
                    text
                    rounded
                    :aria-label="t('repos.importRefresh')"
                    :title="t('repos.importRefresh')"
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
                {{ t('common.empty.loading') }}
            </div>
            <div v-else-if="importableRepos.length" class="import-form__list">
                <div class="import-form__list-actions">
                    <label>
                        <Checkbox
                            :model-value="selectedRepos.length === selectableRepos.length && selectableRepos.length > 0"
                            :binary="true"
                            @update:model-value="(v: boolean) => selectedRepos = v ? [...selectableRepos] : []"
                        />
                        {{ t('repos.importSelectAll', {count: selectableRepos.length}) }}
                    </label>
                    <span class="text-muted">{{ t('repos.importSelectedCount', {count: selectedRepos.length}) }}</span>
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
                            {{ repo.private ? t('repos.privateRepo') : t('repos.publicRepo') }} · {{ repo.defaultBranch }}
                            <template v-if="repo.imported"> · {{ t('repos.imported') }}</template>
                        </small>
                    </div>
                    <Tag
                        v-if="repo.imported"
                        :value="t('repos.exists')"
                        severity="secondary"
                    />
                </div>
            </div>
            <p v-else-if="!importLoading && importCredentialId" class="text-muted">
                {{ t('repos.importNoRepos') }}
            </p>
            <p v-else class="text-muted">
                {{ t('repos.importSelectCredential') }}
            </p>

            <div class="import-form__actions">
                <Button
                    :label="t('common.actions.cancel')"
                    severity="secondary"
                    text
                    @click="dialogVisible = false"
                />
                <Button
                    :label="t('repos.importSelect')"
                    icon="pi pi-check"
                    :loading="importSaving"
                    :disabled="!selectedRepos.length"
                    @click="submitImport"
                />
            </div>
        </div>
    </Dialog>
</template>

<style lang="scss" scoped>
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
</style>
