import type { APIRequestContext } from '@playwright/test'

/**
 * e2e fixtures helper：通过 POST /api/e2e/fixtures 注入 server-side fixtures。
 *
 * 背景（todo.md §M16.5 E2E timeout 修复）：
 * - alerts.vue 迁移 useAsyncData 后 SSR 阶段在 server 进程内 fetch /api/alerts
 * - page.route() 拦截不到 server 内 fetch → SSR 阶段真实打 server → e2e 库空 → hydration
 *   alerts.value=[] → PrimeVue rowGroup 不渲染 → rowGroup 测试 timeout 重试 →
 *   E2E job 累计 ≥ 20min → workflow timeout-minutes 取消
 * - 修复路径：global-setup 通过 fixtures API 注入真实数据，alerts-rowgroup 去掉
 *   page.route mock alerts/repos，依赖 server 真实返回 fixtures 数据
 *
 * 设计取舍：
 * - fixtures 通过 HTTP API 注入而非直接 better-sqlite3 连接（前者由 server 进程控制写入，
 *   避免并发锁问题；后者需要 WAL 模式 + 跨进程同步，复杂度高）
 * - fixtures 仅包含 alerts-rowgroup 测试必需的最小数据集（2 repo + 3 run + 4 alert），
 *   不引入"全量 fixture"，遵循 minimum fixture 原则避免污染其他测试
 * - 每次 globalSetup 调用前先清空已有 alerts-rowgroup fixtures（按 owner/name 列表），
 *   保证测试可重复执行（同样的 owner/name 会因 Repository 复合唯一索引直接冲突）
 */

export interface ScanRunFixture {
    repositoryOwner: string
    repositoryName: string
    mode?: 'report-only' | 'fix' | 'fix-and-pr'
    severityThreshold?: 'low' | 'medium' | 'high' | 'critical'
    executorKind?: 'container' | 'github-action' | 'sandbox'
    status?: 'pending' | 'running' | 'completed' | 'failed'
    summary?: { alertsFound: number, alertsFixed: number }
}

export interface ScanResultFixture {
    scanRunIndex: number
    source: 'dependabot' | 'code-scanning' | 'code-quality' | 'pnpm-audit'
    severity: 'low' | 'medium' | 'high' | 'critical' | 'unknown'
    packageName: string
    manifestPath?: string | null
    ruleId?: string | null
    summary?: string | null
    fixable?: boolean
    fixStrategy?: 'upgrade' | 'lock' | 'wait-upstream' | 'manual' | 'override' | null
    recommendedVersion?: string | null
    htmlUrl?: string | null
    fixStatus?: 'success' | 'failed' | 'skipped' | 'converged' | 'not-tried' | 'pending'
    errorMessage?: string | null
    /**
     * 上游已关闭时间戳（todo.md §M20.3 reconcile 字段，§M20.6 扩展到 fixtures 用例）。
     * ISO 字符串或 null（默认 null = 活跃）。
     * 提供后 fixtures.post.ts 写入 ScanResult.supersededAt 字段，
     * 用于验证"显示已解决"开关切换行为 + 状态列"已关闭"显示。
     */
    supersededAt?: string | null
    /**
     * 规范化上游 ID（todo.md §M20.3 实体升级）。
     * per-alert 模型下 (repositoryId, upstreamId) 复合唯一索引要求必填。
     * 不提供时 fixtures.post.ts 自动按 `${source}:auto-${counter}` 生成（保证唯一）。
     */
    upstreamId?: string
    /**
     * 首次发现时间（todo.md §M20.3）。不提供时 fixtures.post.ts 自动填 now()。
     */
    firstSeenAt?: string
    /**
     * 最近见到时间（todo.md §M20.3）。不提供时 fixtures.post.ts 自动填 now()。
     */
    lastSeenAt?: string
    /**
     * 跨次扫描累计出现次数（todo.md §M20.3）。默认 1。
     */
    occurrenceCount?: number
}

export interface AlertsRowgroupFixtures {
    repos: { owner: string, name: string }[]
    scanRuns: ScanRunFixture[]
    scanResults: ScanResultFixture[]
}

/**
 * alerts-rowgroup.e2e.test.ts 默认 fixtures（与原 MOCK_ALERTS / MOCK_REPOS 语义对齐）：
 *
 * - repos: 2 个（foo/bar + foo/baz）
 * - scanRuns: 3 个（foo/bar × 2 + foo/baz × 1）
 * - scanResults: 6 个（todo.md §M20.6 增加 2 条用于验证"显示已解决"开关 + 状态列 superseded 显示）
 *   - lodash × 2 in foo/bar run 0（high dependabot + medium code-scanning）
 *   - lodash × 1 in foo/bar run 1（high dependabot，跨 run 用于 occurrenceCount 断言）
 *   - axios × 1 in foo/baz run 2（low pnpm-audit）
 *   - minimist × 1 in foo/bar run 1（high dependabot，supersededAt 非空 → 测试"显示已解决"开关）
 *   - node-fetch × 1 in foo/bar run 0（high dependabot，fixStatus=success → 测试"已修复"始终显示）
 *
 * 覆盖 rowGroup by packageName（4 个 packageName） + repository（2 个 repo） +
 * 视图切换 + occurrenceCount + 展开/折叠 + includeSuperseded 开关 + 状态列 superseded 显示
 *
 * 不要扩展这个集合除非新测试需要；保持 minimum fixture 避免污染其他 e2e 文件
 */
export const ALERTS_ROWGROUP_FIXTURES: AlertsRowgroupFixtures = {
    repos: [
        { owner: 'foo', name: 'bar' },
        { owner: 'foo', name: 'baz' },
    ],
    scanRuns: [
        {
            repositoryOwner: 'foo',
            repositoryName: 'bar',
            mode: 'report-only',
            severityThreshold: 'high',
            executorKind: 'github-action',
            status: 'completed',
            summary: { alertsFound: 3, alertsFixed: 1 },
        },
        {
            repositoryOwner: 'foo',
            repositoryName: 'bar',
            mode: 'report-only',
            severityThreshold: 'high',
            executorKind: 'github-action',
            status: 'completed',
            summary: { alertsFound: 1, alertsFixed: 0 },
        },
        {
            repositoryOwner: 'foo',
            repositoryName: 'baz',
            mode: 'report-only',
            severityThreshold: 'low',
            executorKind: 'container',
            status: 'completed',
            summary: { alertsFound: 1, alertsFixed: 0 },
        },
    ],
    scanResults: [
        // lodash alerts in foo/bar run 0（2 条不同 source/severity）
        {
            scanRunIndex: 0,
            upstreamId: 'dependabot:lodash-001',
            source: 'dependabot',
            severity: 'high',
            packageName: 'lodash',
            manifestPath: 'package.json',
            ruleId: null,
            summary: 'prototype pollution',
            fixable: true,
            fixStrategy: 'upgrade',
            recommendedVersion: '4.18.0',
            htmlUrl: null,
            fixStatus: 'pending',
        },
        {
            scanRunIndex: 0,
            upstreamId: 'code-scanning:lodash-001',
            source: 'code-scanning',
            severity: 'medium',
            packageName: 'lodash',
            manifestPath: 'src/utils/x.ts',
            ruleId: 'js/incomplete-sanitization',
            summary: 'incomplete sanitization',
            fixable: false,
            fixStrategy: null,
            recommendedVersion: null,
            htmlUrl: null,
            fixStatus: 'pending',
        },
        // node-fetch in foo/bar run 0（fixStatus=success，验证"已修复"始终显示，不受 supersededAt 影响）
        {
            scanRunIndex: 0,
            upstreamId: 'dependabot:node-fetch-001',
            source: 'dependabot',
            severity: 'high',
            packageName: 'node-fetch',
            manifestPath: 'package.json',
            ruleId: null,
            summary: 'SSRF',
            fixable: true,
            fixStrategy: 'upgrade',
            recommendedVersion: '2.7.0',
            htmlUrl: null,
            fixStatus: 'success',
        },
        // lodash alerts in foo/bar run 1（跨 run occurrenceCount 断言用）
        {
            scanRunIndex: 1,
            upstreamId: 'dependabot:lodash-002',
            source: 'dependabot',
            severity: 'high',
            packageName: 'lodash',
            manifestPath: 'package.json',
            ruleId: null,
            summary: 'prototype pollution',
            fixable: true,
            fixStrategy: 'upgrade',
            recommendedVersion: '4.18.0',
            htmlUrl: null,
            fixStatus: 'pending',
        },
        // minimist in foo/bar run 1（supersededAt 非空，验证"显示已解决"开关）
        {
            scanRunIndex: 1,
            upstreamId: 'dependabot:minimist-001',
            source: 'dependabot',
            severity: 'high',
            packageName: 'minimist',
            manifestPath: 'package.json',
            ruleId: null,
            summary: 'prototype pollution',
            fixable: true,
            fixStrategy: 'upgrade',
            recommendedVersion: '1.2.8',
            htmlUrl: null,
            fixStatus: 'pending',
            supersededAt: '2026-08-26T10:00:00.000Z',
        },
        // axios alerts in foo/baz run 2
        {
            scanRunIndex: 2,
            upstreamId: 'pnpm-audit:axios-001',
            source: 'pnpm-audit',
            severity: 'low',
            packageName: 'axios',
            manifestPath: 'package.json',
            ruleId: null,
            summary: 'CVE-2026-xxxxx',
            fixable: true,
            fixStrategy: 'upgrade',
            recommendedVersion: '1.7.5',
            htmlUrl: null,
            fixStatus: 'pending',
        },
    ],
}

/**
 * 注入 alerts-rowgroup 默认 fixtures（幂等：repos 按 owner+name+platform 查重复用）。
 *
 * 在 global-setup 中调用：使用 setupCtx.request（注册后已关闭）或 admin storageState 新 ctx
 * 都能调用，要求请求 ctx 已认证为 admin（或 server 端默认放行；当前实现不需要 auth，
 * 因为 E2E_TEST 门控是唯一鉴权）
 */
export async function seedAlertsRowgroupFixtures(
    request: APIRequestContext,
): Promise<void> {
    await seedCustomFixtures(request, ALERTS_ROWGROUP_FIXTURES)
}

/**
 * 注入自定义 fixtures（type-safe wrapper；生产构建 E2E_TEST != true 时端点返回 404，
 * 这里捕获后给出可读错误便于排查）
 */
export async function seedCustomFixtures(
    request: APIRequestContext,
    fixtures: AlertsRowgroupFixtures,
): Promise<void> {
    const response = await request.post('/api/e2e/fixtures', { data: fixtures })
    if (!response.ok()) {
        const body = await response.text().catch(() => '')
        throw new Error(
            `[fixtures] POST /api/e2e/fixtures failed: ${response.status()} ${response.statusText()}${body ? ` body=${body}` : ''}`,
        )
    }
}

/**
 * 清理 alerts-rowgroup fixtures（按 fixture key 删除关联数据，避免 CI 跨 run 累积）。
 *
 * 清理顺序（外键 CASCADE 保证）：
 * 1. ScanResult：按 repo id 反查 scan_run 后级联清空
 * 2. ScanRun：按 repo id 清空
 * 3. Repository：按 owner/name 清空
 *
 * 在 global-setup 调用 `seedAlertsRowgroupFixtures` 之前调用，确保每次 e2e run 库状态干净。
 * 幂等：依赖 entity 内置删除 + CASCADE，重复调用安全（删除已不存在的记录无副作用）。
 */
export async function cleanAlertsRowgroupFixtures(
    request: APIRequestContext,
): Promise<void> {
    const response = await request.delete('/api/e2e/fixtures', {
        data: { repos: ALERTS_ROWGROUP_FIXTURES.repos },
    })
    if (!response.ok()) {
        const body = await response.text().catch(() => '')
        throw new Error(
            `[fixtures] DELETE /api/e2e/fixtures failed: ${response.status()} ${response.statusText()}${body ? ` body=${body}` : ''}`,
        )
    }
}
