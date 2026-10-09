import { expect, type Page, test } from '@playwright/test'
import { waitForHydration } from '../e2e/helpers/hydration.helper'
import { VISUAL_FIXTURES } from './helpers/fixtures'
import {
    VISUAL_THEMES,
    applyTheme,
    dynamicMask,
    expectLocatorScreenshot,
    expectPageScreenshot,
    expectThemeApplied,
    waitForVisualStable,
} from './helpers/visual'

/**
 * apps/platform 视觉回归最小集（docs/plan/todo.md §M32.5）。
 *
 * 目的：组件库版本升级 / 主题 token 变更 / 关键页样式改动导致的**非预期视觉漂移**可被自动检出，
 * 不再依赖一次性人工判读。数据由 `tests/visual/global-setup.ts` 注入的确定性 fixtures 提供
 * （独立 SQLite 库 + 固定时间戳，见 helpers/fixtures.ts）。
 *
 * 覆盖：亮色 5 张（alerts / repos / pr-checks / dialog-import-repos / login）+
 * 暗色 2 张（alerts / repos）。基线快照入仓库（`tests/visual/__screenshots__/`）。
 *
 * 不做的：不做全量页面 × 多浏览器 × 多 viewport 矩阵；不替代 ui-validator 的交互 /
 * 可用性审查；不为让用例变绿而放宽阈值或用 mask 掩盖真实差异。
 */

/** 打开 alerts 页并施加「分组 + 多列排序」状态：默认严重级别降序，再叠加出现次数升序。 */
async function openAlerts(page: Page): Promise<void> {
    await page.goto('/alerts')
    await waitForHydration(page)
    const table = page.locator('.caomei-data-table')
    await expect(table).toBeVisible({ timeout: 15000 })

    const severityHeader = page.locator('.caomei-data-table th:has-text("严重级别")').first()
    const occurrenceHeader = page.locator('.caomei-data-table th:has-text("出现次数")').first()
    // 默认排序契约：严重级别降序（alerts.vue 的 multiSortMeta 初值）
    await expect(severityHeader).toHaveAttribute('aria-sort', 'descending')
    // 追加次排序键：caomei 的 `sort-mode="multiple"` 下只有带修饰键的点击才并入排序数组
    // （data-table 源码 `toggleSorting(void 0, event.metaKey || event.ctrlKey)`），
    // 裸点击会替换整组排序 → 用例意图是「多列排序」故用 ControlOrMeta
    await occurrenceHeader.locator('.caomei-data-table__sort').click({ modifiers: ['ControlOrMeta'] })
    await expect(occurrenceHeader).toHaveAttribute('aria-sort', 'ascending', { timeout: 5000 })
    await expect(severityHeader).toHaveAttribute('aria-sort', 'descending')
    // 两列均参与排序 → 表头渲染排序优先级角标（1 / 2）
    await expect(page.locator('.caomei-data-table__sort-index')).toHaveCount(2)

    // 展开全部分组，让 5 个分组下的 9 行明细（severity / source / 状态 / 时间列）进入基线。
    // 逐次点击「尚未展开」的第一个分组开关：展开会插入行，固定下标会错位。
    for (let guard = 0; guard < 10; guard++) {
        const collapsed = page.locator('.caomei-data-table__row-group-toggle[aria-expanded="false"]').first()
        if ((await collapsed.count()) === 0) {
            break
        }
        await collapsed.click()
    }
    await expect(table.locator('tbody .caomei-data-table__row')).toHaveCount(VISUAL_FIXTURES.scanResults.length)

    await waitForVisualStable(page)
}

/** 打开 repos 页并勾选首行：覆盖受控行选择（selected 态）与标签列渲染。 */
async function openRepos(page: Page): Promise<void> {
    await page.goto('/repos')
    await waitForHydration(page)
    const table = page.locator('.caomei-data-table')
    await expect(table).toBeVisible({ timeout: 15000 })
    // 分组与标签均由 fixtures 提供；标签列须可见（否则基线失去该列意义）
    await expect(table).toContainText('frontend')

    await table.locator('tbody .caomei-checkbox__control').first().click()
    await expect(table.locator('tbody .caomei-data-table__row--selected').first()).toBeVisible()

    await waitForVisualStable(page)
}

test.describe('平台页面视觉基线', () => {
    for (const theme of VISUAL_THEMES) {
        test(`alerts 分组与多列排序（${theme}）`, async ({ page }) => {
            await applyTheme(page, theme)
            await openAlerts(page)
            await expectThemeApplied(page, theme)
            await expectPageScreenshot(page, `alerts-${theme}.png`)

            /* 宽表右端列补拍：1440 视口下表格容器横向溢出（实测 clientWidth 1166 < scrollWidth 1318），
               上面那张整页基线只覆盖到可视区左端 → 最右「链接」「详情」两列在画面之外，回归不会被捕获。
               此处把容器内部滚到最右再对容器补拍一张元素级基线。
               与「固定环境口径」的关系：不动 viewport / 阈值 / 重试 / 表格列宽，只改**容器内部滚动位置**；
               滚动量取 `scrollWidth - clientWidth`（最大值）→ 跨机器确定；容器高度随行数变化，
               故补拍仍以固定 fixtures 数据为前提（与整页基线同一数据集）。 */
            const table = page.locator('.caomei-data-table')
            /* 前提断言：宽表确实溢出（否则本补拍失去意义，显式失败而非静默通过） */
            const overflow = await table.evaluate((el: HTMLElement) => el.scrollWidth - el.clientWidth)
            expect(overflow).toBeGreaterThan(0)
            await table.evaluate((el: HTMLElement) => {
                el.scrollLeft = el.scrollWidth
            })
            /* 滚动必须到达最右端（不是「发生了滚动」）：取 `scrollWidth - clientWidth` 作为期望值，
               若未来出现平滑滚动 / 内容变化导致中途停住，此断言失败而非截到半途。 */
            await expect.poll(async () => table.evaluate((el: HTMLElement) => el.scrollLeft)).toBe(overflow)
            await expectLocatorScreenshot(table, `alerts-right-${theme}.png`, dynamicMask(page))
        })

        test(`repos 行选择与标签列（${theme}）`, async ({ page }) => {
            await applyTheme(page, theme)
            await openRepos(page)
            await expectThemeApplied(page, theme)
            await expectPageScreenshot(page, `repos-${theme}.png`)
        })
    }

    test('pr-checks 表格密度例外（light）', async ({ page }) => {
        await applyTheme(page, 'light')
        await page.goto('/pr-checks')
        await waitForHydration(page)
        const table = page.locator('.caomei-data-table')
        await expect(table).toBeVisible({ timeout: 15000 })
        /* 行级覆盖断言：fixtures 端点已支持 prChecks 写入路径，
           若该路径失效则基线会静默落回空态——先断言行数与三态标签再截图，
           让「基线覆盖行级渲染」这件事本身可被检出。 */
        const expectedRows = VISUAL_FIXTURES.prChecks?.length ?? 0
        await expect(table.locator('tbody .caomei-data-table__row')).toHaveCount(expectedRows)
        await expect(table).toContainText('dependfix[bot]')
        await expect(table).toContainText('dependabot[bot]')
        // 结论标签四档色调（danger / success / warning / primary 各至少一处）
        for (const tone of ['danger', 'success', 'warning', 'primary']) {
            await expect(table.locator(`.caomei-tag--${tone}`).first()).toBeVisible()
        }
        // Alert 状态列 neutral 档（已 ack）独立于结论标签，单列断言
        await expect(table.locator('.caomei-tag--neutral').first()).toBeVisible()
        // Alert 状态三态文案（firing / 已 ack / OK）
        for (const label of ['仅 firing', '仅已 ack', 'OK']) {
            await expect(table).toContainText(label)
        }
        await waitForVisualStable(page)
        await expectThemeApplied(page, 'light')
        await expectPageScreenshot(page, 'pr-checks-light.png')
    })

    test('dialog-import-repos 浮层（light）', async ({ page }) => {
        await applyTheme(page, 'light')
        await page.goto('/repos')
        await waitForHydration(page)
        await expect(page.locator('.caomei-data-table')).toBeVisible({ timeout: 15000 })

        await page.getByRole('button', { name: /导入/ }).first().click()
        const dialog = page.locator('.caomei-dialog__content')
        await expect(dialog).toBeVisible({ timeout: 15000 })
        await expect(dialog.locator('.caomei-dialog__header')).toContainText('批量导入仓库')
        await waitForVisualStable(page)
        await expectThemeApplied(page, 'light')
        /* 浮层用元素级截图：避免整页截图下 fixed 定位元素与背景叠加带来的不稳定 */
        await expectLocatorScreenshot(dialog, 'dialog-import-repos-light.png')
    })
})

test.describe('登录页视觉基线（未认证）', () => {
    test.use({ storageState: { cookies: [], origins: [] } })

    test('login（light）', async ({ page }) => {
        await applyTheme(page, 'light')
        await page.goto('/login')
        await waitForHydration(page)
        await expect(page.locator('input#email')).toBeVisible({ timeout: 15000 })
        await waitForVisualStable(page)
        await expectThemeApplied(page, 'light')
        await expectPageScreenshot(page, 'login-light.png')
    })
})
