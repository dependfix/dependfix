// verify-project-readonly-baseline.test.ts — 基线采样用只读验证链（`pnpm lint:check`）。
//
// 背景：默认链的 `pnpm lint` 是写模式（`--fix`），基线采样会在 pristine 工作区改文件，
// 破坏「修复前基线 = 未改动工作区」的前提（归因与回滚都会失真）。
// 口径：**仅基线采样**换只读命令；修复后验证仍走原链（保留自动修复能力）；目标仓库无
// `lint:check` 脚本时回退 `pnpm lint`（不假设脚本存在）。
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FixError } from '@dependfix/core'
import { quickVerifyProject } from '../helpers'
import { sampleVerificationBaseline, verifyProject } from './verify-project'

const runVerificationMock = vi.hoisted(() => vi.fn())

vi.mock('../runners/verification-runner', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../runners/verification-runner')>()
    return { ...actual, runVerification: runVerificationMock }
})

const makeCtx = (workDir: string) => ({
    config: {} as never,
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as never,
    workDir,
    allErrors: [] as FixError[],
})

describe('基线采样只读链', () => {
    let workDir: string

    afterEach(() => {
        runVerificationMock.mockReset()
        if (workDir) {
            rmSync(workDir, { recursive: true, force: true })
        }
    })

    it('目标仓库有 lint:check → 基线用只读命令，不写工作区', async () => {
        workDir = mkdtempSync(join(tmpdir(), 'dependfix-readonly-lint-'))
        writeFileSync(join(workDir, 'package.json'), JSON.stringify({
            name: 'fixture',
            version: '1.0.0',
            scripts: {
                // 写模式 lint：真实仓库的 `--fix` 等价物（基线采样不得触发）
                lint: 'node -e "require(\'node:fs\').writeFileSync(\'lint-wrote.txt\', \'x\')"',
                'lint:check': 'node -e "process.exit(0)"',
                build: 'node -e "process.exit(0)"',
                typecheck: 'node -e "process.exit(0)"',
                test: 'node -e "process.exit(0)"',
            },
        }, null, 2))
        writeFileSync(join(workDir, 'pnpm-lock.yaml'), 'lockfileVersion: \'9.0\'\n')

        // 本用例要真实执行命令（验证工作区未被改写）：委托真实 runner
        const actual = await vi.importActual<typeof import('../runners/verification-runner')>(
            '../runners/verification-runner',
        )
        runVerificationMock.mockImplementation(actual.runVerification)

        const baseline = await sampleVerificationBaseline(makeCtx(workDir), 'foo/bar')

        // 默认链被替换：lint → lint:check（其余命令不变）
        expect(baseline?.map((item) => item.command)).toContain('pnpm lint:check')
        expect(baseline?.map((item) => item.command)).not.toContain('pnpm lint')
        // 写模式未被执行：工作区保持 pristine（AC①）
        expect(existsSync(join(workDir, 'lint-wrote.txt'))).toBe(false)
    }, 60_000)

    it('目标仓库无 lint:check → 回退 pnpm lint（不假设脚本存在）', async () => {
        workDir = mkdtempSync(join(tmpdir(), 'dependfix-readonly-lint-'))
        writeFileSync(join(workDir, 'package.json'), JSON.stringify({
            name: 'fixture',
            version: '1.0.0',
            scripts: { lint: 'eslint .', build: 'tsc', typecheck: 'tsc --noEmit', test: 'vitest run' },
        }, null, 2))
        runVerificationMock.mockResolvedValueOnce({ success: true, commandResults: [] })

        await sampleVerificationBaseline(makeCtx(workDir), 'foo/bar')

        const commands = (runVerificationMock.mock.calls[0]?.[0] as { commands: string[] }).commands
        expect(commands).toContain('pnpm lint')
        expect(commands).not.toContain('pnpm lint:check')
    })

    it('修复后验证仍走写模式 pnpm lint（只读替换仅限基线采样）', async () => {
        workDir = mkdtempSync(join(tmpdir(), 'dependfix-readonly-lint-'))
        writeFileSync(join(workDir, 'package.json'), JSON.stringify({
            name: 'fixture',
            version: '1.0.0',
            scripts: { lint: 'eslint . --fix', 'lint:check': 'eslint .' },
        }, null, 2))
        runVerificationMock.mockResolvedValueOnce({ success: true, commandResults: [] })

        await verifyProject(makeCtx(workDir), 'foo/bar')

        const commands = (runVerificationMock.mock.calls[0]?.[0] as { commands: string[] }).commands
        expect(commands).toContain('pnpm lint')
        expect(commands).not.toContain('pnpm lint:check')
    })

    it('基线只读链的既有失败按别名等价豁免修复后的写模式 lint', async () => {
        workDir = mkdtempSync(join(tmpdir(), 'dependfix-readonly-lint-'))
        writeFileSync(join(workDir, 'package.json'), JSON.stringify({
            name: 'fixture',
            version: '1.0.0',
            scripts: { lint: 'eslint . --fix', 'lint:check': 'eslint .' },
        }, null, 2))
        runVerificationMock.mockResolvedValueOnce({
            success: false,
            commandResults: [
                { command: 'pnpm lint', exitCode: 1, durationMs: 1, stdout: '', stderr: 'lint error' },
            ],
            failedCommand: 'pnpm lint',
        })
        const ctx = makeCtx(workDir)

        const actions = await verifyProject(ctx, 'foo/bar', {
            baseline: [
                { command: 'pnpm lint:check', exitCode: 1, durationMs: 1, stdout: '', stderr: 'lint error' },
            ],
        })

        expect(actions[0]).toMatchObject({ target: 'pnpm lint', preExisting: true })
        expect(ctx.allErrors).toContainEqual(
            expect.objectContaining({ category: 'PRE_EXISTING_FAILURE', target: 'pnpm lint' }),
        )
    })

    it('quick-verify 同样按别名跳过已知红的写模式 lint', async () => {
        workDir = mkdtempSync(join(tmpdir(), 'dependfix-readonly-lint-'))
        writeFileSync(join(workDir, 'package.json'), JSON.stringify({
            name: 'fixture',
            version: '1.0.0',
            scripts: { lint: 'eslint . --fix', 'lint:check': 'eslint .' },
        }, null, 2))
        const ctx = {
            logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as never,
            workDir,
            verificationBaseline: {
                repo: 'foo/bar',
                value: [{ command: 'pnpm lint:check', exitCode: 1, durationMs: 1, stdout: '', stderr: 'lint error' }],
            },
        }

        const ok = await quickVerifyProject(ctx, 'foo/bar')

        // 已知红命令不重跑：等价为通过（既有失败不归因本次）
        expect(ok).toBe(true)
        expect(runVerificationMock).not.toHaveBeenCalled()
    })

    it('自定义链不受只读替换影响（显式配置优先）', async () => {
        workDir = mkdtempSync(join(tmpdir(), 'dependfix-readonly-lint-'))
        writeFileSync(join(workDir, 'package.json'), JSON.stringify({
            name: 'fixture',
            version: '1.0.0',
            scripts: { lint: 'eslint .', 'lint:check': 'eslint .' },
        }, null, 2))
        runVerificationMock.mockResolvedValueOnce({ success: true, commandResults: [] })

        await sampleVerificationBaseline(
            { ...makeCtx(workDir), customCommands: ['pnpm lint'] },
            'foo/bar',
        )

        const commands = (runVerificationMock.mock.calls[0]?.[0] as { commands: string[] }).commands
        expect(commands).toEqual(['pnpm lint'])
    })
})
