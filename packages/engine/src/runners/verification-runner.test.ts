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
import { extractHostname } from './network-audit'

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

    it('injects audit proxy env and telemetry-disable env and records command-output urls', async () => {
        // 治本（候选方向 3）：spawn env 总是构造（不再是 undefined），包含
        // 审计代理（HTTP_PROXY）+ telemetry 禁用（NUXT_TELEMETRY_DISABLED）
        const originalNuxtTelemetry = process.env.NUXT_TELEMETRY_DISABLED
        delete process.env.NUXT_TELEMETRY_DISABLED
        try {
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
            // telemetry 默认禁用（治本 D2：Nuxt CLI 默认 telemetry 上报 → telemetry.nuxt.com:443
            // 真实外联；verification 是离线构建验证，必须禁用）
            expect(spawnOptions.env?.NUXT_TELEMETRY_DISABLED).toBe('1')
            expect(spawnOptions.env?.NEXT_TELEMETRY_DISABLED).toBe('1')
            expect(spawnOptions.env?.DO_NOT_TRACK).toBe('1')
            // 输出 URL 提取进审计记录
            expect(result.networkAudit).toBeDefined()
            expect(result.networkAudit?.some((e) => e.source === 'command-output'
                && e.target === 'https://registry.npmjs.org/lodash/-/lodash-4.17.21.tgz')).toBe(true)
        } finally {
            if (originalNuxtTelemetry === undefined) {
                delete process.env.NUXT_TELEMETRY_DISABLED
            } else {
                process.env.NUXT_TELEMETRY_DISABLED = originalNuxtTelemetry
            }
        }
    })

    it('skips proxy injection when environment already has a proxy', async () => {
        const originalProxy = process.env.HTTP_PROXY
        const originalNuxtTelemetry = process.env.NUXT_TELEMETRY_DISABLED
        process.env.HTTP_PROXY = 'http://corp-proxy.example:8080'
        delete process.env.NUXT_TELEMETRY_DISABLED
        try {
            mockSpawn.mockImplementation(() => successCp('ok'))

            const result = await runVerification({
                workDir: '/tmp/test',
                commands: ['echo ok'],
            })

            const spawnOptions = mockSpawn.mock.calls[0][1] as { env?: NodeJS.ProcessEnv }
            // 不覆盖用户既有代理：spawn env 仍构造（注入 telemetry 禁用），但不动 HTTP_PROXY
            expect(spawnOptions.env).toBeDefined()
            expect(spawnOptions.env?.HTTP_PROXY).toBe('http://corp-proxy.example:8080')
            // telemetry 仍注入（与代理注入正交）
            expect(spawnOptions.env?.NUXT_TELEMETRY_DISABLED).toBe('1')
            // 输出提取仍生效
            expect(result.networkAudit).toBeDefined()
        } finally {
            if (originalProxy === undefined) {
                delete process.env.HTTP_PROXY
            } else {
                process.env.HTTP_PROXY = originalProxy
            }
            if (originalNuxtTelemetry === undefined) {
                delete process.env.NUXT_TELEMETRY_DISABLED
            } else {
                process.env.NUXT_TELEMETRY_DISABLED = originalNuxtTelemetry
            }
        }
    })

    it('skips proxy injection when only ALL_PROXY is set', async () => {
        const originalProxy = process.env.ALL_PROXY
        const originalNuxtTelemetry = process.env.NUXT_TELEMETRY_DISABLED
        process.env.ALL_PROXY = 'http://corp-proxy.example:8080'
        delete process.env.NUXT_TELEMETRY_DISABLED
        try {
            mockSpawn.mockImplementation(() => successCp('ok'))

            const result = await runVerification({
                workDir: '/tmp/test',
                commands: ['echo ok'],
            })

            const spawnOptions = mockSpawn.mock.calls[0][1] as { env?: NodeJS.ProcessEnv }
            // ALL_PROXY 单独存在时也不注入 HTTP_PROXY（覆盖用户 ALL_PROXY 会破坏其网络行为）
            expect(spawnOptions.env).toBeDefined()
            expect(spawnOptions.env?.ALL_PROXY).toBe('http://corp-proxy.example:8080')
            expect(spawnOptions.env?.HTTP_PROXY).toBeUndefined()
            // telemetry 仍注入
            expect(spawnOptions.env?.NUXT_TELEMETRY_DISABLED).toBe('1')
            expect(result.networkAudit).toBeDefined()
        } finally {
            if (originalProxy === undefined) {
                delete process.env.ALL_PROXY
            } else {
                process.env.ALL_PROXY = originalProxy
            }
            if (originalNuxtTelemetry === undefined) {
                delete process.env.NUXT_TELEMETRY_DISABLED
            } else {
                process.env.NUXT_TELEMETRY_DISABLED = originalNuxtTelemetry
            }
        }
    })

    it('does not override NUXT_TELEMETRY_DISABLED when already set in parent env', async () => {
        // 用户显式开启 telemetry 时（如调试 telemetry 行为）不覆盖
        const original = process.env.NUXT_TELEMETRY_DISABLED
        process.env.NUXT_TELEMETRY_DISABLED = '0'
        try {
            mockSpawn.mockImplementation(() => successCp('ok'))

            await runVerification({
                workDir: '/tmp/test',
                commands: ['echo ok'],
            })

            const spawnOptions = mockSpawn.mock.calls[0][1] as { env?: NodeJS.ProcessEnv }
            expect(spawnOptions.env?.NUXT_TELEMETRY_DISABLED).toBe('0')
            // 其他未显式设置的 telemetry 变量仍按默认禁用
            expect(spawnOptions.env?.NEXT_TELEMETRY_DISABLED).toBe('1')
            expect(spawnOptions.env?.DO_NOT_TRACK).toBe('1')
        } finally {
            if (original === undefined) {
                delete process.env.NUXT_TELEMETRY_DISABLED
            } else {
                process.env.NUXT_TELEMETRY_DISABLED = original
            }
        }
    })

    it('treats empty-string NUXT_TELEMETRY_DISABLED as unset and injects default', async () => {
        // W1 边界锁定：`export NUXT_TELEMETRY_DISABLED=`（显式空字符串）等价于未设置，
        // buildSpawnEnv 按"未设置"处理并注入默认 '1'。避免语义模糊导致 subprocess
        // 误继承父进程"开启 telemetry"的状态
        const original = process.env.NUXT_TELEMETRY_DISABLED
        process.env.NUXT_TELEMETRY_DISABLED = ''
        try {
            mockSpawn.mockImplementation(() => successCp('ok'))

            await runVerification({
                workDir: '/tmp/test',
                commands: ['echo ok'],
            })

            const spawnOptions = mockSpawn.mock.calls[0][1] as { env?: NodeJS.ProcessEnv }
            expect(spawnOptions.env?.NUXT_TELEMETRY_DISABLED).toBe('1')
        } finally {
            if (original === undefined) {
                delete process.env.NUXT_TELEMETRY_DISABLED
            } else {
                process.env.NUXT_TELEMETRY_DISABLED = original
            }
        }
    })

    it('still injects telemetry-disable env when network audit is disabled', async () => {
        // W2 锁定：telemetry 注入与审计代理注入正交；`networkAuditDisabled: true` 时
        // 审计代理被禁用（deny-by-default 不生效），但 telemetry 注入仍必须生效——
        // telemetry 是依赖工具自身行为，不应被 networkAuditDisabled 一并关闭
        const original = process.env.NUXT_TELEMETRY_DISABLED
        delete process.env.NUXT_TELEMETRY_DISABLED
        try {
            mockSpawn.mockImplementation(() => successCp('ok'))

            await runVerification({
                workDir: '/tmp/test',
                commands: ['echo ok'],
                networkAuditDisabled: true,
            })

            const spawnOptions = mockSpawn.mock.calls[0][1] as { env?: NodeJS.ProcessEnv }
            // 审计关闭 → spawn env 不含 HTTP_PROXY（无代理注入）
            expect(spawnOptions.env?.HTTP_PROXY).toBeUndefined()
            // telemetry 仍按默认禁用（与审计正交）
            expect(spawnOptions.env?.NUXT_TELEMETRY_DISABLED).toBe('1')
            expect(spawnOptions.env?.NEXT_TELEMETRY_DISABLED).toBe('1')
            expect(spawnOptions.env?.DO_NOT_TRACK).toBe('1')
        } finally {
            if (original === undefined) {
                delete process.env.NUXT_TELEMETRY_DISABLED
            } else {
                process.env.NUXT_TELEMETRY_DISABLED = original
            }
        }
    })

    it('records non-allowlisted command-output urls as audit entries without violating verification', async () => {
        // 治本（候选方向 3）实证：命令输出 URL 不等于真实网络外联 —— stdout/stderr 文本
        // 不应触发 verification fail。仅作为 audit entries 备查，真实外联由审计代理拦截
        // 捕获（run `dependfix-mt8nasq2-0iiiry` 教训 2026-08-25）。
        mockSpawn.mockImplementation(() => successCp('See https://evil.example.com/exfil.tgz\nDone'))

        const result = await runVerification({
            workDir: '/tmp/test',
            commands: ['pnpm install'],
        })

        // 命令输出 URL 仅入 entries，**不**归类 violations（治本语义）
        expect(result.networkViolations ?? []).toEqual([])
        expect(result.success).toBe(true)
        // URL 仍记入 audit entries 备查（与代理拦截两条路径并列，行为可观测）
        const recorded = result.networkAudit?.find((e) => e.source === 'command-output' && e.target === 'https://evil.example.com/exfil.tgz')
        expect(recorded).toBeDefined()
        expect(recorded?.violation).toBeUndefined()
    })

    it('records pnpm.io warning url as audit entry without violating verification', async () => {
        // 复发 run `dependfix-mt8nasq2-0iiiry` 实证 2026-08-25：pnpm 11.x 把
        // `https://pnpm.io/catalogs` 写进 stderr 推荐 catalog 协议 —— 文本链接而非真实外联。
        mockSpawn.mockImplementation(() => successCp('[WARN] The "$" version reference syntax in overrides is deprecated (used by: vite). Define the version in a catalog and reference it with the "catalog:" protocol instead. See https://pnpm.io/catalogs'))

        const result = await runVerification({
            workDir: '/tmp/test',
            commands: ['pnpm install --frozen-lockfile'],
        })

        expect(result.networkViolations ?? []).toEqual([])
        expect(result.success).toBe(true)
        // pnpm.io URL 仅入 audit entries 备查（pnpm.io 不在默认白名单，但命令输出 URL 不阻断）
        const recorded = result.networkAudit?.find((e) => e.source === 'command-output' && extractHostname(e.target) === 'pnpm.io')
        expect(recorded).toBeDefined()
        expect(recorded?.violation).toBeUndefined()
    })

    it('keeps allowlisted command-output urls out of violations (治本后所有 command-output URL 均不进 violations)', async () => {
        // 治本（候选方向 3）后：命令输出 URL 全部仅入 entries，不进 violations；
        // 本 case 保留以锁定"白名单域名也只入 entries"的回归（白名单判定仍可被未来扩展复用）
        mockSpawn.mockImplementation(() => successCp('Downloading https://registry.npmjs.org/lodash/-/lodash-4.17.21.tgz\nDone'))

        const result = await runVerification({
            workDir: '/tmp/test',
            commands: ['pnpm install'],
        })

        expect(result.networkViolations ?? []).toEqual([])
        expect(result.networkAudit?.some((e) => e.source === 'command-output' && extractHostname(e.target) === 'registry.npmjs.org')).toBe(true)
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
