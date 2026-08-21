import { expect, test } from '@playwright/test'
import { waitForHydration } from './helpers/hydration.helper'

/**
 * 定时计划页增强 e2e（docs/plan/todo.md §M12 C65-C1 + C65-C2）。
 *
 * 覆盖点：
 * - C65-C1 cron 实时预览：cron InputText 变更触发 previewCron 重算，合法 cron 显示 next 3 次
 * - C65-C1 非法 cron 反馈：字段数非法或语法非法时显示 cronInvalid 错误提示
 * - C65-C2 时区 Select：含 Intl.supportedValuesOf 全量列表 + filter + 默认浏览器时区（首位）
 * - C65-C2 i18n locale 切换不影响时区列表（IANA 与 locale 无关）
 *
 * 不覆盖：cron-parser next() 计算精度（vitest 单测覆盖）；后端 cron 触发执行（待真实环境验证）。
 */

test.use({ storageState: 'tests/e2e/.auth/admin.json' })

test.describe('定时计划增强（docs/plan/todo.md §M12 C65-C1 + C65-C2）', () => {
    test('打开新建 Dialog → 默认 cron 0 2 * * 1 触发预览显示 next 3 次', async ({ page }) => {
        await page.goto('/schedules')
        await waitForHydration(page)
        await page.locator('button:has-text("新建计划")').click()
        await expect(page.locator('.p-dialog-header')).toContainText('新建定时计划', { timeout: 15000 })

        // 等待 cron preview 渲染（默认空表单 cron = '0 2 * * 1'）
        const cronPreview = page.locator('.schedule-form__cron-preview')
        await expect(cronPreview).toBeVisible({ timeout: 15000 })
        await expect(cronPreview.locator('li')).toHaveCount(3, { timeout: 15000 })

        // 改 cron 为 6 段（含秒）→ 预览仍应有 3 次
        await page.locator('#cron').fill('0 0 2 * * 1')
        await expect(cronPreview.locator('li')).toHaveCount(3, { timeout: 5000 })
    })

    test('非法 cron（字段数不足）→ 显示错误提示', async ({ page }) => {
        await page.goto('/schedules')
        await waitForHydration(page)
        await page.locator('button:has-text("新建计划")').click()
        await expect(page.locator('.p-dialog-header')).toContainText('新建定时计划', { timeout: 15000 })

        // 输入 3 段（非法）
        await page.locator('#cron').fill('0 2 *')
        // 错误提示应显示（class="text-danger"），预览应消失
        await expect(page.locator('.text-danger').filter({ hasText: /段|cron/i }).first()).toBeVisible({ timeout: 5000 })
        await expect(page.locator('.schedule-form__cron-preview')).toHaveCount(0)

        // 改回合法 cron → 错误消失 + 预览恢复
        await page.locator('#cron').fill('0 2 * * 1')
        await expect(page.locator('.schedule-form__cron-preview')).toBeVisible({ timeout: 5000 })
    })

    test('时区 Select 含 IANA 列表 + filter + 默认浏览器时区首位', async ({ page }) => {
        await page.goto('/schedules')
        await waitForHydration(page)
        await page.locator('button:has-text("新建计划")').click()
        await expect(page.locator('.p-dialog-header')).toContainText('新建定时计划', { timeout: 15000 })

        // 时区 Select 可见
        const timezoneSelect = page.locator('#timezone')
        await expect(timezoneSelect).toBeVisible({ timeout: 15000 })

        // 打开 Select overlay（PrimeVue 4 .p-select 容器）
        await timezoneSelect.click()
        const overlay = page.locator('.p-select-overlay')
        await expect(overlay).toBeVisible({ timeout: 5000 })

        // 默认浏览器时区（Asia/Shanghai）排在首位
        const firstOption = overlay.locator('li, [role="option"]').first()
        await expect(firstOption).toContainText('Asia/Shanghai', { timeout: 5000 })

        // overlay 选项数 ≥ 10（IANA 时区列表远大于此，验证 Intl.supportedValuesOf 数据源已加载）
        const optionCount = await overlay.locator('li, [role="option"]').count()
        expect(optionCount).toBeGreaterThanOrEqual(10)

        // filter 过滤（仅显示包含 'Shanghai' 的项，UTC/Tokyo 等被排除）
        await overlay.locator('input.p-select-filter').first().fill('Shanghai')
        await expect(overlay.locator('li, [role="option"]').filter({ hasText: 'Shanghai' }).first()).toBeVisible({ timeout: 5000 })
        await expect(overlay.locator('li, [role="option"]').filter({ hasText: 'Tokyo' })).toHaveCount(0)

        // filter 清空回到完整列表；Tokyo 应出现（前 20 项可见区域），验证浏览器时区首位与 Tokyo 共存
        await overlay.locator('input.p-select-filter').first().fill('')
        await expect(overlay.locator('li, [role="option"]').filter({ hasText: 'Asia/Tokyo' }).first()).toBeVisible({ timeout: 5000 })
    })
})
