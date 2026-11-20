import 'reflect-metadata'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { setupMemoryDatabase, teardownMemoryDatabase } from '../../tests/api-helper'
import { runScanForRepository } from './scan-orchestrator.service'
import { ensureDatabaseInitialized } from '#server/database'
import { Repository } from '#server/entities/repository'

/**
 * 采集侧日志丢弃数（`ScanRun.logsDropped`）在执行器 → 编排 → 落库链路的装配守卫。
 *
 * 单独成文件：`scan-orchestrator.test.ts` 已到行数上限，新增断言会把测试函数推过阈值。
 * 语义（三态）：`0` = 确认未丢；`>0` = 丢弃 N 条；`null` = 执行器不采集（github-action）。
 */

const { containerIsAvailable, containerExecute, sandboxIsAvailable, sandboxExecute } = vi.hoisted(() => ({
    containerIsAvailable: vi.fn(),
    containerExecute: vi.fn(),
    sandboxIsAvailable: vi.fn(),
    sandboxExecute: vi.fn(),
}))

vi.mock('./executor/container-executor', () => ({
    ContainerExecutor: class {
        isAvailable = containerIsAvailable
        execute = containerExecute
    },
}))
vi.mock('./executor/sandbox-executor', () => ({
    SandboxExecutor: class {
        isAvailable = sandboxIsAvailable
        execute = sandboxExecute

        async probeAvailability() {
            const available = await sandboxIsAvailable()
            return available
                ? { available: true, serverVersion: 'test' }
                : { available: false, reason: 'daemon_unreachable', detail: 'test daemon down' }
        }
    },
}))
vi.mock('./executor/action-trigger-executor', () => ({
    ActionTriggerExecutor: class {
        execute = vi.fn()
    },
}))
vi.mock('#server/utils/guard', () => ({
    requireAuth: vi.fn(async () => ({ user: { id: 'u1', email: 'admin@test.dev' } })),
    requireRole: vi.fn(async () => ({ user: { id: 'u1', email: 'admin@test.dev' } })),
}))
vi.mock('./notification', () => ({
    notifyEnvEvent: vi.fn(async () => undefined),
}))

const makeResult = () => ({
    summary: { alertsTotal: 0, severityCounts: {} },
    alerts: [],
})

const createRepo = async (overrides: Record<string, unknown> = {}): Promise<string> => {
    const ds = await ensureDatabaseInitialized()
    const repo = await ds.getRepository(Repository).save(ds.getRepository(Repository).create({
        owner: 'demo',
        name: `logs-${Math.random().toString(36).slice(2, 8)}`,
        platform: 'github',
        packageManager: 'pnpm',
        defaultBranch: 'main',
        executorKind: 'container',
        ...overrides,
    }))
    return repo.id
}

describe('scan-orchestrator logsDropped wiring', () => {
    beforeAll(() => setupMemoryDatabase())
    afterAll(() => teardownMemoryDatabase())

    beforeEach(() => {
        vi.clearAllMocks()
        containerIsAvailable.mockResolvedValue(true)
        sandboxIsAvailable.mockResolvedValue(true)
    })

    it('persists logsDropped=0 from container executor (confirmed no drop)', async () => {
        const repoId = await createRepo()
        containerExecute.mockResolvedValue({
            result: makeResult(),
            error: undefined,
            logsJson: JSON.stringify([{ timestamp: new Date().toISOString(), level: 'info', message: 'line' }]),
            logsDropped: 0,
        })

        const run = await runScanForRepository(repoId, { mode: 'report-only', severityThreshold: 'high' })
        expect(run.logsDropped).toBe(0)
    })

    it('persists logsDropped>0 from sandbox executor (collector dropped earlier entries)', async () => {
        const repoId = await createRepo({ executorKind: 'sandbox' })
        sandboxExecute.mockResolvedValue({
            exitCode: 0,
            result: makeResult(),
            logsJson: JSON.stringify([{ timestamp: new Date().toISOString(), level: 'info', message: 'line' }]),
            logsDropped: 3,
        })

        const run = await runScanForRepository(repoId, { mode: 'report-only', severityThreshold: 'high' })
        expect(run.executorKind).toBe('sandbox')
        expect(run.logsDropped).toBe(3)
    })

    it('keeps logsDropped NULL when the executor does not collect logs', async () => {
        const repoId = await createRepo()
        containerExecute.mockResolvedValue({ result: makeResult(), error: undefined })

        const run = await runScanForRepository(repoId, { mode: 'report-only', severityThreshold: 'high' })
        expect(run.logsDropped).toBeNull()
    })
})
