import { expect, test } from '@playwright/test'
import { authedCookieHeader } from './helpers/auth-cookie.helper'
import { waitForHydration } from './helpers/hydration.helper'

/**
 * 列表页表格基础能力 e2e：仓库列表（搜索 / 筛选 / 分页）与批量运行列表（筛选 / 分页）。
 *
 * 覆盖点：
 * - repos：搜索命中受限 + 默认每页 10 条 + 「下一页」翻页内容变化 + 叠加筛选（执行方式）+ 重置清除筛选态
 * - batch-runs：筛选工具栏与分页控件渲染 + 筛选态与重置交互
 *
 * 说明：
 * - 本用例自建带唯一前缀的仓库（`filters-e2e-<runId>`），断言不依赖库中其它数据。
 * - batch-runs 的数据级筛选断言依赖真实批次记录（由 `batch.e2e.test.ts` 覆盖数据面）；
 *   本文件覆盖控件与交互面（空态/有数据均成立）。
 */

const RUN_ID = Date.now().toString(36)
const OWNER = `filters-e2e-${RUN_ID}`
const REPO_COUNT = 12
const PAGE_SIZE = 10
const E2E_ORIGIN = 'http://127.0.0.1:3101'

test.use({ storageState: 'tests/e2e/.auth/admin.json' })

test.describe('仓库列表筛选与分页', () => {
    test('搜索 / 分页导航 / 叠加筛选 / 重置', async ({ page }) => {
        // 先写入本用例专属数据（认证方式与 repos-crud e2e 同源：显式 cookie + origin 头）
        const cookieHeader = await authedCookieHeader(page)
        for (let i = 0; i < REPO_COUNT; i++) {
            const response = await page.request.post('/api/repos', {
                headers: { cookie: cookieHeader, origin: E2E_ORIGIN },
                data: {
                    owner: OWNER,
                    name: `repo-${String(i).padStart(2, '0')}`,
                    platform: 'github',
                    packageManager: i % 2 === 0 ? 'pnpm' : 'npm',
                    defaultBranch: 'main',
                    // 12 个仓库中 i % 3 === 0 的 4 个为 GitHub Action 执行方式（筛选断言依据）；
                    // 该执行方式要求 actionWorkflowFile（仓库表单 / API 校验必填）
                    ...(i % 3 === 0
                        ? { executorKind: 'github-action', actionWorkflowFile: '.github/workflows/security-auto-fix.yml' }
                        : { executorKind: 'container' }),
                },
            })
            expect(response.ok()).toBeTruthy()
        }

        await page.goto('/repos')
        await waitForHydration(page)

        const rows = page.locator('.caomei-data-table__row')

        // 搜索限定到本用例前缀 → 命中 12 条；默认每页 10 条 → 首屏 10 行 + 分页控件出现
        await page.locator('#repos-filter-search').fill(OWNER)
        await expect(rows).toHaveCount(PAGE_SIZE, { timeout: 15000 })
        await expect(page.locator('.caomei-paginator')).toBeVisible()

        // 每页条数切换：25 → 12 条全部显示；再切回 10 → 恢复 10 行
        const rowsPerPage = page.locator('.caomei-paginator__rows-per-page').first()
        await rowsPerPage.click()
        await page.locator('.caomei-select__content .caomei-select__item').filter({ hasText: '25' }).click()
        await expect(rows).toHaveCount(REPO_COUNT, { timeout: 10000 })
        await rowsPerPage.click()
        await page.locator('.caomei-select__content .caomei-select__item').filter({ hasText: '10' }).click()
        await expect(rows).toHaveCount(PAGE_SIZE, { timeout: 10000 })

        // 每页条数候选含 50 档（AC 要求 10/25/50；12 行数据下 25 与 50 的行数断言等价，故断言选项存在性）
        await rowsPerPage.click()
        await expect(page.locator('.caomei-select__content .caomei-select__item').filter({ hasText: '50' })).toBeVisible({ timeout: 5000 })
        await page.keyboard.press('Escape')

        // 「排序 + 分页」叠加：点「仓库」列头排序 → 分页容量不变（仍 10 行）
        // 注意：caomei 的排序触发器是 th 内的 `button.caomei-data-table__sort`（th 本身无 click），
        // 且排序为三态往返（none → asc → desc → none）、属性回写是异步渲染——故逐次点击并等待属性真正变化，
        // 最后 lock 到升序（避免「恰好未排序」也满足首行断言）
        const nameHeader = page.locator('.caomei-data-table__th').filter({ hasText: '仓库' }).first()
        const sortTrigger = nameHeader.locator('.caomei-data-table__sort')
        const readSort = () => nameHeader.getAttribute('aria-sort')
        for (let attempt = 0; attempt < 4; attempt++) {
            if (await readSort() === 'ascending') {
                break
            }
            const before = await readSort()
            await sortTrigger.click()
            await expect.poll(readSort, { timeout: 5000 }).not.toBe(before)
        }
        await expect(nameHeader).toHaveAttribute('aria-sort', 'ascending', { timeout: 10000 })
        await expect(rows).toHaveCount(PAGE_SIZE, { timeout: 10000 })
        await expect(rows.first()).toContainText('repo-00', { timeout: 10000 })

        // 「下一页」→ 第 2 页展示剩余 2 条，且内容仍属本用例前缀
        await page.getByRole('button', { name: '下一页' }).click()
        await expect(rows).toHaveCount(REPO_COUNT - PAGE_SIZE, { timeout: 10000 })
        await expect(rows.first()).toContainText(OWNER)

        // 叠加筛选（执行方式 = GitHub Action）→ 命中 4 条（4 ≤ 每页 10，任意页均可断言）
        await page.locator('#repos-filter-executor').click()
        await page.locator('.caomei-select__content .caomei-select__item').filter({ hasText: 'GitHub Action' }).click()
        await expect(rows).toHaveCount(4, { timeout: 10000 })

        // 重置 → 搜索框清空且筛选态消失（重置按钮随 hasActiveRepoFilter 隐藏）
        await page.locator('.filter-bar__reset').click()
        await expect(page.locator('#repos-filter-search')).toHaveValue('')
        await expect(page.locator('.filter-bar__reset')).toHaveCount(0)
    })
})

test.describe('批量运行列表筛选', () => {
    test('筛选工具栏 / 筛选态 / 重置', async ({ page }) => {
        await page.goto('/batch-runs')
        await waitForHydration(page)

        // 工具栏渲染（来源 / 状态两个筛选器）
        await expect(page.locator('#batch-runs-filter-source')).toBeVisible({ timeout: 15000 })
        await expect(page.locator('#batch-runs-filter-status')).toBeVisible()

        // 选择「定时触发」→ 进入筛选态（重置按钮出现）
        await page.locator('#batch-runs-filter-source').click()
        await page.locator('.caomei-select__content .caomei-select__item').filter({ hasText: '定时触发' }).click()
        await expect(page.locator('.filter-bar__reset')).toBeVisible({ timeout: 5000 })

        // 重置 → 筛选态清除
        await page.locator('.filter-bar__reset').click()
        await expect(page.locator('.filter-bar__reset')).toHaveCount(0)
    })
})
