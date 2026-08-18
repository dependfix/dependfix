import { expect, test } from '@playwright/test'
import { waitForHydration } from './helpers/hydration.helper'

/**
 * 扫描历史 Dialog（应用层修复 c51）
 * - 点 repo 行 pi-history 按钮 → url 跳到 /repos?history={id} + Dialog 打开
 * - Dialog 列表展示该仓库 runs（至少一条同步模式无 token → failed）
 * - 详情按钮 Dialog 内打开 scan results
 * - 关闭 Dialog → url 移除 ?history
 */
test.use({ storageState: 'tests/e2e/.auth/admin.json' })

test.describe('扫描历史 Dialog（应用层修复）', () => {
    test('点 pi-history → Dialog 打开，列表与详情完整', async ({ page }) => {
        await page.goto('/repos')
        await waitForHydration(page)
        const cookieHeader = (await page.context().cookies()).map((c) => `${c.name}=${c.value}`).join('; ')

        const stamp = Date.now()
        const owner = `e2e-history-${stamp}`
        const name = `e2e-history-repo-${stamp}`

        // 创建仓库
        const created = await page.request.post('/api/repos', {
            headers: { cookie: cookieHeader },
            data: { owner, name, defaultBranch: 'main', packageManager: 'pnpm', executorKind: 'container' },
        })
        expect(created.status()).toBe(200)
        const { id: repoId } = (await created.json()) as { id: string }

        // 触发一次扫描（sync 模式无 token → 快速失败 + 创建 ScanRun record）
        await page.request.post(`/api/repos/${repoId}/scan`, {
            headers: { cookie: cookieHeader },
            data: { mode: 'report-only', severityThreshold: 'high' },
        })

        // 重新进入仓库页（确保新仓库可见）
        await page.goto(`/repos?r=${stamp}`)
        await waitForHydration(page)
        await expect(page.locator('.p-datatable tbody tr').first()).toBeVisible({ timeout: 15000 })

        // 定位目标行
        const targetRow = page.locator('.p-datatable tbody tr').filter({ hasText: owner }).first()
        await expect(targetRow).toBeVisible({ timeout: 15000 })

        // 点击 pi-history 按钮（aria-label "扫描历史"）
        await targetRow.locator('button[aria-label="扫描历史"]').click()

        // url 应改为 /repos?history={repoId}（不再跳 /repos/{id}/runs 子路由）
        await page.waitForURL(new RegExp(`/repos\\?history=${repoId}`), { timeout: 15000 })
        // Dialog 可见
        await expect(page.locator('.p-dialog')).toBeVisible({ timeout: 15000 })
        await expect(page.locator('.p-dialog-header')).toContainText('扫描历史')

        // 列表可见（sync 扫描一定创建 ScanRun record）
        await expect(page.locator('.p-dialog .p-datatable tbody tr').first()).toBeVisible({ timeout: 15000 })

        // 点击详情按钮（aria-label "查看详情"）
        await page.locator('.p-dialog button[aria-label="查看详情"]').first().click()

        // 详情加载（可空 results，但不能 error 占位）
        await expect(page.locator('.p-dialog-error, .p-message-error')).toHaveCount(0, { timeout: 15000 })

        // 关闭 Dialog（点 X）
        await page.locator('.p-dialog-close-button').click()

        // 等待 url 移除 ?history
        await page.waitForURL((u) => !u.searchParams.has('history'), { timeout: 15000 })
        await expect(page.locator('.p-dialog')).not.toBeVisible({ timeout: 15000 })
    })
})
