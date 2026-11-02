// verify-project.test.ts — verifyProject（默认命令链 install 与工具链同版本 + typecheck / test 纳入默认链）。
// 拆分自 app/helpers.test.ts（原 1031 行超 max-lines 1000）。
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { execSync } from 'node:child_process'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CiAlignmentRecord } from '@dependfix/core'
import { enforceVerificationGate } from '../runners/verification-gate'
import type { CommandResult } from '../runners/verification-runner'
import { type AppContext } from './helpers'
import { sampleVerificationBaseline, verifyProject } from './verify-project'

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
            scripts: { lint: 'eslint .', build: 'tsc', typecheck: 'tsc --noEmit', test: 'vitest run' },
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

    function makeVerifyCtx(
        toolchainPnpmVersion?: string,
        customCommands?: string[],
    ): Pick<AppContext, 'config' | 'customCommands' | 'logger' | 'workDir' | 'allErrors'> {
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

    it('剩余预算不足 → 不执行验证链、回调 onSkip、写一条 BUDGET_EXHAUSTED（不归因本次改动）', async () => {
        const ctx = {
            ...makeVerifyCtx(),
            deadlineAt: Date.now() - 1,
            budgetSkips: new Set<string>(),
        }
        const onSkip = vi.fn()
        const actions = await verifyProject(ctx as never, 'foo/bar', { onSkip })

        expect(actions).toEqual([])
        expect(verificationRunnerMock.runVerification).not.toHaveBeenCalled()
        expect(ctx.allErrors.map((error) => error.category)).toEqual(['BUDGET_EXHAUSTED'])
        // 空 actions 不能被调用方折叠成「验证通过」：跳过必须显式回调
        expect(onSkip).toHaveBeenCalledWith('budget')
    })

    it('replaces install command with corepack when toolchain version is set', async () => {
        await verifyProject(makeVerifyCtx('10.5.2'), 'foo/bar')

        const commands = verificationRunnerMock.runVerification.mock.calls[0][0].commands
        expect(commands[0]).toBe('corepack pnpm@10.5.2 install --frozen-lockfile')
        expect(commands[1]).toBe('pnpm lint')
        expect(commands[2]).toBe('pnpm build')
        expect(commands[3]).toBe('pnpm typecheck')
        expect(commands[4]).toBe('pnpm test')
    })

    it('keeps bare pnpm install when no toolchain version is set', async () => {
        await verifyProject(makeVerifyCtx(undefined), 'foo/bar')

        const commands = verificationRunnerMock.runVerification.mock.calls[0][0].commands
        expect(commands[0]).toBe('pnpm install --frozen-lockfile')
    })

    it('记录本次实际执行的命令集与 CI 口径（重复验证同一命令集只保留一条记录）', async () => {
        mkdirSync(join(workDir, '.github', 'workflows'), { recursive: true })
        writeFileSync(join(workDir, '.github', 'workflows', 'ci.yml'), [
            'jobs:',
            '  ci:',
            '    steps:',
            '      - run: pnpm lint',
            '      - run: pnpm build',
            '      - run: pnpm test',
        ].join('\n'))
        const commands = [
            'pnpm install --frozen-lockfile',
            'pnpm lint',
            'pnpm build',
            'pnpm typecheck',
            'pnpm test',
        ]
        verificationRunnerMock.runVerification.mockResolvedValue({
            success: true,
            commandResults: commands.map((command) => ({
                command, exitCode: 0, durationMs: 1, stdout: '', stderr: '',
            })),
        })
        const ctx = { ...makeVerifyCtx(undefined), ciAlignment: [] as CiAlignmentRecord[] }

        await verifyProject(ctx, 'foo/bar', { ciAlignment: { client: null } })
        await verifyProject(ctx, 'foo/bar', { ciAlignment: { client: null } })

        expect(ctx.ciAlignment).toHaveLength(1)
        const record = ctx.ciAlignment[0]
        expect(record.repository).toBe('foo/bar')
        expect(record.commands).toEqual(commands)
        expect(record.status).toBe('aligned')
        expect(record.extraInExecution).toEqual(['typecheck'])
        expect(record.healthUnavailableReason).toContain('无 GitHub 客户端')
    })

    it('同仓库多次验证取命令并集（中间态前缀不覆盖后续全链，也不重复发起健康预检）', async () => {
        mkdirSync(join(workDir, '.github', 'workflows'), { recursive: true })
        writeFileSync(join(workDir, '.github', 'workflows', 'ci.yml'), [
            'jobs:',
            '  ci:',
            '    steps:',
            '      - run: pnpm lint',
            '      - run: pnpm build',
            '      - run: pnpm test',
        ].join('\n'))
        const ctx = { ...makeVerifyCtx(undefined), ciAlignment: [] as CiAlignmentRecord[] }

        // 第一次：首失败短路，只执行 install + lint
        verificationRunnerMock.runVerification.mockResolvedValue({
            success: false,
            commandResults: [
                { command: 'pnpm install --frozen-lockfile', exitCode: 0, durationMs: 1, stdout: '', stderr: '' },
                { command: 'pnpm lint', exitCode: 1, durationMs: 1, stdout: '', stderr: 'lint failed' },
            ],
        })
        await verifyProject(ctx, 'foo/bar', { ciAlignment: { client: null } })
        expect(ctx.ciAlignment[0].commands).toEqual(['pnpm install --frozen-lockfile', 'pnpm lint'])
        const firstReason = ctx.ciAlignment[0].healthUnavailableReason

        // 第二次：全链通过（跨 major 回退 / 单元回滚后的终验形态）
        verificationRunnerMock.runVerification.mockResolvedValue({
            success: true,
            commandResults: [
                'pnpm install --frozen-lockfile', 'pnpm lint', 'pnpm build', 'pnpm typecheck', 'pnpm test',
            ].map((command) => ({ command, exitCode: 0, durationMs: 1, stdout: '', stderr: '' })),
        })
        await verifyProject(ctx, 'foo/bar', { ciAlignment: { client: null } })

        expect(ctx.ciAlignment).toHaveLength(1)
        expect(ctx.ciAlignment[0].commands).toEqual([
            'pnpm install --frozen-lockfile', 'pnpm lint', 'pnpm build', 'pnpm typecheck', 'pnpm test',
        ])
        expect(ctx.ciAlignment[0].status).toBe('aligned')
        expect(ctx.ciAlignment[0].healthUnavailableReason).toBe(firstReason)
    })

    it('首失败短路时只记录实际执行的命令前缀（不得断言未跑到的命令已验证）', async () => {
        mkdirSync(join(workDir, '.github', 'workflows'), { recursive: true })
        writeFileSync(join(workDir, '.github', 'workflows', 'ci.yml'), [
            'jobs:',
            '  ci:',
            '    steps:',
            '      - run: pnpm lint',
            '      - run: pnpm build',
            '      - run: pnpm test',
        ].join('\n'))
        verificationRunnerMock.runVerification.mockResolvedValue({
            success: false,
            commandResults: [
                { command: 'pnpm install --frozen-lockfile', exitCode: 0, durationMs: 1, stdout: '', stderr: '' },
                { command: 'pnpm lint', exitCode: 1, durationMs: 1, stdout: '', stderr: 'lint failed' },
            ],
        })
        const ctx = { ...makeVerifyCtx(undefined), ciAlignment: [] as CiAlignmentRecord[] }

        await verifyProject(ctx, 'foo/bar', { ciAlignment: { client: null } })

        const record = ctx.ciAlignment[0]
        expect(record.commands).toEqual(['pnpm install --frozen-lockfile', 'pnpm lint'])
        expect(record.status).toBe('differs')
        expect(record.missingInExecution).toEqual(['build', 'test'])
        expect(record.extraInExecution).toEqual([])
    })

    it('实际执行的命令集为空（取消 / 未执行）→ 不产生口径记录', async () => {
        const ctx = { ...makeVerifyCtx(undefined), ciAlignment: [] as CiAlignmentRecord[] }

        await verifyProject(ctx, 'foo/bar', { ciAlignment: { client: null } })

        expect(ctx.ciAlignment).toEqual([])
    })

    it('未提供 CI 口径上下文时不做比对（报告不产生空记录）', async () => {
        const ctx = { ...makeVerifyCtx(undefined), ciAlignment: [] as CiAlignmentRecord[] }

        await verifyProject(ctx, 'foo/bar')

        expect(ctx.ciAlignment).toEqual([])
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
    // typecheck / test 纳入默认链（install → lint → build → typecheck → test）
    // -----------------------------------------------------------------------

    /** 覆盖 fixture 的 package.json（用于构造「有 / 无 test 脚本」两类仓库） */
    function writePkg(scripts: Record<string, string>) {
        writeFileSync(join(workDir, 'package.json'), JSON.stringify({
            name: 'fixture', version: '1.0.0', scripts,
        }, null, 2))
    }

    /** 复现原始事故形态：install / lint / build / typecheck 全绿，pnpm test 失败（ESM-only 依赖破坏 CJS 消费方） */
    function mockTestFailureAtEnd() {
        verificationRunnerMock.runVerification.mockResolvedValue({
            success: false,
            failedCommand: 'pnpm test',
            commandResults: [
                { command: 'pnpm install --frozen-lockfile', exitCode: 0, durationMs: 1, stdout: '', stderr: '' },
                { command: 'pnpm lint', exitCode: 0, durationMs: 1, stdout: '', stderr: '' },
                { command: 'pnpm build', exitCode: 0, durationMs: 1, stdout: '', stderr: '' },
                { command: 'pnpm typecheck', exitCode: 0, durationMs: 1, stdout: '', stderr: '' },
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

    /**
     * 复现本条目事故形态：install / lint / build 全绿，`pnpm typecheck` 失败
     * （依赖升级引入类型面破坏——消费方引用了已不存在的类型导出）。
     * 结果集在首个失败命令处截断，与 `runVerification`「首个失败即停」语义一致
     * （typecheck 失败后 `pnpm test` 不会被执行）。
     */
    function mockTypecheckFailureAtEnd() {
        verificationRunnerMock.runVerification.mockResolvedValue({
            success: false,
            failedCommand: 'pnpm typecheck',
            commandResults: [
                { command: 'pnpm install --frozen-lockfile', exitCode: 0, durationMs: 1, stdout: '', stderr: '' },
                { command: 'pnpm lint', exitCode: 0, durationMs: 1, stdout: '', stderr: '' },
                { command: 'pnpm build', exitCode: 0, durationMs: 1, stdout: '', stderr: '' },
                {
                    command: 'pnpm typecheck',
                    exitCode: 2,
                    durationMs: 1,
                    stdout: '',
                    stderr: `src/mail.ts(12,24): error TS2503: Cannot find namespace 'nodemailer'.`,
                },
            ],
        })
    }

    // -----------------------------------------------------------------------
    // 既有失败基线判定：修复前即红的命令不归因本次改动
    // -----------------------------------------------------------------------

    /** 修复前基线采样：install / lint / build / typecheck 绿、test 红（目标仓库长期红测试套件的典型形态） */
    function baselineWithTestFailure(): CommandResult[] {
        return [
            { command: 'pnpm install --frozen-lockfile', exitCode: 0, durationMs: 1, stdout: '', stderr: '' },
            { command: 'pnpm lint', exitCode: 0, durationMs: 1, stdout: '', stderr: '' },
            { command: 'pnpm build', exitCode: 0, durationMs: 1, stdout: '', stderr: '' },
            { command: 'pnpm typecheck', exitCode: 0, durationMs: 1, stdout: '', stderr: '' },
            { command: 'pnpm test', exitCode: 1, durationMs: 1, stdout: '', stderr: 'pre-existing failure' },
        ]
    }

    it('基线红 + 修复后仍红 → 标记 preExisting，不归因本次改动（报告单列 PRE_EXISTING_FAILURE）', async () => {
        writePkg({ lint: 'eslint .', build: 'tsc', typecheck: 'tsc --noEmit', test: 'vitest run' })
        mockTestFailureAtEnd()
        const ctx = makeVerifyCtx(undefined)
        const actions = await verifyProject(ctx, 'foo/bar', { baseline: baselineWithTestFailure() })

        const testAction = actions.find((a) => a.target === 'pnpm test')
        expect(testAction?.success).toBe(false)
        expect(testAction?.preExisting).toBe(true)
        // 归因口径：只有 test 是既有失败，其余四条仍为成功
        expect(actions.filter((a) => a.success).map((a) => a.target)).toEqual([
            'pnpm install --frozen-lockfile', 'pnpm lint', 'pnpm build', 'pnpm typecheck',
        ])
        // 报告口径：既有失败单列，不混入「本次引入的失败」
        expect(ctx.allErrors).toEqual([expect.objectContaining({
            repository: 'foo/bar', stage: 'verify', category: 'PRE_EXISTING_FAILURE', target: 'pnpm test',
        })])
    })

    it('typecheck 基线红 + 修复后仍红 → 不归因本次改动（既有失败豁免同样适用于 typecheck）', async () => {
        writePkg({ lint: 'eslint .', build: 'tsc', typecheck: 'tsc --noEmit', test: 'vitest run' })
        mockTypecheckFailureAtEnd()
        const baseline = baselineWithTestFailure()
        baseline[3] = { command: 'pnpm typecheck', exitCode: 2, durationMs: 1, stdout: '', stderr: 'pre-existing type error' }
        baseline[4] = { command: 'pnpm test', exitCode: 0, durationMs: 1, stdout: '', stderr: '' }
        const ctx = makeVerifyCtx(undefined)
        const actions = await verifyProject(ctx, 'foo/bar', { baseline })

        const typecheckAction = actions.find((a) => a.target === 'pnpm typecheck')
        expect(typecheckAction?.success).toBe(false)
        expect(typecheckAction?.preExisting).toBe(true)
        expect(ctx.allErrors).toEqual([expect.objectContaining({
            repository: 'foo/bar', stage: 'verify', category: 'PRE_EXISTING_FAILURE', target: 'pnpm typecheck',
        })])
    })

    // 回归：pristine 安装失败会在收尾阶段（recordInstallBaselineFailure）先写一条审计；
    // 修复后验证再遇同一命令失败时不得重复记第二条（否则报告把同一根因渲染两次）。
    it('基线安装失败已先记录 → 修复后同命令只保留一条 PRE_EXISTING_FAILURE', async () => {
        writePkg({ lint: 'eslint .', build: 'tsc', typecheck: 'tsc --noEmit', test: 'vitest run' })
        verificationRunnerMock.runVerification.mockResolvedValue({
            success: false,
            failedCommand: 'pnpm install --frozen-lockfile',
            commandResults: [{
                command: 'pnpm install --frozen-lockfile',
                exitCode: 1,
                durationMs: 1,
                stdout: '',
                stderr: 'ERR_PNPM_BROKEN_LOCKFILE',
            }],
        })
        const ctx = makeVerifyCtx(undefined)
        ctx.allErrors.push({
            repository: 'foo/bar',
            target: 'pnpm install --frozen-lockfile',
            stage: 'verify',
            category: 'PRE_EXISTING_FAILURE',
            message: 'Pre-existing failure (already failing before this run; not caused by this change): '
                + 'pnpm install --frozen-lockfile — ERR_PNPM_BROKEN_LOCKFILE',
        })

        const actions = await verifyProject(ctx, 'foo/bar', {
            baseline: [{
                command: 'pnpm install --frozen-lockfile',
                exitCode: 1,
                durationMs: 1,
                stdout: '',
                stderr: 'ERR_PNPM_BROKEN_LOCKFILE',
            }],
        })

        expect(actions[0]).toMatchObject({
            target: 'pnpm install --frozen-lockfile',
            success: false,
            preExisting: true,
        })
        // 去重判据：仓库 + 命令 + 类别 命中即视为已记录
        expect(ctx.allErrors).toHaveLength(1)
        expect(ctx.allErrors[0]).toMatchObject({
            category: 'PRE_EXISTING_FAILURE',
            target: 'pnpm install --frozen-lockfile',
        })
    })

    // 反向守卫：去重谓词必须三键同时命中。若退化为只比命令 / 只比类别，
    // 多仓运行会把「仓库 B 的同命令既有失败」吞进仓库 A 的记录，报告静默丢条目。
    it('其它仓库的同命令既有失败不被去重吞掉（仓库维度参与判定）', async () => {
        writePkg({ lint: 'eslint .', build: 'tsc', typecheck: 'tsc --noEmit', test: 'vitest run' })
        verificationRunnerMock.runVerification.mockResolvedValue({
            success: false,
            failedCommand: 'pnpm install --frozen-lockfile',
            commandResults: [{
                command: 'pnpm install --frozen-lockfile',
                exitCode: 1,
                durationMs: 1,
                stdout: '',
                stderr: 'ERR_PNPM_BROKEN_LOCKFILE',
            }],
        })
        const ctx = makeVerifyCtx(undefined)
        ctx.allErrors.push({
            repository: 'other/repo',
            target: 'pnpm install --frozen-lockfile',
            stage: 'verify',
            category: 'PRE_EXISTING_FAILURE',
            message: 'Pre-existing failure (already failing before this run; not caused by this change): '
                + 'pnpm install --frozen-lockfile — ERR_PNPM_BROKEN_LOCKFILE',
        })

        await verifyProject(ctx, 'foo/bar', {
            baseline: [{
                command: 'pnpm install --frozen-lockfile',
                exitCode: 1,
                durationMs: 1,
                stdout: '',
                stderr: 'ERR_PNPM_BROKEN_LOCKFILE',
            }],
        })

        expect(ctx.allErrors.map((error) => error.repository)).toEqual(['other/repo', 'foo/bar'])
        expect(ctx.allErrors.every((error) => error.category === 'PRE_EXISTING_FAILURE')).toBe(true)
    })

    it('基线绿 + 修复后红 → 归因本次改动（不标记 preExisting，交由门禁回滚）', async () => {
        writePkg({ lint: 'eslint .', build: 'tsc', typecheck: 'tsc --noEmit', test: 'vitest run' })
        mockTestFailureAtEnd()
        const baseline = baselineWithTestFailure()
        baseline[4] = { command: 'pnpm test', exitCode: 0, durationMs: 1, stdout: '', stderr: '' }
        const ctx = makeVerifyCtx(undefined)
        const actions = await verifyProject(ctx, 'foo/bar', { baseline })

        const testAction = actions.find((a) => a.target === 'pnpm test')
        expect(testAction?.success).toBe(false)
        expect(testAction?.preExisting).toBeUndefined()
        expect(ctx.allErrors.some((e) => e.category === 'PRE_EXISTING_FAILURE')).toBe(false)
    })

    it('基线中缺少该命令（pristine 链路未跑到）→ 不适用豁免，保守归因本次改动', async () => {
        writePkg({ lint: 'eslint .', build: 'tsc', typecheck: 'tsc --noEmit', test: 'vitest run' })
        mockTestFailureAtEnd()
        const ctx = makeVerifyCtx(undefined)
        // 基线只覆盖 install（pristine 安装即失败 → runVerification 遇错即停，未采样到 test）
        const actions = await verifyProject(ctx, 'foo/bar', {
            baseline: [{ command: 'pnpm install --frozen-lockfile', exitCode: 1, durationMs: 1, stdout: '', stderr: '' }],
        })

        const testAction = actions.find((a) => a.target === 'pnpm test')
        expect(testAction?.preExisting).toBeUndefined()
    })

    it('未提供基线 → 维持原始口径（全部失败均归因，不标记 preExisting）', async () => {
        writePkg({ lint: 'eslint .', build: 'tsc', typecheck: 'tsc --noEmit', test: 'vitest run' })
        mockTestFailureAtEnd()
        const ctx = makeVerifyCtx(undefined)
        const actions = await verifyProject(ctx, 'foo/bar')

        expect(actions.find((a) => a.target === 'pnpm test')?.preExisting).toBeUndefined()
        expect(ctx.allErrors).toEqual([])
    })

    it('noChanges（本次运行对该仓库无写操作）→ 失败一律豁免，类别与既有基线一致、文案标明来源', async () => {
        writePkg({ lint: 'eslint .', build: 'tsc', typecheck: 'tsc --noEmit', test: 'vitest run' })
        mockTestFailureAtEnd()
        const ctx = makeVerifyCtx(undefined)
        const actions = await verifyProject(ctx, 'foo/bar', { noChanges: true })

        const testAction = actions.find((a) => a.target === 'pnpm test')
        expect(testAction?.success).toBe(false)
        expect(testAction?.preExisting).toBe(true)
        // 类别与「基线命中」同源（出口码 / 门禁谓词零退化），仅文案区分来源
        expect(ctx.allErrors).toEqual([expect.objectContaining({
            repository: 'foo/bar', stage: 'verify', category: 'PRE_EXISTING_FAILURE', target: 'pnpm test',
        })])
        expect(ctx.allErrors[0]!.message).toContain('no alerts or pending fixes')
    })

    it('基线命中与 noChanges 并存 → 文案取基线来源（基线判定优先）', async () => {
        writePkg({ lint: 'eslint .', build: 'tsc', typecheck: 'tsc --noEmit', test: 'vitest run' })
        mockTestFailureAtEnd()
        const ctx = makeVerifyCtx(undefined)
        await verifyProject(ctx, 'foo/bar', { baseline: baselineWithTestFailure(), noChanges: true })

        expect(ctx.allErrors[0]!.message).toContain('already failing before this run')
    })

    // -----------------------------------------------------------------------
    // sampleVerificationBaseline（修复前按需采样）
    // -----------------------------------------------------------------------

    it('基线采样只测量：逐命令结果返回、失败只记日志不写 allErrors', async () => {
        writePkg({ lint: 'eslint .', build: 'tsc', typecheck: 'tsc --noEmit', test: 'vitest run' })
        mockTestFailureAtEnd()
        const ctx = makeVerifyCtx(undefined)
        const result = await sampleVerificationBaseline(ctx, 'foo/bar')

        expect(result?.map((cr) => cr.command)).toEqual([
            'pnpm install --frozen-lockfile', 'pnpm lint', 'pnpm build', 'pnpm typecheck', 'pnpm test',
        ])
        // 既有状态不得渲染成本次运行的问题
        expect(ctx.allErrors).toEqual([])
        expect(ctx.logger.warn).toHaveBeenCalledWith(expect.stringContaining('already failing before this run'))
    })

    it('基线采样沿用同一跳过口径：无对应脚本的命令被跳过，非脚本命令（install）保留', async () => {
        writePkg({})
        verificationRunnerMock.runVerification.mockResolvedValue({
            success: true,
            commandResults: [{ command: 'pnpm install --frozen-lockfile', exitCode: 0, durationMs: 1, stdout: '', stderr: '' }],
        })
        const ctx = makeVerifyCtx(undefined)
        const result = await sampleVerificationBaseline(ctx, 'foo/bar')

        expect(verificationRunnerMock.runVerification.mock.calls[0][0].commands).toEqual(['pnpm install --frozen-lockfile'])
        expect(result?.map((cr) => cr.command)).toEqual(['pnpm install --frozen-lockfile'])
        expect(ctx.logger.info).toHaveBeenCalledWith(expect.stringContaining('Skipping command "pnpm lint"'))
        expect(ctx.allErrors).toEqual([])
    })

    it('基线采样：命令链为空 → 直接返回空数组且不发命令', async () => {
        const ctx = makeVerifyCtx(undefined, [])
        const result = await sampleVerificationBaseline(ctx, 'foo/bar')

        expect(result).toEqual([])
        expect(verificationRunnerMock.runVerification).not.toHaveBeenCalled()
    })

    it('基线采样：外联违规只 warn 留痕、不入 allErrors（既有状态不渲染成本次问题）', async () => {
        writePkg({ lint: 'eslint .', build: 'tsc', typecheck: 'tsc --noEmit', test: 'vitest run' })
        verificationRunnerMock.runVerification.mockResolvedValue({
            success: false,
            commandResults: [{ command: 'pnpm lint', exitCode: 1, durationMs: 1, stdout: '', stderr: 'boom' }],
            networkViolations: [{ time: 't', source: 'proxy', method: 'CONNECT', target: 'evil.example.com:443', violation: true }],
        })
        const ctx = makeVerifyCtx(undefined)
        await sampleVerificationBaseline(ctx, 'foo/bar')

        expect(ctx.allErrors).toEqual([])
        expect(ctx.logger.warn).toHaveBeenCalledWith(expect.stringContaining('outbound blocked by allowlist'))
    })

    it('基线采样异常 → 返回 undefined（调用方退回全量归因，不静默豁免）', async () => {
        writePkg({ lint: 'eslint .', build: 'tsc', typecheck: 'tsc --noEmit', test: 'vitest run' })
        verificationRunnerMock.runVerification.mockRejectedValue(new Error('spawn EACCES'))
        const ctx = makeVerifyCtx(undefined)
        const result = await sampleVerificationBaseline(ctx, 'foo/bar')

        expect(result).toBeUndefined()
        expect(ctx.logger.warn).toHaveBeenCalledWith(expect.stringContaining('Sampling failed'))
    })

    it('默认命令链纳入 typecheck，顺序 install → lint → build → typecheck → test', async () => {
        writePkg({ lint: 'eslint .', build: 'tsc', typecheck: 'tsc --noEmit', test: 'vitest run' })
        await verifyProject(makeVerifyCtx(undefined), 'foo/bar')

        const commands = verificationRunnerMock.runVerification.mock.calls[0][0].commands
        expect(commands).toEqual([
            'pnpm install --frozen-lockfile',
            'pnpm lint',
            'pnpm build',
            'pnpm typecheck',
            'pnpm test',
        ])
    })

    it('无 typecheck 脚本的仓库跳过 pnpm typecheck 并记 SCRIPT_NOT_FOUND 审计（不误伤未配置类型检查的仓库）', async () => {
        writePkg({ lint: 'eslint .', build: 'tsc', test: 'vitest run' }) // 显式构造无 typecheck 脚本的仓库
        const ctx = makeVerifyCtx(undefined)
        await verifyProject(ctx, 'foo/bar')

        const commands = verificationRunnerMock.runVerification.mock.calls[0][0].commands
        expect(commands).toEqual(['pnpm install --frozen-lockfile', 'pnpm lint', 'pnpm build', 'pnpm test'])
        expect(commands).not.toContain('pnpm typecheck')
        expect(ctx.allErrors).toEqual([expect.objectContaining({
            repository: 'foo/bar', stage: 'verify', category: 'SCRIPT_NOT_FOUND', target: 'pnpm typecheck',
        })])
    })

    it('无 test 脚本的仓库跳过 pnpm test 并记 SCRIPT_NOT_FOUND 审计（不误伤未配置测试的仓库）', async () => {
        writePkg({ lint: 'eslint .', build: 'tsc', typecheck: 'tsc --noEmit' }) // 显式构造无 test 脚本的仓库
        const ctx = makeVerifyCtx(undefined)
        await verifyProject(ctx, 'foo/bar')

        const commands = verificationRunnerMock.runVerification.mock.calls[0][0].commands
        expect(commands).toEqual(['pnpm install --frozen-lockfile', 'pnpm lint', 'pnpm build', 'pnpm typecheck'])
        expect(commands).not.toContain('pnpm test')
        expect(ctx.allErrors).toEqual([expect.objectContaining({
            repository: 'foo/bar', stage: 'verify', category: 'SCRIPT_NOT_FOUND', target: 'pnpm test',
        })])
    })

    it('依赖升级引入类型面破坏：install/lint/build 全绿但 typecheck 失败 → verification action 失败', async () => {
        writePkg({ lint: 'eslint .', build: 'tsc', typecheck: 'tsc --noEmit', test: 'vitest run' })
        mockTypecheckFailureAtEnd()
        const actions = await verifyProject(makeVerifyCtx(undefined), 'foo/bar')

        const typecheckAction = actions.find((a) => a.target === 'pnpm typecheck')
        expect(typecheckAction?.success).toBe(false)
        expect(typecheckAction?.error).toContain(`TS2503`)
        // 复现事故形态：install / lint / build 三条仍为成功——类型面破坏只能由 typecheck 暴露
        // （typecheck 之后的 pnpm test 未执行，与「首个失败即停」一致）
        const beforeTypecheck = actions.filter((a) => ['pnpm install --frozen-lockfile', 'pnpm lint', 'pnpm build'].includes(a.target))
        expect(beforeTypecheck).toHaveLength(3)
        expect(beforeTypecheck.every((a) => a.success)).toBe(true)
    })

    it('ESM-only 依赖破坏 CJS 消费方：install/lint/build/typecheck 全绿但 test 失败 → verification action 失败', async () => {
        writePkg({ lint: 'eslint .', build: 'tsc', typecheck: 'tsc --noEmit', test: 'jest' })
        mockTestFailureAtEnd()
        const actions = await verifyProject(makeVerifyCtx(undefined), 'foo/bar')

        const testAction = actions.find((a) => a.target === 'pnpm test')
        expect(testAction?.success).toBe(false)
        expect(testAction?.error).toContain(`Unexpected token 'export'`)
        // 复现原始事故形态：其余四条仍为成功——破坏只能由 test 暴露
        expect(actions.filter((a) => a.target !== 'pnpm test').every((a) => a.success)).toBe(true)
    })

    /**
     * 门禁组合用例（真实 git 仓库 + 模拟修复改动）：verifyProject → verificationPassed=false
     * → enforceVerificationGate 阻断并真实回滚。供不同失败源（typecheck / test）共用。
     */
    async function assertGateBlocksAndRollsBack() {
        // 门禁回滚需要真实 git 仓库
        execSync('git init -q', { cwd: workDir })
        execSync('git config user.name test', { cwd: workDir })
        execSync('git config user.email test@test', { cwd: workDir })
        execSync('git add . && git commit -qm init', { cwd: workDir })
        // 模拟修复改动（待回滚还原）：只改 version，保留 scripts——否则 validateVerifyCommands 会把链降级，
        // 与实际验证链不一致（mock 返回的是 5 条常驻结果）
        const pkgBefore = JSON.parse(readFileSync(join(workDir, 'package.json'), 'utf-8')) as Record<string, unknown>
        writeFileSync(join(workDir, 'package.json'), JSON.stringify({ ...pkgBefore, version: '2.0.0' }, null, 2))
        execSync('git add package.json', { cwd: workDir })

        const ctx = makeVerifyCtx(undefined)
        const actions = await verifyProject(ctx, 'foo/bar')

        // 与 repo-fix.ts 的判定一致：全部验证动作成功才算通过
        const verificationPassed = actions.every((a) => a.success)
        expect(verificationPassed).toBe(false)

        const blocked = await enforceVerificationGate({
            logger: ctx.logger,
            workDir,
            allErrors: ctx.allErrors,
            repoResults: [{ repository: 'foo/bar', verificationPassed } as never],
        }, { preExistingDirty: false, action: 'pr' })

        expect(blocked).toBe(true)
        expect(ctx.allErrors.some((e) => e.category === 'VERIFICATION_FAILED')).toBe(true)
        // 修复改动已回滚（package.json 回到初始版本）
        expect(execSync('git show HEAD:package.json', { cwd: workDir, encoding: 'utf-8' })).toContain('"version": "1.0.0"')
    }

    it('组合：typecheck 失败 → verificationPassed=false → 验证门禁阻断交付并真实回滚', async () => {
        writePkg({ lint: 'eslint .', build: 'tsc', typecheck: 'tsc --noEmit', test: 'vitest run' })
        mockTypecheckFailureAtEnd()
        await assertGateBlocksAndRollsBack()
    }, 30_000)

    it('组合：test 失败 → verificationPassed=false → 验证门禁阻断交付并真实回滚', async () => {
        writePkg({ lint: 'eslint .', build: 'tsc', typecheck: 'tsc --noEmit', test: 'jest' })
        mockTestFailureAtEnd()
        await assertGateBlocksAndRollsBack()
    }, 30_000)
})
