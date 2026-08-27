import { expect, test } from '@playwright/test'
import { waitForHydration } from './helpers/hydration.helper'

/**
 * /scans 独立页面（todo.md §M16.1）端到端测试：
 * 1. /scans（无 query）— 顶部汇总卡片 + 全运行列表渲染
 * 2. /scans?repository=xxx — 按仓库过滤 + 仓库面包屑
 * 3. /scans?run=xxx — RepoHistoryDialog query-key='run' 直接打开单 run 详情
 *
 * 依赖：todo.md §M14.2 /api/runs 分页契约 + §M16.1 organizationId 隔离 + RepoHistoryDialog query-key 支持
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

    test('case 3: /scans?run=xxx — RepoHistoryDialog query-key="run" 直接打开详情', async ({ page }) => {
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
        // Dialog 应自动打开（RepoHistoryDialog watch ?run= query）
        await expect(page.locator('.p-dialog')).toBeVisible({ timeout: 15000 })
        await expect(page.locator('.p-dialog-header')).toContainText('扫描历史')
    })
})

/**
 * viewer 角色可见性：todo.md §M16.1 阶段扫描历史是只读数据，viewer 应可见（与 batch-runs 一致）；
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
        await expect(page.locator('.p-message-error')).toHaveCount(0)
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
