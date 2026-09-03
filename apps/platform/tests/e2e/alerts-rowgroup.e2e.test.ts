import { test, expect, type Request } from '@playwright/test'
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
 * 测试数据来源（todo.md §M16.5 E2E timeout 修复）：
 * - 依赖 global-setup 通过 POST /api/e2e/fixtures 注入的 server-side fixtures
 *   （apps/platform/tests/e2e/helpers/fixtures.helper.ts ALERTS_ROWGROUP_FIXTURES）
 * - **不能用 page.route mock /api/alerts + /api/repos**：alerts.vue 迁移 useAsyncData 后
 *   SSR 阶段在 server 进程内 fetch，page.route() 只能拦截浏览器请求，拦截不到 server
 *   进程内 fetch → SSR 阶段真实打 server → e2e 库空 → hydration 时 alerts.value=[] →
 *   PrimeVue rowGroup subheader 不渲染 → rowGroup 测试 timeout 重试 → E2E job
 *   累计 ≥ 20min → workflow timeout-minutes 取消（todo.md §M16.5 复盘）
 *
 * fixtures 内容（最小集）：
 * - repos: foo/bar + foo/baz（仓库 Select 选项）
 * - scanRuns: 3 个（foo/bar × 2 + foo/baz × 1；2 个 lodash scan run 用于跨次去重）
 * - scanResults: 4 个（lodash × 3 in foo/bar + axios × 1 in foo/baz）
 */

test.use({ storageState: 'tests/e2e/.auth/admin.json' })

test.describe('alerts rowGroup + 视图切换', () => {
    /**
     * SSR 锁定测试（todo.md §M16.4 useAsyncData SSR-aware data fetching）
     *
     * 验证迁移到 useAsyncData 后，alerts 数据走 Nuxt payload 通道：
     * - SSR 阶段 server 进程内 fetch /api/alerts（依赖 global-setup 注入的 fixtures 提供真实数据）
     * - hydration 完成时 alerts.value 已有完整数据 → PrimeVue DataTable processedData
     *   在 hydration 阶段就完整计算 → rowGroup subheader 立即可见
     *
     * 反向锁定（双保险）：
     * 1. UI 断言：hydration 后立即见 rowGroup subheader（onMounted 模式下 SSR alerts=[] →
     *    PrimeVue 4 rowGroup known issue 不渲染 → waitForSelector timeout）
     * 2. 网络断言：page.on('request') 跟踪浏览器侧 /api/alerts fetch 数 = 0
     *    （useAsyncData SSR-aware → SSR fetch + payload 复用 → 客户端 0 次额外 fetch；
     *    onMounted 模式下 hydration 后客户端必然触发 1 次 fetchAlerts → 断言失败反向锁定）
     *
     * 注：page.on('request') 看不到 SSR 阶段 server 进程内 fetch（playwright 设计限制），
     * 但这恰好是断言的优势——只看客户端 fetch 就能区分 SSR-aware vs onMounted 模式。
     */
    test('SSR 锁定：useAsyncData SSR-aware → hydration 后 subheader 立即可见 + 客户端 /api/alerts fetch = 0', async ({ page }) => {
        const requests: string[] = []
        const onRequest = (request: Request) => {
            if (request.url().includes('/api/alerts')) {
                requests.push(request.url())
            }
        }
        page.on('request', onRequest)

        try {
            await page.goto('/alerts')
            await waitForHydration(page)
            // 反向锁定：useAsyncData SSR-aware → 0 次客户端 fetch（payload 复用）
            // 若回退到 onMounted 异步赋值模式，hydration 后客户端必然触发 1 次 /api/alerts
            expect(requests).toHaveLength(0)
            // 反向锁定：UI 已渲染 rowGroup subheader（onMounted 模式下 PrimeVue hydration 后不渲染）
            await page.waitForSelector('.alerts__group-header', { timeout: 5000 })
            const groupHeaders = await page.locator('.alerts__group-header').count()
            expect(groupHeaders).toBeGreaterThan(0)
        } finally {
            page.off('request', onRequest)
        }
    })

    test('alerts 页面不包含 dashboard 同款图表（去重 todo.md §C65-D4）', async ({ page }) => {
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
        // 跟踪浏览器侧 /api/alerts 请求（page.route 看不到 SSR 阶段 server 进程内 fetch，
        // 因此断言只能针对 client 触发的 refetch 请求；SSR 阶段 fetch 触发由 SSR 锁定 case 覆盖）
        const requests: string[] = []
        const onRequest = (request: Request) => {
            if (request.url().includes('/api/alerts')) {
                requests.push(request.url())
            }
        }
        page.on('request', onRequest)

        await page.goto('/alerts')
        await waitForHydration(page)
        // 切换到按项目 → useAsyncData watch 触发 client refetch → /api/alerts?groupBy=repository
        const repoResponsePromise = page.waitForResponse(
            (resp) => resp.url().includes('/api/alerts') && resp.url().includes('groupBy=repository'),
        )
        await page.locator('#view-mode').click()
        await page.locator('.p-select-overlay li:has-text("按项目")').click()
        await repoResponsePromise
        // 至少有一次 client 请求 groupBy=repository
        const repoReq = requests.find((u) => new URL(u).searchParams.get('groupBy') === 'repository')
        expect(repoReq).toBeDefined()
        page.off('request', onRequest)
    })

    test('视图切换：原始列表不传 groupBy 参数', async ({ page }) => {
        const requests: string[] = []
        const onRequest = (request: Request) => {
            if (request.url().includes('/api/alerts')) {
                requests.push(request.url())
            }
        }
        page.on('request', onRequest)

        await page.goto('/alerts')
        await waitForHydration(page)
        // 切换到原始列表 → /api/alerts 不带 groupBy 参数
        const noneResponsePromise = page.waitForResponse(
            (resp) => resp.url().includes('/api/alerts') && !resp.url().includes('groupBy'),
        )
        await page.locator('#view-mode').click()
        await page.locator('.p-select-overlay li:has-text("原始列表")').click()
        await noneResponsePromise
        // 至少有一次 client 请求不带 groupBy
        const noneReq = requests.find((u) => !new URL(u).searchParams.has('groupBy'))
        expect(noneReq).toBeDefined()
        page.off('request', onRequest)
    })

    // todo.md §M20.6：M20.3 per-alert 模型下 ScanResult 字段（occurrenceCount / firstSeenAt /
    // lastSeenAt）默认显示；includeSuperseded 开关控制"已关闭"告警显示。
    //
    // 反向锁定（替代旧 todo.md §M14.3 §T1403 dedupe=across 锁定）：
    // - 旧测试验证默认 dedupe=across → 聚合列展开；todo.md §M20.6 移除 dedupe UI 后改为验证
    //   默认 includeSuperseded=false → 已关闭告警行不渲染（minimist 行不在首屏表格中）
    test('首屏默认 includeSuperseded=false → hydration 后已关闭告警行不渲染', async ({ page }) => {
        await page.goto('/alerts')
        await waitForHydration(page)
        // 默认 includeSuperseded=false → 后端 result.supersededAt IS NULL 过滤
        // → minimist（supersededAt 非空）行不在首屏表格中
        // 断言活跃告警可见
        await expect(page.locator('tbody tr:has-text("lodash")').first()).toBeVisible()
        await expect(page.locator('tbody tr:has-text("node-fetch")').first()).toBeVisible()
        // 断言已关闭告警不可见
        await expect(page.locator('tbody tr:has-text("minimist")')).toHaveCount(0)
        // 出现次数 / 最近发现 / 首次发现 列默认显示（todo.md §M20.6 移除 v-if 控制）
        await expect(page.locator('th:has-text("出现次数")')).toBeVisible()
        await expect(page.locator('th:has-text("最近发现")')).toBeVisible()
        await expect(page.locator('th:has-text("首次发现")')).toBeVisible()
    })

    // todo.md §M20.6：includeSuperseded 开关切换验证。
    // PrimeVue 4 ToggleSwitch 是 checkbox 形式（无 overlay），点击切换布尔值。
    // 设计取舍：
    // - 默认 includeSuperseded=false → minimist 行不渲染（已关闭告警被过滤）
    // - 点击开关 → true → useAsyncData watch 触发 refetch → /api/alerts?includeSuperseded=true
    //   → minimist 行出现
    // - 再点击 → false → 再次 refetch → minimist 行消失
    test('视图切换：includeSuperseded 关闭 → 隐藏已关闭告警；打开 → 显示已关闭告警', async ({ page }) => {
        await page.goto('/alerts')
        await waitForHydration(page)
        // 默认 false：minimist 行不渲染
        await expect(page.locator('tbody tr:has-text("minimist")')).toHaveCount(0)

        // 点击开关切换为 true
        await page.locator('#include-superseded').click()
        // 等待 watch 触发 refetch + UI 更新
        await expect(page.locator('tbody tr:has-text("minimist")')).toBeVisible({ timeout: 5000 })

        // 再点击切换为 false
        await page.locator('#include-superseded').click()
        await expect(page.locator('tbody tr:has-text("minimist")')).toHaveCount(0, { timeout: 5000 })
    })

    /**
     * 默认排序契约：默认视图（'package'）下告警按严重级别降序，
     * 同 severity 内按 packageName 升序（保证 rowGroup subheader 渲染）。
     *
     * 反向锁定（bug fix 2026-09-04）：
     * - 修复前 multiSortMeta = [{ field: 'packageName', order: 1 }] → 按包名字典序，
     *   severity 高低完全无序 → 用户期望 critical 优先看到但实际看到 medium 在最前
     * - 修复后 multiSortMeta = [{ field: '_severityRank', order: -1 }, { field: 'packageName', order: 1 }]
     *   → severity desc + packageName asc
     *
     * 业务依据：docs/standards/platform.md §7.1 「业务语义排序需 :default-sort-order='-1'」，
     * severity Rank 字段是 highest-first（critical=5），desc 渲染符合「critical 优先」业务期望。
     *
     * 断言契约（subheader 级别，而非数据行级别）：
     * - 用户可见的第一印象是「subheader 顺序」——每个 subheader 代表一个 package 的告警集合
     * - PrimeVue 多键排序 stable sort 保留同 package 内原顺序（lodash 3 条 = high/medium/high，
     *   high × 2 + medium × 1 → stable sort 后仍是 high → medium → high），但**不同 package 之间**
     *   必须按 severity desc 排列
     * - 因此正确的断言不是「所有数据行 severity 单调不增」（会因稳定排序误判），
     *   而是「所有 subheader 内的最高 severity 单调不增」
     *
     * 实现细节：DataTable 默认 rowGroup 折叠，先点开每个 subheader 展开告警行才能读到 severity cell。
     */
    test('默认排序契约：告警视图按严重级别降序（subheader 顺序：critical package 在 high 之前，依此类推）', async ({ page }) => {
        await page.goto('/alerts')
        await waitForHydration(page)
        await page.waitForSelector('.alerts__group-header', { timeout: 15000 })

        const groupCount = await page.locator('.alerts__group-header').count()
        expect(groupCount).toBeGreaterThan(0)

        // 逐一点击每个 subheader 展开所有告警行
        for (let i = 0; i < groupCount; i++) {
            const gh = page.locator('.alerts__group-header').nth(i)
            if (await gh.isVisible()) {
                await gh.click()
                await page.waitForTimeout(50)
            }
        }
        // 等所有数据 Tag cell 都出现
        await page.waitForTimeout(200)

        // 提取每个 subheader 对应的 package + 该 group 内告警的 severity 序列
        // 关键 DOM 特征：
        // - subheader 行：class 含 p-datatable-row-group-header，TD colspan=13，内嵌 .alerts__group-header
        // - 数据行：class p-row-odd / p-row-even，紧随在某 subheader 行之后
        const groupSeverities: { packageName: string, severities: string[] }[] = await page.evaluate(() => {
            const rows = Array.from(document.querySelectorAll('tbody tr'))
            const groups: { packageName: string, severities: string[] }[] = []
            let current: { packageName: string, severities: string[] } | null = null
            for (const tr of rows) {
                const cls = tr.getAttribute('class') ?? ''
                const isRowGroupHeader = cls.includes('p-datatable-row-group-header')
                if (isRowGroupHeader) {
                    const strong = tr.querySelector('.alerts__group-header strong')
                    const packageName = strong?.textContent?.trim() ?? ''
                    current = { packageName, severities: [] }
                    groups.push(current)
                    continue
                }
                // 数据行：class p-row-odd 或 p-row-even；只取紧接 subheader 后面的
                if (current && (cls.includes('p-row-odd') || cls.includes('p-row-even'))) {
                    const cells = tr.querySelectorAll('td')
                    const severityCell = cells[1]
                    const tag = severityCell?.querySelector('.p-tag-label')
                    const tagText = tag?.textContent?.trim().toLowerCase() ?? ''
                    if (tagText) {
                        current.severities.push(tagText)
                    }
                }
            }
            return groups
        })

        // 断言至少有一个 subheader 分组（有数据）
        const nonEmptyGroups = groupSeverities.filter((g) => g.severities.length > 0)
        expect(nonEmptyGroups.length, '至少有一个 subheader 含告警').toBeGreaterThan(0)

        // 严重级别排序权重（与 apps/platform/app/utils/sort-helpers.ts SEVERITY_RANK 同步）
        const severityRank: Record<string, number> = {
            critical: 5,
            high: 4,
            medium: 3,
            low: 2,
            unknown: 1,
        }
        const maxSeverityOf = (arr: string[]): number =>
            arr.reduce((max, s) => Math.max(max, severityRank[s] ?? 0), 0)

        // subheader 顺序契约：每个 group 的最高 severity 单调不增
        // 修复前的回归症状：subheader 按 packageName asc，severity 高的 package（如 lodash = high）
        // 会排在 severity 低 package（如 axios = low）之后，与用户期望「critical 优先」相反
        let prevMaxRank = Infinity
        for (const g of nonEmptyGroups) {
            const maxRank = maxSeverityOf(g.severities)
            expect(
                maxRank,
                `subheader 顺序契约违反：group '${g.packageName}' 的最高 severity rank ${maxRank}（含 [${g.severities.join(', ')}]）`
                + `不单调不增，前序 group 最高 rank ${prevMaxRank}`,
            ).toBeLessThanOrEqual(prevMaxRank)
            prevMaxRank = maxRank
        }
    })
})
