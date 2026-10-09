import { expect, test } from '@playwright/test'
import { waitForHydration } from './helpers/hydration.helper'
import { unauthenticatedApiContext } from './helpers/unauthenticated-api.helper'

/**
 * /scans 独立页面端到端测试：
 * 1. /scans（无 query）— 顶部汇总卡片 + 全运行列表渲染
 * 2. /scans?repository=xxx — 按仓库过滤 + 仓库面包屑
 * 3. /scans?run=xxx — `repo-history-dialog` query-key='run' 直接打开单 run 详情
 *
 * 依赖：/api/runs 分页契约 + organizationId 隔离 + `repo-history-dialog` query-key 支持
 * 共享：e2e 测试账号（global-setup 注册首用户 admin + viewer；admin 走 storageState）
 */
test.use({ storageState: 'tests/e2e/.auth/admin.json' })

const scanRunRepository = async (page: import('@playwright/test').Page, owner: string, name: string) => {
    const cookies = (await page.context().cookies()).map((c) => `${c.name}=${c.value}`).join('; ')
    const created = await page.request.post('/api/repos', {
        headers: { cookie: cookies },
        data: { owner, name, defaultBranch: 'main', packageManager: 'pnpm', executorKind: 'container' },
    })
    expect(created.status()).toBe(200)
    const { id } = (await created.json()) as { id: string }
    // 触发一次 sync 扫描（无 token → 快速失败 + 创建 ScanRun record）
    await page.request.post(`/api/repos/${id}/scan`, {
        headers: { cookie: cookies },
        data: { mode: 'report-only', severityThreshold: 'high' },
    })
    return id
}

test.describe('/scans 独立页面', () => {
    test('case 1: /scans 无 query — 顶部汇总卡片 + 全运行列表渲染', async ({ page }) => {
        const stamp = Date.now()
        const owner = `e2e-scans-all-${stamp}`
        await scanRunRepository(page, owner, `e2e-scans-all-repo-${stamp}`)

        await page.goto('/scans')
        await waitForHydration(page)
        // 顶部 4 块汇总卡片（locale=zh-CN 默认情况下 label 文案）
        await expect(page.getByText('总运行数').first()).toBeVisible({ timeout: 15000 })
        await expect(page.getByText('告警总数').first()).toBeVisible()
        await expect(page.getByText('已修复总数').first()).toBeVisible()
        await expect(page.getByText('最近扫描').first()).toBeVisible()
        // 全运行列表 — seed 的 repo 对应的 run 应可见（owner 仓库名含在 owner）
        await expect(page.getByText(owner).first()).toBeVisible({ timeout: 15000 })
    })

    test('case 2: /scans?repository=xxx — 面包屑显示仓库 + 列表过滤', async ({ page }) => {
        const stamp = Date.now()
        const owner = `e2e-scans-repo-${stamp}`
        const name = `e2e-scans-repo-name-${stamp}`
        const repoId = await scanRunRepository(page, owner, name)

        await page.goto(`/scans?repository=${repoId}`)
        await waitForHydration(page)
        // 面包屑：含 owner/name
        await expect(page.getByText(`${owner}/${name}`).first()).toBeVisible({ timeout: 15000 })
        // 清除过滤按钮可见
        await expect(page.getByRole('button', { name: '清除过滤' })).toBeVisible()
    })

    test('case 3: /scans?run=xxx — `repo-history-dialog` query-key="run" 直接打开详情', async ({ page }) => {
        const stamp = Date.now()
        const owner = `e2e-scans-run-${stamp}`
        const name = `e2e-scans-run-name-${stamp}`
        const repoId = await scanRunRepository(page, owner, name)

        // 通过 /api/runs?repositoryId= 获取刚 seed 的 run id
        const cookies = (await page.context().cookies()).map((c) => `${c.name}=${c.value}`).join('; ')
        const runsRes = await page.request.get(`/api/runs?repositoryId=${repoId}`, { headers: { cookie: cookies } })
        expect(runsRes.status()).toBe(200)
        const { items } = (await runsRes.json()) as { items: { id: string }[] }
        expect(items.length).toBeGreaterThan(0)
        const runId = items[0]!.id

        await page.goto(`/scans?run=${runId}`)
        await waitForHydration(page)
        // Dialog 应自动打开（`repo-history-dialog` watch ?run= query）
        await expect(page.locator('.caomei-dialog__content')).toBeVisible({ timeout: 15000 })
        await expect(page.locator('.caomei-dialog__header')).toContainText('扫描历史')
        // run 模式 body 不再渲染冗余「× 关闭」按钮：关闭仅走弹窗 header「×」与 Esc
        await expect(page.locator('.caomei-dialog__header .caomei-dialog__close')).toBeVisible()
        await expect(page.locator('.repo-history__detail-header').getByRole('button', { name: '关闭' })).toHaveCount(0)
        // 日志滚动区高度自适应（视口比例 clamp）：可视高度显著大于原固定 200px
        const logsScroll = page.locator('.repo-history__logs-scroll')
        await expect(logsScroll).toBeVisible()
        const logsHeight = await logsScroll.evaluate((el) => el.getBoundingClientRect().height)
        expect(logsHeight).toBeGreaterThan(200)
        // 宽屏（默认 1280 视口）：面板宽度 = 720px（--caomei-dialog-width 钩子，非窄视口不收缩）
        const dialogBox = await page.locator('.caomei-dialog__content').boundingBox()
        expect(dialogBox).not.toBeNull()
        expect(Math.round(dialogBox!.width)).toBe(720)
    })

    /**
     * 运行失败分类筛选：状态列「失败 · {阶段}」+ 失败阶段筛选生效。
     * 用 e2e fixtures 端点注入两条确定性失败 run（verify / clone），避免依赖无 token 扫描的真实分类。
     */
    test('case 4: /scans 失败阶段筛选 — 状态列显示阶段 + 筛选命中 / 排除', async ({ page }) => {
        const stamp = Date.now()
        const verifyOwner = `e2e-scans-fail-verify-${stamp}`
        const cloneOwner = `e2e-scans-fail-clone-${stamp}`
        const cookies = (await page.context().cookies()).map((c) => `${c.name}=${c.value}`).join('; ')

        const seeded = await page.request.post('/api/e2e/fixtures', {
            headers: { cookie: cookies },
            data: {
                repos: [
                    { owner: verifyOwner, name: 'app' },
                    { owner: cloneOwner, name: 'app' },
                ],
                scanRuns: [
                    {
                        repositoryOwner: verifyOwner,
                        repositoryName: 'app',
                        status: 'failed',
                        failureCode: 'VERIFICATION_FAILED',
                        failureStage: 'verify',
                        failureKind: 'deterministic',
                    },
                    {
                        repositoryOwner: cloneOwner,
                        repositoryName: 'app',
                        status: 'failed',
                        failureCode: 'clone_timeout',
                        failureStage: 'clone',
                        failureKind: 'transient',
                    },
                ],
            },
        })
        expect(seeded.status()).toBe(200)

        await page.goto('/scans')
        await waitForHydration(page)

        const runList = page.locator('.scans__run-list')
        // 未筛选：两条失败 run 均在列表内，状态列显示「失败 · {阶段}」
        await expect(runList.getByText(`${verifyOwner}/app`).first()).toBeVisible({ timeout: 15000 })
        await expect(runList.getByText(`${cloneOwner}/app`).first()).toBeVisible()
        await expect(runList.getByText('失败 · 验证门禁').first()).toBeVisible()
        await expect(runList.getByText('失败 · 仓库克隆').first()).toBeVisible()

        // 阶段分布计数（byFailureStage）标签可见
        await expect(page.getByText('失败阶段分布：').first()).toBeVisible()

        // 失败阶段筛选 = 验证门禁 → 命中 verify 行、排除 clone 行
        await page.locator('#run-failure-stage').click()
        await page.locator('.caomei-select__content .caomei-select__item:has-text("验证门禁")').click()
        await expect(runList.getByText(`${verifyOwner}/app`).first()).toBeVisible({ timeout: 15000 })
        await expect(runList.getByText(`${cloneOwner}/app`)).toHaveCount(0)

        // 清除筛选 → clone 行重新可见
        await page.getByRole('button', { name: '清除筛选' }).click()
        await expect(runList.getByText(`${cloneOwner}/app`).first()).toBeVisible({ timeout: 15000 })
    })

    /**
     * 「按仓库」分区：Tabs 切换 + 「最近状态」筛选 + 客户端分页。
     * 数据由 e2e fixtures 端点注入（每仓库单 run → lastStatus 确定）；额外注入 12 个 completed 仓库
     * 保证聚合列表超过单页 10 行，从而触发客户端分页。
     */
    test('case 5: 按仓库分区 — 最近状态筛选 + 客户端分页', async ({ page }) => {
        const stamp = Date.now()
        const cookies = (await page.context().cookies()).map((c) => `${c.name}=${c.value}`).join('; ')
        const failedOwner = `e2e-scans-byrepo-failed-${stamp}`
        const okOwner = `e2e-scans-byrepo-ok-${stamp}`
        const fillerOwners = Array.from({ length: 12 }, (_, i) => `e2e-scans-page-${stamp}-${i}`)
        const seeded = await page.request.post('/api/e2e/fixtures', {
            headers: { cookie: cookies },
            data: {
                repos: [
                    ...fillerOwners.map((owner) => ({ owner, name: 'app' })),
                    { owner: failedOwner, name: 'app' },
                    { owner: okOwner, name: 'app' },
                ],
                scanRuns: [
                    ...fillerOwners.map((owner) => ({ repositoryOwner: owner, repositoryName: 'app', status: 'completed' })),
                    {
                        repositoryOwner: failedOwner,
                        repositoryName: 'app',
                        status: 'failed',
                        failureCode: 'clone_timeout',
                        failureStage: 'clone',
                        failureKind: 'transient',
                    },
                    { repositoryOwner: okOwner, repositoryName: 'app', status: 'completed' },
                ],
            },
        })
        expect(seeded.status()).toBe(200)

        await page.goto('/scans')
        await waitForHydration(page)
        // 默认「全部运行」分区：runs 列表可见（Tabs 分区不破坏既有首屏语义）
        await expect(page.locator('.scans__run-list')).toBeVisible({ timeout: 15000 })
        // 切到「按仓库」分区
        await page.getByRole('tab', { name: '按仓库' }).click()
        const byRepoTable = page.locator('.caomei-data-table')
        await expect(byRepoTable).toBeVisible({ timeout: 15000 })
        // 统计窗口提示（窗口边界显式标注）
        await expect(page.locator('.scans__window-hint')).toContainText('统计窗口')

        // 客户端分页：单页 10 行（聚合仓库数 > 10）
        const rows = byRepoTable.locator('tbody .caomei-data-table__row')
        await expect(rows).toHaveCount(10)
        const firstRowBefore = await rows.first().innerText()
        await page.getByRole('button', { name: '下一页' }).click()
        // 翻页后首行内容变化（证明分页真正切片）
        await expect.poll(async () => rows.first().innerText()).not.toBe(firstRowBefore)

        // 「最近状态」筛选 = 失败 → 每行最近状态均为失败，且 completed 仓库被排除
        await page.locator('#byrepo-status').click()
        await page.locator('.caomei-select__content .caomei-select__item:has-text("失败")').click()
        // 等待筛选生效（refetch 完成后每行最近状态均为失败；避免读到筛选前的行）
        await expect.poll(async () => {
            const texts = await rows.allInnerTexts()
            return texts.length > 0 && texts.every((text) => text.includes('失败'))
        }).toBe(true)
        // completed 仓库被排除（按行文本匹配 owner，非 owner/name 组合子串——两列为独立单元格）
        await expect(rows.filter({ hasText: okOwner })).toHaveCount(0)

        // 行操作「仅查看此仓库」→ 切到「全部运行」分区 + URL 携带 repository（深链语义不变）
        await rows.first().getByRole('button', { name: '仅查看此仓库' }).click()
        await expect(page.getByRole('tab', { name: '全部运行' })).toHaveAttribute('aria-selected', 'true')
        await expect(page).toHaveURL(/repository=/)
    })

    test('case 6: 扫描历史弹窗窄视口不溢出（响应式宽度覆盖 720px）', async ({ page }) => {
        const stamp = Date.now()
        const owner = `e2e-scans-narrow-${stamp}`
        const name = `e2e-scans-narrow-name-${stamp}`
        const repoId = await scanRunRepository(page, owner, name)
        const cookies = (await page.context().cookies()).map((c) => `${c.name}=${c.value}`).join('; ')
        const runsRes = await page.request.get(`/api/runs?repositoryId=${repoId}`, { headers: { cookie: cookies } })
        expect(runsRes.status()).toBe(200)
        const { items } = (await runsRes.json()) as { items: { id: string }[] }
        expect(items.length).toBeGreaterThan(0)
        const runId = items[0]!.id

        // 窄视口（≤ 640px）：弹窗宽度由 caomei 基类 min(90vw, --caomei-dialog-width) + ≤640px 全宽规则覆盖 720px，不溢出
        await page.setViewportSize({ width: 480, height: 720 })
        await page.goto(`/scans?run=${runId}`)
        await waitForHydration(page)
        const dialog = page.locator('.caomei-dialog__content')
        await expect(dialog).toBeVisible({ timeout: 15000 })
        const box = await dialog.boundingBox()
        expect(box).not.toBeNull()
        expect(box!.width).toBeLessThanOrEqual(480)
    })

    test('case 7: 批量日志导出入口 + 已认证导出命中静态路由 + 未认证被拒', async ({ page, browser }) => {
        const stamp = Date.now()
        const owner = `e2e-export-${stamp}`
        const repositoryId = await scanRunRepository(page, owner, `e2e-export-repo-${stamp}`)

        await page.goto('/scans')
        await waitForHydration(page)
        // 运行列表筛选工具栏的批量导出按钮（默认「全部运行」tab）
        await expect(page.locator('button:has-text("导出当前筛选日志")')).toBeVisible({ timeout: 15000 })

        // 已认证导出：命中静态路由 /api/runs/logs-export（证明优先于 /api/runs/[id] 的假 id 分支）
        const cookies = (await page.context().cookies()).map((c) => `${c.name}=${c.value}`).join('; ')
        const authed = await page.request.get(`/api/runs/logs-export?repositoryId=${repositoryId}`, {
            headers: { cookie: cookies },
        })
        expect(authed.status()).toBe(200)
        expect(authed.headers()['content-type']).toContain('text/plain')
        expect(authed.headers()['content-disposition']).toContain('runs-logs-')
        const body = await authed.text()
        expect(body).toContain('# dependfix 执行日志导出')
        expect(body).toContain(`# 筛选：repositoryId=${repositoryId}`)

        // 未认证请求（强制空 storageState 的独立 context）→ 401
        const context = await unauthenticatedApiContext(browser)
        try {
            const unauth = await context.request.get('/api/runs/logs-export')
            expect(unauth.status()).toBe(401)
        } finally {
            await context.close()
        }
    })
})

/**
 * viewer 角色可见性：阶段扫描历史是只读数据，viewer 应可见（与 batch-runs 一致）；
 * 菜单项 + 页面均可访问。
 */
test.describe('/scans viewer 角色可见', () => {
    test.use({ storageState: 'tests/e2e/.auth/viewer.json' })

    test('viewer 可访问 /scans 页面 + 看到菜单项', async ({ page }) => {
        await page.goto('/scans')
        await waitForHydration(page)
        // 菜单"扫描"项可见（locale=zh-CN）
        await expect(page.getByRole('link', { name: '扫描' }).first()).toBeVisible({ timeout: 15000 })
        // 页面标题可见
        await expect(page.getByText('扫描', { exact: true }).first()).toBeVisible()
        // viewer 不应看到"环境事件"或"定时计划"或"用户"
        await expect(page.getByRole('link', { name: '环境事件' })).toHaveCount(0)
        await expect(page.getByRole('link', { name: '定时计划' })).toHaveCount(0)
        await expect(page.getByRole('link', { name: '用户' })).toHaveCount(0)
    })

    test('viewer 无法访问 dashboard 时仍可访问 /scans（确认非 admin 专用）', async ({ page }) => {
        // 直接 navigate，确认 viewer 不被 middleware 拦截
        const response = await page.goto('/scans')
        expect(response?.status()).toBe(200)
        await waitForHydration(page)
        // viewer 应不报 Error Message（403 / 401）
        await expect(page.locator('.caomei-message--danger')).toHaveCount(0)
    })
})

/**
 * 兜底：若 storageState 缺失 viewer（CI 缓存丢失），跳过 viewer 用例而非失败
 */
test.beforeAll(async () => {
    const fs = await import('node:fs/promises')
    try {
        await fs.access('tests/e2e/.auth/viewer.json')
    } catch {
        test.skip(true, 'viewer.json missing — global-setup did not run; skipping viewer-specific cases')
    }
})
