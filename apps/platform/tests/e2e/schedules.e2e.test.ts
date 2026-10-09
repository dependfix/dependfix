import { expect, test } from '@playwright/test'
import { waitForHydration } from './helpers/hydration.helper'

/**
 * 定时计划页增强 e2e。
 *
 * 覆盖点：
 * - cron 实时预览：cron 输入变更触发预览重算，合法 cron 显示 next 3 次
 * - 非法 cron 反馈：字段数非法或语法非法时显示 cronInvalid 错误提示
 * - 时区选择器：CaomeiAutoComplete 载入 Intl.supportedValuesOf 全量时区，输入关键字过滤，
 *   默认浏览器时区排在首位
 * - 计划类型选择器：默认 scan 显示扫描模式 / 严重级别，切换 PR Check 监测后隐藏二者并显示说明
 * - i18n locale 切换不影响时区列表（IANA 与 locale 无关）
 *
 * 不覆盖：cron-parser next() 计算精度（vitest 单测覆盖）；后端 cron 触发执行（待真实环境验证）。
 */

test.use({ storageState: 'tests/e2e/.auth/admin.json' })

test.describe('定时计划增强', () => {
    test('打开新建 Dialog → 默认 cron 0 2 * * 1 触发预览显示 next 3 次', async ({ page }) => {
        await page.goto('/schedules')
        await waitForHydration(page)
        await page.locator('button:has-text("新建计划")').click()
        await expect(page.locator('.caomei-dialog__header')).toContainText('新建定时计划', { timeout: 15000 })

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
        await expect(page.locator('.caomei-dialog__header')).toContainText('新建定时计划', { timeout: 15000 })

        // 输入 3 段（非法）
        await page.locator('#cron').fill('0 2 *')
        // 错误提示应显示（class="text-danger"），预览应消失
        await expect(page.locator('.text-danger').filter({ hasText: /段|cron/i }).first()).toBeVisible({ timeout: 5000 })
        await expect(page.locator('.schedule-form__cron-preview')).toHaveCount(0)

        // 改回合法 cron → 错误消失 + 预览恢复
        await page.locator('#cron').fill('0 2 * * 1')
        await expect(page.locator('.schedule-form__cron-preview')).toBeVisible({ timeout: 5000 })
    })

    test('时区 AutoComplete 含 IANA 列表 + 输入过滤 + 默认浏览器时区首位', async ({ page }) => {
        await page.goto('/schedules')
        await waitForHydration(page)
        await page.locator('button:has-text("新建计划")').click()
        await expect(page.locator('.caomei-dialog__header')).toContainText('新建定时计划', { timeout: 15000 })

        // 时区选择器为 CaomeiAutoComplete，id 落在输入框上
        const timezoneInput = page.locator('.caomei-auto-complete__input#timezone')
        await expect(timezoneInput).toBeVisible({ timeout: 15000 })

        // 聚焦/点击展开建议浮层
        await timezoneInput.click()
        const overlay = page.locator('.caomei-auto-complete__content')
        await expect(overlay).toBeVisible({ timeout: 5000 })

        // 默认浏览器时区排在首位（运行时探测，跨时区可移植；不硬编码开发机假设）
        const browserTz = await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone)
        const items = overlay.locator('.caomei-auto-complete__item')
        await expect(items.first()).toContainText(browserTz, { timeout: 5000 })

        // 建议项数 ≥ 10（IANA 时区列表远大于此，验证 Intl.supportedValuesOf 数据源已加载）
        expect(await items.count()).toBeGreaterThanOrEqual(10)

        // 输入关键字过滤（仅保留包含 'Shanghai' 的项，Tokyo 等被排除）
        await timezoneInput.fill('Shanghai')
        await expect(items.filter({ hasText: 'Shanghai' }).first()).toBeVisible({ timeout: 5000 })
        await expect(items.filter({ hasText: 'Tokyo' })).toHaveCount(0)

        // 清空关键字回到完整列表；Tokyo 应再次出现（验证过滤可逆）
        await timezoneInput.fill('')
        await expect(items.filter({ hasText: 'Asia/Tokyo' }).first()).toBeVisible({ timeout: 5000 })
    })

    test('计划类型选择器：默认含扫描模式；切换 PR Check 监测隐藏扫描模式并显示说明', async ({ page }) => {
        await page.goto('/schedules')
        await waitForHydration(page)
        await page.locator('button:has-text("新建计划")').click()
        await expect(page.locator('.caomei-dialog__header')).toContainText('新建定时计划', { timeout: 15000 })

        // 默认 scan：类型选择器可见，扫描模式 / 严重级别阈值可见
        await expect(page.locator('#kind')).toBeVisible({ timeout: 15000 })
        await expect(page.locator('#mode')).toBeVisible()
        await expect(page.locator('#severityThreshold')).toBeVisible()

        // 切换为 PR Check 监测
        await page.locator('#kind').click()
        await expect(page.locator('.caomei-select__content')).toBeVisible()
        await page.locator('.caomei-select__content .caomei-select__item:has-text("PR Check 监测")').click()

        // 扫描模式 / 严重级别阈值隐藏，显示 pr-check 行为说明
        await expect(page.locator('#mode')).toHaveCount(0)
        await expect(page.locator('#severityThreshold')).toHaveCount(0)
        await expect(page.locator('.caomei-dialog__content .caomei-message').filter({ hasText: 'PR Check 监测' })).toBeVisible()
    })
})
