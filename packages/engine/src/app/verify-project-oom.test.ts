// verify-project-oom.test.ts — 命令级 OOM 透传到验证动作（报告 / 平台据此按层级披露）。
//
// 分层：`CommandResult.oomKilled` 是命令级事实；运行级 cgroup OOM 仍由平台 `ScanRun.oomKilled` 承载。
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FixError } from '@dependfix/core'
import { verifyProject } from './verify-project'

const runVerificationMock = vi.hoisted(() => vi.fn())

vi.mock('../runners/verification-runner', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../runners/verification-runner')>()
    return { ...actual, runVerification: runVerificationMock }
})

const makeCtx = (workDir: string) => ({
    config: {} as never,
    customCommands: ['pnpm test'],
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as never,
    workDir,
    allErrors: [] as FixError[],
})

describe('verifyProject 命令级 OOM', () => {
    let workDir: string

    afterEach(() => {
        runVerificationMock.mockReset()
        if (workDir) {
            rmSync(workDir, { recursive: true, force: true })
        }
    })

    it('OOM 命令的动作带 oomKilled，普通失败不带', async () => {
        workDir = mkdtempSync(join(tmpdir(), 'dependfix-verify-oom-'))
        const ctx = makeCtx(workDir)
        runVerificationMock.mockResolvedValueOnce({
            success: false,
            commandResults: [
                { command: 'pnpm test', exitCode: 137, durationMs: 1, stdout: '', stderr: '', oomKilled: true },
            ],
            failedCommand: 'pnpm test',
        })

        const actions = await verifyProject(ctx, 'foo/bar')

        expect(actions).toHaveLength(1)
        expect(actions[0]).toMatchObject({ target: 'pnpm test', success: false, oomKilled: true })
    })

    it('非 OOM 失败不携带该字段（不得把超时 / 普通失败混记为 OOM）', async () => {
        workDir = mkdtempSync(join(tmpdir(), 'dependfix-verify-oom-'))
        const ctx = makeCtx(workDir)
        runVerificationMock.mockResolvedValueOnce({
            success: false,
            commandResults: [
                { command: 'pnpm test', exitCode: 1, durationMs: 1, stdout: '', stderr: 'boom' },
            ],
            failedCommand: 'pnpm test',
        })

        const actions = await verifyProject(ctx, 'foo/bar')

        expect(actions[0]?.oomKilled).toBeUndefined()
    })
})
