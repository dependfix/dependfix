import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BaselineSkippedCommand, FixError } from '@dependfix/core'
import { sampleVerificationBaseline, verifyProject } from './verify-project'

const runVerificationMock = vi.hoisted(() => vi.fn())

vi.mock('../runners/verification-runner', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../runners/verification-runner')>()
    return { ...actual, runVerification: runVerificationMock }
})

const commandResult = (
    command: string,
    exitCode: number,
    stderr = '',
) => ({ command, exitCode, durationMs: 1, stdout: '', stderr })

const makeCtx = (workDir: string) => {
    const loggerSpy = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
    return {
        config: {
            rollbackGranularity: 'unit' as const,
        } as never,
        customCommands: ['pnpm install --frozen-lockfile', 'pnpm test'],
        logger: loggerSpy as never,
        workDir,
        allErrors: [] as FixError[],
        loggerSpy,
    }
}

describe('修复前基线链：安装失败短路', () => {
    let workDir: string

    afterEach(() => {
        runVerificationMock.mockReset()
        if (workDir) {
            rmSync(workDir, { recursive: true, force: true })
        }
    })

    it('安装命令失败即短路：后续命令不再采样，并回报未采样原因', async () => {
        workDir = mkdtempSync(join(tmpdir(), 'dependfix-baseline-chain-'))
        const ctx = makeCtx(workDir)
        const skipped: BaselineSkippedCommand[] = []

        runVerificationMock.mockResolvedValueOnce({
            success: false,
            commandResults: [
                commandResult('pnpm install --frozen-lockfile', 1, 'ERR_PNPM_BROKEN_LOCKFILE'),
            ],
            failedCommand: 'pnpm install --frozen-lockfile',
        })

        const baseline = await sampleVerificationBaseline(ctx, 'foo/bar', {
            onSkipped: (items) => skipped.push(...items),
        })

        // 短路谓词交给 runner：只对安装命令命中，其余命令仍按完整链采样
        const params = runVerificationMock.mock.calls[0]?.[0] as {
            stopOnFailure: boolean
            stopOnFailureWhen: (command: string) => boolean
        }
        expect(params.stopOnFailure).toBe(false)
        expect(params.stopOnFailureWhen('pnpm install --frozen-lockfile')).toBe(true)
        expect(params.stopOnFailureWhen('corepack pnpm@10.5.2 install --frozen-lockfile')).toBe(true)
        expect(params.stopOnFailureWhen('pnpm test')).toBe(false)

        expect(baseline?.map((item) => item.command)).toEqual(['pnpm install --frozen-lockfile'])
        expect(skipped).toEqual([{ command: 'pnpm test', reason: 'install-baseline-failed' }])
        expect(ctx.loggerSpy.info).toHaveBeenCalledWith(
            expect.stringContaining('"pnpm test" not sampled'),
        )
    })

    it('非安装命令失败不短路：后续命令照常采样，不产生未采样记录', async () => {
        workDir = mkdtempSync(join(tmpdir(), 'dependfix-baseline-chain-'))
        const ctx = makeCtx(workDir)
        const skipped: BaselineSkippedCommand[] = []

        runVerificationMock.mockResolvedValueOnce({
            success: false,
            commandResults: [
                commandResult('pnpm install --frozen-lockfile', 0),
                commandResult('pnpm test', 1, 'No tests found'),
            ],
            failedCommand: 'pnpm test',
        })

        const baseline = await sampleVerificationBaseline(ctx, 'foo/bar', {
            onSkipped: (items) => skipped.push(...items),
        })

        expect(baseline?.map((item) => item.command)).toEqual([
            'pnpm install --frozen-lockfile',
            'pnpm test',
        ])
        expect(skipped).toEqual([])
    })

    it('安装命令不在链首：只把其后的命令记为未采样', async () => {
        workDir = mkdtempSync(join(tmpdir(), 'dependfix-baseline-chain-'))
        const ctx = {
            ...makeCtx(workDir),
            customCommands: ['pnpm lint', 'pnpm install --frozen-lockfile', 'pnpm test'],
        }
        const skipped: BaselineSkippedCommand[] = []

        runVerificationMock.mockResolvedValueOnce({
            success: false,
            commandResults: [
                commandResult('pnpm lint', 0),
                commandResult('pnpm install --frozen-lockfile', 1, 'ERR_PNPM_BROKEN_LOCKFILE'),
            ],
            failedCommand: 'pnpm install --frozen-lockfile',
        })

        const baseline = await sampleVerificationBaseline(ctx, 'foo/bar', {
            onSkipped: (items) => skipped.push(...items),
        })

        // install 之前的 lint 已正常采样，不得误标未采样
        expect(baseline?.map((item) => item.command)).toEqual([
            'pnpm lint',
            'pnpm install --frozen-lockfile',
        ])
        expect(skipped).toEqual([{ command: 'pnpm test', reason: 'install-baseline-failed' }])
    })

    it('未采样命令的终验失败不再获得既有失败豁免（保守归因）', async () => {
        workDir = mkdtempSync(join(tmpdir(), 'dependfix-baseline-chain-'))
        const ctx = makeCtx(workDir)

        runVerificationMock.mockResolvedValueOnce({
            success: false,
            commandResults: [
                commandResult('pnpm install --frozen-lockfile', 1, 'ERR_PNPM_BROKEN_LOCKFILE'),
            ],
            failedCommand: 'pnpm install --frozen-lockfile',
        })
        const baseline = await sampleVerificationBaseline(ctx, 'foo/bar')

        // 修复后安装通过、test 仍红：test 没有基线读数 → 归因本次改动（未知不算既有）
        runVerificationMock.mockResolvedValueOnce({
            success: false,
            commandResults: [
                commandResult('pnpm install --frozen-lockfile', 0),
                commandResult('pnpm test', 1, 'No tests found'),
            ],
            failedCommand: 'pnpm test',
        })
        const actions = await verifyProject(ctx, 'foo/bar', { baseline })

        const testAction = actions.find((action) => action.target === 'pnpm test')
        expect(testAction).toMatchObject({ success: false })
        expect(testAction?.preExisting).toBeUndefined()
        expect(ctx.allErrors).toEqual([])
        expect(ctx.loggerSpy.error).toHaveBeenCalledWith(
            expect.stringContaining('Verification failed for foo/bar: pnpm test'),
        )
    })
})
