// verify-project.test.ts — verifyProject（默认命令链 install 与工具链同版本）。
// 拆分自 app/helpers.test.ts（原 1031 行超 max-lines 1000）。
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { verifyProject, type AppContext } from './helpers'

// ---------------------------------------------------------------------------
// Mock verification-runner（verifyProject 依赖，避免真实 spawn）
// ---------------------------------------------------------------------------

const verificationRunnerMock = vi.hoisted(() => ({
    runVerification: vi.fn(),
}))

vi.mock('../runners/verification-runner', () => verificationRunnerMock)

describe('verifyProject', () => {
    let workDir: string

    beforeEach(() => {
        workDir = mkdtempSync(join(tmpdir(), 'dependfix-verify-'))
        writeFileSync(join(workDir, 'package.json'), JSON.stringify({
            name: 'fixture',
            version: '1.0.0',
            scripts: { lint: 'eslint .', build: 'tsc' },
        }, null, 2))
        verificationRunnerMock.runVerification.mockReset()
        verificationRunnerMock.runVerification.mockResolvedValue({
            success: true,
            commandResults: [],
        })
    })

    afterEach(() => {
        rmSync(workDir, { recursive: true, force: true })
    })

    function makeVerifyCtx(toolchainPnpmVersion?: string, customCommands?: string[]): Pick<AppContext, 'config' | 'customCommands' | 'logger' | 'workDir' | 'allErrors'> {
        return {
            config: {
                toolchainPnpmVersion,
            } as AppContext['config'],
            customCommands,
            logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as unknown as AppContext['logger'],
            workDir,
            allErrors: [],
        }
    }

    it('replaces install command with corepack when toolchain version is set', async () => {
        await verifyProject(makeVerifyCtx('10.5.2'), 'foo/bar')

        const commands = verificationRunnerMock.runVerification.mock.calls[0][0].commands
        expect(commands[0]).toBe('corepack pnpm@10.5.2 install --frozen-lockfile')
        expect(commands[1]).toBe('pnpm lint')
        expect(commands[2]).toBe('pnpm build')
    })

    it('keeps bare pnpm install when no toolchain version is set', async () => {
        await verifyProject(makeVerifyCtx(undefined), 'foo/bar')

        const commands = verificationRunnerMock.runVerification.mock.calls[0][0].commands
        expect(commands[0]).toBe('pnpm install --frozen-lockfile')
    })

    it('does not touch custom commands', async () => {
        await verifyProject(makeVerifyCtx('10.5.2', ['pnpm test']), 'foo/bar')

        const commands = verificationRunnerMock.runVerification.mock.calls[0][0].commands
        expect(commands).toEqual(['pnpm test'])
    })

    it('records network violations into report errors', async () => {
        verificationRunnerMock.runVerification.mockResolvedValue({
            success: true, commandResults: [],
            networkViolations: [{ time: 't', source: 'proxy', method: 'CONNECT', target: 'evil.example.com:443', violation: true }],
        })
        const ctx = makeVerifyCtx(undefined)
        await verifyProject(ctx, 'foo/bar')
        expect(ctx.allErrors).toEqual([expect.objectContaining({
            repository: 'foo/bar', stage: 'verify', category: 'network_violation', target: 'evil.example.com:443',
        })])
    })

    it('redacts path and query from violation target in report errors', async () => {
        // 恶意 URL 的 path/query 可能携带外带凭据：报告只落 host[:port]，不落 payload（防御纵深）
        verificationRunnerMock.runVerification.mockResolvedValue({
            success: true, commandResults: [],
            networkViolations: [{ time: 't', source: 'command-output', method: 'GET', target: 'https://evil.example.com/exfil?token=stolen', violation: true }],
        })
        const ctx = makeVerifyCtx(undefined)
        await verifyProject(ctx, 'foo/bar')
        expect(ctx.allErrors[0]?.target).toBe('evil.example.com')
        expect(ctx.allErrors[0]?.message).not.toContain('token=stolen')
        expect(ctx.allErrors[0]?.message).toContain('evil.example.com')
    })

    it('records no errors when there are no network violations', async () => {
        verificationRunnerMock.runVerification.mockResolvedValue({ success: true, commandResults: [], networkViolations: [] })
        const ctx = makeVerifyCtx(undefined)
        await verifyProject(ctx, 'foo/bar')
        expect(ctx.allErrors).toHaveLength(0)
    })
})
