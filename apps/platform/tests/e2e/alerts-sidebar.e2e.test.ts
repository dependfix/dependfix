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
        const run = makeRun({
            summary: {
                alertsFound: 20,
                alertsFixed: 0,
                alertsUnfixed: 20,
                alertsConverged: 0,
                environmentalFailures: 1,
                alertsSkipped: 4,
                alertsSkippedByReason: { 'cross-major': 4 },
                alertsTruncated: 6,
                alertsTruncatedBySeverity: { critical: 2, high: 4 },
            },
            exitCode: 1,
            environmentalFailureCount: 1,
            buildVersion: '2026.10.23',
            buildCommit: 'deadbeefcafe',
        })
        await installRoutes(page, [run])

        await page.goto('/alerts')
        await waitForHydration(page)
        await page.locator('#view-mode').click()
        await page.locator('.caomei-select__content .caomei-select__item').filter({ hasText: '原始列表' }).click()
        const row = page.locator('.caomei-data-table__row').filter({ hasText: 'lodash' }).first()
        await expect(row).toBeVisible()

        await row.locator('button[aria-label="详情"]').click()
        const sidebar = page.locator('.caomei-drawer__content')
        await expect(sidebar).toContainText('12345678')
        await expect(sidebar).toContainText('仅报告')
        // 阈值展示口径已统一（级别首字母大写，与扫描选项 / 运行列表同源）
        await expect(sidebar).toContainText('High')
        await expect(sidebar).toContainText('GitHub Action')
        await expect(sidebar).toContainText('20')

        await sidebar.locator('button[aria-label="详情"]').click()
        const detail = page.locator('.caomei-dialog__content')
        await expect(detail).toContainText('扫描详情')
        await expect(detail).toContainText('仅报告')
        await expect(detail).toContainText('12.3 秒')
        // 结果可信度：未修复 / 环境性失败 / 退出码（run-detail-dialog 是 alerts 侧栏实际挂载的详情）
        await expect(detail).toContainText('未修复告警')
        await expect(detail).toContainText('环境性失败')
        await expect(detail).toContainText('退出码')
        // 构建版本回执：本次 run 由哪个部署产物执行（版本 · 短 commit）
        const buildMeta = detail.locator('.run-detail__meta-item').filter({ hasText: '构建版本' })
        await expect(buildMeta).toContainText('2026.10.23 · deadbeef')
        const breakdown = detail.locator('.run-outcome-breakdown')
        await expect(breakdown).toContainText('未修复 20 / 26')
        await expect(breakdown).toContainText('跨大版本 / 人工复核 4')
        await expect(breakdown).toContainText('Critical 2')
        await expect(page.locator('.run-detail__run-url')).toHaveAttribute('href', String(run.runUrl))
    })

    test('命令级 OOM 与运行级 OOM 分层展示', async ({ page }) => {
        const commandOomRun = makeRun({
            summary: {
                alertsFound: 2,
                alertsFixed: 1,
                commandOomKills: 2,
                commandOomCommands: ['pnpm test', 'pnpm build'],
            },
            // 执行窗口内 cgroup 计数亦增加：由命令级归因解释，不得渲染成运行级 OOM
            oomKilled: true,
        })
        await installRoutes(page, [commandOomRun])

        const openDetail = async () => {
            await page.goto('/alerts')
            await waitForHydration(page)
            await page.locator('#view-mode').click()
            await page.locator('.caomei-select__content .caomei-select__item').filter({ hasText: '原始列表' }).click()
            const row = page.locator('.caomei-data-table__row').filter({ hasText: 'lodash' }).first()
            await expect(row).toBeVisible()
            await row.locator('button[aria-label="详情"]').click()
            const sidebar = page.locator('.caomei-drawer__content')
            await sidebar.locator('button[aria-label="详情"]').click()
            const detail = page.locator('.caomei-dialog__content')
            await expect(detail).toBeVisible()
            return detail
        }

        const detail = await openDetail()
        const commandOomMeta = detail.locator('.run-detail__meta-item').filter({ hasText: '命令级 OOM' })
        await expect(commandOomMeta).toContainText('2 次')
        // 命令名在正文内可见（不依赖悬停）
        await expect(commandOomMeta).toContainText('pnpm test、pnpm build')
        // 命令级已归因 → 不再单列运行级 OOM 行
        await expect(detail.locator('.run-detail__meta-item').filter({ hasText: '运行级 OOM' })).toHaveCount(0)

        const runLevelRun = makeRun({
            status: 'failed',
            oomKilled: true,
            summary: { alertsFound: 2, alertsFixed: 0 },
        })
        await installRoutes(page, [runLevelRun])
        const failedDetail = await openDetail()
        const runLevelMeta = failedDetail.locator('.run-detail__meta-item').filter({ hasText: '运行级 OOM' })
        await expect(runLevelMeta).toContainText('是')
    })

    test('结果缺失时详情显示结果缺失而非告警 0', async ({ page }) => {
        const run = makeRun({
            status: 'failed',
            summary: null,
            error: { code: 'execution_timeout', message: '执行超时' },
            runUrl: null,
        })
        await installRoutes(page, [run])

        await page.goto('/alerts')
        await waitForHydration(page)
        await page.locator('#view-mode').click()
        await page.locator('.caomei-select__content .caomei-select__item').filter({ hasText: '原始列表' }).click()
        const row = page.locator('.caomei-data-table__row').filter({ hasText: 'lodash' }).first()
        await expect(row).toBeVisible()
        await row.locator('button[aria-label="详情"]').click()
        const sidebar = page.locator('.caomei-drawer__content')
        await expect(sidebar).toContainText('12345678')
        await sidebar.locator('button[aria-label="详情"]').click()

        const detail = page.locator('.caomei-dialog__content')
        await expect(detail).toContainText('扫描详情')
        const alertsMeta = detail.locator('.run-detail__meta-item').filter({ hasText: '告警数' })
        await expect(alertsMeta).toContainText('结果缺失')
        await expect(alertsMeta).not.toContainText('0')
        // 构建版本缺失（旧数据 / 未注入）显示「未知」，不进入错误态
        await expect(detail.locator('.run-detail__meta-item').filter({ hasText: '构建版本' })).toContainText('未知')
    })

    test('容器执行不显示内部 Run URL', async ({ page }) => {
        const actionRun = makeRun()
        const containerRun = makeRun({
            id: 'abcdef12-34567890-qrstuvwx',
            executorKind: 'container',
            runUrl: null,
        })
        // per-alert 模型：sidebar 只显示 alert.runId 关联的 1 个 run（affectedRunIds 移除）；
        // 构造 alert.runId 指向 actionRun 验证 sidebar 拉取单个 run 详情
        await installRoutes(page, [actionRun, containerRun])

        await page.goto('/alerts')
        await waitForHydration(page)
        await page.locator('#view-mode').click()
        await page.locator('.caomei-select__content .caomei-select__item').filter({ hasText: '原始列表' }).click()
        const row = page.locator('.caomei-data-table__row').filter({ hasText: 'lodash' }).first()
        await expect(row).toBeVisible()
        await row.locator('button[aria-label="详情"]').click()

        const sidebar = page.locator('.caomei-drawer__content')
        // sidebar 仅显示 alert.runId 单 run 详情（每行 1 run）
        await expect(sidebar.locator('button[aria-label="详情"]')).toHaveCount(1)
        // 链接指向 actionRun.runUrl（mock alert.runId = affectedRunIds[0] = actionRun.id）
        await expect(sidebar.locator('a')).toHaveCount(1)
        await expect(sidebar.locator('a')).toHaveAttribute('href', String(actionRun.runUrl))
    })

    test('关闭侧栏后抽屉隐藏且可再次打开（hide 清理语义回归）', async ({ page }) => {
        const run = makeRun()
        await installRoutes(page, [run])

        await page.goto('/alerts')
        await waitForHydration(page)
        await page.locator('#view-mode').click()
        await page.locator('.caomei-select__content .caomei-select__item').filter({ hasText: '原始列表' }).click()
        const row = page.locator('.caomei-data-table__row').filter({ hasText: 'lodash' }).first()
        await expect(row).toBeVisible()

        await row.locator('button[aria-label="详情"]').click()
        const sidebar = page.locator('.caomei-drawer__content')
        await expect(sidebar).toBeVisible()

        // 关闭按钮走「drawer 内部关闭 → update:open → 父级置 false → 补发 hide → closeSidebar 清理」链路
        await sidebar.locator('.caomei-drawer__close').click()
        await expect(sidebar).toBeHidden()

        // 清理未破坏后续打开（sidebarAlert / sidebarRuns 已复位后重新赋值）
        await row.locator('button[aria-label="详情"]').click()
        await expect(sidebar).toBeVisible()
        await expect(sidebar).toContainText('12345678')
    })
})
