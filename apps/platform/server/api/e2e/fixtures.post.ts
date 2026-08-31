import { createError, defineEventHandler, readBody } from 'h3'
import { z } from 'zod'
import { ensureDatabaseInitialized } from '#server/database'
import { Repository } from '#server/entities/repository'
import { ScanRun, SCAN_RUN_STATUSES } from '#server/entities/scan-run'
import { ScanResult } from '#server/entities/scan-result'
import { resolveOrganizationId } from '#server/utils/organization'

/**
 * POST /api/e2e/fixtures：e2e fixtures 注入端点。
 *
 * 设计动机（todo.md §M16.5）：
 * - alerts.vue 迁移到 useAsyncData 后，SSR 阶段 useAsyncData handler 在 server 进程内
 *   发起 fetch，page.route() 拦截不到（playwright route 只能拦浏览器请求）。
 * - e2e 测试如果只 page.route mock /api/alerts + /api/repos，SSR 阶段 fetch 会真实打
 *   server，e2e 库空 → hydration 时 alerts.value=[] → PrimeVue rowGroup subheader 不渲染 →
 *   rowGroup 测试 timeout 重试 → E2E job 累计 ≥ 20min → workflow timeout-minutes 取消。
 * - 修复路径：global-setup 通过本端点注入真实 fixtures（repos + scanRuns + scanResults），
 *   tests/e2e/alerts-rowgroup.e2e.test.ts 去掉 page.route mock alerts/repos，依赖
 *   server 真实返回 fixtures 数据，验证 useAsyncData SSR-aware 行为。
 *
 * 安全门控：`process.env.E2E_TEST !== 'true'` 时 handler 返回 404。Nitro 无条件注册
 * server/api/* → 生产构建 .output/server/chunks/routes/api/e2e/fixtures.post.mjs 存在，
 * 但生产环境 E2E_TEST 缺省不可达；**严禁生产环境设置 E2E_TEST=true**（CI 部署硬约束，
 * docs/standards/security.md "测试环境隔离" 章节明示）。当前实现未叠加 requireAuth：
 * 测试场景可接受，prod 双重防御建议叠加 `NODE_ENV === 'production' → 404`（RG-S3 follow-up）。
 *
 * 幂等策略：
 * - repos 按 owner+name+platform 查重（与 POST /api/repos 唯一性约束一致），已存在则复用 id
 *   标记 created=false（保证 global-setup 重复执行不报错）
 * - scanRuns 每次新建（每次 e2e 跑模拟一次新扫描；与历史 run 共存用于跨次去重断言）
 * - scanResults 跟随 scanRun 创建（无需查重，每条都是独立告警）
 *
 * 清理策略：DELETE /api/e2e/fixtures（同名端点 .delete.ts）按 owner/name 级联清理关联
 * 数据；global-setup 在 seed 前调用避免跨 run 累积。
 */

const repoSchema = z.object({
    owner: z.string().min(1).max(100),
    name: z.string().min(1).max(100),
    platform: z.enum(['github']).default('github'),
})

const scanRunSchema = z.object({
    /** 引用 repos 中已存在的仓库（owner/name 组合在 repos 中唯一） */
    repositoryOwner: z.string().min(1),
    repositoryName: z.string().min(1),
    mode: z.enum(['report-only', 'fix', 'fix-and-pr']).default('report-only'),
    severityThreshold: z.enum(['low', 'medium', 'high', 'critical']).default('high'),
    executorKind: z.enum(['container', 'github-action', 'sandbox']).default('container'),
    /** 复用 ScanRunStatus 实体枚举（单点声明；避免 schema 与 entity 不同步） */
    status: z.enum(SCAN_RUN_STATUSES).default('completed'),
    /** 汇总统计（JSON；与 ScanRun.summaryJson 字段对齐） */
    summary: z.object({
        alertsFound: z.number().int().min(0),
        alertsFixed: z.number().int().min(0),
    }).optional(),
})

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
})

const fixturesBodySchema = z.object({
    repos: z.array(repoSchema).optional(),
    scanRuns: z.array(scanRunSchema).optional(),
    scanResults: z.array(scanResultSchema).optional(),
})

export default defineEventHandler(async (event) => {
    // E2E_TEST 门控：非 e2e 环境返回 404 防止生产泄漏（与 global-setup.ts 的角色 + 全局速率
    // 放宽同模式，E2E_TEST=true 时此端点才注册到路由表）
    if (process.env.E2E_TEST !== 'true') {
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
            const saved = await runRepo.save(runRepo.create({
                repositoryId,
                mode: sr.mode,
                severityThreshold: sr.severityThreshold,
                executorKind: sr.executorKind,
                status: sr.status,
                startedAt: sr.status === 'pending' ? null : now,
                finishedAt: sr.status === 'completed' || sr.status === 'failed' ? now : null,
                summaryJson: sr.summary ? JSON.stringify(sr.summary) : null,
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

    return {
        repos: repoResults,
        scanRuns: runResults,
        scanResults: resultResults,
    }
})
