#!/usr/bin/env tsx
/**
 * M20.7 backfill-scan-result：一次性数据迁移脚本。
 *
 * 背景（todo.md §M20.7）：
 * - 旧 schema ScanResult 是"每次扫描 × 每个告警"存一行（91 行 vs 13 个独立告警），
 *   无 reconcile 逻辑，上游已关闭的告警永远残留
 * - M20.3 已升级 ScanResult 实体为 per-alert 模型（每行 = 一个独立告警）+ reconcile 函数
 * - M20.5 API 改为 `supersededAt IS NULL` 默认过滤；M20.6 前端"显示已解决"开关
 * - 本脚本：把现有 N×run 重复行迁移到新模型（决策 2 保留修复记录 + 合成 upstreamId +
 +   上游已消失的标记 superseded）
 *
 * 用法：
 *   pnpm db:backfill:dry-run    # 预览迁移计划（默认模式，不写库）
 *   pnpm db:backfill            # 实跑（必须 --apply + y/N 确认）
 *
 * 数据库连接：沿用 createDataSourceOptions 逻辑（DATABASE_PATH / DATABASE_TYPE 等 env var）
 *
 * 安全门：
 * - 默认 dry-run 模式，只输出统计计划，不写库
 * - apply 模式必须显式 --apply flag + y/N 二次确认（生产安全）
 * - 整批包在一个事务里（失败回滚保证"全成功或全失败"）
 *
 * 决策依据（todo.md §M20.7 决策 1-4）：
 * - 决策 1：fixStatus='success' 永不被 supersede（保留修复记录）
 * - 决策 2：backfill 聚合时若有 success 行保留该行；否则保留最早 createdAt 行
 * - 决策 3：upstreamId 必须规范化（命名空间隔离：本脚本用 `backfill-${rowId}` 前缀）
 * - 决策 4：fixStatus='success' + supersededAt 不影响显示（决策 1 蕴含 supersedeAt=null）
 */
import { pathToFileURL } from 'node:url'
import type { EntityManager } from 'typeorm'
import { ensureDatabaseInitialized } from '../index'
import { ScanResult } from '../../entities/scan-result'
import { Repository } from '../../entities/repository'
// 注册所有 entities 到 TypeORM metadata（tsx CLI 不走 Nitro auto-load；必须显式 import 触发装饰器）
// side-effect import（仅用于触发 @Entity/@Column 装饰器注册，运行时无副作用）
 
import { ScanRun } from '../../entities/scan-run'
import { User } from '../../entities/user'
import { Session } from '../../entities/session'
import { Account } from '../../entities/account'
import { Verification } from '../../entities/verification'
import { Credential } from '../../entities/credential'
import { Organization } from '../../entities/organization'
import { Schedule } from '../../entities/schedule'
import { BatchRun } from '../../entities/batch-run'
import { AuditEvent } from '../../entities/audit-event'
void ScanResult
void Repository
void ScanRun
void User
void Session
void Account
void Verification
void Credential
void Organization
void Schedule
void BatchRun
void AuditEvent
 

/**
 * backfill 统计结果（dry-run 与 apply 共用输出格式）
 */
export interface BackfillStats {
    /** 处理前 ScanResult 总行数 */
    totalBefore: number
    /** 删除的重复行（组内非保留行） */
    deletedDuplicates: number
    /** 保留的修复记录（fixStatus='success' 永不被 supersede） */
    preservedSuccess: number
    /** 上游已消失的标记为 superseded */
    supersededAfterBackfill: number
    /** 处理后 ScanResult 总行数 */
    totalAfter: number
    /** 处理的仓库数 */
    reposProcessed: number
    /** dry-run 模式标记（apply 模式 false） */
    dryRun: boolean
}

/**
 * backfill 操作计划（plan + execute 分离）
 */
interface BackfillPlan {
    /** 需要删除的行（组内非保留行） */
    toDelete: ScanResult[]
    /** 需要更新 upstreamId 的行（保留行但 upstreamId 为空） */
    toUpdateUpstreamId: ScanResult[]
    /** 需要标记 superseded 的行（非 success + supersededAt 为 NULL） */
    toSupersede: ScanResult[]
    /** 处理前总行数 */
    totalBefore: number
    /** 处理后总行数 */
    totalAfter: number
    /** 保留 success 行数 */
    preservedSuccess: number
}

/**
 * 聚合键：(source, packageName, ruleId)
 * ruleId 为 null 时所有 null 合并（同 source+packageName 的无规则告警归一组）
 */
type AggregateKey = string

const buildAggregateKey = (row: ScanResult): AggregateKey =>
    `${row.source}::${row.packageName}::${row.ruleId ?? '<null>'}`

/**
 * 合成 backfill 行 upstreamId（命名空间隔离，避免与未来真实 upstreamId 冲突）
 *
 * 设计取舍：
 * - 不用 `${source}:${packageName}:${ruleId}`：与 M20.1 normalizeUpstreamId 输出格式不兼容
 *   （pnpm-audit 双冒号格式），且 ruleId=null fallback 难以保证唯一
 * - 改用 `${source}:backfill-${rowId}`：rowId 唯一保证 + "backfill-" 命名空间前缀
 *   明确标识"这是 backfill 合成的 upstream ID，不是真实上游 ID"
 * - 未来 reconcile 用真实 upstreamId 创建新行（unique 索引 (repositoryId, upstreamId) 不同），
 *   backfill 行与真 ID 行并存；最终效果 = 旧的聚合行被 supersede + 新的真实 ID 行活跃
 */
export const buildBackfillUpstreamId = (row: Pick<ScanResult, 'source' | 'id'>): string =>
    `${row.source}:backfill-${row.id}`

/**
 * 纯计算 backfill 计划：扫描 ScanResult 表聚合 + 决策保留行 / 删除行 / 更新行。
 *
 * 设计要点：
 * - 纯查询 + 计算，无副作用，便于 vitest 单测覆盖
 * - 不写库；调用方根据 plan 决定是 dry-run 仅统计还是 apply 实跑
 *
 * @param ds 已初始化的 DataSource（ensureDatabaseInitialized 返回值）
 * @param now 测试用固定时间（默认 new Date()）
 */
export const computeBackfillPlan = async (
    ds: Awaited<ReturnType<typeof ensureDatabaseInitialized>>,
): Promise<BackfillPlan> => {
    const resultRepo = ds.getRepository(ScanResult)
    const repoRepo = ds.getRepository(Repository)

    const repos = await repoRepo.find()
    const plan: BackfillPlan = {
        toDelete: [],
        toUpdateUpstreamId: [],
        toSupersede: [],
        totalBefore: 0,
        totalAfter: 0,
        preservedSuccess: 0,
    }

    for (const repo of repos) {
        const rows = await resultRepo.find({
            where: { repositoryId: repo.id },
            order: { createdAt: 'ASC' },
        })
        plan.totalBefore += rows.length

        // 按聚合键分组
        const groups = new Map<AggregateKey, ScanResult[]>()
        for (const row of rows) {
            const key = buildAggregateKey(row)
            const list = groups.get(key) ?? []
            list.push(row)
            groups.set(key, list)
        }

        // 对每个聚合组选保留行
        for (const [, groupRows] of groups) {
            // 决策 2：组内有 fixStatus='success' → 保留最早 success 行；否则保留最早 createdAt 行
            // groupRows 已按 createdAt ASC 排序，filter 不改变顺序，所以 successRows[0] 是最早 success
            const successRows = groupRows.filter((r) => r.fixStatus === 'success')
            const keeper = successRows[0] ?? groupRows[0]! // createdAt ASC，最早的就是 [0]

            // 其他行标记 DELETE
            for (const r of groupRows) {
                if (r.id !== keeper.id) {
                    plan.toDelete.push(r)
                }
            }

            // keeper 处理：
            // 1. 总是替换 upstreamId 为 `${source}:backfill-${rowId}` 命名空间隔离
            //    （M20.3 schema 加列后旧数据可能是 fixtures auto- 占位符或 backfill-${rowId} 再次处理；
            //    总是替换保证命名空间一致 + 唯一索引 (repositoryId, upstreamId) 命中）
            //    注意：未来 reconcile 用真实 upstreamId 创建新行（unique 索引不同），
            //    backfill 行与真 ID 行并存，最终效果 = 旧的聚合行被 supersede + 新的真实 ID 行活跃
            // 2. 若不是 success 行 + supersededAt 为 null → 标记 superseded
            plan.toUpdateUpstreamId.push(keeper)
            if (keeper.fixStatus !== 'success' && keeper.supersededAt === null) {
                plan.toSupersede.push(keeper)
            } else if (keeper.fixStatus === 'success') {
                plan.preservedSuccess++
            }
        }
    }

    plan.totalAfter = plan.totalBefore - plan.toDelete.length
    return plan
}

/**
 * 执行 backfill 计划：写库（必须在事务中调用）
 *
 * 性能：使用批量 save 避免 N+1（每个 row 单次 SQL → 1000 行节省 999 次往返）。
 *
 * @param manager TypeORM EntityManager（事务上下文）
 * @param plan computeBackfillPlan 返回的计划
 * @param now supersededAt 写入时间（可选，默认 now）
 */
export const executeBackfillPlan = async (
    manager: EntityManager,
    plan: BackfillPlan,
    now: Date = new Date(),
): Promise<void> => {
    const resultRepo = manager.getRepository(ScanResult)

    // 批量 DELETE（toDelete 用 WHERE IN 一次完成）
    if (plan.toDelete.length > 0) {
        await resultRepo.delete(plan.toDelete.map((r) => r.id))
    }

    // 批量 SAVE：先 mutate 字段（一次循环），再 batch save（TypeORM 合并批量 INSERT/UPDATE）
    for (const r of plan.toUpdateUpstreamId) {
        r.upstreamId = buildBackfillUpstreamId(r)
    }
    for (const r of plan.toSupersede) {
        r.supersededAt = now
    }
    const dirty = [...plan.toUpdateUpstreamId, ...plan.toSupersede]
    if (dirty.length > 0) {
        await resultRepo.save(dirty)
    }
}

/**
 * dry-run 包装：计算计划但不执行，返回统计
 *
 * 注：函数参数不能直接 `= await ensureDatabaseInitialized()`（TS 不支持 await 在 default param），
 * 用 `?? await` 模式等价表达。
 */
export const backfillScanResultsDryRun = async (
    ds?: Awaited<ReturnType<typeof ensureDatabaseInitialized>>,
): Promise<BackfillStats> => {
    const resolvedDs = ds ?? await ensureDatabaseInitialized()
    const plan = await computeBackfillPlan(resolvedDs)
    return {
        totalBefore: plan.totalBefore,
        deletedDuplicates: plan.toDelete.length,
        preservedSuccess: plan.preservedSuccess,
        supersededAfterBackfill: plan.toSupersede.length,
        totalAfter: plan.totalAfter,
        reposProcessed: await resolvedDs.getRepository(Repository).count(),
        dryRun: true,
    }
}

/**
 * apply 包装：计算计划 + 事务化执行
 */
export const backfillScanResultsApply = async (
    now: Date = new Date(),
): Promise<BackfillStats> => {
    const ds = await ensureDatabaseInitialized()
    const plan = await computeBackfillPlan(ds)
    await ds.transaction(async (manager) => {
        await executeBackfillPlan(manager, plan, now)
    })
    return {
        totalBefore: plan.totalBefore,
        deletedDuplicates: plan.toDelete.length,
        preservedSuccess: plan.preservedSuccess,
        supersededAfterBackfill: plan.toSupersede.length,
        totalAfter: plan.totalAfter,
        reposProcessed: await ds.getRepository(Repository).count(),
        dryRun: false,
    }
}

/**
 * 格式化 stats 为可读输出（CLI 友好）
 */
export const formatStats = (stats: BackfillStats): string => {
    const lines = [
        `[${stats.dryRun ? 'DRY-RUN' : 'APPLY'}] backfill 统计`,
        `  仓库数:           ${stats.reposProcessed}`,
        `  处理前行数:       ${stats.totalBefore}`,
        `  处理后行数:       ${stats.totalAfter}  (减少 ${stats.totalBefore - stats.totalAfter} 行)`,
        `  删除重复行:       ${stats.deletedDuplicates}`,
        `  保留修复记录:     ${stats.preservedSuccess}  (fixStatus='success' 永不被 supersede)`,
        `  标记已关闭:       ${stats.supersededAfterBackfill}`,
        '',
    ]
    return lines.join('\n')
}

/**
 * CLI 入口（仅在直接运行本脚本时执行；模块导入时不触发）
 *
 * 用法：
 *   tsx backfill-scan-result.ts --dry-run      # 默认 dry-run
 *   tsx backfill-scan-result.ts --apply        # 实跑（需 y/N 确认）
 */
function isExecutedAsEntryPoint(): boolean {
    const entry = process.argv[1]

    if (!entry) {
        return false
    }

    return import.meta.url === pathToFileURL(entry).href
}

const isMainModule = isExecutedAsEntryPoint()

if (isMainModule) {
    const args = process.argv.slice(2)
    const isApply = args.includes('--apply')
    const isDryRun = args.includes('--dry-run') || !isApply
    const isHelp = args.includes('--help') || args.includes('-h')

    if (isHelp) {
        console.log(`
M20.7 backfill-scan-result：ScanResult 表 per-alert 模型数据迁移

用法：
  pnpm db:backfill:dry-run    预览迁移计划（默认，不写库）
  pnpm db:backfill            实跑迁移（必须 --apply + y/N 确认）

参数：
  --dry-run    仅输出统计计划，不写库（默认）
  --apply      实跑迁移（必须 + y/N 二次确认）
  --help, -h   显示帮助

数据库连接：沿用 createDataSourceOptions 逻辑（DATABASE_PATH 等 env var）
        `.trim())
        process.exit(0)
    }

    if (isDryRun) {
        const stats = await backfillScanResultsDryRun()
        console.log(formatStats(stats))
        process.exit(0)
    }

    // apply 模式：y/N 二次确认
    console.log('⚠️  即将执行 ScanResult backfill 迁移（实跑模式）。')
    console.log('   数据库路径：', process.env.DATABASE_PATH ?? 'data/dependfix.sqlite')
    console.log('   操作：删除重复行 + 合成 upstreamId + 标记已关闭告警')
    console.log('')
    const previewStats = await backfillScanResultsDryRun()
    console.log(formatStats(previewStats))

    const readline = await import('node:readline/promises')
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    const answer = await rl.question('确认实跑？(yes/no): ')
    rl.close()
    if (answer.trim().toLowerCase() !== 'yes' && answer.trim().toLowerCase() !== 'y') {
        console.log('已取消。')
        process.exit(0)
    }

    try {
        const stats = await backfillScanResultsApply()
        console.log(formatStats(stats))
    } catch (error) {
        console.error('backfill 失败，事务已回滚：', error)
        process.exit(1)
    }
}
