import { createError, defineEventHandler, readBody } from 'h3'
import { z } from 'zod'
import { ensureDatabaseInitialized } from '#server/database'
import { Repository } from '#server/entities/repository'
import { ScanRun, SCAN_RUN_STATUSES } from '#server/entities/scan-run'
import { RUN_FAILURE_KINDS, RUN_FAILURE_STAGES } from '#server/services/run-failure-classify'
import { ScanResult } from '#server/entities/scan-result'
import { PRCheck, PR_CHECK_CONCLUSIONS } from '#server/entities/pr-check'
import { resolveOrganizationId } from '#server/utils/organization'
import { summarizeFailureSources } from '#server/services/monitor/build-signals'
import { repositoryTagsSchema } from '#server/schemas/repository'

// useRuntimeConfig 由 Nuxt/Nitro auto-import 提供（vitest 环境由 tests/setup-nuxt-server.ts stub）
// 不在 h3 中显式 import，避免被 h3 解析为 undefined（h3 不导出 useRuntimeConfig）

/**
 * POST /api/e2e/fixtures：e2e fixtures 注入端点。
 *
 * 设计动机（todo.md §M16.5）：
 * - alerts.vue 迁移到 useAsyncData 后，SSR 阶段 useAsyncData handler 在 server 进程内
 *   发起 fetch，page.route() 拦截不到（playwright route 只能拦浏览器请求）。
 * - e2e 测试如果只 page.route mock /api/alerts + /api/repos，SSR 阶段 fetch 会真实打
 *   server，e2e 库空 → hydration 时 alerts.value=[] → 迁移前的 rowGroup subheader 不渲染 →
 *   rowGroup 测试 timeout 重试 → E2E job 累计 ≥ 20min → workflow timeout-minutes 取消。
 * - 修复路径：global-setup 通过本端点注入真实 fixtures（repos + scanRuns + scanResults），
 *   tests/e2e/alerts-rowgroup.e2e.test.ts 去掉 page.route mock alerts/repos，依赖
 *   server 真实返回 fixtures 数据，验证 useAsyncData SSR-aware 行为。
 *
 * 安全门控：双门控 `E2E_TEST === 'true'` + `runtimeConfig.e2eFixturesAllowed`（hard requirement：
 * docs/standards/platform.md §3.6 + security.md §2.1.4）。Nitro 无条件注册 server/api/* →
 * 生产构建 .output/server/chunks/routes/api/e2e/fixtures.post.mjs 存在，但生产构建
 * `runtimeConfig.e2eFixturesAllowed` 默认 false，仅 e2e webServer 启动时通过
 * `NUXT_E2E_FIXTURES_ALLOWED=true` 显式覆盖为 true 才能调通；runtimeConfig 是 Nuxt
 * 官方运行时覆盖通道，绕开 Nitro/esbuild `process.env.NODE_ENV` 静态替换陷阱。
 * 当前实现未叠加 requireAuth：测试场景可接受（playwright e2e 用例独立角色鉴权）。
 *
 * 幂等策略：
 * - repos 按 owner+name+platform 查重（与 POST /api/repos 唯一性约束一致），已存在则复用 id
 *   标记 created=false（保证 global-setup 重复执行不报错）
 * - scanRuns 每次新建（每次 e2e 跑模拟一次新扫描；与历史 run 共存用于跨次去重断言）；
 *   显式传 `id` 时按主键覆盖写入，不再新增行——视觉套件依赖 global-setup 先 DELETE 保证是新建
 * - scanResults 跟随 scanRun 创建（无需查重，每条都是独立告警）
 * - prChecks 按 (repositoryId, prNumber, headSha) 复合唯一索引查重复用（同 repos 语义；
 *   该写入路径只服务测试——视觉套件需要 pr-checks 页行级基线，见 tests/visual/helpers/fixtures.ts）
 *
 * 清理策略：DELETE /api/e2e/fixtures（同名端点 .delete.ts）按 owner/name 级联清理关联
 * 数据；global-setup 在 seed 前调用避免跨 run 累积。
 */

const repoSchema = z.object({
    owner: z.string().min(1).max(100),
    name: z.string().min(1).max(100),
    platform: z.enum(['github']).default('github'),
    /**
     * 执行器类型（默认 container）。生产仓库 schema 已拒绝 sandbox（2026-10-27 入口临时关闭）；
     * 本字段仅供 e2e 注入**存量** sandbox 仓库，验证 UI 迁移提示与编排层强制降级路径。
     */
    executorKind: z.enum(['container', 'github-action', 'sandbox']).default('container'),
    /**
     * 仓库标签（可选）。视觉回归基线需要确定性的标签列渲染，否则该列只能落空态；
     * 写入口径与 POST /api/repos 一致（同一 `repositoryTagsSchema`：trim + 去重 + 容量上限；
     * JSON 字符串存储；空数组 / 缺省写 null）。
     * 注意：按 owner/name 复用既有仓库时**不更新**该字段（幂等语义），标签仅在该仓库首次创建时生效。
     */
    tags: repositoryTagsSchema.optional(),
})

const scanRunSchema = z.object({
    /** 引用 repos 中已存在的仓库（owner/name 组合在 repos 中唯一） */
    repositoryOwner: z.string().min(1),
    repositoryName: z.string().min(1),
    /**
     * 主键覆盖（雪花 ID 十六进制串，最长 36）。缺省由 `BaseEntity.setId` 生成。
     * 运行 ID 以短 ID 形式渲染在运行抽屉与运行详情弹窗上 → 视觉基线需要确定性取值。
     */
    id: z.string().min(1).max(36).optional(),
    /**
     * 时间戳覆盖。缺省填注入时刻 `now()`；`createdAt` 参与「最近运行」统计与运行列表排序，
     * `startedAt` / `finishedAt` 渲染在运行列表 / 运行详情弹窗 / 运行抽屉上 → 视觉基线需要确定性取值。
     * `startedAt` / `finishedAt` 传 `null` 表示显式置空（与「不传走状态默认值」区分）。
     */
    createdAt: z.string().optional(),
    startedAt: z.string().nullable().optional(),
    finishedAt: z.string().nullable().optional(),
    /** 执行级错误（写入 `errorJson`；详情弹窗失败横幅据此渲染，与 `failureCode` 同源） */
    error: z.object({
        code: z.string().max(64),
        message: z.string().max(500),
    }).optional(),
    mode: z.enum(['report-only', 'fix', 'fix-and-pr']).default('report-only'),
    severityThreshold: z.enum(['low', 'medium', 'high', 'critical']).default('high'),
    // 生产仓库 schema 已拒绝 sandbox（2026-10-27 入口临时关闭）；本 fixture 保留 sandbox 以模拟存量仓库降级路径。
    executorKind: z.enum(['container', 'github-action', 'sandbox']).default('container'),
    /** 复用 ScanRunStatus 实体枚举（单点声明；避免 schema 与 entity 不同步） */
    status: z.enum(SCAN_RUN_STATUSES).default('completed'),
    /** 汇总统计（JSON；与 ScanRun.summaryJson 字段对齐） */
    summary: z.object({
        alertsFound: z.number().int().min(0),
        alertsFixed: z.number().int().min(0),
        /** 告警级未修复数（旧数据可缺省，UI 回退近似公式） */
        alertsUnfixed: z.number().int().min(0).optional(),
        /** 已收敛（未修复口径排除项） */
        alertsConverged: z.number().int().min(0).optional(),
        /** 环境性失败事件数（UI 在列缺失时回退该值） */
        environmentalFailures: z.number().int().min(0).optional(),
        /** 交付跳过（基线红）：受影响仓库数 / 新建 issue 数 / 草稿 PR 数 */
        deliverySkipped: z.number().int().min(0).optional(),
        deliverySkipIssues: z.number().int().min(0).optional(),
        deliverySkipDraftPrs: z.number().int().min(0).optional(),
        /** 跳过总数与按原因分组（结果披露） */
        alertsSkipped: z.number().int().min(0).optional(),
        alertsSkippedByReason: z.object({
            'subdirectory-manifest': z.number().int().min(0).optional(),
            'cross-major': z.number().int().min(0).optional(),
            'not-fixable': z.number().int().min(0).optional(),
            'override-protected': z.number().int().min(0).optional(),
            'repeated-failure': z.number().int().min(0).optional(),
        }).optional(),
        /** 截断总数与按严重级别分组（结果披露） */
        alertsTruncated: z.number().int().min(0).optional(),
        alertsTruncatedBySeverity: z.object({
            critical: z.number().int().min(0).optional(),
            high: z.number().int().min(0).optional(),
            medium: z.number().int().min(0).optional(),
            low: z.number().int().min(0).optional(),
            unknown: z.number().int().min(0).optional(),
        }).optional(),
    }).optional(),
    /** 进程级退出码（缺省 null；视觉基线可钉死非 null 值） */
    exitCode: z.number().int().min(0).max(255).nullable().optional(),
    /** 环境性失败计数列（缺省 null；与 summary.environmentalFailures 同源） */
    environmentalFailureCount: z.number().int().min(0).nullable().optional(),
    /** 失败分类（运行失败筛选 e2e 基线；与 ScanRun.failureCode / failureStage / failureKind 对齐） */
    failureCode: z.string().max(64).optional(),
    failureStage: z.enum(RUN_FAILURE_STAGES).optional(),
    failureKind: z.enum(RUN_FAILURE_KINDS).optional(),
})

/**
 * 解析 fixtures 的时间戳覆盖：`undefined`（未传）用调用方给的状态默认值，`null` 显式置空。
 * 视觉回归基线要求确定性取值（见 `tests/visual/helpers/fixtures.ts`）。
 */
const resolveTimestamp = (override: string | null | undefined, fallback: Date | null): Date | null => {
    if (override === undefined) {
        return fallback
    }
    return override === null ? null : new Date(override)
}

const scanResultSchema = z.object({
    /** 引用 scanRuns 数组中已创建的 index（0-based） */
    scanRunIndex: z.number().int().min(0),
    /** per-alert 模型唯一索引第二段（todo.md §M20.3 实体升级）；不传则自动生成（避免跨 fixture 冲突） */
    upstreamId: z.string().max(255).optional(),
    source: z.enum(['dependabot', 'code-scanning', 'code-quality', 'pnpm-audit']),
    severity: z.enum(['low', 'medium', 'high', 'critical', 'unknown']),
    packageName: z.string().max(255),
    manifestPath: z.string().max(500).nullable().optional(),
    ruleId: z.string().max(255).nullable().optional(),
    summary: z.string().nullable().optional(),
    fixable: z.boolean().default(false),
    fixStrategy: z.enum(['upgrade', 'lock', 'wait-upstream', 'manual', 'override']).nullable().optional(),
    recommendedVersion: z.string().max(100).nullable().optional(),
    htmlUrl: z.string().max(500).nullable().optional(),
    fixStatus: z.enum(['success', 'failed', 'skipped', 'converged', 'not-tried', 'pending']).default('pending'),
    errorMessage: z.string().nullable().optional(),
    /** 跨次扫描累计出现次数（todo.md §M20.3）；默认 1 */
    occurrenceCount: z.number().int().min(0).default(1),
    /** 首次发现时间（todo.md §M20.3）；不传则自动 now() */
    firstSeenAt: z.string().nullable().optional(),
    /** 最近见到时间（todo.md §M20.3）；不传则自动 now() */
    lastSeenAt: z.string().nullable().optional(),
    /** 上游已关闭时间（todo.md §M20.3 reconcile 函数写入，§M20.6 扩展到 fixtures 用例）；不传则 null（活跃） */
    supersededAt: z.string().nullable().optional(),
    /**
     * 创建时间：原始列表（alerts 页「原始列表」视图）按 `createdAt DESC` 排序，故视觉基线必须钉死——
     * 不传时同批次插入落在同一毫秒会形成排序并列，并列顺序由数据库返回顺序决定 → 行序逐次漂移。
     */
    createdAt: z.string().optional(),
})

/**
 * PR Check fixtures（apps/platform/tests/visual 的 pr-checks 页行级基线用）。
 *
 * 该表原本没有任何写入路径（行数据只由 GitHub 轮询产生）→ pr-checks 页视觉基线只覆盖空态与表头密度。
 * 这里补一条**仅测试可达**的写入路径（双门控同本文件），使该页行级渲染进入基线：
 * 结论标签 / Alert 状态三态（firing / 已 ack / OK）/ 最近轮询列 / ack 按钮。
 *
 * 幂等：按实体复合唯一索引 `(repositoryId, prNumber, headSha)` 查重复用，已存在不更新字段
 * （与 repo 的幂等语义一致；视觉套件每次先 DELETE 再 seed，不依赖更新语义）。
 */
const prCheckSignalSchema = z.object({
    /** 信号来源（check run / commit status / deployment） */
    kind: z.enum(['check', 'status', 'deployment']),
    /** provider 归因（如 `github-actions` / `vercel`） */
    provider: z.string().min(1).max(100),
    /** 展示名（check 名 / status context / deployment environment） */
    name: z.string().min(1).max(200),
    /** 归一化状态 */
    state: z.enum(['pending', 'success', 'failure', 'error', 'neutral', 'skipped']),
    /** 原始 GitHub 取值（可选） */
    rawState: z.string().max(64).nullable().optional(),
    /** 源侧 id（可选） */
    sourceId: z.string().max(64).nullable().optional(),
    /** 详情 / 日志链接（可选） */
    targetUrl: z.string().max(500).nullable().optional(),
    logUrl: z.string().max(500).nullable().optional(),
    /** 摘要（可选；上限与生产 `SIGNAL_SUMMARY_MAX_LENGTH` 对齐） */
    summary: z.string().max(300).nullable().optional(),
    /** 失败归因（可选；供视觉基线构造带标签的信号） */
    attribution: z.enum(['self_caused', 'pre_existing', 'external_noise', 'cancelled', 'unknown']).optional(),
})

const prCheckFailureSourceSchema = z.object({
    provider: z.string().min(1).max(100),
    name: z.string().min(1).max(200),
    kind: z.enum(['check', 'status', 'deployment']),
})

const prCheckSchema = z.object({
    /** 引用 repos 中已存在的仓库（owner/name 组合在 repos 中唯一） */
    repositoryOwner: z.string().min(1),
    repositoryName: z.string().min(1),
    /** PR 编号（GitHub pull_request.number） */
    prNumber: z.number().int().min(1),
    /** PR HEAD SHA（实体列长 40；短 SHA 亦可，供 fixture 省略书写） */
    headSha: z.string().min(1).max(40),
    /** PR 作者 login（如 `dependfix[bot]` / `dependabot[bot]`） */
    authorLogin: z.string().min(1).max(100),
    /** check 结论；复用实体枚举单点声明（避免 schema 与 entity 不同步） */
    conclusion: z.enum(PR_CHECK_CONCLUSIONS).default('pending'),
    checkRunId: z.string().max(64).nullable().optional(),
    detailsUrl: z.string().max(500).nullable().optional(),
    errorMessage: z.string().nullable().optional(),
    alertFiring: z.boolean().default(false),
    /** 用户 ack 时间（ISO 串；null = 未 ack） */
    acknowledgedAt: z.string().nullable().optional(),
    acknowledgedByUserId: z.string().max(36).nullable().optional(),
    /** 最近轮询时间（实体列 NOT NULL）：**必填**，视觉基线需要确定性的时间列取值 */
    lastPolledAt: z.string().min(1),
    /** 聚合构建 / 部署状态（缺省 null = 本列上线前的历史行） */
    overallStatus: z.enum(['pending', 'success', 'failure']).nullable().optional(),
    /** 归一化三源信号（写入 `signals_json`；`observedAt` 由写入时刻填充；条数上限与生产 `MAX_SIGNALS_PER_PR` 对齐） */
    signals: z.array(prCheckSignalSchema).max(50).optional(),
    /** 失败源清单（写入 `failure_sources_json`；缺省时按 `signals` 派生，与生产同源） */
    failureSources: z.array(prCheckFailureSourceSchema).optional(),
})

const fixturesBodySchema = z.object({
    repos: z.array(repoSchema).optional(),
    scanRuns: z.array(scanRunSchema).optional(),
    scanResults: z.array(scanResultSchema).optional(),
    prChecks: z.array(prCheckSchema).optional(),
})

export default defineEventHandler(async (event) => {
    // 双门控（hard requirement：platform.md §3.6 + security.md §2.1.4）：
    // E2E_TEST !== 'true' || !runtimeConfig.e2eFixturesAllowed → 404
    // 不能直接用 process.env.NODE_ENV 作第二门控——Nitro/esbuild 构建期会把
    // process.env.NODE_ENV 静态替换为构建时值，导致 prod build 表达式折叠后永远 404。
    // runtimeConfig.e2eFixturesAllowed 通过 NUXT_E2E_FIXTURES_ALLOWED 运行时覆盖，绕开 esbuild define。
    const config = useRuntimeConfig()
    if (process.env.E2E_TEST !== 'true' || !config.e2eFixturesAllowed) {
        throw createError({ statusCode: 404, statusMessage: 'Not Found' })
    }

    const body = await readBody<Record<string, unknown>>(event).catch(() => ({}))
    const parsed = fixturesBodySchema.safeParse(body)
    if (!parsed.success) {
        throw createError({
            statusCode: 400,
            statusMessage: 'Fixtures body validation failed',
            data: { issues: parsed.error.issues },
        })
    }

    const ds = await ensureDatabaseInitialized()
    const repoRepo = ds.getRepository(Repository)
    const runRepo = ds.getRepository(ScanRun)
    const resultRepo = ds.getRepository(ScanResult)
    const prCheckRepo = ds.getRepository(PRCheck)

    // repos：按 owner+name+platform 查重（与实体复合唯一索引一致）
    const repoResults: { owner: string, name: string, id: string, created: boolean }[] = []
    if (parsed.data.repos) {
        // 应用层强制非空 organizationId（与 POST /api/repos 路径语义一致）
        const organizationId = await resolveOrganizationId(ds)
        for (const r of parsed.data.repos) {
            const existing = await repoRepo.findOne({
                where: { owner: r.owner, name: r.name, platform: r.platform },
            })
            if (existing) {
                repoResults.push({
                    owner: r.owner,
                    name: r.name,
                    id: existing.id,
                    created: false,
                })
                continue
            }
            const saved = await repoRepo.save(repoRepo.create({
                organizationId,
                owner: r.owner,
                name: r.name,
                platform: r.platform,
                executorKind: r.executorKind,
                tags: r.tags?.length ? JSON.stringify(r.tags) : null,
            }))
            repoResults.push({
                owner: r.owner,
                name: r.name,
                id: saved.id,
                created: true,
            })
        }
    }

    // scanRuns：通过 owner/name 反查已创建的 repo id（保证引用一致性）
    const runResults: { index: number, id: string, repositoryId: string, created: boolean }[] = []
    if (parsed.data.scanRuns) {
        for (let i = 0; i < parsed.data.scanRuns.length; i++) {
            const sr = parsed.data.scanRuns[i]!
            const repo = repoResults.find(
                (r) => r.owner === sr.repositoryOwner && r.name === sr.repositoryName,
            ) ?? await repoRepo.findOne({
                where: { owner: sr.repositoryOwner, name: sr.repositoryName },
            })
            if (!repo) {
                throw createError({
                    statusCode: 400,
                    statusMessage: `scanRuns[${i}]: repository ${sr.repositoryOwner}/${sr.repositoryName} not found in repos payload`,
                })
            }
            const repositoryId = repo.id
            const now = new Date()
            const startedAt = resolveTimestamp(sr.startedAt, sr.status === 'pending' ? null : now)
            const finishedAt = resolveTimestamp(
                sr.finishedAt,
                sr.status === 'completed' || sr.status === 'failed' ? now : null,
            )
            const saved = await runRepo.save(runRepo.create({
                // id / createdAt 走「传了才覆盖」：缺省交给 BaseEntity 与数据库默认值
                ...(sr.id ? { id: sr.id } : {}),
                ...(sr.createdAt ? { createdAt: new Date(sr.createdAt) } : {}),
                repositoryId,
                mode: sr.mode,
                severityThreshold: sr.severityThreshold,
                executorKind: sr.executorKind,
                status: sr.status,
                startedAt,
                finishedAt,
                summaryJson: sr.summary ? JSON.stringify(sr.summary) : null,
                exitCode: sr.exitCode ?? null,
                environmentalFailureCount: sr.environmentalFailureCount ?? null,
                errorJson: sr.error ? JSON.stringify(sr.error) : null,
                failureCode: sr.failureCode ?? null,
                failureStage: sr.failureStage ?? null,
                failureKind: sr.failureKind ?? null,
            }))
            runResults.push({
                index: i,
                id: saved.id,
                repositoryId,
                created: true,
            })
        }
    }

    // scanResults：通过 scanRunIndex 反查已创建的 scan run id
    const resultResults: { scanRunId: string, id: string, created: boolean }[] = []
    if (parsed.data.scanResults) {
        // counter 保证未显式传 upstreamId 时生成唯一值（per-alert 模型 (repositoryId, upstreamId) 复合唯一索引，见 todo.md §M20.3）
        let autoUpstreamIdCounter = 0
        for (const result of parsed.data.scanResults) {
            const run = runResults[result.scanRunIndex]
            if (!run) {
                throw createError({
                    statusCode: 400,
                    statusMessage: `scanResults: scanRunIndex ${result.scanRunIndex} not found in scanRuns payload`,
                })
            }
            const now = new Date()
            const upstreamId = result.upstreamId ?? `${result.source}:auto-${++autoUpstreamIdCounter}`
            const firstSeenAt = result.firstSeenAt ? new Date(result.firstSeenAt) : now
            const lastSeenAt = result.lastSeenAt ? new Date(result.lastSeenAt) : now
            const supersededAt = result.supersededAt ? new Date(result.supersededAt) : null
            const saved = await resultRepo.save(resultRepo.create({
                // createdAt 走「传了才覆盖」：缺省交给实体默认值（插入时刻）
                ...(result.createdAt ? { createdAt: new Date(result.createdAt) } : {}),
                scanRunId: run.id,
                repositoryId: run.repositoryId,
                upstreamId,
                source: result.source,
                severity: result.severity,
                packageName: result.packageName,
                manifestPath: result.manifestPath ?? null,
                ruleId: result.ruleId ?? null,
                summary: result.summary ?? null,
                fixable: result.fixable,
                fixStrategy: result.fixStrategy ?? null,
                recommendedVersion: result.recommendedVersion ?? null,
                htmlUrl: result.htmlUrl ?? null,
                fixStatus: result.fixStatus,
                errorMessage: result.errorMessage ?? null,
                occurrenceCount: result.occurrenceCount,
                firstSeenAt,
                lastSeenAt,
                supersededAt,
            }))
            resultResults.push({
                scanRunId: run.id,
                id: saved.id,
                created: true,
            })
        }
    }

    // prChecks：通过 owner/name 反查已创建的 repo id；按 (repositoryId, prNumber, headSha) 幂等
    const prCheckResults: { repositoryId: string, id: string, created: boolean }[] = []
    if (parsed.data.prChecks) {
        for (let i = 0; i < parsed.data.prChecks.length; i++) {
            const pc = parsed.data.prChecks[i]!
            const repo = repoResults.find(
                (r) => r.owner === pc.repositoryOwner && r.name === pc.repositoryName,
            ) ?? await repoRepo.findOne({
                where: { owner: pc.repositoryOwner, name: pc.repositoryName },
            })
            if (!repo) {
                throw createError({
                    statusCode: 400,
                    statusMessage: `prChecks[${i}]: repository ${pc.repositoryOwner}/${pc.repositoryName} not found`,
                })
            }
            const existing = await prCheckRepo.findOne({
                where: { repositoryId: repo.id, prNumber: pc.prNumber, headSha: pc.headSha },
            })
            if (existing) {
                prCheckResults.push({ repositoryId: repo.id, id: existing.id, created: false })
                continue
            }
            // 三源字段：信号补 observedAt（写入时刻）；失败源清单缺省时按 signals 派生（复用生产纯函数）
            const signals = (pc.signals ?? []).map((signal) => ({
                kind: signal.kind,
                provider: signal.provider,
                name: signal.name,
                state: signal.state,
                rawState: signal.rawState ?? null,
                sourceId: signal.sourceId ?? null,
                targetUrl: signal.targetUrl ?? null,
                logUrl: signal.logUrl ?? null,
                summary: signal.summary ?? null,
                /* 归因字段必须透传：schema 允许构造带归因的信号（供视觉基线覆盖标签渲染），
                   早期写入映射漏了这一项，导致 fixture 里的 attribution 静默丢失、基线无标签 */
                attribution: signal.attribution,
                observedAt: new Date(),
            }))
            const failureSources = pc.failureSources
                ?? (signals.length > 0 ? summarizeFailureSources(signals) : null)

            const saved = await prCheckRepo.save(prCheckRepo.create({
                repositoryId: repo.id,
                prNumber: pc.prNumber,
                headSha: pc.headSha,
                authorLogin: pc.authorLogin,
                conclusion: pc.conclusion,
                signalsJson: signals.length > 0 ? JSON.stringify(signals) : null,
                overallStatus: pc.overallStatus ?? null,
                failureSourcesJson: failureSources ? JSON.stringify(failureSources) : null,
                checkRunId: pc.checkRunId ?? null,
                detailsUrl: pc.detailsUrl ?? null,
                errorMessage: pc.errorMessage ?? null,
                alertFiring: pc.alertFiring,
                acknowledgedAt: pc.acknowledgedAt ? new Date(pc.acknowledgedAt) : null,
                acknowledgedByUserId: pc.acknowledgedByUserId ?? null,
                lastPolledAt: new Date(pc.lastPolledAt),
            }))
            prCheckResults.push({ repositoryId: repo.id, id: saved.id, created: true })
        }
    }

    return {
        repos: repoResults,
        scanRuns: runResults,
        scanResults: resultResults,
        prChecks: prCheckResults,
    }
})
