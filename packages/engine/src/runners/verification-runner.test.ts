import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Mock child_process.spawn
// ---------------------------------------------------------------------------

interface MockChildProcess extends EventEmitter {
    stdout: EventEmitter
    stderr: EventEmitter
    kill: ReturnType<typeof vi.fn>
}

const { mockSpawn, mockSpawnSync } = vi.hoisted(() => ({
    mockSpawn: vi.fn(),
    mockSpawnSync: vi.fn(),
}))

vi.mock('node:child_process', () => ({
    spawn: mockSpawn,
    spawnSync: mockSpawnSync,
}))

import {
    formatVerificationError,
    runVerification,
    sanitizeOutput,
    summarizeVerificationOutput,
} from './verification-runner'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockCp(
    behavior: {
        stdout?: string
        stderr?: string
        exitCode?: number
        error?: string
        delay?: number
    },
): MockChildProcess {
    const cp = new EventEmitter() as MockChildProcess
    cp.stdout = new EventEmitter()
    cp.stderr = new EventEmitter()
    // 超时中止时由 execCommand 调用 kill：mock 语义为触发 close（与真实进程被杀后 close 一致）
    cp.kill = vi.fn(() => {
        cp.emit('close', null)
    })

    if (behavior.error) {
        // emit error immediately
        setImmediate(() => {
            cp.emit('error', new Error(behavior.error))
        })
    } else {
        // emit data after a tick
        setImmediate(() => {
            if (behavior.stdout) {
                cp.stdout.emit('data', Buffer.from(behavior.stdout, 'utf-8'))
            }
            if (behavior.stderr) {
                cp.stderr.emit('data', Buffer.from(behavior.stderr, 'utf-8'))
            }
        })
        // emit close after delay（unref：超时测试中该 timer 存活于 kill 触发 close 之后，不悬挂进程）
        setTimeout(() => {
            cp.emit('close', behavior.exitCode ?? 0)
        }, behavior.delay ?? 5).unref()
    }

    return cp
}

/** 成功命令的 mock Cp */
function successCp(stdout?: string, stderr?: string): MockChildProcess {
    return createMockCp({ stdout, stderr, exitCode: 0 })
}

/** 失败命令的 mock Cp */
function failedCp(exitCode = 1, stderr?: string): MockChildProcess {
    return createMockCp({ exitCode, stderr: stderr ?? 'command failed' })
}

// ---------------------------------------------------------------------------
// sanitizeOutput
// ---------------------------------------------------------------------------

describe('sanitizeOutput', () => {
    it('removes GITHUB_TOKEN exposure', () => {
        const input = 'GITHUB_TOKEN=ghp_abc123def456'
        const result = sanitizeOutput(input)
        expect(result).not.toContain('ghp_abc')
        expect(result).toContain('GITHUB_TOKEN=***')
    })

    it('removes NPM_TOKEN exposure', () => {
        const input = 'NPM_TOKEN=npm_xyz789'
        const result = sanitizeOutput(input)
        expect(result).not.toContain('npm_xyz')
        expect(result).toContain('NPM_TOKEN=***')
    })

    it('removes token=value pattern', () => {
        const input = 'export token=mysecret123'
        const result = sanitizeOutput(input)
        expect(result).not.toContain('mysecret')
        expect(result).toContain('token=***')
    })

    it('removes password=value pattern', () => {
        const input = 'password: supersecret'
        const result = sanitizeOutput(input)
        expect(result).not.toContain('supersecret')
        expect(result).toContain('password')
    })

    it('removes URL credentials', () => {
        const input = '//user:password@registry.example.com'
        const result = sanitizeOutput(input)
        expect(result).not.toContain('user:password')
        expect(result).toContain('//***@')
    })

    it('removes npm_config secret values', () => {
        const input = 'npm_config_registry_token=abc123'
        const result = sanitizeOutput(input)
        expect(result).not.toContain('abc123')
        expect(result).toContain('npm_config_***=***')
    })

    it('passes through harmless output unchanged', () => {
        const input = 'Build completed successfully'
        expect(sanitizeOutput(input)).toBe('Build completed successfully')
    })

    it('handles empty string', () => {
        expect(sanitizeOutput('')).toBe('')
    })

    it('multiple secrets in one output', () => {
        const input = 'GITHUB_TOKEN=ghp_1\nNPM_TOKEN=npm_2'
        const result = sanitizeOutput(input)
        expect(result).not.toContain('ghp_1')
        expect(result).not.toContain('npm_2')
        expect(result).toContain('GITHUB_TOKEN=***')
        expect(result).toContain('NPM_TOKEN=***')
    })
})

// ---------------------------------------------------------------------------
// runVerification
// ---------------------------------------------------------------------------

describe('runVerification', () => {
    beforeEach(() => {
        mockSpawn.mockReset()
        mockSpawnSync.mockReset()
    })

    it('aborts command on timeout with timed out classification', async () => {
        // 永不正常 close 的 cp（仅 kill 时触发 close，模拟死循环脚本）
        const cp = createMockCp({ exitCode: 0, delay: 10_000 })
        mockSpawn.mockImplementation(() => cp)

        const result = await runVerification({
            workDir: '/tmp/test',
            commands: ['while true; do :; done'],
            commandTimeoutMs: 30,
        })

        expect(result.success).toBe(false)
        expect(result.failedCommand).toContain('while true')
        expect(result.failure).toContain('timed out after')
        expect(result.commandResults[0].timedOut).toBe(true)
        // 被 kill 后 exitCode 非 0（POSIX 信号杀为 -1、Windows 强杀可能为 1），timedOut 是主判别
        expect(result.commandResults[0].exitCode).not.toBe(0)
        // 超时中止时进程树终止被触发
        expect(cp.kill).toHaveBeenCalled()
    })

    it('does not run subsequent commands after timeout', async () => {
        mockSpawn
            .mockImplementationOnce(() => createMockCp({ exitCode: 0, delay: 10_000 }))
            .mockImplementationOnce(() => successCp('should not run'))

        const result = await runVerification({
            workDir: '/tmp/test',
            commands: ['hanging', 'after'],
            commandTimeoutMs: 30,
        })

        expect(result.commandResults).toHaveLength(1)
        expect(result.success).toBe(false)
    })

    it('applies custom timeout without aborting normal commands', async () => {
        mockSpawn.mockImplementation(() => successCp('ok'))

        const result = await runVerification({
            workDir: '/tmp/test',
            commands: ['echo ok'],
            commandTimeoutMs: 60_000,
        })

        expect(result.success).toBe(true)
        expect(result.commandResults[0].timedOut).toBe(false)
    })

    it('injects audit proxy env and records command-output urls', async () => {
        mockSpawn.mockImplementation(() => successCp('Downloading https://registry.npmjs.org/lodash/-/lodash-4.17.21.tgz (1.1 MB)\nDone'))

        const result = await runVerification({
            workDir: '/tmp/test',
            commands: ['pnpm install'],
        })

        // 代理 env 注入（环境无既有代理时）
        const spawnOptions = mockSpawn.mock.calls[0][1] as { env?: NodeJS.ProcessEnv }
        expect(spawnOptions.env?.HTTP_PROXY).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)
        expect(spawnOptions.env?.NO_PROXY).toBe('')
        expect(spawnOptions.env?.no_proxy).toBe('')
        // 输出 URL 提取进审计记录
        expect(result.networkAudit).toBeDefined()
        expect(result.networkAudit?.some((e) => e.source === 'command-output'
            && e.target === 'https://registry.npmjs.org/lodash/-/lodash-4.17.21.tgz')).toBe(true)
    })

    it('skips proxy injection when environment already has a proxy', async () => {
        const original = process.env.HTTP_PROXY
        process.env.HTTP_PROXY = 'http://corp-proxy.example:8080'
        try {
            mockSpawn.mockImplementation(() => successCp('ok'))

            const result = await runVerification({
                workDir: '/tmp/test',
                commands: ['echo ok'],
            })

            const spawnOptions = mockSpawn.mock.calls[0][1] as { env?: NodeJS.ProcessEnv }
            // 不覆盖用户既有代理：spawn 不传 env（子进程继承父环境，HTTP_PROXY 保持用户设置）
            expect(spawnOptions.env).toBeUndefined()
            // 输出提取仍生效
            expect(result.networkAudit).toBeDefined()
        } finally {
            if (original === undefined) {
                delete process.env.HTTP_PROXY
            } else {
                process.env.HTTP_PROXY = original
            }
        }
    })

    it('skips proxy injection when only ALL_PROXY is set', async () => {
        const original = process.env.ALL_PROXY
        process.env.ALL_PROXY = 'http://corp-proxy.example:8080'
        try {
            mockSpawn.mockImplementation(() => successCp('ok'))

            const result = await runVerification({
                workDir: '/tmp/test',
                commands: ['echo ok'],
            })

            const spawnOptions = mockSpawn.mock.calls[0][1] as { env?: NodeJS.ProcessEnv }
            // ALL_PROXY 单独存在时也不注入（覆盖用户 ALL_PROXY 会破坏其网络行为）
            expect(spawnOptions.env).toBeUndefined()
            expect(result.networkAudit).toBeDefined()
        } finally {
            if (original === undefined) {
                delete process.env.ALL_PROXY
            } else {
                process.env.ALL_PROXY = original
            }
        }
    })

    it('flags non-allowlisted command-output urls as network violations', async () => {
        mockSpawn.mockImplementation(() => successCp('Downloading https://evil.example.com/exfil.tgz\nDone'))

        const result = await runVerification({
            workDir: '/tmp/test',
            commands: ['pnpm install'],
        })

        // deny-by-default：非白名单 URL 归类违规
        expect(result.networkViolations).toHaveLength(1)
        expect(result.networkViolations?.[0]).toMatchObject({
            source: 'command-output',
            target: 'https://evil.example.com/exfil.tgz',
            violation: true,
        })
        // 违规同时存在于 entries（审计完整性）
        expect(result.networkAudit?.some((e) => e.target === 'https://evil.example.com/exfil.tgz' && e.violation)).toBe(true)
    })

    it('keeps allowlisted command-output urls out of violations', async () => {
        mockSpawn.mockImplementation(() => successCp('Downloading https://registry.npmjs.org/lodash/-/lodash-4.17.21.tgz\nDone'))

        const result = await runVerification({
            workDir: '/tmp/test',
            commands: ['pnpm install'],
        })

        expect(result.networkViolations).toHaveLength(0)
        expect(result.networkAudit?.some((e) => e.source === 'command-output' && e.target.startsWith('https://registry.npmjs.org'))).toBe(true)
    })

    it('omits network audit when disabled', async () => {
        mockSpawn.mockImplementation(() => successCp('ok'))

        const result = await runVerification({
            workDir: '/tmp/test',
            commands: ['echo ok'],
            networkAuditDisabled: true,
        })

        expect(result.networkAudit).toBeUndefined()
    })

    it('executes default commands and returns success', async () => {
        mockSpawn.mockImplementation(() => successCp('ok'))
        const result = await runVerification({ workDir: '/tmp/test' })

        expect(result.success).toBe(true)
        expect(result.commandResults).toHaveLength(3)
        // 默认命令: frozen-lockfile → lint → build
        expect(result.commandResults[0].command).toContain('--frozen-lockfile')
        expect(result.commandResults[1].command).toContain('lint')
        expect(result.commandResults[2].command).toContain('build')
    })

    it('uses custom commands when provided', async () => {
        mockSpawn.mockImplementation(() => successCp('ok'))
        const result = await runVerification({
            workDir: '/tmp/test',
            commands: ['echo hello', 'echo world'],
        })

        expect(result.success).toBe(true)
        expect(result.commandResults).toHaveLength(2)
        expect(result.commandResults[0].command).toBe('echo hello')
        expect(result.commandResults[1].command).toBe('echo world')
    })

    it('stops on first failure', async () => {
        mockSpawn
            .mockImplementationOnce(() => successCp('first ok'))
            .mockImplementationOnce(() => failedCp(1, 'lint error'))
            .mockImplementationOnce(() => successCp('should not run'))

        const result = await runVerification({ workDir: '/tmp/test' })

        expect(result.success).toBe(false)
        expect(result.commandResults).toHaveLength(2)
        // 第二个命令失败后不应执行第三个
        expect(result.commandResults[0].exitCode).toBe(0)
        expect(result.commandResults[1].exitCode).toBe(1)
    })

    it('failure early return still carries network audit entries', async () => {
        mockSpawn
            .mockImplementationOnce(() => successCp('ok https://a.example/pkg.tgz'))
            .mockImplementationOnce(() => failedCp(1, 'bad'))

        const result = await runVerification({ workDir: '/tmp/test' })

        expect(result.success).toBe(false)
        // 失败前命令的输出 URL 提取保留在失败结果的 networkAudit
        expect(result.networkAudit?.some((e) => e.source === 'command-output' && e.target === 'https://a.example/pkg.tgz')).toBe(true)
    })

    it('returns failedCommand and failure on error', async () => {
        mockSpawn.mockImplementationOnce(() => failedCp(2, 'build failed'))

        const result = await runVerification({ workDir: '/tmp/test' })

        expect(result.success).toBe(false)
        expect(result.failedCommand).toContain('--frozen-lockfile')
        expect(result.failure).toContain('exited with code 2')
    })

    it('all commands succeed → success true', async () => {
        mockSpawn.mockImplementation(() => successCp('all good'))

        const result = await runVerification({
            workDir: '/tmp/test',
            commands: ['echo one'],
        })

        expect(result.success).toBe(true)
        expect(result.failedCommand).toBeUndefined()
        expect(result.failure).toBeUndefined()
    })

    it('records duration for each command', async () => {
        mockSpawn.mockImplementation(() => successCp('ok'))

        const result = await runVerification({
            workDir: '/tmp/test',
            commands: ['echo a', 'echo b'],
        })

        for (const cr of result.commandResults) {
            expect(cr.durationMs).toBeGreaterThanOrEqual(0)
        }
    })

    it('records exit code for each command', async () => {
        mockSpawn
            .mockImplementationOnce(() => successCp('ok'))
            .mockImplementationOnce(() => failedCp(42, 'error'))

        const result = await runVerification({ workDir: '/tmp/test' })
        expect(result.commandResults[0].exitCode).toBe(0)
        expect(result.commandResults[1].exitCode).toBe(42)
    })

    it('captures stdout', async () => {
        mockSpawn.mockImplementation(() => successCp('Build successful', ''))

        const result = await runVerification({
            workDir: '/tmp/test',
            commands: ['echo hello'],
        })

        expect(result.commandResults[0].stdout).toBe('Build successful')
    })

    it('captures stderr', async () => {
        mockSpawn.mockImplementation(() => successCp('', 'warning: deprecated'))

        const result = await runVerification({
            workDir: '/tmp/test',
            commands: ['echo hello'],
        })

        expect(result.commandResults[0].stderr).toBe('warning: deprecated')
    })

    it('sanitizes token in stdout', async () => {
        mockSpawn.mockImplementation(() => successCp('GITHUB_TOKEN=ghp_secret_value', ''))

        const result = await runVerification({
            workDir: '/tmp/test',
            commands: ['echo hello'],
        })

        expect(result.commandResults[0].stdout).not.toContain('ghp_secret')
        expect(result.commandResults[0].stdout).toContain('GITHUB_TOKEN=***')
    })

    it('truncates output beyond 200 lines', async () => {
        const longOutput = Array.from({ length: 250 }, (_, i) => `line ${i + 1}`).join('\n')
        mockSpawn.mockImplementation(() => successCp(longOutput))

        const result = await runVerification({
            workDir: '/tmp/test',
            commands: ['generate-lot-of-output'],
        })

        const stdout = result.commandResults[0].stdout
        const lines = stdout.split('\n')
        // 200 lines + truncation notice
        expect(lines.length).toBeLessThanOrEqual(202)
        expect(stdout).toContain('truncated')
    })

    it('handles spawn error (command not found)', async () => {
        mockSpawn.mockImplementation(() => createMockCp({ error: 'ENOENT' }))

        const result = await runVerification({
            workDir: '/tmp/test',
            commands: ['nonexistent-command'],
        })

        expect(result.success).toBe(false)
        expect(result.commandResults[0].exitCode).toBe(-1)
        expect(result.commandResults[0].stderr).toContain('ENOENT')
    })

    it('empty commands array → returns success with no results', async () => {
        const result = await runVerification({
            workDir: '/tmp/test',
            commands: [],
        })

        expect(result.success).toBe(true)
        expect(result.commandResults).toHaveLength(0)
    })

    it('returns all results even on success', async () => {
        mockSpawn.mockImplementation(() => successCp('ok'))

        const result = await runVerification({
            workDir: '/tmp/test',
            commands: ['cmd1', 'cmd2'],
        })

        expect(result.commandResults).toHaveLength(2)
    })
})

// ---------------------------------------------------------------------------
// summarizeVerificationOutput
// ---------------------------------------------------------------------------

describe('summarizeVerificationOutput', () => {
    it('keeps short output unchanged', () => {
        const input = 'Parsing error: TS5012: Cannot read file .nuxt/tsconfig.json'
        expect(summarizeVerificationOutput(input)).toBe(input)
    })

    it('keeps output at exactly max length unchanged', () => {
        const input = 'A'.repeat(1200)
        expect(summarizeVerificationOutput(input)).toBe(input)
    })

    it('trims long output with head/tail and omission notice', () => {
        const output = summarizeVerificationOutput('A'.repeat(3000))

        // head(600) + tail(500) 保留 1100，实际省略 1900（提示数字与实际一致）
        expect(output).toContain('(1900 chars omitted)')
        expect(output.startsWith('A'.repeat(600))).toBe(true)
        expect(output.endsWith('A'.repeat(500))).toBe(true)
    })

    it('handles empty string', () => {
        expect(summarizeVerificationOutput('')).toBe('')
    })
})

// ---------------------------------------------------------------------------
// formatVerificationError
// ---------------------------------------------------------------------------

describe('formatVerificationError', () => {
    it('includes stderr detail with exit code', () => {
        const result = formatVerificationError({
            command: 'pnpm lint',
            exitCode: 1,
            durationMs: 100,
            stdout: '',
            stderr: 'Parsing error: TS5012: Cannot read file .nuxt/tsconfig.json',
        })

        expect(result).toBe('exit code 1 — Parsing error: TS5012: Cannot read file .nuxt/tsconfig.json')
    })

    it('falls back to bare exit code when no output', () => {
        const result = formatVerificationError({
            command: 'pnpm lint',
            exitCode: 2,
            durationMs: 100,
            stdout: '',
            stderr: '',
        })

        expect(result).toBe('exit code 2')
    })

    it('classifies timeout as timed out instead of exit code', () => {
        const result = formatVerificationError({
            command: 'pnpm lint',
            exitCode: -1,
            durationMs: 30_000,
            timedOut: true,
            stdout: '',
            stderr: '',
        })

        expect(result).toBe('timed out after 30000ms')
    })
})
