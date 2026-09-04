// cli/runner 测试：runCli / dependfixCommand / runDependfixMain 分支覆盖
import { describe, expect, it, vi, beforeEach } from 'vitest'

// Mock citty 模块
vi.mock('citty', () => ({
    defineCommand: vi.fn((cmd) => cmd),
    renderUsage: vi.fn().mockResolvedValue('usage text'),
    runCommand: vi.fn().mockResolvedValue(undefined),
    runMain: vi.fn().mockResolvedValue(undefined),
    showUsage: vi.fn(),
}))

// Mock 依赖
vi.mock('@dependfix/core', () => ({
    toAppError: vi.fn((error, code) => ({ message: error.message || 'error', code })),
}))

vi.mock('@dependfix/engine', () => ({}))

vi.mock('../app/pipeline', () => ({
    createPipeline: vi.fn(() => ({
        parse: vi.fn().mockReturnValue({ ok: true, invocation: {}, config: {} }),
        run: vi.fn().mockResolvedValue(0),
    })),
}))

vi.mock('../skills', () => ({
    skillsCommand: { meta: { name: 'skills' } },
}))

vi.mock('./index', () => ({
    argsDef: {},
    type: {},
}))

import { runCommand, runMain, renderUsage } from 'citty'
import { createPipeline } from '../app/pipeline'
import { runCli, dependfixCommand, runDependfixMain } from './runner'

// 类型断言简化访问
const cmd = dependfixCommand as any

describe('runCli', () => {
    it('returns parse result from pipeline', () => {
        const result = runCli(['fix', '--repo', 'owner/repo'])
        expect(result.ok).toBe(true)
        expect(createPipeline).toHaveBeenCalled()
    })
})

describe('dependfixCommand', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('routes skills subcommand to runCommand', async () => {
        const mockRun = vi.fn().mockResolvedValue(0)
        vi.mocked(createPipeline).mockReturnValue({
            parse: vi.fn().mockReturnValue({ ok: true, invocation: {}, config: {} }),
            run: mockRun,
        } as any)

        await cmd.run({ rawArgs: ['skills', 'install'] })

        expect(runCommand).toHaveBeenCalled()
    })

    it('runs app for non-skills commands', async () => {
        const mockRun = vi.fn().mockResolvedValue(0)
        vi.mocked(createPipeline).mockReturnValue({
            parse: vi.fn().mockReturnValue({ ok: true, invocation: {}, config: {} }),
            run: mockRun,
        } as any)

        await cmd.run({ rawArgs: ['fix', '--repo', 'owner/repo'] })

        expect(mockRun).toHaveBeenCalledWith(['fix', '--repo', 'owner/repo'])
    })

    it('handles errors from app run', async () => {
        const mockRun = vi.fn().mockRejectedValue(new Error('test error'))
        vi.mocked(createPipeline).mockReturnValue({
            parse: vi.fn().mockReturnValue({ ok: true, invocation: {}, config: {} }),
            run: mockRun,
        } as any)

        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

        await cmd.run({ rawArgs: ['fix'] })

        expect(consoleSpy).toHaveBeenCalledWith('Error: test error')
        consoleSpy.mockRestore()
    })
})

describe('runDependfixMain', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('routes skills --help to renderUsage', async () => {
        await runDependfixMain(['skills', '--help'])

        expect(renderUsage).toHaveBeenCalled()
    })

    it('routes skills -h to renderUsage', async () => {
        await runDependfixMain(['skills', '-h'])

        expect(renderUsage).toHaveBeenCalled()
    })

    it('calls runMain for non-skills commands', async () => {
        await runDependfixMain(['fix'])

        expect(runMain).toHaveBeenCalled()
    })
})
