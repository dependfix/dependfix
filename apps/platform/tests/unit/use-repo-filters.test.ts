import { describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { useRepoFilters } from '../../app/composables/use-repo-filters'
import type { RepoView } from '../../app/types/platform'

/**
 * use-repo-filters 单测：仓库列表客户端搜索 / 筛选的派生语义（自 repos.vue 拆出的纯逻辑面）。
 *
 * 覆盖「无筛选返回全量 / 搜索四个字段 / 三维筛选叠加 / 凭据未关联 / 重置清空筛选态」五组，
 * 页面级交互（翻页、勾选联动）由 `tests/e2e/table-filters.e2e.test.ts` 覆盖。
 */

const makeRepo = (over: Partial<RepoView> = {}): RepoView => ({
    id: over.id ?? 'repo-1',
    owner: 'acme',
    name: 'app',
    platform: 'github',
    defaultBranch: 'main',
    packageManager: 'pnpm',
    credentialId: null,
    credentialName: null,
    actionWorkflowFile: null,
    executorKind: 'container',
    sandboxImage: null,
    note: null,
    tags: [],
    verifyCommands: [],
    prCheckFocus: null,
    vercelProjectId: null,
    cloudflareAccountId: null,
    cloudflareWorkerTag: null,
    executionTimeoutMs: null,
    verifyCommandTimeoutMs: null,
    installTimeoutMs: null,
    cloneTimeoutMs: null,
    allowMajorUpgrade: false,
    aiEnabled: false,
    aiTrigger: 'both',
    lastScanAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
})

/** i18n 桩：返回 key，便于断言选项文案来源 */
const t = (key: string) => key

const setup = (repos: RepoView[], credentials: { id: string, name: string }[] = []) => useRepoFilters({
    repos: ref(repos),
    credentials: ref(credentials),
    t,
})

describe('useRepoFilters', () => {
    it('无筛选时返回全量且 hasActiveFilter=false', () => {
        const filters = setup([makeRepo({ id: 'a' }), makeRepo({ id: 'b' })])
        expect(filters.filteredRepos.value.map((repo) => repo.id)).toEqual(['a', 'b'])
        expect(filters.hasActiveFilter.value).toBe(false)
    })

    it('搜索覆盖 owner / 仓库名 / 标签 / 凭据名，大小写不敏感且忽略首尾空白', () => {
        const filters = setup([
            makeRepo({ id: 'owner', owner: 'Acme' }),
            makeRepo({ id: 'name', owner: 'globex', name: 'My-App' }),
            makeRepo({ id: 'tag', owner: 'initech', tags: ['security'] }),
            makeRepo({ id: 'cred', owner: 'umbrella', credentialName: 'Primary Token' }),
            makeRepo({ id: 'miss', owner: 'other', name: 'lib', tags: ['ui'], credentialName: 'Alt' }),
        ])

        const ids = (keyword: string) => {
            filters.searchQuery.value = keyword
            return filters.filteredRepos.value.map((repo) => repo.id)
        }

        expect(ids('  ACME  ')).toEqual(['owner'])
        expect(ids('my-app')).toEqual(['name'])
        expect(ids('SECURITY')).toEqual(['tag'])
        expect(ids('primary')).toEqual(['cred'])
        expect(filters.hasActiveFilter.value).toBe(true)
    })

    it('三维筛选叠加：执行方式 + 包管理器 + 凭据（含「未关联」哨兵）', () => {
        const filters = setup([
            makeRepo({ id: 'hit', executorKind: 'sandbox', packageManager: 'npm', credentialId: 'cred-1', credentialName: 'A' }),
            makeRepo({ id: 'other-executor', executorKind: 'container', packageManager: 'npm', credentialId: 'cred-1', credentialName: 'A' }),
            makeRepo({ id: 'no-credential', executorKind: 'sandbox', packageManager: 'npm', credentialId: null }),
        ])

        filters.filters.executorKind = 'sandbox'
        filters.filters.packageManager = 'npm'
        expect(filters.filteredRepos.value.map((repo) => repo.id)).toEqual(['hit', 'no-credential'])

        filters.filters.credentialId = 'none'
        expect(filters.filteredRepos.value.map((repo) => repo.id)).toEqual(['no-credential'])

        filters.filters.credentialId = 'cred-1'
        expect(filters.filteredRepos.value.map((repo) => repo.id)).toEqual(['hit'])
    })

    it('凭据筛选项包含「全部 / 未关联 / 实际凭据」三段', () => {
        const filters = setup([], [{ id: 'cred-1', name: 'Primary' }])
        expect(filters.credentialFilterOptions.value).toEqual([
            { label: 'repos.filterAll', value: 'all' },
            { label: 'repos.filterNotLinked', value: 'none' },
            { label: 'Primary', value: 'cred-1' },
        ])
    })

    it('reset 清空搜索与三维筛选', () => {
        const filters = setup([makeRepo()])
        filters.searchQuery.value = 'acme'
        filters.filters.executorKind = 'github-action'
        filters.filters.packageManager = 'yarn'
        filters.filters.credentialId = 'none'
        expect(filters.hasActiveFilter.value).toBe(true)

        filters.reset()

        expect(filters.searchQuery.value).toBe('')
        expect(filters.filters).toEqual({ executorKind: 'all', packageManager: 'all', credentialId: 'all' })
        expect(filters.hasActiveFilter.value).toBe(false)
    })
})
