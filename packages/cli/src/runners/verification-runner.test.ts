import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Mock child_process.spawn
// ---------------------------------------------------------------------------

interface MockChildProcess extends EventEmitter {
    stdout: EventEmitter
    stderr: EventEmitter
}

const { mockSpawn } = vi.hoisted(() => ({
    mockSpawn: vi.fn(),
}))

vi.mock('node:child_process', () => ({
    spawn: mockSpawn,
}))

import {
    runVerification,
    sanitizeOutput,
    type VerificationResult,
    type CommandResult,
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
        // emit close after delay
        setTimeout(() => {
            cp.emit('close', behavior.exitCode ?? 0)
        }, behavior.delay ?? 5)
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
