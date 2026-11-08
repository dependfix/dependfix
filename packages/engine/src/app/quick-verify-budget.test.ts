// quick-verify-budget.test.ts — 基线与快速验证的运行预算夹取、基线已红命令跳过。
//
// 背景（2026-11-01 批量运行复盘）：基线链按默认 10 分钟逐条启动，最坏 50 分钟远超单仓 30 分钟
// 上限；quick-verify 在剩余 4 分钟时仍启动已知会 OOM 的 lint。本文件锁定：
// ① 基线命令超时按剩余预算收缩；② 预算不足不启动 quick 验证；
// ③ 基线中已红的命令不再重跑（既有失败不归因本次改动）。
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CommandResult } from '../runners/verification-runner'

const { mockRunVerification } = vi.hoisted(() => ({ mockRunVerification: vi.fn() }))

vi.mock('../runners/verification-runner', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../runners/verification-runner')>()
    return { ...actual, runVerification: mockRunVerification }
})

import { quickVerifyProject } from '../helpers'
import { sampleVerificationBaseline } from './verify-project'

let workDir: string

beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), 'dependfix-quick-budget-'))
    writeFileSync(join(workDir, 'package.json'), JSON.stringify({
        name: 'fixture',
        version: '1.0.0',
        scripts: { lint: 'exit 0' },
    }))
    mockRunVerification.mockReset()
})

afterEach(() => {
    rmSync(workDir, { recursive: true, force: true })
})

const commandResult = (command: string, exitCode: number, timedOut = false): CommandResult => ({
    command,
    exitCode,
    timedOut,
    durationMs: 1,
    stdout: '',
    stderr: '',
})

const makeLogger = () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }) as never

describe('sampleVerificationBaseline 预算夹取', () => {
    it('shrinks the command timeout to the remaining budget minus the delivery reserve', async () => {
        const deadlineAt = Date.now() + 120_000
        mockRunVerification.mockResolvedValue({
            success: true,
            commandResults: [commandResult('pnpm lint', 0)],
            networkViolations: [],
        })

        await sampleVerificationBaseline({
            config: {} as never,
            logger: makeLogger(),
            workDir,
            allErrors: [],
            deadlineAt,
        }, 'foo/bar')

        const params = mockRunVerification.mock.calls[0][0] as { commandTimeoutMs?: number }
        // 剩余约 120s − 最小步骤预算 60s，容忍执行耗时抖动
        expect(params.commandTimeoutMs).toBeGreaterThan(50_000)
        expect(params.commandTimeoutMs).toBeLessThanOrEqual(60_000)
    })

    it('keeps the default timeout when no deadline is provided', async () => {
        mockRunVerification.mockResolvedValue({
            success: true,
            commandResults: [commandResult('pnpm lint', 0)],
            networkViolations: [],
        })

        await sampleVerificationBaseline({
            config: {} as never,
            logger: makeLogger(),
            workDir,
            allErrors: [],
        }, 'foo/bar')

        const params = mockRunVerification.mock.calls[0][0] as { commandTimeoutMs?: number }
        expect(params.commandTimeoutMs).toBeUndefined()
    })
})

describe('quickVerifyProject 预算与基线跳过', () => {
    it('skips quick verification when the remaining budget is below the step minimum', async () => {
        const logger = makeLogger()
        const allErrors: { category?: string, message: string }[] = []
        const ok = await quickVerifyProject({
            logger,
            workDir,
            allErrors: allErrors as never,
            deadlineAt: Date.now() - 1,
        }, 'foo/bar')

        expect(ok).toBe(true)
        expect(mockRunVerification).not.toHaveBeenCalled()
        expect(allErrors.some((error) => error.category === 'BUDGET_EXHAUSTED')).toBe(true)
    })

    it('does not re-run commands that already failed in the pre-fix baseline', async () => {
        const logger = makeLogger()
        const ok = await quickVerifyProject({
            logger,
            workDir,
            verificationBaseline: {
                repo: 'foo/bar',
                value: [commandResult('pnpm lint', 1)],
            },
        }, 'foo/bar')

        expect(ok).toBe(true)
        expect(mockRunVerification).not.toHaveBeenCalled()
    })

    it('passes the repository verify timeout to the verification runner', async () => {
        mockRunVerification.mockResolvedValue({
            success: true,
            commandResults: [commandResult('pnpm lint', 0)],
            failedCommand: undefined,
        })

        await quickVerifyProject({
            logger: makeLogger(),
            workDir,
            verifyCommandTimeoutMs: 120_000,
        }, 'foo/bar')

        const params = mockRunVerification.mock.calls[0][0] as { commandTimeoutMs?: number }
        expect(params.commandTimeoutMs).toBe(120_000)
    })

    it('ignores a baseline that belongs to another repository', async () => {
        mockRunVerification.mockResolvedValue({
            success: true,
            commandResults: [commandResult('pnpm lint', 0)],
            failedCommand: undefined,
        })

        const ok = await quickVerifyProject({
            logger: makeLogger(),
            workDir,
            verificationBaseline: { repo: 'other/repo', value: [commandResult('pnpm lint', 1)] },
        }, 'foo/bar')

        expect(ok).toBe(true)
        expect(mockRunVerification).toHaveBeenCalledTimes(1)
    })
})
