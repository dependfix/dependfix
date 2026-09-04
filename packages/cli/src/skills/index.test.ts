// skills/index 测试：skillsCommand 分支覆盖
import { describe, expect, it, vi, beforeEach } from 'vitest'

// Mock 依赖
vi.mock('node:os', () => ({
    homedir: vi.fn().mockReturnValue('/home/test'),
}))

vi.mock('citty', () => ({
    defineCommand: vi.fn((cmd) => cmd),
    renderUsage: vi.fn().mockResolvedValue('skills usage'),
}))

// 使用 vi.hoisted 创建可配置的 mock
const { mockDetectInstalled, mockGlobalSkillDir, mockProjectSkillDir, mockRunDoctor, mockInstallSkillToDir } = vi.hoisted(() => ({
    mockDetectInstalled: vi.fn().mockReturnValue(true),
    mockGlobalSkillDir: vi.fn().mockReturnValue('/home/test/.test/skills'),
    mockProjectSkillDir: vi.fn().mockReturnValue('/project/.test/skills'),
    mockRunDoctor: vi.fn().mockReturnValue([
        { level: 'ok', message: 'All good' },
        { level: 'warn', message: 'Warning message' },
    ]),
    mockInstallSkillToDir: vi.fn().mockResolvedValue({ status: 'installed' }),
}))

vi.mock('./agents', () => ({
    AGENTS: [{
        id: 'test-agent',
        displayName: 'Test Agent',
        detectInstalled: mockDetectInstalled,
        globalSkillDir: mockGlobalSkillDir,
        projectSkillDir: mockProjectSkillDir,
    }],
}))

vi.mock('./doctor', () => ({
    runDoctor: mockRunDoctor,
}))

vi.mock('./installer', () => ({
    installSkillToDir: mockInstallSkillToDir,
}))

vi.mock('./source', () => ({
    resolveProductSkillSourceDir: vi.fn().mockReturnValue('/source/dir'),
}))

import { skillsCommand } from './index'

// 类型断言简化访问
const cmd = skillsCommand as any

describe('skillsCommand', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockDetectInstalled.mockReturnValue(true)
        mockGlobalSkillDir.mockReturnValue('/home/test/.test/skills')
        mockProjectSkillDir.mockReturnValue('/project/.test/skills')
    })

    it('has correct meta', () => {
        expect(cmd.meta.name).toBe('skills')
    })

    it('routes to install subcommand', () => {
        expect(cmd.subCommands.install).toBeDefined()
        expect(cmd.subCommands.install.meta.name).toBe('install')
    })

    it('routes to doctor subcommand', () => {
        expect(cmd.subCommands.doctor).toBeDefined()
        expect(cmd.subCommands.doctor.meta.name).toBe('doctor')
    })

    it('shows usage for unknown subcommand', async () => {
        await cmd.run({ cmd: { meta: cmd.meta }, rawArgs: ['unknown'] })
        // 不抛异常即通过
    })

    it('returns early for install subcommand', async () => {
        await cmd.run({ cmd: { meta: cmd.meta }, rawArgs: ['install'] })
        // 不抛异常即通过
    })

    it('returns early for doctor subcommand', async () => {
        await cmd.run({ cmd: { meta: cmd.meta }, rawArgs: ['doctor'] })
        // 不抛异常即通过
    })
})

describe('install subcommand', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockDetectInstalled.mockReturnValue(true)
        mockGlobalSkillDir.mockReturnValue('/home/test/.test/skills')
        mockProjectSkillDir.mockReturnValue('/project/.test/skills')
    })

    it('installs skills to detected agents', async () => {
        await cmd.subCommands.install.run({ args: {} })
        expect(mockInstallSkillToDir).toHaveBeenCalled()
    })

    it('handles no detected agents', async () => {
        mockDetectInstalled.mockReturnValue(false)
        await cmd.subCommands.install.run({ args: {} })
        // 不调用 installSkillToDir
        expect(mockInstallSkillToDir).not.toHaveBeenCalled()
    })

    it('handles source dir resolution failure', async () => {
        const { resolveProductSkillSourceDir } = await import('./source')
        vi.mocked(resolveProductSkillSourceDir).mockImplementation(() => {
            throw new Error('not found')
        })
        await cmd.subCommands.install.run({ args: {} })
        expect(mockInstallSkillToDir).not.toHaveBeenCalled()
    })

    it('skips agents without agentDir', async () => {
        mockGlobalSkillDir.mockReturnValue(null)
        await cmd.subCommands.install.run({ args: {} })
        // agentDir 为 null 时跳过安装
        expect(mockInstallSkillToDir).not.toHaveBeenCalled()
    })

    it('handles failed installations', async () => {
        mockInstallSkillToDir.mockResolvedValue({ status: 'failed', detail: 'error' })
        await cmd.subCommands.install.run({ args: {} })
        expect(process.exitCode).toBe(1)
    })
})

describe('doctor subcommand', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('runs doctor and displays findings', async () => {
        await cmd.subCommands.doctor.run()
        expect(mockRunDoctor).toHaveBeenCalled()
    })

    it('sets exitCode when errors found', async () => {
        mockRunDoctor.mockReturnValue([
            { level: 'error', message: 'Error message' },
        ])
        await cmd.subCommands.doctor.run()
        expect(process.exitCode).toBe(1)
    })

    it('does not set exitCode when only warnings', async () => {
        mockRunDoctor.mockReturnValue([
            { level: 'warn', message: 'Warning' },
        ])
        process.exitCode = 0
        await cmd.subCommands.doctor.run()
        expect(process.exitCode).toBe(0)
    })
})
