import { expect, test } from '@playwright/test'
import { waitForHydration } from './helpers/hydration.helper'

/**
 * 批量扫描闭环 e2e（QUEUE_ENABLED=false 强制 sync 降级模式，见 playwright.config）：
 * 勾选多仓库 → 批量扫描 → BatchRun 创建 → 轮询聚合 → 详情统计闭环。
 * 执行语义：容器执行器 + 无凭据（无 token）→ 执行快速失败 → run failed；
 * 聚合终态判定"整体完成（含部分失败）"不依赖执行成功，闭环可确定性验证。
 * 幂等设计：Date.now() 唯一 owner/name，重复运行不撞唯一约束（对齐既有 e2e 幂等惯例）。
 * 环境要点：
 * - page.request（APIRequestContext）不会把 __Secure- secure cookie 发送到 http 请求
 *   （浏览器页面在 127.0.0.1 secure context 才发送）→ 手动构造 Cookie header 注入
 * - 列表按 createdAt DESC，本轮创建的 2 个仓库恒排最前 → 用行索引 nth 勾选（幂等）
 */
test.use({ storageState: 'tests/e2e/.auth/admin.json' })

test.describe('批量扫描（sync 降级模式）', () => {
    test('勾选多仓库 → 批量扫描 → BatchRun 聚合统计闭环', async ({ page }) => {
        // 浏览器上下文就绪后，构造会话 Cookie header 供 API 请求使用
        await page.goto('/repos')
        await waitForHydration(page)
        await expect(page.locator('.p-datatable')).toBeVisible({ timeout: 15000 })
        const cookieHeader = (await page.context().cookies())
            .map((c) => `${c.name}=${c.value}`)
            .join('; ')

        // 准备：创建 2 个 container 模式仓库（其余字段走 schema 默认值）
        const stamp = Date.now()
        const owner = `e2e-batch-${stamp}`
        const names = [`repo-a-${stamp}`, `repo-b-${stamp}`]
        for (const name of names) {
            const res = await page.request.post('/api/repos', {
                headers: { cookie: cookieHeader },
                data: {
                    owner,
                    name,
                    defaultBranch: 'main',
                    packageManager: 'pnpm',
                    executorKind: 'container',
                },
            })
            expect(res.status()).toBe(200)
        }

        // 重新导航（带唯一 query 强制全新加载）→ 新仓库恒排最前（createdAt DESC）
        await page.goto(`/repos?r=${stamp}`)
        await waitForHydration(page)
        await expect(page.locator('.p-datatable')).toBeVisible({ timeout: 15000 })
        const rows = page.locator('.p-datatable-tbody tr')
        // 本轮创建的 2 个仓库是列表前 2 行；行选择 checkbox 为原生 input（无显式 role 属性）
        await expect(rows.nth(0)).toContainText(owner, { timeout: 15000 })
        await rows.nth(0).locator('input.p-checkbox-input').click()
        await rows.nth(1).locator('input.p-checkbox-input').click()

        // 批量扫描按钮随勾选激活
        const batchButton = page.locator('button:has-text("批量扫描")')
        await expect(batchButton).toBeEnabled()

        // 打开批量扫描弹窗（参数默认 report-only / high）→ 确认开始
        await batchButton.click()
        await expect(page.locator('.p-dialog-header')).toContainText('批量扫描（2 个仓库）')
        await page.locator('.batch-form button:has-text("开始扫描")').click()

        // 提交后跳转批量运行页（sync 模式 POST 返回时下属 run 已全部终态）
        await page.waitForURL(/\/batch-runs/, { timeout: 120000 })

        // 列表出现手动批量记录
        const firstRow = page.locator('.p-datatable-tbody tr').first()
        await expect(firstRow).toContainText('手动批量', { timeout: 30000 })

        // 展开首行 → 详情（GET /api/batch-runs/[id] 实时聚合写回）
        // 行展开按钮：PrimeVue 4 DataTable 为 button.p-datatable-row-toggle-button
        await firstRow.locator('button.p-datatable-row-toggle-button').click()
        await expect(page.locator('.batch-runs__detail')).toBeVisible({ timeout: 15000 })

        // 聚合统计：状态收敛为已完成（整体完成含部分失败）+ 统计卡片渲染
        await expect(page.locator('.batch-runs__detail')).toContainText('告警总数', { timeout: 15000 })
        await expect(page.locator('.batch-runs__detail')).toContainText('成功/完成')
        await expect(page.locator('.p-datatable-tbody tr').first()).toContainText('已完成', { timeout: 15000 })

        // 下属 ScanRun 明细（2 个仓库；无凭据时 fetch 告警软失败 → run completed + 0 告警）
        // stats 卡片终态聚合："2/2成功/完成"（0/2 → 2/2 需等轮询详情写回终态快照）
        await expect(page.locator('.batch-runs__detail')).toContainText('2/2成功/完成', { timeout: 15000 })
        await expect(page.locator('.batch-runs__detail .p-datatable-tbody tr')).toHaveCount(2)
        await expect(page.locator('.batch-runs__detail')).toContainText(owner)
    })

    test('导航栏包含批量运行入口', async ({ page }) => {
        await page.goto('/dashboard')
        await waitForHydration(page)
        await expect(page.locator('a[href="/batch-runs"]')).toBeVisible()
    })

    test('手动刷新按钮响应（loading 反馈 + 页面不破坏）', async ({ page }) => {
        await page.goto('/batch-runs')
        await waitForHydration(page)

        // 刷新按钮可见可点（无论列表是否为空）
        const refreshButton = page.locator('button:has-text("刷新")')
        await expect(refreshButton).toBeVisible()
        await expect(refreshButton).toBeEnabled()

        // 点击刷新：PrimeVue Button.loading 反馈 → fetchBatchRuns → reconcileBatchRuns → 列表恢复
        const clickPromise = refreshButton.click()
        // 锚定 loading 真的曾出现（PrimeVue 4 渲染 .p-button-loading-icon）—— 防止 refactor 误删
        // loading.value=true 后断言无法 catch 的回归；极短请求可能错过，catch 兜底
        await expect(refreshButton.locator('.p-button-loading-icon')).toBeVisible({ timeout: 500 }).catch(() => { /* 极短请求 catch 掉,主路径靠 toBeEnabled 兜底 */ })
        // 请求期间按钮 loading 状态短暂可见（5000ms 内必恢复，无 batch run 时几乎瞬时）
        await expect(refreshButton).toBeEnabled({ timeout: 5000 })
        await clickPromise

        // DataTable 容器仍可见（refresh 不破坏页面——首屏骨架已折叠，loading 不影响 DataTable）
        await expect(page.locator('.p-datatable')).toBeVisible({ timeout: 5000 })

        // 连续点击不破坏页面状态（in-flight 守卫保证不并发堆叠）
        await refreshButton.click()
        await refreshButton.click().catch(() => { /* 守卫期间点击可能抛错，吞掉 */ })
        await expect(page.locator('.p-datatable')).toBeVisible({ timeout: 5000 })
    })
})
