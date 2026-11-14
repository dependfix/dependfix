import { computed, reactive, ref, type Ref } from 'vue'
import type { RepoView } from '~/types/platform'

/**
 * 仓库列表的客户端搜索 / 筛选状态（自 repos.vue 拆出：页面行数治理 max-lines 800）。
 *
 * 语义与拆分前一致：`/api/repos` 返回全量，搜索（owner / 仓库名 / 标签 / 凭据名）与
 * 三维筛选（执行方式 / 包管理器 / 凭据）在客户端叠加；`selectedRows` 不受筛选影响
 * （筛选是视图态，不改变已选集合），列表刷新后由页面按 id 重映射。
 *
 * 依赖通过参数注入（不加载 Nuxt 运行时），便于单测直接覆盖筛选分支。
 */
export interface RepoFilterOption {
    label: string
    value: string
}

/** 筛选态（`'all'` = 不筛选；凭据列 `'none'` = 仅未关联） */
export interface RepoFilterState {
    executorKind: string
    packageManager: string
    credentialId: string
}

export interface RepoCredentialSource {
    id: string
    name: string
}

export interface UseRepoFiltersOptions {
    /** 全量仓库列表（服务端返回） */
    repos: Ref<RepoView[]>
    /** 凭据列表（用于凭据筛选项） */
    credentials: Ref<RepoCredentialSource[]>
    /** i18n 文案解析 */
    t: (key: string, params?: Record<string, string | number>) => string
}

export const useRepoFilters = ({ repos, credentials, t }: UseRepoFiltersOptions) => {
    const searchQuery = ref('')

    const filters = reactive<RepoFilterState>({
        executorKind: 'all',
        packageManager: 'all',
        credentialId: 'all',
    })

    const executorFilterOptions = computed<RepoFilterOption[]>(() => [
        { label: t('repos.filterAll'), value: 'all' },
        { label: t('repos.platformContainer'), value: 'container' },
        { label: t('repos.githubAction'), value: 'github-action' },
        { label: t('repos.sandboxContainer'), value: 'sandbox' },
    ])

    const packageManagerFilterOptions = computed<RepoFilterOption[]>(() => [
        { label: t('repos.filterAll'), value: 'all' },
        { label: 'pnpm', value: 'pnpm' },
        { label: 'npm', value: 'npm' },
        { label: 'yarn', value: 'yarn' },
    ])

    const credentialFilterOptions = computed<RepoFilterOption[]>(() => [
        { label: t('repos.filterAll'), value: 'all' },
        { label: t('repos.filterNotLinked'), value: 'none' },
        ...credentials.value.map((credential) => ({ label: credential.name, value: credential.id })),
    ])

    /** 是否存在生效中的搜索 / 筛选（用于空态文案与「重置」按钮可用性） */
    const hasActiveFilter = computed(() => Boolean(
        searchQuery.value.trim()
        || filters.executorKind !== 'all'
        || filters.packageManager !== 'all'
        || filters.credentialId !== 'all',
    ))

    const reset = () => {
        searchQuery.value = ''
        filters.executorKind = 'all'
        filters.packageManager = 'all'
        filters.credentialId = 'all'
    }

    /**
     * 搜索 + 筛选叠加结果。
     *
     * 页码语义不变：`filteredRepos` 变化时由 DataTable 内部 autoResetPageIndex 回到第 1 页；
     * 保存刷新走页面受控分页（编辑保留当前页，新增 / 删除 / 批量导入回到第 1 页）。
     */
    const filteredRepos = computed(() => {
        const keyword = searchQuery.value.trim().toLowerCase()
        return repos.value.filter((repo) => {
            if (filters.executorKind !== 'all' && repo.executorKind !== filters.executorKind) {
                return false
            }
            if (filters.packageManager !== 'all' && repo.packageManager !== filters.packageManager) {
                return false
            }
            if (filters.credentialId === 'none') {
                if (repo.credentialId) {
                    return false
                }
            } else if (filters.credentialId !== 'all' && repo.credentialId !== filters.credentialId) {
                return false
            }
            if (!keyword) {
                return true
            }
            return [
                repo.owner,
                repo.name,
                (repo.tags ?? []).join(' '),
                repo.credentialName ?? '',
            ].some((field) => field.toLowerCase().includes(keyword))
        })
    })

    return {
        searchQuery,
        filters,
        executorFilterOptions,
        packageManagerFilterOptions,
        credentialFilterOptions,
        hasActiveFilter,
        reset,
        filteredRepos,
    }
}
