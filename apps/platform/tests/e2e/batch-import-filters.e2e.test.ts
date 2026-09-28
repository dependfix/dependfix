import { expect, test } from '@playwright/test'
import { waitForHydration } from './helpers/hydration.helper'

/**
 * 批量导入对话框过滤 + 分页 + 默认凭据 + 缓存命中 e2e。
 *
 * 覆盖点：
 * - Dialog 渲染 + 默认关联凭据下拉 + 拉取用凭据下拉
 * - 默认不勾选仓库（回归：手滑防护）
 * - Dialog 默认不可拖动（回归：标题栏 mousedown 不移动弹窗）
 *
 * 不覆盖：服务端真实缓存命中（受 SSR+CSR 双层 fetch 影响，单测覆盖 hit/miss/expiry/fresh/in-flight）。
 * 不覆盖：fork/visibility/archived filter 真实数据收敛（需 > 100 仓库凭据，单测覆盖 cache+paginate）。
 * 不覆盖：第 4 维 archived/disabled 过滤控件渲染断言（过滤 UI 仅在 importableRepos.length > 0 时渲染，
 * 当前 e2e 场景无真实 GitHub 凭据/仓库；过滤谓词逻辑由 import-repos-filter.test.ts 单测覆盖，
 * 后端透传由 importable.get.test.ts 覆盖）。
 *
 * 不 mock GitHub API：e2e 走真实凭据（admin.json storageState）。
 */
test.use({ storageState: 'tests/e2e/.auth/admin.json' })

test.describe('批量导入对话框', () => {
    test('打开批量导入 → Dialog 渲染 + 默认关联凭据下拉可见 + 拉取用凭据下拉', async ({ page }) => {
        await page.goto('/repos')
        await waitForHydration(page)
        await expect(page.locator('.caomei-data-table')).toBeVisible({ timeout: 15000 })

        await page.locator('button:has-text("批量导入")').click()
        await expect(page.locator('.caomei-dialog__header')).toContainText('批量导入仓库', { timeout: 15000 })

        // 默认关联凭据下拉始终可见（Dialog 顶部独立字段）
        await expect(page.locator('#importDefaultCredential')).toBeVisible()
        await expect(page.locator('text=默认关联凭据')).toBeVisible()

        // 拉取用凭据下拉（语义分离）
        await expect(page.locator('#importCredential')).toBeVisible()

        // 关闭按钮可见
        await expect(page.locator('.caomei-dialog__content button:has-text("取消")')).toBeVisible()

        // 测试场景无真实 GitHub 凭据 / 仓库，过滤 UI / Paginator 仅在 importableRepos.length > 0 时渲染
        // 该路径走单测覆盖（importable.get.test.ts + repos-cache.test.ts）；
        // UI 渲染验证留给人工 / UI validator。
        const noRepos = page.locator('text=请先选择 GitHub 凭据')
        await expect(noRepos).toBeVisible({ timeout: 10000 })
    })

    test('批量导入对话框默认不勾选仓库（回归：手滑防护）', async ({ page }) => {
        await page.goto('/repos')
        await waitForHydration(page)
        await page.locator('button:has-text("批量导入")').click()
        await expect(page.locator('.caomei-dialog__header')).toContainText('批量导入仓库', { timeout: 15000 })

        const dialog = page.locator('.caomei-dialog__content')
        // Dialog 内不应存在任何已勾选 checkbox（默认全空——手滑防护回归）
        await expect(dialog.locator('button.caomei-checkbox__control[data-state="checked"]')).toHaveCount(0)

        // 全选控件仅在「有可导入仓库」时渲染（e2e 无真实 GitHub 凭据 → 通常走空态分支）。
        // 两条分支都必须给出实质断言：有候选时全选默认未勾选且可点击翻转为选中；无候选时明确处于空态。
        const selectAll = dialog.locator('.import-form__meta button.caomei-checkbox__control')
        if (await selectAll.count()) {
            await expect(selectAll).toHaveAttribute('data-state', 'unchecked')
            await selectAll.click()
            await expect(selectAll).toHaveAttribute('data-state', 'checked')
        } else {
            await expect(dialog.locator('text=请先选择 GitHub 凭据')).toBeVisible({ timeout: 10000 })
        }
    })

    test('Dialog 默认不可拖动（回归：标题栏 mousedown 不移动弹窗）', async ({ page }) => {
        await page.goto('/repos')
        await waitForHydration(page)
        await page.locator('button:has-text("批量导入")').click()
        await expect(page.locator('.caomei-dialog__header')).toContainText('批量导入仓库', { timeout: 15000 })

        // caomei Dialog 不提供拖拽能力：在标题栏按下并移动鼠标后，内容盒位置必须保持不变
        const content = page.locator('.caomei-dialog__content')
        await expect(content).toBeVisible()
        const before = await content.boundingBox()
        expect(before).not.toBeNull()
        const header = page.locator('.caomei-dialog__header')
        const headerBox = await header.boundingBox()
        expect(headerBox).not.toBeNull()
        if (before && headerBox) {
            await page.mouse.move(headerBox.x + headerBox.width / 2, headerBox.y + headerBox.height / 2)
            await page.mouse.down()
            await page.mouse.move(headerBox.x + headerBox.width / 2 + 120, headerBox.y + headerBox.height / 2 + 80, { steps: 10 })
            await page.mouse.up()
        }
        const after = await content.boundingBox()
        expect(after).toEqual(before)
    })
})
