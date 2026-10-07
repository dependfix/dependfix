import { test, expect } from '@playwright/test'
import { waitForHydration } from './helpers/hydration.helper'

/**
 * 单仓库扫描配置 Dialog e2e（补全 mode/severity 选择入口）。
 * 关键路径：点击 pi-play → Dialog 可见 → 选 mode/severity → 提交 → POST /api/repos/[id]/scan body 携带所选参数。
 * mock POST scan 避免真实容器执行；mock 返回 sync 模式 completed 响应让 Dialog 关闭并显示结果。
 */
test.use({ storageState: 'tests/e2e/.auth/admin.json' })

test.describe('单仓库扫描配置 Dialog', () => {
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
        await expect(page.locator('.caomei-data-table')).toBeVisible({ timeout: 15000 })
        const row = page.locator('.caomei-data-table__row').filter({ hasText: owner })
        await expect(row).toBeVisible({ timeout: 15000 })

        // 3) 点击 pi-play → 打开单仓库扫描配置 Dialog
        await row.locator('button[title="触发扫描"]').click()
        // Dialog 渲染（不强求 owner/name 完全匹配文本格式，仅断言 Dialog 出现）
        await expect(page.locator('.caomei-dialog__header')).toBeVisible({ timeout: 15000 })
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
        await expect(page.locator('.caomei-data-table')).toBeVisible({ timeout: 15000 })
        const row = page.locator('.caomei-data-table__row').filter({ hasText: owner })
        await expect(row).toBeVisible({ timeout: 15000 })

        // 点击 pi-play → 打开 Dialog
        await row.locator('button[title="触发扫描"]').click()
        await expect(page.locator('.caomei-dialog__header')).toBeVisible({ timeout: 15000 })

        // 选 mode=fix-and-pr（点击 Select 打开下拉 → 选项）
        await page.locator('#scanConfigMode').click()
        await page.locator('.caomei-select__content .caomei-select__item:has-text("修复并建 PR")').click()
        // 选 severity=all
        await page.locator('#scanConfigSeverity').click()
        await page.locator('.caomei-select__content .caomei-select__item:has-text("全部")').click()

        // 点击开始扫描 → 触发 POST /api/repos/[id]/scan → Dialog 关闭
        await page.locator('.scan-config-form button:has-text("开始扫描")').click()
        await expect(page.locator('.caomei-dialog__header')).not.toBeVisible({ timeout: 15000 })

        // 验证 mock 捕获的 body 含 fix-and-pr 和 all
        expect(capturedBody).not.toBeNull()
        expect((capturedBody as { mode: string }).mode).toBe('fix-and-pr')
        expect((capturedBody as { severityThreshold: string }).severityThreshold).toBe('all')
    })

    /**
     * 设备级扫描偏好（localStorage）：记住上次选择（重开 + 刷新生效）→ 设置页重置 → 恢复系统兜底。
     * 覆盖「显式默认 > 上次选择 > 硬编码兜底」中的「上次选择」与「兜底」两级（显式默认由设置页用例覆盖）。
     */
    test('扫描偏好：记住上次选择（重开 + 刷新生效），设置页重置后恢复兜底', async ({ page }) => {
        const stamp = Date.now()
        const owner = `e2e-scan-pref-${stamp}`
        const name = `repo-${stamp}`

        const cookieHeader = (await page.context().cookies())
            .map((c) => `${c.name}=${c.value}`)
            .join('; ')
        const createRes = await page.request.post('/api/repos', {
            headers: { cookie: cookieHeader },
            data: { owner, name, defaultBranch: 'main', packageManager: 'pnpm', executorKind: 'container' },
        })
        expect(createRes.status()).toBe(200)

        // mock POST scan：避免真实容器执行
        await page.route('**/api/repos/*/scan', async (route) => {
            if (route.request().method() !== 'POST') {
                return route.fallback()
            }
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    id: `mock-run-${stamp}`,
                    repositoryId: 'mock',
                    mode: 'fix-and-pr',
                    severityThreshold: 'all',
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

        const openScanConfig = async () => {
            await page.goto(`/repos?_=${stamp}`)
            await waitForHydration(page)
            const row = page.locator('.caomei-data-table__row').filter({ hasText: owner })
            await expect(row).toBeVisible({ timeout: 15000 })
            await row.locator('button[title="触发扫描"]').click()
            await expect(page.locator('.caomei-dialog__header')).toBeVisible({ timeout: 15000 })
        }

        // 1) 无偏好 → 系统兜底（仅报告 / High）
        await openScanConfig()
        await expect(page.locator('#scanConfigMode')).toContainText('仅报告')
        await expect(page.locator('#scanConfigSeverity')).toContainText('High')

        // 2) 选 fix-and-pr + all 并提交（记录「上次选择」）
        await page.locator('#scanConfigMode').click()
        await page.locator('.caomei-select__content .caomei-select__item:has-text("修复并建 PR")').click()
        await page.locator('#scanConfigSeverity').click()
        await page.locator('.caomei-select__content .caomei-select__item:has-text("全部")').click()
        await page.locator('.scan-config-form button:has-text("开始扫描")').click()
        await expect(page.locator('.caomei-dialog__header')).not.toBeVisible({ timeout: 15000 })

        // 3) 同页重开（不刷新）：打开 → 记住上次选择 → 取消关闭 → 再打开 → 仍记住
        const rowTrigger = () => page.locator('.caomei-data-table__row').filter({ hasText: owner }).locator('button[title="触发扫描"]')
        await rowTrigger().click()
        await expect(page.locator('.caomei-dialog__header')).toBeVisible({ timeout: 15000 })
        await expect(page.locator('#scanConfigMode')).toContainText('修复并建 PR')
        await expect(page.locator('#scanConfigSeverity')).toContainText('全部')
        await page.locator('.scan-config-form button:has-text("取消")').click()
        await expect(page.locator('.caomei-dialog__header')).not.toBeVisible({ timeout: 15000 })
        await rowTrigger().click()
        await expect(page.locator('.caomei-dialog__header')).toBeVisible({ timeout: 15000 })
        await expect(page.locator('#scanConfigMode')).toContainText('修复并建 PR')
        await expect(page.locator('#scanConfigSeverity')).toContainText('全部')

        // 4) 刷新页面 → 仍记住（localStorage 持久化）
        await openScanConfig()
        await expect(page.locator('#scanConfigMode')).toContainText('修复并建 PR')
        await expect(page.locator('#scanConfigSeverity')).toContainText('全部')

        // 5) 批量扫描弹窗共享同一偏好（单仓库 + 批量同源解析）
        await page.goto(`/repos?_=${stamp}`)
        await waitForHydration(page)
        const prefRow = page.locator('.caomei-data-table__row').filter({ hasText: owner })
        await expect(prefRow).toBeVisible({ timeout: 15000 })
        await prefRow.locator('.caomei-checkbox__control').click()
        await page.locator('button:has-text("批量扫描")').click()
        await expect(page.locator('#batchMode')).toContainText('修复并建 PR')
        await expect(page.locator('#batchSeverity')).toContainText('全部')

        // 6) 设置页重置 → 恢复系统兜底
        await page.goto('/settings')
        await waitForHydration(page)
        await page.getByRole('button', { name: '重置扫描偏好' }).click()
        await expect(page.getByText('已重置扫描偏好').first()).toBeVisible({ timeout: 15000 })

        await openScanConfig()
        await expect(page.locator('#scanConfigMode')).toContainText('仅报告')
        await expect(page.locator('#scanConfigSeverity')).toContainText('High')
    })

    /**
     * 设置页「显式默认」路径（优先级最高 + 哨兵可清除）：
     * 显式默认 > 上次选择 > 系统兜底；设置页选「未设置」即清除显式默认。
     */
    test('扫描偏好：设置页显式默认优先于上次选择，「未设置」可清除', async ({ page }) => {
        const stamp = Date.now()
        const owner = `e2e-scan-pref-default-${stamp}`
        const name = `repo-${stamp}`

        const cookieHeader = (await page.context().cookies())
            .map((c) => `${c.name}=${c.value}`)
            .join('; ')
        const createRes = await page.request.post('/api/repos', {
            headers: { cookie: cookieHeader },
            data: { owner, name, defaultBranch: 'main', packageManager: 'pnpm', executorKind: 'container' },
        })
        expect(createRes.status()).toBe(200)

        await page.route('**/api/repos/*/scan', async (route) => {
            if (route.request().method() !== 'POST') {
                return route.fallback()
            }
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    id: `mock-run-${stamp}`,
                    repositoryId: 'mock',
                    mode: 'report-only',
                    severityThreshold: 'high',
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

        const openScanConfig = async () => {
            await page.goto(`/repos?_=${stamp}`)
            await waitForHydration(page)
            const row = page.locator('.caomei-data-table__row').filter({ hasText: owner })
            await expect(row).toBeVisible({ timeout: 15000 })
            await row.locator('button[title="触发扫描"]').click()
            await expect(page.locator('.caomei-dialog__header')).toBeVisible({ timeout: 15000 })
        }
        const selectOption = async (triggerId: string, label: string | RegExp) => {
            await page.locator(triggerId).click()
            await page.locator('.caomei-select__content .caomei-select__item').filter({ hasText: label }).first().click()
        }

        // 1) 设置页显式默认 = 修复（「修复」不能被「修复并建 PR」误命中）
        await page.goto('/settings')
        await waitForHydration(page)
        await selectOption('#scanDefaultMode', /^\s*修复\s*$/)
        // 生效口径提示：显式默认
        await expect(page.getByText('当前生效：').first()).toContainText('显式默认')

        // 2) 无上次选择时，弹窗默认 = 显式默认
        await openScanConfig()
        await expect(page.locator('#scanConfigMode')).toContainText('修复')
        await expect(page.locator('#scanConfigSeverity')).toContainText('High')

        // 3) 用「仅报告」提交一次（写入上次选择）→ 显式默认仍应胜出
        await selectOption('#scanConfigMode', /^\s*仅报告\s*$/)
        await page.locator('.scan-config-form button:has-text("开始扫描")').click()
        await expect(page.locator('.caomei-dialog__header')).not.toBeVisible({ timeout: 15000 })

        await openScanConfig()
        await expect(page.locator('#scanConfigMode')).toContainText('修复')

        // 4) 设置页选「未设置」清除显式默认 → 回落到上次选择（仅报告）
        await page.goto('/settings')
        await waitForHydration(page)
        await selectOption('#scanDefaultMode', '未设置')
        await expect(page.getByText('当前生效：').first()).toContainText('上次选择')

        await openScanConfig()
        await expect(page.locator('#scanConfigMode')).toContainText('仅报告')
    })
})
