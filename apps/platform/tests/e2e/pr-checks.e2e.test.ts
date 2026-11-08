import { expect, test } from '@playwright/test'
import { seedCustomFixtures } from './helpers/fixtures.helper'
import { authedCookieHeader } from './helpers/auth-cookie.helper'
import { waitForHydration } from './helpers/hydration.helper'

/**
 * PR Check 页 e2e。
 *
 * 覆盖点：
 * - 按钮在页面头部可见（admin 登录态）
 * - 点击后：e2e 环境默认未启用总开关 `ACTION_STATUS_MONITOR_ENABLED` → 服务端返回 `skipped: true`
 *   → 前端以 warning toast 呈现「监测未启用」提示（不视为失败、不跳转）
 * - 仓库列：跨仓库同号 PR 并存时行内可辨识归属（仓库标签 `owner/name`）
 *
 * 不覆盖：启用总开关后的真实 polling（需真实 GitHub 凭据 + 网络；启用分支的响应形态由
 * `server/api/pr-checks/poll.post.test.ts` 单测覆盖，真实链路验证登记为待人工验收）。
 */

test.use({ storageState: 'tests/e2e/.auth/admin.json' })

test.describe('PR Check 手动触发', () => {
    test('「立即检查」按钮可见；未启用总开关时点击给出提示', async ({ page }) => {
        await page.goto('/pr-checks')
        await waitForHydration(page)

        const pollButton = page.locator('button:has-text("立即检查")')
        await expect(pollButton).toBeVisible({ timeout: 15000 })

        await pollButton.click()

        // 未启用总开关 → warning 提示（文案来自 prChecks.poll.disabled）
        await expect(
            page.locator('.caomei-toast').filter({ hasText: '监测未启用' }).first(),
        ).toBeVisible({ timeout: 10000 })
    })
})

test.describe('PR Check 构建 / 部署信号详情', () => {
    test('展开行展示聚合状态、失败源与各信号链接', async ({ page }) => {
        // 复用 global-setup 已注入的仓库（foo/bar），构造「三源信号 + 聚合失败」的 PR
        await seedCustomFixtures(page.request, {
            repos: [{ owner: 'foo', name: 'bar' }],
            scanRuns: [],
            scanResults: [],
            prChecks: [
                {
                    repositoryOwner: 'foo',
                    repositoryName: 'bar',
                    prNumber: 391,
                    headSha: 'c'.repeat(40),
                    authorLogin: 'dependfix[bot]',
                    conclusion: 'failure',
                    overallStatus: 'failure',
                    signals: [
                        {
                            kind: 'check',
                            provider: 'github-actions',
                            name: 'Test',
                            state: 'success',
                            rawState: 'success',
                            sourceId: '9001',
                            targetUrl: 'https://github.com/foo/bar/runs/9001',
                        },
                        {
                            kind: 'check',
                            provider: 'cloudflare-workers-and-pages',
                            name: 'Workers Builds',
                            state: 'failure',
                            rawState: 'failure',
                            sourceId: '9002',
                            summary: 'script size exceeded',
                            targetUrl: 'https://dash.cloudflare.com/build/9002',
                        },
                        {
                            kind: 'deployment',
                            provider: 'vercel',
                            name: 'Preview',
                            state: 'failure',
                            rawState: 'failure',
                            sourceId: '5001',
                            summary: 'Deployment failed',
                            targetUrl: 'https://preview.example.com',
                            logUrl: 'https://logs.example.com/deploy',
                        },
                    ],
                    alertFiring: true,
                    lastPolledAt: '2026-08-28T02:00:00.000Z',
                },
                {
                    // 存量行（本字段上线前采集）：signals 缺省 → signals_json 为 null
                    repositoryOwner: 'foo',
                    repositoryName: 'bar',
                    prNumber: 392,
                    headSha: 'd'.repeat(40),
                    authorLogin: 'dependabot[bot]',
                    conclusion: 'success',
                    alertFiring: false,
                    lastPolledAt: '2026-08-27T02:00:00.000Z',
                },
            ],
        })

        await page.goto('/pr-checks')
        await waitForHydration(page)

        const table = page.locator('.caomei-data-table')
        await expect(table).toBeVisible({ timeout: 15000 })
        const row = table.locator('tbody .caomei-data-table__row').filter({ hasText: '#391' }).first()
        await expect(row).toBeVisible()

        await row.locator('button.caomei-data-table__row-expander').click()

        const panel = table.locator('.pr-checks__signals')
        await expect(panel).toBeVisible()
        await expect(panel).toContainText('构建 / 部署信号')
        // 聚合状态 + 失败源清单（失败源由 fixtures 端点按 signals 派生）
        await expect(panel).toContainText('聚合状态')
        await expect(panel).toContainText('失败源')
        await expect(panel).toContainText('cloudflare-workers-and-pages / Workers Builds')
        await expect(panel).toContainText('vercel / Preview')
        // 各信号条目（来源 + provider + 名称）
        await expect(panel.locator('.pr-checks__signal')).toHaveCount(3)
        await expect(panel).toContainText('github-actions')
        await expect(panel).toContainText('Workers Builds')
        // 链接：详情 + 日志（新窗口打开）
        const logLink = panel.locator('a[href="https://logs.example.com/deploy"]')
        await expect(logLink).toHaveAttribute('target', '_blank')
        await expect(panel.locator('a[href="https://dash.cloudflare.com/build/9002"]')).toHaveCount(1)
    })

    test('存量行（无信号数据）展开时给出显式说明', async ({ page }) => {
        // 自包含：本用例独立补种存量行（幂等；避免依赖前一个用例的种子，保证 -g 定向运行可用）
        await seedCustomFixtures(page.request, {
            repos: [{ owner: 'foo', name: 'bar' }],
            scanRuns: [],
            scanResults: [],
            prChecks: [
                {
                    repositoryOwner: 'foo',
                    repositoryName: 'bar',
                    prNumber: 392,
                    headSha: 'd'.repeat(40),
                    authorLogin: 'dependabot[bot]',
                    conclusion: 'success',
                    alertFiring: false,
                    lastPolledAt: '2026-08-27T02:00:00.000Z',
                },
            ],
        })

        await page.goto('/pr-checks')
        await waitForHydration(page)

        const table = page.locator('.caomei-data-table')
        await expect(table).toBeVisible({ timeout: 15000 })
        const legacyRow = table.locator('tbody .caomei-data-table__row').filter({ hasText: '#392' }).first()
        await expect(legacyRow).toBeVisible()

        await legacyRow.locator('button.caomei-data-table__row-expander').click()

        const panel = table.locator('.pr-checks__signals')
        await expect(panel).toBeVisible()
        await expect(panel).toContainText('无信号数据')
        await expect(panel.locator('.pr-checks__signal')).toHaveCount(0)
    })
})

test.describe('PR Check 结论筛选与生命周期标签', () => {
    test('按结论筛选 → 请求带 conclusion=failure；关闭态行标注「已关闭」', async ({ page }) => {
        // 自包含：先清理同名仓库（e2e 库跨 run 复用，旧行会被 fixtures 端点按幂等语义跳过）
        await page.request.delete('/api/e2e/fixtures', {
            data: { repos: [{ owner: 'lifecycle-e2e', name: 'repo' }] },
            maxRetries: 2,
        })
        await seedCustomFixtures(page.request, {
            repos: [{ owner: 'lifecycle-e2e', name: 'repo' }],
            scanRuns: [],
            scanResults: [],
            prChecks: [
                {
                    repositoryOwner: 'lifecycle-e2e',
                    repositoryName: 'repo',
                    prNumber: 401,
                    headSha: '1'.repeat(40),
                    authorLogin: 'dependfix[bot]',
                    conclusion: 'failure',
                    prState: 'open',
                    alertFiring: true,
                    lastPolledAt: '2026-09-01T02:00:00.000Z',
                },
                {
                    repositoryOwner: 'lifecycle-e2e',
                    repositoryName: 'repo',
                    prNumber: 402,
                    headSha: '2'.repeat(40),
                    authorLogin: 'dependfix[bot]',
                    conclusion: 'failure',
                    prState: 'closed',
                    alertFiring: false,
                    overallStatus: 'failure',
                    signals: [
                        {
                            kind: 'check',
                            provider: 'github-actions',
                            name: 'Legacy Test',
                            state: 'failure',
                            rawState: 'failure',
                            sourceId: '9402',
                            summary: 'historical failure',
                        },
                    ],
                    lastPolledAt: '2026-09-02T02:00:00.000Z',
                },
                {
                    repositoryOwner: 'lifecycle-e2e',
                    repositoryName: 'repo',
                    prNumber: 403,
                    headSha: '3'.repeat(40),
                    authorLogin: 'dependfix[bot]',
                    conclusion: 'success',
                    prState: 'open',
                    alertFiring: false,
                    lastPolledAt: '2026-09-03T02:00:00.000Z',
                },
            ],
        })

        await page.goto('/pr-checks')
        await waitForHydration(page)

        const table = page.locator('.caomei-data-table')
        await expect(table).toBeVisible({ timeout: 15000 })
        await expect(table.locator('tbody .caomei-data-table__row').filter({ hasText: '#401' })).toBeVisible()

        // 选择结论 = failure → client refetch 必须带 conclusion=failure
        const filtered = page.waitForResponse(
            (resp) => resp.url().includes('/api/pr-checks') && resp.url().includes('conclusion=failure'),
        )
        await page.locator('#pr-check-conclusion').click()
        await page.locator('.caomei-select__content .caomei-select__item').filter({ hasText: /^failure$/ }).click()
        await filtered

        // 结果与所选结论一致：#403（success）被筛掉；关闭态行保留且标注「已关闭」
        const rows = table.locator('tbody .caomei-data-table__row')
        await expect(rows.filter({ hasText: '#401' })).toBeVisible()
        const closedRow = rows.filter({ hasText: '#402' })
        await expect(closedRow).toBeVisible()
        await expect(closedRow).toContainText('已关闭')
        await expect(rows.filter({ hasText: '#403' })).toHaveCount(0)

        // 关闭态仍可展开查看历史信号（只读：无 ack 入口）
        await closedRow.locator('button.caomei-data-table__row-expander').click()
        const panel = table.locator('.pr-checks__signals')
        await expect(panel).toBeVisible()
        await expect(panel).toContainText('Legacy Test')
        await expect(closedRow.locator('button', { hasText: 'Ack' })).toHaveCount(0)
    })
})

test.describe('PR Check 列表行内仓库辨识度', () => {
    test('仓库列：跨仓库同号 PR 并存时行内可区分归属', async ({ page }) => {
        // 复用 global-setup 已注入的仓库（foo/bar + foo/baz，幂等），构造「跨仓库同号 PR（#390）」
        await seedCustomFixtures(page.request, {
            repos: [{ owner: 'foo', name: 'bar' }, { owner: 'foo', name: 'baz' }],
            scanRuns: [],
            scanResults: [],
            prChecks: [
                {
                    repositoryOwner: 'foo',
                    repositoryName: 'bar',
                    prNumber: 390,
                    headSha: 'a'.repeat(40),
                    authorLogin: 'dependfix[bot]',
                    conclusion: 'failure',
                    alertFiring: true,
                    lastPolledAt: '2026-08-28T02:00:00.000Z',
                },
                {
                    repositoryOwner: 'foo',
                    repositoryName: 'baz',
                    prNumber: 390,
                    headSha: 'b'.repeat(40),
                    authorLogin: 'dependfix[bot]',
                    conclusion: 'success',
                    alertFiring: false,
                    lastPolledAt: '2026-08-27T02:00:00.000Z',
                },
            ],
        })

        await page.goto('/pr-checks')
        await waitForHydration(page)

        const table = page.locator('.caomei-data-table')
        await expect(table).toBeVisible({ timeout: 15000 })
        await expect(table.locator('th', { hasText: '仓库' }).first()).toBeVisible()

        // 两行同号 PR 并存：若无仓库列则行内无从区分（本用例即锁定该可辨识度）
        const sameNumberRows = table.locator('tbody .caomei-data-table__row').filter({ hasText: '#390' })
        await expect(sameNumberRows).toHaveCount(2)
        // 逐行绑定仓库标签（锁定「值 → 行」映射，而非仅「两个值分别出现在某行」）
        await expect(sameNumberRows.filter({ hasText: 'foo/bar' })).toHaveCount(1)
        await expect(sameNumberRows.filter({ hasText: 'foo/baz' })).toHaveCount(1)

        // 截断策略：完整 `owner/name` 经 title 暴露；超长值下单元内 ellipsis 生效（scrollWidth > clientWidth）
        const repoCell = sameNumberRows.first().locator('.pr-checks__repository')
        await expect(repoCell).toHaveAttribute('title', /foo\/(bar|baz)/)
        const truncation = await repoCell.evaluate((el) => {
            const text = el.textContent
            el.textContent = `${'very-long-organization-name/'.repeat(12)}web-application-with-an-extremely-long-repository-name`
            const metrics = { scroll: el.scrollWidth, client: el.clientWidth }
            el.textContent = text
            return metrics
        })
        expect(truncation.scroll).toBeGreaterThan(truncation.client)
    })
})

test.describe('PR Check 关注集标注', () => {
    test('未命中关注集的信号在展开行标注「未关注」', async ({ page }) => {
        // 自包含：种一个专属仓库 + 一行「关注面 success / 非关注面 failure」的 PR，
        // 通过 API 配置关注集（只关注 Test），再断言展开行的标注（覆盖「被过滤信号仍可在 UI 看到」的可见性面）
        const seed = await page.request.post('/api/e2e/fixtures', {
            data: {
                repos: [{ owner: 'focus-e2e', name: 'repo' }],
                scanRuns: [],
                scanResults: [],
                prChecks: [
                    {
                        repositoryOwner: 'focus-e2e',
                        repositoryName: 'repo',
                        prNumber: 393,
                        headSha: 'e'.repeat(40),
                        authorLogin: 'dependfix[bot]',
                        conclusion: 'success',
                        overallStatus: 'success',
                        signals: [
                            {
                                kind: 'check',
                                provider: 'github-actions',
                                name: 'Test',
                                state: 'success',
                                rawState: 'success',
                                sourceId: '9101',
                            },
                            {
                                kind: 'check',
                                provider: 'github-actions',
                                name: 'Lint',
                                state: 'failure',
                                rawState: 'failure',
                                sourceId: '9102',
                                summary: 'lint failed',
                            },
                        ],
                        alertFiring: false,
                        lastPolledAt: '2026-08-29T02:00:00.000Z',
                    },
                ],
            },
            maxRetries: 2,
        })
        expect(seed.ok()).toBeTruthy()
        const seeded = await seed.json() as { repos: { id: string, owner: string }[] }
        const repoId = seeded.repos.find((item) => item.owner === 'focus-e2e')!.id

        const cookieHeader = await authedCookieHeader(page)
        const headers = { cookie: cookieHeader, origin: 'http://127.0.0.1:3101' }
        const configured = await page.request.put(`/api/repos/${repoId}`, {
            headers,
            data: { prCheckFocus: { names: ['Test'] } },
        })
        expect(configured.ok()).toBeTruthy()

        try {
            await page.goto('/pr-checks')
            await waitForHydration(page)

            const table = page.locator('.caomei-data-table')
            await expect(table).toBeVisible({ timeout: 15000 })
            const row = table.locator('tbody .caomei-data-table__row').filter({ hasText: '#393' }).first()
            await expect(row).toBeVisible()

            await row.locator('button.caomei-data-table__row-expander').click()
            const panel = table.locator('.pr-checks__signals')
            await expect(panel).toBeVisible()
            await expect(panel).toContainText('关注集生效')

            // 未命中（Lint）标注「未关注」；命中（Test）不标注
            await expect(panel.locator('.pr-checks__signal').filter({ hasText: 'Lint' }))
                .toContainText('未关注')
            await expect(panel.locator('.pr-checks__signal').filter({ hasText: 'Test' }))
                .not.toContainText('未关注')
        } finally {
            // 复位：避免影响同库其它用例（e2e 库跨 run 复用）
            await page.request.put(`/api/repos/${repoId}`, { headers, data: { prCheckFocus: null } })
        }
    })
})
