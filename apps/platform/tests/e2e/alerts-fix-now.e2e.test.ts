import { expect, test, type Page } from '@playwright/test'
import { waitForHydration } from './helpers/hydration.helper'

/**
 * alerts "立即修复此仓库" 一键修复端到端测试。
 * 1. report-only 模式运行 → 显示 "立即修复此仓库" 按钮
 * 2. 点击按钮 → POST /api/repos/[id]/scan 携带 reuseScanRunId → 跳转 /scans?repository=xxx&run=xxx
 * 3. 成功消息 toast 显示 + 5s 自动清除
 *
 * 依赖：todo.md §M14.2 /api/runs 分页契约 + §M16.2 reuseScanRunId API + `alert-run-sidebar` 组件 + useFixNow composable
 * 共享：e2e 测试账号（global-setup 注册首用户 admin）
 */
test.use({ storageState: 'tests/e2e/.auth/admin.json' })

const MOCK_REPOS = [
    { id: 'repo-1', owner: 'foo', name: 'bar' },
]

const makeAlert = (affectedRunIds: string[]) => ({
    id: 'alert-1',
    runId: affectedRunIds[0] ?? '',
    repository: 'foo/bar',
    source: 'dependabot',
    severity: 'high',
    packageName: 'lodash',
    manifestPath: 'package.json',
    ruleId: 'GHSA-xxxx-xxxx-xxxx',
    summary: 'prototype pollution',
    fixable: true,
    fixStrategy: 'dependency-upgrade',
    recommendedVersion: '4.18.0',
    htmlUrl: null,
    fixStatus: 'pending',
    errorMessage: null,
    affectedRunIds,
    occurrenceCount: 1,
    firstSeenAt: '2026-08-26T10:00:00.000Z',
    lastSeenAt: '2026-08-26T10:00:12.345Z',
})

const makeRun = (overrides: Record<string, unknown> = {}) => ({
    id: '12345678-abcdefgh-ijklmnop',
    repositoryId: 'repo-1',
    owner: 'foo',
    name: 'bar',
    mode: 'report-only',
    severityThreshold: 'high',
    executorKind: 'github-action',
    status: 'completed',
    startedAt: '2026-08-26T10:00:00.000Z',
    finishedAt: '2026-08-26T10:00:12.345Z',
    runUrl: 'https://github.com/foo/bar/actions/runs/12345678',
    summary: { alertsFound: 2, alertsFixed: 1 },
    error: null,
    ...overrides,
})

const installRoutes = async (
    page: Page,
    runs: Record<string, unknown>[],
) => {
    await page.route('**/api/alerts*', (route) => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([makeAlert(runs.map((run) => String(run.id)))]),
    }))
    await page.route('**/api/repos*', (route) => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_REPOS),
    }))
    await page.route(/\/api\/runs(\/|\?|$)/, async (route) => {
        const url = new URL(route.request().url())
        if (url.pathname === '/api/runs' && url.searchParams.has('ids')) {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ items: runs, total: runs.length, page: 1, pageSize: 100 }),
            })
            return
        }
        const run = runs.find((item) => url.pathname === `/api/runs/${String(item.id)}`)
        if (run) {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(run),
            })
            return
        }
        await route.continue()
    })
}

/**
 * reuseScanRunId：fix 模式触发时携带的既有 run id
 */
const FIX_RUN_ID = '12345678-abcdefgh-ijklmnop'

test.describe('alerts "立即修复此仓库" 入口', () => {
    test('report-only 运行展示 "立即修复此仓库" 按钮 + 点击触发 reuseScanRunId 调用', async ({ page }) => {
        const run = makeRun({ mode: 'report-only' })
        await installRoutes(page, [run])

        // 监听 /api/repos/[id]/scan POST 请求，断言 reuseScanRunId 携带
        const scanRequests: { body: Record<string, unknown>, url: string }[] = []
        await page.route('**/api/repos/*/scan', async (route) => {
            if (route.request().method() !== 'POST') {
                await route.continue()
                return
            }
            scanRequests.push({
                url: route.request().url(),
                body: JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>,
            })
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ ...run, status: 'running' }),
            })
        })
        // mock /scans 页面所需的端点（避免真实打 DB）
        await page.route('**/api/scan-history/summary*', (route) => route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                byStatus: { pending: 0, running: 0, completed: 1, failed: 0, dispatched: 0, degraded: 0 },
                totals: { runs: 1, totalAlerts: 2, totalFixed: 0 },
                repositories: [{ repositoryId: 'repo-1', owner: 'foo', name: 'bar', runCount: 1, alertCount: 2, fixedCount: 0, lastRunAt: '2026-08-26T10:00:12.345Z', lastStatus: 'completed' }],
                window: { start: '2026-08-26T10:00:00.000Z', end: '2026-08-26T10:00:12.345Z', included: 1, limit: 500 },
                filtered: { repositoryId: null },
            }),
        }))

        await page.goto('/alerts')
        await waitForHydration(page)
        await page.locator('#view-mode').click()
        await page.locator('.p-select-overlay li').filter({ hasText: '原始列表' }).click()
        const row = page.locator('.p-datatable tbody tr').filter({ hasText: 'lodash' }).first()
        await expect(row).toBeVisible()
        await row.locator('button[aria-label="详情"]').click()

        const sidebar = page.locator('.p-drawer')
        await expect(sidebar).toContainText('12345678')

        // 按钮可见（aria-label 中文 "立即修复此仓库"）
        const fixBtn = sidebar.locator('button[aria-label="立即修复此仓库"]')
        await expect(fixBtn).toBeVisible()

        await fixBtn.click()

        // 等待 scan API 调用
        await expect.poll(() => scanRequests.length, { timeout: 5000 }).toBe(1)
        const req = scanRequests[0]!
        expect(req.body).toMatchObject({
            mode: 'fix',
            severityThreshold: 'high',
            reuseScanRunId: FIX_RUN_ID,
        })
        // URL 应指向 repo-1
        expect(req.url).toContain('/api/repos/repo-1/scan')

        // 跳转：/scans?repository=xxx&run=xxx
        await page.waitForURL((u) => {
            const sp = new URL(u).searchParams
            return sp.get('repository') === 'repo-1' && sp.get('run') === FIX_RUN_ID
        }, { timeout: 10000 })
    })

    test('fix 模式运行不展示 "立即修复此仓库" 按钮（已是终态无需复用）', async ({ page }) => {
        // 已处于 fix 模式的运行不应触发再次复用
        const run = makeRun({ mode: 'fix' })
        await installRoutes(page, [run])

        await page.goto('/alerts')
        await waitForHydration(page)
        await page.locator('#view-mode').click()
        await page.locator('.p-select-overlay li').filter({ hasText: '原始列表' }).click()
        const row = page.locator('.p-datatable tbody tr').filter({ hasText: 'lodash' }).first()
        await expect(row).toBeVisible()
        await row.locator('button[aria-label="详情"]').click()

        const sidebar = page.locator('.p-drawer')
        await expect(sidebar).toContainText('12345678')
        // 修复模式运行不应展示 "立即修复此仓库" 按钮
        await expect(sidebar.locator('button[aria-label="立即修复此仓库"]')).toHaveCount(0)
    })

    test('扫描 API 返回 4xx 错误时 sidebar 显示错误消息 + 不跳转', async ({ page }) => {
        const run = makeRun({ mode: 'report-only' })
        await installRoutes(page, [run])

        // scan API 返回 409（模拟运行中冲突）
        await page.route('**/api/repos/*/scan', async (route) => {
            if (route.request().method() !== 'POST') {
                await route.continue()
                return
            }
            await route.fulfill({
                status: 409,
                contentType: 'application/json',
                body: JSON.stringify({ statusCode: 409, message: '该扫描正在执行中，请等待完成后复用' }),
            })
        })

        await page.goto('/alerts')
        await waitForHydration(page)
        await page.locator('#view-mode').click()
        await page.locator('.p-select-overlay li').filter({ hasText: '原始列表' }).click()
        const row = page.locator('.p-datatable tbody tr').filter({ hasText: 'lodash' }).first()
        await expect(row).toBeVisible()
        await row.locator('button[aria-label="详情"]').click()

        const sidebar = page.locator('.p-drawer')
        const fixBtn = sidebar.locator('button[aria-label="立即修复此仓库"]')
        await expect(fixBtn).toBeVisible()
        await fixBtn.click()

        // 错误消息显示（success 不会显示，因为没成功）
        await expect(sidebar.locator('.p-message-error')).toContainText('该扫描正在执行中', { timeout: 10000 })
        // URL 不变（仍在 /alerts）
        await expect(page).toHaveURL(/\/alerts$/)
    })
})
