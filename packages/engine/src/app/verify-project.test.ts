// verify-project.test.ts — verifyProject（默认命令链 install 与工具链同版本 + test 纳入默认链）。
// 拆分自 app/helpers.test.ts（原 1031 行超 max-lines 1000）。
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { execSync } from 'node:child_process'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enforceVerificationGate } from '../runners/verification-gate'
import { verifyProject, type AppContext } from './helpers'

// ---------------------------------------------------------------------------
// Mock verification-runner（verifyProject 依赖，避免真实 spawn）
// 用 importOriginal 保留真实导出（DEFAULT_VERIFY_COMMANDS / formatVerificationError），
// 只替换 runVerification——避免在测试内再造一份命令链副本（与「唯一事实源」相悖）。
// ---------------------------------------------------------------------------

const verificationRunnerMock = vi.hoisted(() => ({
    runVerification: vi.fn(),
}))

vi.mock('../runners/verification-runner', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../runners/verification-runner')>()
    return {
        ...actual,
        runVerification: verificationRunnerMock.runVerification,
    }
})

describe('verifyProject', () => {
    let workDir: string

    beforeEach(() => {
        workDir = mkdtempSync(join(tmpdir(), 'dependfix-verify-'))
        writeFileSync(join(workDir, 'package.json'), JSON.stringify({
            name: 'fixture',
            version: '1.0.0',
            scripts: { lint: 'eslint .', build: 'tsc', test: 'vitest run' },
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

    // -----------------------------------------------------------------------
    // test 纳入默认链（install → lint → build → test）
    // -----------------------------------------------------------------------

    /** 覆盖 fixture 的 package.json（用于构造「有 / 无 test 脚本」两类仓库） */
    function writePkg(scripts: Record<string, string>) {
        writeFileSync(join(workDir, 'package.json'), JSON.stringify({
            name: 'fixture', version: '1.0.0', scripts,
        }, null, 2))
    }

    /** 复现原始事故形态：install / lint / build 全绿，pnpm test 失败（ESM-only 依赖破坏 CJS 消费方） */
    function mockTestFailureAtEnd() {
        verificationRunnerMock.runVerification.mockResolvedValue({
            success: false,
            failedCommand: 'pnpm test',
            commandResults: [
                { command: 'pnpm install --frozen-lockfile', exitCode: 0, durationMs: 1, stdout: '', stderr: '' },
                { command: 'pnpm lint', exitCode: 0, durationMs: 1, stdout: '', stderr: '' },
                { command: 'pnpm build', exitCode: 0, durationMs: 1, stdout: '', stderr: '' },
                {
                    command: 'pnpm test',
                    exitCode: 1,
                    durationMs: 1,
                    stdout: '',
                    stderr: `SyntaxError: Unexpected token 'export' — decode-uri-component 0.5.0 is ESM-only, CJS consumer query-string@7.1.3 cannot load it`,
                },
            ],
        })
    }

    it('默认命令链纳入 test，顺序 install → lint → build → test', async () => {
        writePkg({ lint: 'eslint .', build: 'tsc', test: 'vitest run' })
        await verifyProject(makeVerifyCtx(undefined), 'foo/bar')

        const commands = verificationRunnerMock.runVerification.mock.calls[0][0].commands
        expect(commands).toEqual([
            'pnpm install --frozen-lockfile',
            'pnpm lint',
            'pnpm build',
            'pnpm test',
        ])
    })

    it('无 test 脚本的仓库跳过 pnpm test 并记 SCRIPT_NOT_FOUND 审计（不误伤未配置测试的仓库）', async () => {
        writePkg({ lint: 'eslint .', build: 'tsc' }) // 显式构造无 test 脚本的仓库
        const ctx = makeVerifyCtx(undefined)
        await verifyProject(ctx, 'foo/bar')

        const commands = verificationRunnerMock.runVerification.mock.calls[0][0].commands
        expect(commands).toEqual(['pnpm install --frozen-lockfile', 'pnpm lint', 'pnpm build'])
        expect(commands).not.toContain('pnpm test')
        expect(ctx.allErrors).toEqual([expect.objectContaining({
            repository: 'foo/bar', stage: 'verify', category: 'SCRIPT_NOT_FOUND', target: 'pnpm test',
        })])
    })

    it('ESM-only 依赖破坏 CJS 消费方：install/lint/build 全绿但 test 失败 → verification action 失败', async () => {
        writePkg({ lint: 'eslint .', build: 'tsc', test: 'jest' })
        mockTestFailureAtEnd()
        const actions = await verifyProject(makeVerifyCtx(undefined), 'foo/bar')

        const testAction = actions.find((a) => a.target === 'pnpm test')
        expect(testAction?.success).toBe(false)
        expect(testAction?.error).toContain(`Unexpected token 'export'`)
        // 复现原始事故形态：其余三条仍为成功——破坏只能由 test 暴露
        expect(actions.filter((a) => a.target !== 'pnpm test').every((a) => a.success)).toBe(true)
    })

    it('组合：test 失败 → verificationPassed=false → 验证门禁阻断交付并回滚', async () => {
        writePkg({ lint: 'eslint .', build: 'tsc', test: 'jest' })
        mockTestFailureAtEnd()

        // 门禁回滚需要真实 git 仓库
        execSync('git init -q', { cwd: workDir })
        execSync('git config user.name test', { cwd: workDir })
        execSync('git config user.email test@test', { cwd: workDir })
        execSync('git add . && git commit -qm init', { cwd: workDir })
        // 模拟修复改动（待回滚还原）：只改 version，保留 scripts——否则 validateVerifyCommands 会把链降级，
        // 与实际验证链不一致（mock 返回的是 4 条常驻结果）
        const pkgBefore = JSON.parse(readFileSync(join(workDir, 'package.json'), 'utf-8')) as Record<string, unknown>
        writeFileSync(join(workDir, 'package.json'), JSON.stringify({ ...pkgBefore, version: '2.0.0' }, null, 2))
        execSync('git add package.json', { cwd: workDir })

        const ctx = makeVerifyCtx(undefined)
        const actions = await verifyProject(ctx, 'foo/bar')

        // 与 repo-fix.ts 的判定一致：全部验证动作成功才算通过
        const verificationPassed = actions.every((a) => a.success)
        expect(verificationPassed).toBe(false)

        const blocked = enforceVerificationGate({
            logger: ctx.logger,
            workDir,
            allErrors: ctx.allErrors,
            repoResults: [{ repository: 'foo/bar', verificationPassed } as never],
        }, { preExistingDirty: false, action: 'pr' })

        expect(blocked).toBe(true)
        expect(ctx.allErrors.some((e) => e.category === 'VERIFICATION_FAILED')).toBe(true)
        // 修复改动已回滚（package.json 回到初始版本）
        expect(execSync('git show HEAD:package.json', { cwd: workDir, encoding: 'utf-8' })).toContain('"version": "1.0.0"')
    }, 30_000)
})
