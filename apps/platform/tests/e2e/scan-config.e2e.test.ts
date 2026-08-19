import { test, expect } from '@playwright/test'
import { waitForHydration } from './helpers/hydration.helper'

/**
 * 单仓库扫描配置 Dialog e2e（见 docs/plan/todo.md §PR2 C52：补全 mode/severity 选择入口）。
 * 关键路径：点击 pi-play → Dialog 可见 → 选 mode/severity → 提交 → POST /api/repos/[id]/scan body 携带所选参数。
 * mock POST scan 避免真实容器执行；mock 返回 sync 模式 completed 响应让 Dialog 关闭并显示结果。
 */
test.use({ storageState: 'tests/e2e/.auth/admin.json' })

test.describe('单仓库扫描配置 Dialog（见 docs/plan/todo.md §PR2 C52）', () => {
    test('单仓库 pi-play 触发 → Dialog 渲染（含目标仓库信息 + 模式/严重级别下拉）', async ({ page }) => {
        page.on('console', (msg) => {
            if (msg.type() === 'error') {
                console.log(`[browser error]`, msg.text())
            }
        })

        const stamp = Date.now()
        const owner = `e2e-scan-cfg-${stamp}`
        const name = `repo-${stamp}`

        // 1) 创建容器模式仓库
        const cookieHeader = (await page.context().cookies())
            .map((c) => `${c.name}=${c.value}`)
            .join('; ')
        const createRes = await page.request.post('/api/repos', {
            headers: { cookie: cookieHeader },
            data: {
                owner,
                name,
                defaultBranch: 'main',
                packageManager: 'pnpm',
                executorKind: 'container',
            },
        })
        expect(createRes.status()).toBe(200)

        // 2) 进入 repos 页 + 找到新仓库行
        await page.goto(`/repos?_=${stamp}`)
        await waitForHydration(page)
        await expect(page.locator('.p-datatable')).toBeVisible({ timeout: 15000 })
        const row = page.locator('.p-datatable-tbody tr').filter({ hasText: owner })
        await expect(row).toBeVisible({ timeout: 15000 })

        // 3) 点击 pi-play → 打开单仓库扫描配置 Dialog
        await row.locator('button[title="触发扫描"]').click()
        // Dialog 渲染（不强求 owner/name 完全匹配文本格式，仅断言 Dialog 出现）
        await expect(page.locator('.p-dialog-header')).toBeVisible({ timeout: 15000 })
        // 目标仓库信息可见（owner）
        await expect(page.locator('.scan-config-form__repo')).toContainText(owner)
        // 模式 + 严重级别 Select 可见
        await expect(page.locator('#scanConfigMode')).toBeVisible()
        await expect(page.locator('#scanConfigSeverity')).toBeVisible()
        // 开始扫描按钮可见
        await expect(page.locator('.scan-config-form button:has-text("开始扫描")')).toBeVisible()
    })

    test('单仓库扫描配置 Dialog 提交后 POST body 携带所选 mode/severity（mock）', async ({ page }) => {
        const stamp = Date.now()
        const owner = `e2e-scan-cfg-submit-${stamp}`
        const name = `repo-${stamp}`

        // 创建仓库
        const cookieHeader = (await page.context().cookies())
            .map((c) => `${c.name}=${c.value}`)
            .join('; ')
        const createRes = await page.request.post('/api/repos', {
            headers: { cookie: cookieHeader },
            data: {
                owner,
                name,
                defaultBranch: 'main',
                packageManager: 'pnpm',
                executorKind: 'container',
            },
        })
        expect(createRes.status()).toBe(200)

        // mock POST /api/repos/[id]/scan：捕获 body，返回 sync 模式 completed
        let capturedBody: unknown = null
        await page.route('**/api/repos/*/scan', async (route) => {
            if (route.request().method() !== 'POST') {
                return route.fallback()
            }
            capturedBody = route.request().postDataJSON()
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    id: `mock-run-${stamp}`,
                    repositoryId: 'mock',
                    mode: (capturedBody as { mode: string } | null)?.mode ?? 'report-only',
                    severityThreshold: (capturedBody as { severityThreshold: string } | null)?.severityThreshold ?? 'high',
                    executorKind: 'container',
                    status: 'completed',
                    startedAt: new Date().toISOString(),
                    finishedAt: new Date().toISOString(),
                    runUrl: null,
                    summary: null,
                    error: null,
                }),
            })
        })

        // 进入 repos 页 + 找到新仓库行
        await page.goto(`/repos?_=${stamp}`)
        await waitForHydration(page)
        await expect(page.locator('.p-datatable')).toBeVisible({ timeout: 15000 })
        const row = page.locator('.p-datatable-tbody tr').filter({ hasText: owner })
        await expect(row).toBeVisible({ timeout: 15000 })

        // 点击 pi-play → 打开 Dialog
        await row.locator('button[title="触发扫描"]').click()
        await expect(page.locator('.p-dialog-header')).toBeVisible({ timeout: 15000 })

        // 选 mode=fix-and-pr（点击 Select 打开下拉 → 选项）
        await page.locator('#scanConfigMode').click()
        await page.locator('.p-select-option:has-text("修复并建 PR")').click()
        // 选 severity=all
        await page.locator('#scanConfigSeverity').click()
        await page.locator('.p-select-option:has-text("全部")').click()

        // 点击开始扫描 → 触发 POST /api/repos/[id]/scan → Dialog 关闭
        await page.locator('.scan-config-form button:has-text("开始扫描")').click()
        await expect(page.locator('.p-dialog-header')).not.toBeVisible({ timeout: 15000 })

        // 验证 mock 捕获的 body 含 fix-and-pr 和 all
        expect(capturedBody).not.toBeNull()
        expect((capturedBody as { mode: string }).mode).toBe('fix-and-pr')
        expect((capturedBody as { severityThreshold: string }).severityThreshold).toBe('all')
    })
})
