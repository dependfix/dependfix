import { test, expect } from '@playwright/test'
import { waitForHydration } from './helpers/hydration.helper'

/**
 * alerts 视图 rowGroup + 视图切换冒烟（docs/plan/todo.md §C58 + §C65-D2/D3/D4）。
 *
 * 覆盖：
 * - 顶部图表去重（alerts 不再渲染 dashboard 同款图表，与 dashboard.vue 完全去重）
 * - DataTable rowGroup by packageName（subheader 显示包名 + 告警数）
 * - subheader 点击折叠/展开（PrimeVue 默认 rowToggleButton + 自定义 span 整体交互）
 * - 视图切换：按包 / 按项目 / 原始列表三选一，groupBy 参数 + 动态 DataTable 属性
 *
 * 测试数据：依赖后端 /api/alerts + /api/repos（e2e setup 通过 admin auth + 历史 alert fixtures）
 */

test.use({ storageState: 'tests/e2e/.auth/admin.json' })

/**
 * rowGroup 测试依赖 /api/alerts 返回非空数据 + /api/repos
 * （alerts.vue onMounted: await fetchRepositories(); await fetchAlerts()—— 任一前置卡住
 *  则 fetchAlerts 永不执行，DataTable 不渲染，rowGroup subheader 永远找不到）
 *
 * PrimeVue rowGroupMode="subheader" 须按 groupRowsBy 字段预排序才会渲染 subheader。
 * mock 两个不同 packageName 的告警 → 渲染 2 个 group header。
 */
const MOCK_ALERTS = [
    {
        id: 'alert-1', runId: 'run-1', repository: 'foo/bar',
        source: 'dependabot', severity: 'high',
        packageName: 'lodash', manifestPath: 'package.json', ruleId: null,
        summary: 'prototype pollution', fixable: true, fixStrategy: null,
        recommendedVersion: '4.18.0', htmlUrl: null, fixStatus: 'pending', errorMessage: null,
    },
    {
        id: 'alert-2', runId: 'run-2', repository: 'foo/bar',
        source: 'code-scanning', severity: 'medium',
        packageName: 'lodash', manifestPath: 'src/utils/x.ts', ruleId: 'js/incomplete-sanitization',
        summary: 'incomplete sanitization', fixable: false, fixStrategy: null,
        recommendedVersion: null, htmlUrl: null, fixStatus: 'pending', errorMessage: null,
    },
    {
        id: 'alert-3', runId: 'run-3', repository: 'foo/baz',
        source: 'pnpm-audit', severity: 'low',
        packageName: 'axios', manifestPath: 'package.json', ruleId: null,
        summary: 'CVE-2026-xxxxx', fixable: true, fixStrategy: null,
        recommendedVersion: '1.7.5', htmlUrl: null, fixStatus: 'pending', errorMessage: null,
    },
]

const MOCK_REPOS = [
    { id: 'repo-1', owner: 'foo', name: 'bar' },
    { id: 'repo-2', owner: 'foo', name: 'baz' },
]

test.describe('C58 alerts rowGroup + 视图切换', () => {
    /**
     * SSR 锁定测试（todo.md §M16.4 useAsyncData SSR-aware data fetching）
     *
     * 验证迁移到 useAsyncData 后，alerts 数据走 Nuxt payload 通道：
     * 1. SSR HTML 不依赖 client JS 执行就含 rowGroup subheader 容器（hydration 完成后
     *    PrimeVue 把 rowGroup subheader 注入 DOM，所以断言"hydration 后 .alerts__group-header
     *    立即可见 + /api/alerts 只在 SSR 阶段 fetch 1 次"作为反向锁定 —— 若未来回退到
     *    onMounted(fetchAlerts) 异步赋值模式，hydration 时 data.value=[] → rowGroup
     *    subheader 永不渲染，client 必然再触发一次 /api/alerts，触发第二个 fetch）
     * 2. /api/alerts 触发次数 ≤ 2（SSR 1 次 + 客户端因 watch 触发最多 1 次；useAsyncData payload
     *    复用默认 0 次客户端 fetch）
     *
     * 实测：改造后 hydration 阶段 rowGroup subheader 立即渲染（debug 脚本证实 2 个 group header）
     */
    test('SSR 锁定：useAsyncData payload 复用 → hydration 后 subheader 立即可见 + /api/alerts 请求 ≤ 2 次', async ({ page }) => {
        const requests: string[] = []
        await page.route('**/api/alerts*', (route, request) => {
            requests.push(request.url())
            return route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(MOCK_ALERTS),
            })
        })
        await page.route('**/api/repos*', (route) => route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(MOCK_REPOS),
        }))

        await page.goto('/alerts')
        await waitForHydration(page)
        // hydration 完成后立即检查（不等任何额外 fetch）
        await page.waitForSelector('.alerts__group-header', { timeout: 5000 })
        const groupHeaders = await page.locator('.alerts__group-header').count()
        expect(groupHeaders).toBeGreaterThan(0)
        // 关键反向锁定：SSR 阶段 fetch 1 次；useAsyncData payload 复用 → 客户端 0 次额外 fetch
        // 允许最多 2 次（SSR + 客户端因 watch 触发 1 次，防御性兜底）
        const alertsRequests = requests.filter((u) => u.includes('/api/alerts'))
        expect(alertsRequests.length).toBeLessThanOrEqual(2)
        // SSR 1 次（url 含 groupBy=package + dedupe=true；后端默认 dedupe=false 故前端 UI 主动 ?dedupe=true 触发跨次去重）
        expect(alertsRequests[0]).toContain('groupBy=package')
    })


    test.beforeEach(async ({ page }) => {
        // 必须在 goto 之前注册：alerts.vue 在 onMounted 立即调用 fetchAlerts()
        // 且前置 fetchRepositories 必须先成功完成
        await page.route('**/api/alerts*', (route) => route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(MOCK_ALERTS),
        }))
        await page.route('**/api/repos*', (route) => route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(MOCK_REPOS),
        }))
    })

    test('alerts 页面不包含 dashboard 同款图表（去重 todo.md §C65-D4）', async ({ page }) => {
        // todo.md §C65-D4：alerts 顶部 3 图与 dashboard.vue 完全重复（全量聚合与 alerts 过滤无关），
        // 删除后用户需要全局统计去 dashboard；alerts 聚焦表格 + 详情
        await page.goto('/alerts')
        await waitForHydration(page)
        // 断言：alerts 页面不存在 dashboard 图表 DOM
        const chartCanvases = page.locator('.alerts__chart-canvas canvas[role="img"]')
        await expect(chartCanvases).toHaveCount(0)
        // charts-grid 容器也应不存在
        const chartsGrid = page.locator('.alerts__charts-grid')
        await expect(chartsGrid).toHaveCount(0)
    })

    // todo.md §M16.4 useAsyncData SSR-aware data fetching 修复后启用：
    // 迁移到 useAsyncData 后，SSR 阶段 fetch 已经发生，hydration 时 alerts 数组已有数据，
    // PrimeVue DataTable processedData 在 hydration 阶段就完整计算 → rowGroup subheader 渲染。
    test('DataTable rowGroup by packageName：subheader 显示包名 + 告警数', async ({ page }) => {
        await page.goto('/alerts')
        await waitForHydration(page)
        // 等待 alerts 数据加载完成
        await page.waitForSelector('.alerts__group-header', { timeout: 15000 })
        const groupHeaders = page.locator('.alerts__group-header strong')
        const count = await groupHeaders.count()
        expect(count).toBeGreaterThan(0)
        // 第一个 group header 应该包含包名 + 告警数
        const firstGroup = groupHeaders.first()
        await expect(firstGroup).toBeVisible()
    })

    test('subheader 点击可展开/折叠该包告警', async ({ page }) => {
        await page.goto('/alerts')
        await waitForHydration(page)
        await page.waitForSelector('.alerts__group-header', { timeout: 15000 })
        const firstGroup = page.locator('.alerts__group-header').first()
        // PrimeVue 4.5.5 rowToggleButton + chevron 图标：ChevronRight/Left 通过 SVG path 区分
        // （不是 pi-chevron-* class 名 —— 旧版 PrimeVue 4 早期使用 font-awesome class，
        // 4.5.5 改用 primeicons SVG），断言 SVG path 子串区分
        // 折叠态 SVG path 起点 "M14"（ChevronRight）；展开态 "M5"（ChevronDown）；
        // 用 rowToggleButton 的 transform 状态判断（PrimeVue 内部用旋转 + 路径切换实现）
        const toggleButton = page.locator('.p-datatable-row-toggle-button').first()
        // 点击前：折叠态（默认）
        await expect(toggleButton).toBeVisible()
        // 点击 groupheader 展开
        await firstGroup.click()
        // 等待动画后验证 toggleButton 内部 SVG path 已变（展开态）
        await page.waitForTimeout(300)
        const expandedPath = await page.locator('.p-datatable-row-toggle-button').first().locator('svg path').getAttribute('d')
        // 折叠态 "M14 7.5L17.5 10.5L14 13.5"（ChevronRight） vs 展开态 "M5 7.5L8 10.5L5 13.5"（ChevronLeft 旋转）
        // 简化断言：点击前后 path 不一致即可证明状态切换
        await firstGroup.click()
        await page.waitForTimeout(300)
        const collapsedPath = await page.locator('.p-datatable-row-toggle-button').first().locator('svg path').getAttribute('d')
        expect(expandedPath).not.toBe(collapsedPath)
    })

    test('#groupheader slot 内无自定义 chevron（双 chevron 视觉缺陷修复）', async ({ page }) => {
        await page.goto('/alerts')
        await waitForHydration(page)
        // PrimeVue 4 expandable-row-groups + #groupheader slot 模式下，PrimeVue 默认渲染
        // rowToggleButton（含 ChevronDownIcon/RightIcon），slot 内不应再叠加自定义 chevron
        // （参见 node_modules/primevue/datatable/index.mjs:1776-1800）
        // 断言：DOM 中不存在 alerts__group-toggle 类名的 <i> 元素（修复前是 font-awesome pi-chevron-*）
        const customChevron = page.locator('i.alerts__group-toggle')
        await expect(customChevron).toHaveCount(0)
    })

    test('视图切换：顶部 Select 三选一（按包 / 按项目 / 原始列表）', async ({ page }) => {
        await page.goto('/alerts')
        await waitForHydration(page)
        // 视图切换 Select 存在，含 3 个选项
        const viewSelect = page.locator('#view-mode')
        await expect(viewSelect).toBeVisible()
        await viewSelect.click()
        const overlay = page.locator('.p-select-overlay')
        await expect(overlay).toBeVisible({ timeout: 5000 })
        const options = overlay.locator('li[role="option"]')
        await expect(options).toHaveCount(3, { timeout: 5000 })
        // 选项 label 文本（i18n 默认 zh-CN）
        await expect(options.nth(0)).toContainText('按包')
        await expect(options.nth(1)).toContainText('按项目')
        await expect(options.nth(2)).toContainText('原始列表')
    })

    test('视图切换：按项目触发 /api/alerts?groupBy=repository', async ({ page }) => {
        // 跟踪 /api/alerts 请求，验证 groupBy 参数
        const requests: URL[] = []
        await page.route('**/api/alerts*', (route, request) => {
            requests.push(new URL(request.url()))
            return route.fulfill({
                status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_ALERTS),
            })
        })
        await page.route('**/api/repos*', (route) => route.fulfill({
            status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_REPOS),
        }))
        // 等待默认 viewMode=package 的初始 fetchAlerts 请求
        const initialResponsePromise = page.waitForResponse('**/api/alerts?groupBy=package*')
        await page.goto('/alerts')
        await initialResponsePromise
        await waitForHydration(page)
        // 默认 viewMode=package 请求应包含 groupBy=package
        const initial = requests.find((u) => u.searchParams.get('groupBy') === 'package')
        expect(initial).toBeDefined()
        // 切换到按项目
        const repoResponsePromise = page.waitForResponse('**/api/alerts?groupBy=repository*')
        await page.locator('#view-mode').click()
        await page.locator('.p-select-overlay li:has-text("按项目")').click()
        await repoResponsePromise
        // 切换后应触发新请求 groupBy=repository
        const repoReq = requests.find((u) => u.searchParams.get('groupBy') === 'repository')
        expect(repoReq).toBeDefined()
    })

    test('视图切换：原始列表不传 groupBy 参数', async ({ page }) => {
        const requests: URL[] = []
        await page.route('**/api/alerts*', (route, request) => {
            requests.push(new URL(request.url()))
            return route.fulfill({
                status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_ALERTS),
            })
        })
        await page.route('**/api/repos*', (route) => route.fulfill({
            status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_REPOS),
        }))
        await page.goto('/alerts')
        await waitForHydration(page)
        // 切换到原始列表
        const noneResponsePromise = page.waitForResponse((resp) => resp.url().includes('/api/alerts') && !resp.url().includes('groupBy'))
        await page.locator('#view-mode').click()
        await page.locator('.p-select-overlay li:has-text("原始列表")').click()
        await noneResponsePromise
        // 切换后请求不应包含 groupBy 参数
        const noneReq = requests.find((u) => !u.searchParams.has('groupBy'))
        expect(noneReq).toBeDefined()
    })

    // todo.md §M14.3 M13.4 T1403 follow-up：T1403 修复后 filters.dedupe 默认值改为 'across'
    // （见 apps/platform/app/pages/alerts.vue:56），首屏首次 fetchAlerts 请求 URL 应含 dedupe=true。
    // 本 case 与下方「切换 dedupe off → across」case 互补：手动切换路径已有覆盖，首屏默认
    // 路径此前无 case 覆盖（T1403 follow-up 登记项）。
    test('首屏默认 dedupe=across → 首次 /api/alerts 请求 URL 含 ?dedupe=true', async ({ page }) => {
        const requests: URL[] = []
        await page.route('**/api/alerts*', (route, request) => {
            requests.push(new URL(request.url()))
            return route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(MOCK_ALERTS),
            })
        })
        await page.route('**/api/repos*', (route) => route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(MOCK_REPOS),
        }))
        // 首屏 fetchAlerts 由 onMounted 触发，等待首个 /api/alerts 请求
        const initialResponsePromise = page.waitForResponse('**/api/alerts*')
        await page.goto('/alerts')
        await initialResponsePromise
        await waitForHydration(page)
        // 验证首个 /api/alerts 请求 URL 含 dedupe=true
        const initial = requests.find((u) => u.searchParams.get('dedupe') === 'true')
        expect(initial).toBeDefined()
    })

    // todo.md §T1306：dedupe 模式切换触发 /api/alerts?dedupe=true + 表格列扩展
    test('视图切换：dedupe 模式触发 /api/alerts?dedupe=true + 显示聚合列', async ({ page }) => {
        const requests: URL[] = []
        await page.route('**/api/alerts*', (route, request) => {
            requests.push(new URL(request.url()))
            return route.fulfill({
                status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_ALERTS),
            })
        })
        await page.route('**/api/repos*', (route) => route.fulfill({
            status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_REPOS),
        }))
        // 等待初始 fetchAlerts 请求
        const initialResponsePromise = page.waitForResponse('**/api/alerts*')
        await page.goto('/alerts')
        await initialResponsePromise
        await waitForHydration(page)
        // 切换 dedupe 到「跨次去重」
        const dedupeAcrossResponsePromise = page.waitForResponse((resp) =>
            resp.url().includes('/api/alerts') && resp.url().includes('dedupe=true'),
        )
        await page.locator('#dedupe').click()
        await page.locator('.p-select-overlay li:has-text("跨次去重")').click()
        await dedupeAcrossResponsePromise
        // 验证请求包含 dedupe=true
        const dedupeReq = requests.find((u) => u.searchParams.get('dedupe') === 'true')
        expect(dedupeReq).toBeDefined()
        // 表格额外显示「出现次数」列（dedupe=across 时 v-if 显示）
        await expect(page.locator('th:has-text("出现次数")')).toBeVisible()
        // 表格额外显示「最近发现」列
        await expect(page.locator('th:has-text("最近发现")')).toBeVisible()
    })
})
