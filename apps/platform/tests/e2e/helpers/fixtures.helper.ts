import type { APIRequestContext } from '@playwright/test'
import type { RunFailureKind, RunFailureStage } from '#server/services/run-failure-classify'

/**
 * e2e fixtures helper：通过 POST /api/e2e/fixtures 注入 server-side fixtures。
 *
 * 背景（todo.md §M16.5 E2E timeout 修复）：
 * - alerts.vue 迁移 useAsyncData 后 SSR 阶段在 server 进程内 fetch /api/alerts
 * - page.route() 拦截不到 server 内 fetch → SSR 阶段真实打 server → e2e 库空 → hydration
 *   alerts.value=[] → 迁移前的 rowGroup 不渲染 → rowGroup 测试 timeout 重试 →
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
    /**
     * 主键覆盖（雪花 ID 十六进制串）。缺省由 `BaseEntity.setId` 生成；
     * 视觉回归基线需要确定性的短 ID 文本（运行抽屉 / 运行详情弹窗会渲染它）。
     */
    id?: string
    /**
     * 时间戳覆盖。缺省由 fixtures 端点填注入时刻 `now()`：`createdAt` 参与运行列表排序与
     * 「最近运行」统计，`startedAt` / `finishedAt` 渲染在运行列表 / 详情弹窗 / 运行抽屉上。
     * `startedAt` / `finishedAt` 传 `null` 表示显式置空（与「不传走状态默认值」区分）。
     */
    createdAt?: string
    startedAt?: string | null
    finishedAt?: string | null
    mode?: 'report-only' | 'fix' | 'fix-and-pr'
    severityThreshold?: 'low' | 'medium' | 'high' | 'critical'
    executorKind?: 'container' | 'github-action' | 'sandbox'
    status?: 'pending' | 'running' | 'completed' | 'failed'
    summary?: {
        alertsFound: number
        alertsFixed: number
        /** 告警级未修复数（旧数据可缺省，UI 回退近似公式） */
        alertsUnfixed?: number
        /** 已收敛（未修复口径排除项） */
        alertsConverged?: number
        /** 环境性失败事件数（UI 在列缺失时回退该值） */
        environmentalFailures?: number
        /** 交付跳过（基线红）：受影响仓库数 / 新建 issue 数 / 草稿 PR 数 */
        deliverySkipped?: number
        deliverySkipIssues?: number
        deliverySkipDraftPrs?: number
        /** 跳过总数与按原因分组（结果披露） */
        alertsSkipped?: number
        alertsSkippedByReason?: Partial<Record<
            'subdirectory-manifest' | 'cross-major' | 'not-fixable' | 'override-protected' | 'repeated-failure',
            number
        >>
        /** 截断总数与按严重级别分组（结果披露） */
        alertsTruncated?: number
        alertsTruncatedBySeverity?: Partial<Record<'critical' | 'high' | 'medium' | 'low' | 'unknown', number>>
    }
    /** 进程级退出码（缺省 null） */
    exitCode?: number | null
    /** 环境性失败计数列（缺省 null） */
    environmentalFailureCount?: number | null
    /** 执行级错误（写入 `errorJson`；详情弹窗失败横幅据此渲染，与 `failureCode` 同源） */
    error?: { code: string, message: string }
    /** 失败分类三列（复用服务端枚举，避免与端点校验的类型漂移） */
    failureCode?: string
    failureStage?: RunFailureStage
    failureKind?: RunFailureKind
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
    /**
     * 创建时间。不提供时由实体默认值（插入时刻）填充。
     * alerts 页「原始列表」视图按 `createdAt DESC` 排序——视觉基线需逐像素可复现时必须钉死，
     * 否则同批次插入落在同一毫秒形成排序并列，行序随数据库返回顺序漂移。
     */
    createdAt?: string
}

/** 归一化构建 / 部署信号（写入 `signals_json`；`observedAt` 由 fixtures 端点写入时刻填充） */
export interface PRCheckSignalFixture {
    kind: 'check' | 'status' | 'deployment'
    provider: string
    name: string
    state: 'pending' | 'success' | 'failure' | 'error' | 'neutral' | 'skipped'
    rawState?: string | null
    sourceId?: string | null
    targetUrl?: string | null
    logUrl?: string | null
    summary?: string | null
    /** 失败归因（供视觉基线构造带归因标签的信号；缺省不写该字段） */
    attribution?: 'self_caused' | 'pre_existing' | 'external_noise' | 'cancelled' | 'unknown'
}

/** 失败源条目（写入 `failure_sources_json`；缺省时按 `signals` 派生） */
export interface PRCheckFailureSourceFixture {
    provider: string
    name: string
    kind: 'check' | 'status' | 'deployment'
}

export interface PRCheckFixture {
    /** 引用 repos 中已存在的仓库 */
    repositoryOwner: string
    repositoryName: string
    prNumber: number
    headSha: string
    authorLogin: string
    conclusion?: 'success' | 'failure' | 'neutral' | 'cancelled' | 'timed_out' | 'action_required' | 'stale' | 'pending' | 'skipped'
    checkRunId?: string | null
    detailsUrl?: string | null
    errorMessage?: string | null
    alertFiring?: boolean
    /** 用户 ack 时间（ISO 串）；设置后「Alert 状态」列渲染为已确认态 */
    acknowledgedAt?: string | null
    acknowledgedByUserId?: string | null
    /** 最近采集时间（ISO 串，必填）：视觉基线依赖确定性取值（语义见「最近采集」列提示） */
    lastPolledAt: string
    /** 聚合构建 / 部署状态（缺省 null = 本列上线前的历史行） */
    overallStatus?: 'pending' | 'success' | 'failure' | null
    /** 归一化三源信号（缺省不写 `signals_json`） */
    signals?: PRCheckSignalFixture[]
    /** 失败源清单（缺省按 `signals` 派生） */
    failureSources?: PRCheckFailureSourceFixture[]
}

/**
 * fixtures 注入载荷（`POST /api/e2e/fixtures` 的 body 形状）。
 *
 * 名称沿革：原为 `AlertsRowgroupFixtures`（只有 alerts-rowgroup 数据集用到），
 * 接入 `prChecks` 字段后成为通用载荷类型，故更名；数据集常量名保持不变。
 */
export interface FixturesPayload {
    repos: { owner: string, name: string, tags?: string[] }[]
    scanRuns: ScanRunFixture[]
    scanResults: ScanResultFixture[]
    /** PR Check 数据（视觉套件 pr-checks 页行级基线用；e2e 数据集可不提供） */
    prChecks?: PRCheckFixture[]
}

/**
 * alerts-rowgroup.e2e.test.ts 默认 fixtures（与原 MOCK_ALERTS / MOCK_REPOS 语义对齐）：
 *
 * - repos: 2 个（foo/bar + foo/baz）
 * - scanRuns: 3 个（foo/bar × 2 + foo/baz × 1）
 * - scanResults: 6 个（todo.md §M20.6 增加 2 条用于验证"显示已解决"开关 + 状态列 superseded 显示）
 *   - lodash × 2 in foo/bar run 0（high dependabot + medium code-scanning）
 *   - lodash × 1 in foo/bar run 1（high dependabot，跨 run 用于 occurrenceCount 断言）
 *     注：lodash 三条 occurrenceCount 取 2 / 1 / 3（跨档跨 run 各异）——既覆盖「跨次累计」语义，
 *     也是「用户按其它列排序后分组仍连续」断言的区分度来源（全部相同则排序后无法暴露拆组回归）。
 *   - axios × 1 in foo/baz run 2（low pnpm-audit）
 *   - minimist × 1 in foo/bar run 1（high dependabot，supersededAt 非空 → 测试"显示已解决"开关）
 *   - node-fetch × 1 in foo/bar run 0（high dependabot，fixStatus=success → 测试"已修复"始终显示）
 *
 * 覆盖 rowGroup by packageName（4 个 packageName） + repository（2 个 repo） +
 * 视图切换 + occurrenceCount + 展开/折叠 + includeSuperseded 开关 + 状态列 superseded 显示
 *
 * **跨 severity 契约**：lodash 在同一仓库（foo/bar run 0）同时含 high（dependabot）与
 * medium（code-scanning），是「一个包一组」的断言数据源——修复前按行 severity 降序会把两档拆到
 * 不同区块、渲染重复分组头；`alerts-rowgroup` 的「同一包跨 severity 只渲染一个分组头」用例据此断言。
 *
 * 不要扩展这个集合除非新测试需要；保持 minimum fixture 避免污染其他 e2e 文件
 */
export const ALERTS_ROWGROUP_FIXTURES: FixturesPayload = {
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
            occurrenceCount: 2,
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
            occurrenceCount: 3,
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
 *
 * maxRetries：CI 环境首请求偶现 ECONNRESET（global-setup 串行 5+ 次 setupPage.request /
 * pageSignIn 后立即发请求；可能与服务端 better-auth session 写入后 SQLite 连接释放
 * 存在窗口竞争，详见 CI run 33525721103 复盘）。Playwright 1.62 `_sendRequestWithRetries`
 * 仅对 `e.code === 'ECONNRESET'` 触发 250ms 指数 backoff 重试（其他网络错误码如
 * ECONNREFUSED / ETIMEDOUT 不重试），maxRetries=2 覆盖本次失败模式；服务端 handler 不动，
 * 本地/CI 行为等价。
 */
export async function seedCustomFixtures(
    request: APIRequestContext,
    fixtures: FixturesPayload,
): Promise<void> {
    const response = await request.post('/api/e2e/fixtures', {
        data: fixtures,
        maxRetries: 2,
    })
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
 * 幂等：依赖 entity 内置删除 + CASCADE，重复调用安全（删除不存在记录返回 0）。
 *
 * maxRetries：与 `seedCustomFixtures` 同因——CI 环境首请求偶现 ECONNRESET（global-setup
 * 串行 5+ 次 setupPage.request / pageSignIn 后立即发请求；详见 CI run 33525721103 复盘）。
 * Playwright 1.62 `_sendRequestWithRetries` 仅对 `e.code === 'ECONNRESET'` 触发 250ms
 * 指数 backoff 重试，maxRetries=2 覆盖本次失败模式；服务端 handler 不动，本地/CI 行为等价。
 */
export async function cleanAlertsRowgroupFixtures(
    request: APIRequestContext,
): Promise<void> {
    const response = await request.delete('/api/e2e/fixtures', {
        data: { repos: ALERTS_ROWGROUP_FIXTURES.repos },
        maxRetries: 2,
    })
    if (!response.ok()) {
        const body = await response.text().catch(() => '')
        throw new Error(
            `[fixtures] DELETE /api/e2e/fixtures failed: ${response.status()} ${response.statusText()}${body ? ` body=${body}` : ''}`,
        )
    }
}
