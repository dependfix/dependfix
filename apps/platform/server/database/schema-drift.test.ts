import 'reflect-metadata'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import betterSqlite3 from 'better-sqlite3'
import { DataSource } from 'typeorm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { detectSchemaDrift, getSchemaStatus, setSchemaStatus } from './schema-drift'
import { checkSchemaDrift, createDataSourceOptions } from './index'

/**
 * schema 漂移检测（启动期自检）。
 *
 * 覆盖「实体元数据 vs 实库」的比对语义（缺表 / 缺列 / 多余列 / 自定义前缀）与启动期接线的
 * 跳过条件（`synchronize=true` / worker 进程）及 fail-open 行为。用真实 SQLite 与真实实体跑，
 * 不 mock TypeORM 元数据。
 */
describe('schema 漂移检测', () => {
    let dir: string | undefined
    const dataSources: DataSource[] = []
    let consoleLogSpy: ReturnType<typeof vi.spyOn>

    const makeDataSource = async (options: { prefix?: string, synchronize?: boolean, empty?: boolean } = {}): Promise<DataSource> => {
        dir ??= await mkdtemp(join(tmpdir(), 'dependfix-schema-drift-'))
        const base = createDataSourceOptions() as unknown as Record<string, unknown>
        const file = join(dir, `drift-${dataSources.length}.sqlite`)
        const prefix = options.prefix ?? 'dependfix_'
        const synchronize = options.synchronize ?? true
        const create = (sync: boolean) => new DataSource({
            ...base,
            type: 'better-sqlite3',
            database: file,
            driver: betterSqlite3,
            migrations: [],
            migrationsRun: false,
            synchronize: sync,
            entityPrefix: prefix,
        })
        if (!synchronize && !options.empty) {
            // 先用 synchronize 建出实库 schema，再以 synchronize=false 打开：模拟「库已存在但迁移未执行」
            const builder = create(true)
            await builder.initialize()
            await builder.destroy()
        }
        const ds = create(synchronize)
        dataSources.push(ds)
        await ds.initialize()
        return ds
    }

    beforeEach(() => {
        // createDataSourceOptions 启动日志在单测里是噪声
        consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => { /* noop */ })
        setSchemaStatus('unknown')
    })

    afterEach(async () => {
        for (const ds of dataSources.splice(0)) {
            if (ds.isInitialized) {
                await ds.destroy()
            }
        }
        if (dir) {
            await rm(dir, { recursive: true, force: true })
            dir = undefined
        }
        consoleLogSpy.mockRestore()
        vi.unstubAllEnvs()
        setSchemaStatus('unknown')
    })

    describe('detectSchemaDrift', () => {
        it('schema 与实体元数据一致时无漂移', async () => {
            const ds = await makeDataSource()
            await expect(detectSchemaDrift(ds)).resolves.toEqual({
                hasDrift: false,
                missingTables: [],
                missingColumns: [],
            })
        })

        it('缺列时报告表名与列名（生产事故形态）', async () => {
            const ds = await makeDataSource()
            await ds.query('ALTER TABLE dependfix_scan_run DROP COLUMN execution_timeout_ms')

            const drift = await detectSchemaDrift(ds)
            expect(drift.hasDrift).toBe(true)
            expect(drift.missingTables).toEqual([])
            expect(drift.missingColumns).toContainEqual({
                table: 'dependfix_scan_run',
                column: 'execution_timeout_ms',
            })
        })

        it('缺表时报告表名', async () => {
            const ds = await makeDataSource()
            await ds.query('DROP TABLE dependfix_audit_event')

            const drift = await detectSchemaDrift(ds)
            expect(drift.hasDrift).toBe(true)
            expect(drift.missingTables).toContain('dependfix_audit_event')
        })

        it('实库多出的列不算漂移（只检测缺失项）', async () => {
            const ds = await makeDataSource()
            await ds.query('ALTER TABLE dependfix_scan_run ADD COLUMN legacy_extra text NULL')

            await expect(detectSchemaDrift(ds)).resolves.toEqual({
                hasDrift: false,
                missingTables: [],
                missingColumns: [],
            })
        })

        it('自定义 entityPrefix 时按实际表名比对', async () => {
            const ds = await makeDataSource({ prefix: 'dfx_' })
            await ds.query('ALTER TABLE dfx_scan_run DROP COLUMN execution_timeout_ms')

            const drift = await detectSchemaDrift(ds)
            expect(drift.missingColumns).toContainEqual({
                table: 'dfx_scan_run',
                column: 'execution_timeout_ms',
            })
        })
    })

    describe('checkSchemaDrift（启动期接线）', () => {
        let errorSpy: ReturnType<typeof vi.spyOn>
        let warnSpy: ReturnType<typeof vi.spyOn>

        beforeEach(() => {
            errorSpy = vi.spyOn(console, 'error').mockImplementation(() => { /* noop */ })
            warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => { /* noop */ })
        })

        afterEach(() => {
            errorSpy.mockRestore()
            warnSpy.mockRestore()
        })

        it('无漂移时状态为 ok 且不报错', async () => {
            const ds = await makeDataSource({ synchronize: false })
            await expect(checkSchemaDrift(ds)).resolves.toMatchObject({ hasDrift: false })
            expect(getSchemaStatus()).toBe('ok')
            expect(errorSpy).not.toHaveBeenCalled()
        })

        it('漂移时状态为 drift 并输出可操作的 ERROR 日志', async () => {
            const ds = await makeDataSource({ synchronize: false })
            await ds.query('ALTER TABLE dependfix_scan_run DROP COLUMN execution_timeout_ms')

            const drift = await checkSchemaDrift(ds)
            expect(drift?.hasDrift).toBe(true)
            expect(getSchemaStatus()).toBe('drift')
            const message = String(errorSpy.mock.calls[0]?.[0] ?? '')
            expect(message).toContain('schema 漂移')
            expect(message).toContain('dependfix_scan_run.execution_timeout_ms')
            expect(message).toContain('DATABASE_MIGRATIONS_RUN=true')
        })

        it('synchronize=true 时跳过检测（TypeORM 自行补 schema）', async () => {
            const ds = await makeDataSource()
            expect(ds.options.synchronize).toBe(true)

            await expect(checkSchemaDrift(ds)).resolves.toBeNull()
            expect(getSchemaStatus()).toBe('unknown')
        })

        it('SQLite 空库跳过检测（空库告警单独输出）', async () => {
            const ds = await makeDataSource({ synchronize: false, empty: true })

            await expect(checkSchemaDrift(ds)).resolves.toBeNull()
            expect(getSchemaStatus()).toBe('unknown')
            expect(errorSpy).not.toHaveBeenCalled()
        })

        it('worker 进程跳过检测（迁移由 HTTP 主进程执行）', async () => {
            vi.stubEnv('DEPENDFIX_ROLE', 'worker')
            const ds = await makeDataSource({ synchronize: false })

            await expect(checkSchemaDrift(ds)).resolves.toBeNull()
            expect(getSchemaStatus()).toBe('unknown')
            expect(errorSpy).not.toHaveBeenCalled()
        })

        it('检测自身失败时 fail-open：状态 unknown 仅告警', async () => {
            const ds = await makeDataSource({ synchronize: false })
            vi.spyOn(ds, 'createQueryRunner').mockImplementation(() => {
                throw new Error('boom')
            })

            await expect(checkSchemaDrift(ds)).resolves.toBeNull()
            expect(getSchemaStatus()).toBe('unknown')
            expect(warnSpy).toHaveBeenCalled()
        })
    })

    describe('schema 状态读写', () => {
        it('未检测时为 unknown，写入后按值返回', () => {
            expect(getSchemaStatus()).toBe('unknown')
            setSchemaStatus('ok')
            expect(getSchemaStatus()).toBe('ok')
            setSchemaStatus('drift')
            expect(getSchemaStatus()).toBe('drift')
        })
    })
})
