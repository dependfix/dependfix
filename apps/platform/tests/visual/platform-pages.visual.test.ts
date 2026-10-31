import { expect, type Locator, type Page, test } from '@playwright/test'
import { waitForHydration } from '../e2e/helpers/hydration.helper'
import { VISUAL_FIXTURES } from './helpers/fixtures'
import {
    VISUAL_THEMES,
    applyTheme,
    dynamicMask,
    expectLocatorScreenshot,
    expectPageScreenshot,
    expectThemeApplied,
    expectViewportScreenshot,
    openSelectPanel,
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
 * 暗色 2 张（alerts / repos）+ 浮层落点页 5 张（todo.md §M45.5：schedules 表单浮层 light / dark、
 * scans 运行详情弹窗、alerts 运行抽屉、pr-checks Toast）。基线快照入仓库（`tests/visual/__screenshots__/`）。
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
    // caomei-ui 0.6.0 起 `sort-mode="multiple"` 下所有可排序列都渲染 `__sort-index`（未参与排序的带
    // `--reserved` 修饰符且文本为空，用于避免排序时列宽跳动）→ 只统计真正参与排序的角标
    await expect(
        page.locator('.caomei-data-table__sort-index:not(.caomei-data-table__sort-index--reserved)'),
    ).toHaveCount(2)

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

/**
 * 取视觉 fixtures 里已钉死的运行 ID（单一事实源）。
 *
 * 运行 ID 会以短 ID 形式渲染在运行列表详情弹窗与运行抽屉上，未钉死时基线随注入时刻漂移 →
 * 这里 fail-fast，避免 fixtures 被改动后静默落成不可复现的基线。
 */
function pinnedRunId(index: number): string {
    const id = VISUAL_FIXTURES.scanRuns[index]?.id
    if (!id) {
        throw new Error(`视觉 fixtures 的 scanRuns[${index}] 未钉死 id：详情弹窗 / 运行抽屉基线依赖确定性取值`)
    }
    return id
}

/** 打开定时计划页并展开「新建计划」弹窗（表单首个 Select 为业务类型，含门户面板）。 */
async function openScheduleForm(page: Page): Promise<Locator> {
    await page.goto('/schedules')
    await waitForHydration(page)
    const table = page.locator('.caomei-data-table')
    await expect(table).toBeVisible({ timeout: 15000 })
    /* 前置断言（假绿防护）：空态文案说明列表已渲染（视觉库不注入定时计划 fixtures，
       若列表落成加载态则基线会截成「只有骨架」形态仍全绿）。 */
    await expect(table).toContainText('暂无定时计划，点击右上角新建')

    await page.getByRole('button', { name: '新建计划' }).click()
    const dialog = page.locator('.caomei-dialog__content')
    await expect(dialog).toBeVisible({ timeout: 15000 })
    await expect(dialog.locator('.caomei-dialog__header')).toContainText('新建定时计划')
    return dialog
}

/** 打开 alerts 页的「原始列表」视图并展开指定行的运行抽屉。 */
async function openAlertsRunDrawer(page: Page): Promise<Locator> {
    await page.goto('/alerts')
    await waitForHydration(page)
    await page.locator('#view-mode').click()
    await page.locator('.caomei-select__content .caomei-select__item').filter({ hasText: '原始列表' }).click()
    const row = page.locator('.caomei-data-table__row').filter({ hasText: 'lodash' }).first()
    await expect(row).toBeVisible({ timeout: 15000 })
    /* 行序由 fixtures 的 `createdAt` 钉死（原始列表按 `createdAt DESC`，并列会让 `.first()` 随数据库返回
       顺序漂移）：此处显式断言选中的是 code-quality 那条（规则标识列有值），基线主体一旦被别的 lodash
       告警替换会在此失败，而不是落成一张「看起来也像」的像素差异。 */
    await expect(row).toContainText('typescript:S1854')
    await row.locator('button[aria-label="详情"]').click()

    const drawer = page.locator('.caomei-drawer__content')
    await expect(drawer).toBeVisible({ timeout: 15000 })
    return drawer
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

        /* 浮层落点页（todo.md §M45.5）：定时计划表单弹窗 + 业务类型 Select 门户面板。
           门户面板挂在 body 上（不在弹窗子树内），故用视口级截图覆盖「弹窗 + 遮罩 + 面板」的合成结果；
           表单的 cron 预览是「当前时刻 + cron」派生值，已在 schedules.vue 标 `data-visual-mask`。 */
        test(`schedules 计划表单浮层（${theme}）`, async ({ page }) => {
            await applyTheme(page, theme)
            const dialog = await openScheduleForm(page)

            const kindTrigger = dialog.locator('.caomei-select').first()
            await expect(kindTrigger).toBeEnabled()
            const panel = await openSelectPanel(page, kindTrigger)
            await expect(panel.locator('[role="option"]')).toHaveCount(2)
            await expect(panel).toContainText('定时批量扫描')
            /* 前置断言：面板确实门户挂载（不是弹窗后代）——否则面板未挂载时基线会被落成
               「只有弹窗 + 遮罩」的形态而仍全绿（同 dialog-select-layer 的口径）。 */
            await expect(page.locator('.caomei-dialog__content .caomei-select__content')).toHaveCount(0)

            await waitForVisualStable(page)
            await expectThemeApplied(page, theme)
            await expectViewportScreenshot(page, `schedules-form-layer-${theme}.png`)
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
        /* 展开首行（默认按「最近采集」降序 → #101 失败行）覆盖三源信号面板：
           先断言语义再截图，避免面板未挂载时基线被落成缺面板形态。 */
        const firstRow = table.locator('tbody .caomei-data-table__row').first()
        await firstRow.locator('button.caomei-data-table__row-expander').click()
        const panel = table.locator('.pr-checks__signals')
        await expect(panel).toBeVisible()
        await expect(panel).toContainText('构建 / 部署信号')
        await expect(panel.locator('.pr-checks__signal')).toHaveCount(2)
        await expect(panel).toContainText('vercel')
        /* 归因标签：失败信号的「归因文案 + 色调 class」两档都要锁住。
           fixtures 里 check 信号 = self_caused（danger）、deployment 信号 = external_noise（neutral）；
           只断文案会漏掉色调映射改革，只断 class 会漏掉 i18n 键漂移，两者一起才锁得住。 */
        /* 断言必须落在归因标签自身（`.pr-checks__signal-attribution`）上：
           行内另有 kind（neutral）与 state（failure → danger）标签，直接查 `.caomei-tag--danger`
           会被它们满足，色调映射回归就拦不住。 */
        const attributionTags = panel.locator('.pr-checks__signal-attribution')
        await expect(attributionTags).toHaveCount(2)
        await expect(panel.locator('.pr-checks__signal-attribution.caomei-tag--danger')).toHaveText('本次改动导致')
        await expect(panel.locator('.pr-checks__signal-attribution.caomei-tag--neutral')).toHaveText('外部噪音')
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

    /* scans 页的运行详情弹窗（`/scans?run=` 深链触发的 repo-history-dialog，页面唯一弹窗落点）。
       弹窗为 modal + 遮罩，故按视口级截图；运行 ID / 时间戳均取自 fixtures 的钉死取值。 */
    test('scans 运行详情弹窗（light）', async ({ page }) => {
        await applyTheme(page, 'light')
        await page.goto(`/scans?run=${pinnedRunId(0)}`)
        await waitForHydration(page)

        const dialog = page.getByRole('dialog', { name: /扫描历史/ })
        await expect(dialog).toBeVisible({ timeout: 15000 })
        /* 前置断言（假绿防护）：
           - 弹窗内容主体 = 结果表（run 模式的详情视图不渲染运行元信息块），行数取自 fixtures 的 run 0 结果集，
             未就绪时弹窗停在加载态会让基线落成缺内容形态仍全绿；
           - 底图运行列表按 createdAt 降序 → 首行为钉死的 transient 失败运行，据此锁定 fixtures 的
             时间戳覆盖确实生效（未生效时该断言失败，而不是截出一张逐次漂移的基线）。 */
        const runResults = VISUAL_FIXTURES.scanResults.filter((result) => result.scanRunIndex === 0)
        await expect(dialog.locator('tbody .caomei-data-table__row')).toHaveCount(runResults.length)
        await expect(dialog).toContainText('lodash')
        await expect(page.locator('.caomei-data-table__row').filter({ hasText: '失败 · 仓库克隆' })).toHaveCount(1)
        /* 结果可信度：fixtures 为 run 0 钉死 unfixed=20 / total=26（6 截断 / 4 跨大版本）/
           environmental=1 / exitCode=1；先把分组语义断言住，再截图，避免基线落成缺区块形态。 */
        await expect(dialog).toContainText('未修复 20 / 26')
        await expect(dialog).toContainText('截断 6')
        await expect(dialog).toContainText('跳过 4')
        await expect(dialog).toContainText('跨大版本 / 人工复核 4')
        await expect(dialog).toContainText('Critical 2')
        await expect(dialog).toContainText('High 4')
        await expect(dialog).toContainText('环境性失败 1')
        await expect(dialog).toContainText('退出码: 1')
        const outcomeRow = page.locator('.scans__run-list .caomei-data-table__row')
            .filter({ hasText: 'acme/web-app' })
            .filter({ hasText: '截断 6 / 跳过 4' })
            .first()
        await expect(outcomeRow).toBeVisible()
        await expect(outcomeRow).toContainText('未修复 20')

        await waitForVisualStable(page)
        await expectThemeApplied(page, 'light')
        await expectViewportScreenshot(page, 'scans-run-detail-light.png')
    })

    /* 通知管理员页：组织设置卡片 + 投递记录表；数据由真实 API 读取默认值。 */
    for (const theme of VISUAL_THEMES) {
        test(`notifications 管理员页（${theme}）`, async ({ page }) => {
            await applyTheme(page, theme)
            await page.goto('/notifications')
            await waitForHydration(page)
            await expect(page.getByRole('heading', { name: '通知与邮件' })).toBeVisible()
            await expect(page.getByText('事件类别')).toBeVisible()
            await expect(page.getByText('投递策略')).toBeVisible()
            await expect(page.getByText('最近投递记录')).toBeVisible()
            /* 前置断言（假绿防护）：必选 Critical 只读行、阈值术语与周汇总提示在位才截图，
               文案退化 / 接口失败时先失败，而不是把缺块形态存成基线。 */
            await expect(page.getByText('Critical 告警', { exact: true })).toBeVisible()
            await expect(page.getByText('严重级别阈值')).toBeVisible()
            await expect(page.getByText('高危阈值')).toHaveCount(0)
            await expect(page.getByText(/默认每周一 09:00/)).toBeVisible()

            await waitForVisualStable(page)
            await expectThemeApplied(page, theme)
            await expectPageScreenshot(page, `notifications-${theme}.png`)
        })
    }

    /* 个人设置页：资料 / 密码 / 邮箱 / 绑定 / 语言 / 扫描偏好 / 通知偏好 / AI 研判。
       前置断言锁定本页承载的通知语义（必选 Critical 只读行、周汇总提示）、「当前生效」派生行
       与 AI 表单已加载，避免加载态把缺块形态截成基线。 */
    for (const theme of VISUAL_THEMES) {
        test(`settings 个人设置（${theme}）`, async ({ page }) => {
            await applyTheme(page, theme)
            await page.goto('/settings')
            await waitForHydration(page)
            await expect(page.getByRole('heading', { name: '个人设置' })).toBeVisible()
            await expect(page.getByText('扫描偏好', { exact: true })).toBeVisible()
            await expect(page.getByText('通知偏好', { exact: true })).toBeVisible()

            const criticalRow = page.locator('#notification-security_critical')
            await expect(criticalRow).toBeVisible()
            await expect(criticalRow).toBeDisabled()
            await expect(page.getByText(/默认每周一 09:00/)).toBeVisible()
            // 设备级扫描偏好为空时走系统兜底（确定性）：锁完整兜底串，避免只锁前缀时静默漂移
            await expect(page.getByText('当前生效：仅报告（系统兜底）· High（系统兜底）')).toBeVisible()
            // 界面语言由 i18n 配置决定（默认 zh-CN），锁显示名以免语言偏好漂移无声进入基线
            await expect(page.locator('#language')).toContainText('简体中文')
            // AI 研判配置由组织接口驱动，未加载完成时输入框为空
            await expect(page.locator('#aiModel')).toHaveValue(/.+/)

            await waitForVisualStable(page)
            await expectThemeApplied(page, theme)
            await expectPageScreenshot(page, `settings-${theme}.png`)
        })
    }

    /* alerts 页的运行抽屉（alert-run-sidebar 的 CaomeiDrawer，含遮罩与右侧滑入面板）。 */
    test('alerts 运行抽屉浮层（light）', async ({ page }) => {
        await applyTheme(page, 'light')
        const drawer = await openAlertsRunDrawer(page)

        /* 前置断言（假绿防护）：抽屉内运行表取自 fixtures 的钉死运行 ID 与时间戳，
           若断言列未渲染则基线会落成空抽屉形态。 */
        await expect(drawer).toContainText(pinnedRunId(0).slice(0, 8))
        await expect(drawer).toContainText('12 秒')
        /* 背景表格行数 = fixtures 告警数：行序由 fixtures 的 createdAt 钉死（见 helpers/fixtures.ts），
           行数变化说明视图仍停留在分组态或数据未注入完整。定位必须限定在 `main` 内——
           抽屉运行表（portal 到 body）同样使用 `caomei-data-table__row`，页面级 locator 会把两侧一起计数。 */
        await expect(
            page.locator('main .caomei-data-table tbody .caomei-data-table__row'),
        ).toHaveCount(VISUAL_FIXTURES.scanResults.length)

        await waitForVisualStable(page)
        await expectThemeApplied(page, 'light')
        await expectViewportScreenshot(page, 'alerts-run-drawer-light.png')
    })

    /* pr-checks Toast 轻提示（CaomeiToastProvider 的门户浮层）。
       触发方式取「立即检查」在监测未启用时的 warning 提示（视觉环境未设
       ACTION_STATUS_MONITOR_ENABLED → 端点返回 skipped，不触网、不改库）→ 本用例可与其它用例同批串行。 */
    test('pr-checks Toast 轻提示（light）', async ({ page }) => {
        await applyTheme(page, 'light')
        await page.goto('/pr-checks')
        await waitForHydration(page)
        const table = page.locator('.caomei-data-table')
        await expect(table).toBeVisible({ timeout: 15000 })
        await expect(table.locator('tbody .caomei-data-table__row')).toHaveCount(VISUAL_FIXTURES.prChecks?.length ?? 0)

        await page.getByRole('button', { name: '立即检查' }).click()
        const toast = page.locator('.caomei-toast')
        await expect(toast).toBeVisible({ timeout: 10000 })
        await expect(toast).toContainText('PR Check 监测未启用')

        await waitForVisualStable(page)
        await expectThemeApplied(page, 'light')
        await expectViewportScreenshot(page, 'pr-checks-toast-light.png')
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
