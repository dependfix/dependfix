import { expect, test, type Page } from '@playwright/test'
import { waitForHydration } from './helpers/hydration.helper'

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
    results: [
        {
            id: 'result-1',
            packageName: 'lodash',
            severity: 'high',
            source: 'dependabot',
            fixable: true,
            recommendedVersion: '4.18.0',
            htmlUrl: 'https://github.com/advisories/GHSA-xxxx-xxxx-xxxx',
        },
    ],
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

test.describe('alerts 去重视图受影响运行 Sidebar', () => {
    test('展示运行元数据并打开详情', async ({ page }) => {
        const run = makeRun()
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
        await expect(sidebar).toContainText('仅报告')
        await expect(sidebar).toContainText('high')
        await expect(sidebar).toContainText('GitHub Action')
        await expect(sidebar).toContainText('2')

        await sidebar.locator('button[aria-label="详情"]').click()
        const detail = page.locator('.p-dialog')
        await expect(detail).toContainText('扫描详情')
        await expect(detail).toContainText('仅报告')
        await expect(detail).toContainText('12.3 秒')
        await expect(page.locator('.run-detail__run-url')).toHaveAttribute('href', String(run.runUrl))
    })

    test('容器执行不显示内部 Run URL', async ({ page }) => {
        const actionRun = makeRun()
        const containerRun = makeRun({
            id: 'abcdef12-34567890-qrstuvwx',
            executorKind: 'container',
            runUrl: null,
        })
        await installRoutes(page, [containerRun, actionRun])

        await page.goto('/alerts')
        await waitForHydration(page)
        await page.locator('#view-mode').click()
        await page.locator('.p-select-overlay li').filter({ hasText: '原始列表' }).click()
        const row = page.locator('.p-datatable tbody tr').filter({ hasText: 'lodash' }).first()
        await expect(row).toBeVisible()
        await row.locator('button[aria-label="详情"]').click()

        const sidebar = page.locator('.p-drawer')
        await expect(sidebar.locator('button[aria-label="详情"]')).toHaveCount(2)
        await expect(sidebar.locator('a')).toHaveCount(1)
        await expect(sidebar.locator('a')).toHaveAttribute('href', String(actionRun.runUrl))
    })
})
