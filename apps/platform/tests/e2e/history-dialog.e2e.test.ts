import { expect, test } from '@playwright/test'
import { waitForHydration } from './helpers/hydration.helper'

/**
 * 扫描历史 Dialog（应用层修复 c51）
 * - 点 repo 行 pi-history 按钮 → url 跳到 /repos?history={id} + Dialog 打开
 * - Dialog 列表展示该仓库 runs（至少一条同步模式无 token → failed）
 * - 详情按钮 Dialog 内打开 scan results
 * - 关闭 Dialog → url 移除 ?history
 *
 * 详情视图 X 按钮语义修复：详情模式下 Dialog :closable=false（X 不渲染 + ESC 不响应），
 * 用户只能通过"返回列表"按钮回到列表，避免误触关闭整个 Dialog。
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

        // C57：详情视图加"返回列表"按钮（顶导）— 断言按钮可见 + 点击回到列表（不重 fetch）
        const backToListBtn = page.locator('.p-dialog button[aria-label="返回列表"]')
        await expect(backToListBtn).toBeVisible({ timeout: 5000 })
        await backToListBtn.click()

        // 列表再次可见（runs 表格恢复，无重新 fetch 视觉迹象——runs value 在组件状态中保留）
        await expect(page.locator('.p-dialog .p-datatable tbody tr').first()).toBeVisible({ timeout: 5000 })

        // 关闭 Dialog（点 X）
        await page.locator('.p-dialog-close-button').click()

        // 等待 url 移除 ?history
        await page.waitForURL((u) => !u.searchParams.has('history'), { timeout: 15000 })
        await expect(page.locator('.p-dialog')).not.toBeVisible({ timeout: 15000 })
    })

    test('详情视图 X 按钮不渲染 + "返回列表" 按钮可点击回退', async ({ page }) => {
        await page.goto('/repos')
        await waitForHydration(page)
        const cookieHeader = (await page.context().cookies()).map((c) => `${c.name}=${c.value}`).join('; ')

        const stamp = Date.now()
        const owner = `e2e-history-x-${stamp}`
        const name = `e2e-history-x-repo-${stamp}`

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
        const targetRow = page.locator('.p-datatable tbody tr').filter({ hasText: owner }).first()
        await expect(targetRow).toBeVisible({ timeout: 15000 })

        // 打开历史 Dialog
        await targetRow.locator('button[aria-label="扫描历史"]').click()
        await expect(page.locator('.p-dialog')).toBeVisible({ timeout: 15000 })
        await expect(page.locator('.p-dialog .p-datatable tbody tr').first()).toBeVisible({ timeout: 15000 })

        // 进入详情视图
        await page.locator('.p-dialog button[aria-label="查看详情"]').first().click()

        // 详情视图：X 按钮不应渲染（:closable=false）
        await expect(page.locator('.p-dialog-close-button')).toHaveCount(0)

        // 详情视图："返回列表" 按钮可见 + 可点击回到列表
        const backToListBtn = page.locator('.p-dialog button[aria-label="返回列表"]')
        await expect(backToListBtn).toBeVisible({ timeout: 5000 })
        await backToListBtn.click()

        // 列表视图：X 按钮恢复渲染
        await expect(page.locator('.p-dialog-close-button')).toHaveCount(1, { timeout: 5000 })

        // 列表视图：点击 X 关闭整个 Dialog
        await page.locator('.p-dialog-close-button').click()
        await page.waitForURL((u) => !u.searchParams.has('history'), { timeout: 15000 })
        await expect(page.locator('.p-dialog')).not.toBeVisible({ timeout: 15000 })
    })
})
