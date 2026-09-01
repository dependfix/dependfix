import { createError, defineEventHandler, readBody } from 'h3'
import { In } from 'typeorm'
import { z } from 'zod'
import { ensureDatabaseInitialized } from '#server/database'
import { Repository } from '#server/entities/repository'
import { ScanRun } from '#server/entities/scan-run'
import { ScanResult } from '#server/entities/scan-result'

// useRuntimeConfig 由 Nuxt/Nitro auto-import 提供（vitest 环境由 tests/setup-nuxt-server.ts stub）
// 不在 h3 中显式 import，避免被 h3 解析为 undefined（h3 不导出 useRuntimeConfig）

/**
 * DELETE /api/e2e/fixtures：清理指定 repos 的关联 scanRuns + scanResults + repos。
 *
 * 设计动机（todo.md §M16.5 E2E fixtures 隔离）：
 * - fixtures API 仅注入（POST），跨 run 累积会导致 scan_run/scan_result 表无界增长；
 *   CI 串行 worker + 一次性 SQLite 实例时影响小（process restart），但 local dev
 *   或复用 SQLite 实例场景会导致 alerts-rowgroup 测试看到的 fixture 数量/状态不可控
 * - global-setup 在 seed 之前调用本端点，按 repos key 删除级联数据，保证 e2e 库状态干净
 *
 * 安全门控：与 POST /api/e2e/fixtures 同模式 —— 双门控 `E2E_TEST === 'true'` +
 * `runtimeConfig.e2eFixturesAllowed`（hard requirement：platform.md §3.6 + security.md §2.1.4）；
 * runtimeConfig 通过 `NUXT_E2E_FIXTURES_ALLOWED` 运行时覆盖，绕开 Nitro/esbuild
 * `process.env.NODE_ENV` 静态替换陷阱（详见 platform.md §3.6 实证段）。
 *
 * 清理顺序（应用层显式级联，不依赖 SQLite FK CASCADE 默认行为）：
 * 1. ScanResult：按 scanRunId IN (...) 批量删除
 * 2. ScanRun：按 repositoryId IN (...) 批量删除
 * 3. Repository：按 id IN (...) 批量删除
 *
 * 幂等：依赖 TypeORM delete 返回 affected count，重复调用安全（删除不存在记录返回 0）。
 */

const deleteBodySchema = z.object({
    /** 按 owner/name 列表删除对应仓库的关联数据 */
    repos: z.array(z.object({
        owner: z.string().min(1),
        name: z.string().min(1),
    })).optional(),
})

export default defineEventHandler(async (event) => {
    // 双门控（hard requirement：platform.md §3.6 + security.md §2.1.4）：同 fixtures.post.ts
    // runtimeConfig.e2eFixturesAllowed 通过 NUXT_E2E_FIXTURES_ALLOWED 运行时覆盖，绕开 esbuild define
    const config = useRuntimeConfig()
    if (process.env.E2E_TEST !== 'true' || !config.e2eFixturesAllowed) {
        throw createError({ statusCode: 404, statusMessage: 'Not Found' })
    }

    const body = await readBody<Record<string, unknown>>(event).catch(() => ({}))
    const parsed = deleteBodySchema.safeParse(body)
    if (!parsed.success) {
        throw createError({
            statusCode: 400,
            statusMessage: 'Fixtures delete body validation failed',
            data: { issues: parsed.error.issues },
        })
    }

    const repos = parsed.data.repos ?? []
    if (repos.length === 0) {
        return { deleted: { repos: 0, scanRuns: 0, scanResults: 0 } }
    }

    const ds = await ensureDatabaseInitialized()
    const repoRepo = ds.getRepository(Repository)
    const runRepo = ds.getRepository(ScanRun)
    const resultRepo = ds.getRepository(ScanResult)

    // 1. 按 owner/name 找到对应 repository id（跳过不存在的 key，幂等）
    const repoEntities = await repoRepo.find({
        where: repos.map((r) => ({ owner: r.owner, name: r.name })),
    })
    if (repoEntities.length === 0) {
        return { deleted: { repos: 0, scanRuns: 0, scanResults: 0 } }
    }
    const repoIds = repoEntities.map((r) => r.id)

    // 2. 找到所有下属 scan run
    const scanRuns = await runRepo.find({ where: { repositoryId: In(repoIds) } })
    const scanRunIds = scanRuns.map((r) => r.id)

    // 3. 显式级联删除 ScanResult → ScanRun → Repository
    let deletedScanResults = 0
    if (scanRunIds.length > 0) {
        const result = await resultRepo.delete({ scanRunId: In(scanRunIds) })
        deletedScanResults = result.affected ?? 0
    }

    const deletedScanRuns = scanRunIds.length > 0
        ? (await runRepo.delete({ id: In(scanRunIds) })).affected ?? 0
        : 0

    const deletedRepos = (await repoRepo.delete({ id: In(repoIds) })).affected ?? 0

    return {
        deleted: {
            repos: deletedRepos,
            scanRuns: deletedScanRuns,
            scanResults: deletedScanResults,
        },
    }
})
