import { mkdtemp, rm, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SandboxExecutor, sanitizeErrorMessage } from './sandbox-executor'
import type { ScanExecutorContext } from './types'
import { SpyRuntimeAdapter } from './runtime-adapter'

const makeCtx = (overrides: Partial<ScanExecutorContext> = {}): ScanExecutorContext => ({
    runId: 'run-sandbox-1',
    repository: {
        owner: 'owner-a',
        name: 'repo-b',
        defaultBranch: 'main',
    },
    config: {
        mode: 'report-only',
        severityThreshold: 'high',
        repositories: ['owner-a/repo-b'],
        dryRun: false,
        createPullRequest: false,
        commit: false,
        cleanupBranches: false,
        cleanupBranchesAuto: false,
        githubToken: 'ghp_test',
        alertSource: 'github-dependabot',
        codeScanningEnabled: false,
        allowMajorUpgrade: false,
        maxAlertsPerRepository: 20,
        maxConcurrency: 1,
        maxRetries: 3,
        maxBackoffMs: 30_000,
    },
    credential: { token: 'ghp_test' },
    workDir: '/tmp/runs/run-sandbox-1',
    ...overrides,
})

/** 构造合法 RunResult(供 spy 返回,使 parseRunResult 走完整成功路径) */
const makeLegalRunResultJson = (ctx: ScanExecutorContext, exitCode = 0): string => {
    const repo = `${ctx.repository.owner}/${ctx.repository.name}`
    const result = {
        runId: ctx.runId,
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        config: {
            mode: ctx.config.mode,
            severityThreshold: String(ctx.config.severityThreshold),
            repositories: [repo],
            dryRun: ctx.config.dryRun,
            createPullRequest: ctx.config.createPullRequest,
            maxAlertsPerRepository: ctx.config.maxAlertsPerRepository,
            alertSource: 'github-dependabot',
        },
        summary: {
            repositoriesScanned: 1,
            alertsFound: 0,
            alertsFixable: 0,
            alertsFixed: 0,
            alertsFailed: 0,
            alertsSkipped: 0,
            alertsConverged: 0,
            alertsTruncated: 0,
            lockfileRepairs: 0,
            verificationsPassed: 0,
            verificationsFailed: 0,
        },
        repositories: [{
            repository: repo,
            defaultBranch: ctx.repository.defaultBranch,
            alertsCount: 0,
            fixable: 0,
            fixed: 0,
            failed: 0,
            lockfileRepaired: false,
            durationMs: 0,
        }],
        alerts: [],
        actions: [],
        errors: [],
    }
    return JSON.stringify({ exitCode, result })
}

describe('SandboxExecutor', () => {
    let workRoot: string

    beforeEach(async () => {
        workRoot = await mkdtemp(join(tmpdir(), 'sandbox-exec-test-'))
    })

    afterEach(async () => {
        await rm(workRoot, { recursive: true, force: true }).catch(() => { /* 清理失败静默 */ })
    })

    describe('kind 路由(与 ContainerExecutor 并存;详见 todo.md §M10 决策会议结论 Q6)', () => {
        it('declares kind as "sandbox" (distinct from "container")', () => {
            const executor = new SandboxExecutor({ workRoot, runtimeAdapter: new SpyRuntimeAdapter() })
            expect(executor.kind).toBe('sandbox')
        })

        it('coexists with ContainerExecutor via distinct kind identifier', async () => {
            // 验证:两个 Executor 在同一 scan-orchestrator 注册不冲突
            const sandbox = new SandboxExecutor({ workRoot, runtimeAdapter: new SpyRuntimeAdapter() })
            const { ContainerExecutor } = await import('./container-executor')
            const container = new ContainerExecutor({ workRoot })
            expect(sandbox.kind).not.toBe(container.kind)
            expect(sandbox.kind).toBe('sandbox')
            expect(container.kind).toBe('container')
        })
    })

    describe('isAvailable(docker host 不可用降级)', () => {
        it('returns true when RuntimeAdapter is available', async () => {
            const adapter = new SpyRuntimeAdapter({ available: true })
            const executor = new SandboxExecutor({ workRoot, runtimeAdapter: adapter })
            expect(await executor.isAvailable()).toBe(true)
        })

        it('returns false when RuntimeAdapter is unavailable (caller should fallback to ContainerExecutor)', async () => {
            const adapter = new SpyRuntimeAdapter({ available: false })
            const executor = new SandboxExecutor({ workRoot, runtimeAdapter: adapter })
            expect(await executor.isAvailable()).toBe(false)
        })
    })

    describe('execute() 接口契约', () => {
        it('builds spec with workDir bind-mount (host workDir → container /work)', async () => {
            const adapter = new SpyRuntimeAdapter()
            const executor = new SandboxExecutor({
                workRoot,
                runtimeAdapter: adapter,
                image: 'dependfix:test',
            })
            await executor.execute(makeCtx({ runId: 'run-bind' }))
            expect(adapter.calls).toHaveLength(1)
            const call = adapter.calls[0]
            expect(call).toBeDefined()
            expect(call?.spec.workDir).toBe('/work')
            expect(call?.spec.mounts).toEqual([
                { src: join(workRoot, 'run-bind'), dst: '/work', readonly: false },
            ])
        })

        it('passes user (rootless default) and runtime through to ContainerSpec', async () => {
            const adapter = new SpyRuntimeAdapter()
            const executor = new SandboxExecutor({
                workRoot,
                runtimeAdapter: adapter,
                sandboxLimits: { memoryMb: 1024, cpu: 0.5 },
            })
            await executor.execute(makeCtx())
            const call = adapter.calls[0]
            expect(call?.spec.memoryMb).toBe(1024)
            expect(call?.spec.cpu).toBe(0.5)
        })

        it('cgroup 限额透传——memoryMb / cpu 通过 DockerAdapter.buildRunArgs 落到 docker CLI(snapshot 验证)', async () => {
            // 集成验证:buildSpec 输出喂给 DockerAdapter.buildRunArgs,限额参数正确出现
            const { DockerAdapter } = await import('./runtime-adapter')
            const executor = new SandboxExecutor({
                workRoot,
                runtimeAdapter: new SpyRuntimeAdapter(),
                sandboxLimits: { memoryMb: 1024, cpu: 2.0 },
                image: 'alpine:3',
            })
            const spec = executor.buildSpec(join(workRoot, 'run-cgroup'), makeCtx())
            const args = new DockerAdapter().buildRunArgs(spec, ['echo', 'ok'])
            const memIdx = args.indexOf('--memory')
            expect(args[memIdx + 1]).toBe('1024m')
            const cpuIdx = args.indexOf('--cpus')
            expect(args[cpuIdx + 1]).toBe('2')
        })

        it('injects GITHUB_TOKEN via spec.env (not via cmd argv)', async () => {
            // 安全契约:token 仅走 env,不进容器 cmd(防止 test 日志 / docker inspect / spy 调用栈泄露)
            const adapter = new SpyRuntimeAdapter()
            const executor = new SandboxExecutor({ workRoot, runtimeAdapter: adapter })
            await executor.execute(makeCtx({ credential: { token: 'ghp_SECRET' } }))
            const call = adapter.calls[0]
            expect(call?.spec.env?.GITHUB_TOKEN).toBe('ghp_SECRET')
            // 验证:cmd 字段不含 token
            expect(JSON.stringify(call?.cmd)).not.toContain('ghp_SECRET')
        })

        it('sets network to none for report-only mode (zero trust default)', async () => {
            const adapter = new SpyRuntimeAdapter()
            const executor = new SandboxExecutor({ workRoot, runtimeAdapter: adapter })
            await executor.execute(makeCtx({ config: { ...makeCtx().config, mode: 'report-only' } }))
            expect(adapter.calls[0]?.spec.network).toBe('none')
        })

        it('sets network to bridge for fix/fix-and-pr mode (git clone needs network)', async () => {
            const adapter = new SpyRuntimeAdapter()
            const executor = new SandboxExecutor({ workRoot, runtimeAdapter: adapter })
            await executor.execute(makeCtx({ config: { ...makeCtx().config, mode: 'fix-and-pr' } }))
            expect(adapter.calls[0]?.spec.network).toBe('bridge')
        })

        it('parses legal RunResult JSON as structured success result', async () => {
            const ctx = makeCtx()
            const adapter = new SpyRuntimeAdapter({
                result: {
                    stdout: makeLegalRunResultJson(ctx),
                    stderr: '',
                    exitCode: 0,
                },
            })
            const executor = new SandboxExecutor({ workRoot, runtimeAdapter: adapter })
            const result = await executor.execute(ctx)
            expect(result.exitCode).toBe(0)
            expect(result.result?.repositories[0]?.repository).toBe('owner-a/repo-b')
            expect(result.error).toBeUndefined()
            expect(result.startedAt).toBeTruthy()
            expect(result.finishedAt).toBeTruthy()
        })
    })

    describe('execute() fail-closed 错误分类', () => {
        it('returns execution_failed when stdout is not valid JSON (defensive parse)', async () => {
            const adapter = new SpyRuntimeAdapter({
                result: { stdout: 'this is not JSON', stderr: '', exitCode: 0 },
            })
            const executor = new SandboxExecutor({ workRoot, runtimeAdapter: adapter })
            const result = await executor.execute(makeCtx())
            expect(result.exitCode).toBe(2)
            expect(result.error?.code).toBe('execution_failed')
        })

        it('returns execution_failed when stdout contains credentials in URL (sanitize in error message)', async () => {
            const maliciousStdout = 'fatal: cannot clone https://x-access-token:SECRET@github.com/o/r.git: not found'
            const adapter = new SpyRuntimeAdapter({
                result: { stdout: maliciousStdout, stderr: '', exitCode: 0 },
            })
            const executor = new SandboxExecutor({ workRoot, runtimeAdapter: adapter })
            const result = await executor.execute(makeCtx())
            expect(result.error?.code).toBe('execution_failed')
            // 错误消息中不能泄露 token
            expect(result.error?.message).not.toContain('SECRET')
            expect(result.error?.message).toContain('https://***@')
        })

        it('returns execution_failed when payload result is malformed (missing required fields)', async () => {
            // 合法 JSON 但 result 缺 runId/summary
            const malformedJson = JSON.stringify({ exitCode: 0, result: { repositories: [] } })
            const adapter = new SpyRuntimeAdapter({
                result: { stdout: malformedJson, stderr: '', exitCode: 0 },
            })
            const executor = new SandboxExecutor({ workRoot, runtimeAdapter: adapter })
            const result = await executor.execute(makeCtx())
            expect(result.exitCode).toBe(2)
            expect(result.error?.code).toBe('execution_failed')
            expect(result.error?.message).toContain('校验失败')
        })

        it('returns execution_failed when transport exitCode != 0 but payload exitCode === 0 (forgery detection)', async () => {
            const ctx = makeCtx()
            const adapter = new SpyRuntimeAdapter({
                result: {
                    stdout: makeLegalRunResultJson(ctx, 0), // payload 声称成功
                    stderr: 'daemon warning',
                    exitCode: 1, // 但 transport 退出码非 0
                },
            })
            const executor = new SandboxExecutor({ workRoot, runtimeAdapter: adapter })
            const result = await executor.execute(ctx)
            expect(result.exitCode).toBe(2)
            expect(result.error?.code).toBe('execution_failed')
            expect(result.error?.message).toContain('矛盾')
        })

        it('returns execution_timeout when adapter returns exitCode 124', async () => {
            const adapter = new SpyRuntimeAdapter({
                result: {
                    stdout: '',
                    stderr: '[docker] execution timeout',
                    exitCode: 124,
                    truncated: true,
                },
            })
            const executor = new SandboxExecutor({ workRoot, runtimeAdapter: adapter, timeoutMs: 5_000 })
            const result = await executor.execute(makeCtx())
            expect(result.exitCode).toBe(2)
            expect(result.error?.code).toBe('execution_timeout')
            expect(result.error?.message).toContain('5000ms')
        })

        it('returns execution_timeout when outer withTimeout triggers (adapter never resolves)', async () => {
            // 模拟外层超时:永不 resolve 的 adapter + 极短 timeoutMs
            class NeverResolveAdapter {
                readonly name = 'never-resolve'
                async isAvailable() { return true }
                async run(): Promise<{ stdout: string, stderr: string, exitCode: number }> {
                    return new Promise(() => { /* never resolve */ })
                }
            }
            const executor = new SandboxExecutor({
                workRoot,
                runtimeAdapter: new NeverResolveAdapter(),
                timeoutMs: 50, // 50ms 外层超时
            })
            const result = await executor.execute(makeCtx())
            expect(result.exitCode).toBe(2)
            expect(result.error?.code).toBe('execution_timeout')
            expect(result.error?.message).toContain('50ms')
        })

        it('returns sandbox_unavailable for ENOENT/ENOTCONN/EACCES/ECONNREFUSED errno', async () => {
            for (const errno of ['ENOENT', 'ENOTCONN', 'EACCES', 'ECONNREFUSED']) {
                const adapter = new SpyRuntimeAdapter({
                    result: Object.assign(new Error(`docker daemon ${errno}`), { code: errno }),
                })
                const executor = new SandboxExecutor({ workRoot, runtimeAdapter: adapter })
                const result = await executor.execute(makeCtx())
                expect(result.exitCode).toBe(2)
                expect(result.error?.code).toBe('sandbox_unavailable')
            }
        })

        it('returns execution_failed (not sandbox_unavailable) for other adapter errors', async () => {
            const adapter = new SpyRuntimeAdapter({
                result: Object.assign(new Error('manifest unknown'), { code: 'EBADRPC' }),
            })
            const executor = new SandboxExecutor({ workRoot, runtimeAdapter: adapter })
            const result = await executor.execute(makeCtx())
            expect(result.exitCode).toBe(2)
            expect(result.error?.code).toBe('execution_failed')
        })

        it('returns execution_failed when mkdir fails (EACCES on workDir parent)', async () => {
            // 构造 EACCES:把 workRoot 替换为已存在的普通文件,mkdir 无法在其下创建子目录
            const blockingFile = join(workRoot, 'block.txt')
            await writeFile(blockingFile, 'block')
            const executor = new SandboxExecutor({ workRoot: blockingFile, runtimeAdapter: new SpyRuntimeAdapter() })
            const result = await executor.execute(makeCtx())
            expect(result.exitCode).toBe(2)
            expect(result.error?.code).toBe('execution_failed')
            // 不能误报为 sandbox_unavailable(文件系统错误 ≠ daemon 错误)
            expect(result.error?.code).not.toBe('sandbox_unavailable')
        })

        it('returns execution_failed when runId contains path traversal characters', async () => {
            const adapter = new SpyRuntimeAdapter()
            const executor = new SandboxExecutor({ workRoot, runtimeAdapter: adapter })
            // 路径穿越尝试
            const result = await executor.execute(makeCtx({ runId: '../etc/passwd' }))
            expect(result.exitCode).toBe(2)
            expect(result.error?.code).toBe('execution_failed')
            // adapter 不应被调用
            expect(adapter.calls).toHaveLength(0)
        })
    })

    describe('execute() workDir cleanup', () => {
        it('cleans up workDir after successful execution', async () => {
            const ctx = makeCtx()
            const adapter = new SpyRuntimeAdapter({
                result: { stdout: makeLegalRunResultJson(ctx), stderr: '', exitCode: 0 },
            })
            const executor = new SandboxExecutor({ workRoot, runtimeAdapter: adapter })
            await executor.execute(ctx)
            const entries = await readdir(workRoot)
            expect(entries).not.toContain(ctx.runId)
        })

        it('cleans up workDir after execution failure (best-effort cleanup)', async () => {
            const ctx = makeCtx()
            const adapter = new SpyRuntimeAdapter({
                result: Object.assign(new Error('fail'), { code: 'EBADRPC' }),
            })
            const executor = new SandboxExecutor({ workRoot, runtimeAdapter: adapter })
            await executor.execute(ctx)
            const entries = await readdir(workRoot)
            expect(entries).not.toContain(ctx.runId)
        })
    })
})

describe('sanitizeErrorMessage', () => {
    it('masks credentials inlined in URLs', () => {
        const input = 'fatal: unable to access https://x-access-token:SECRET@github.com/o/r.git'
        const output = sanitizeErrorMessage(input)
        expect(output).not.toContain('SECRET')
        expect(output).toContain('https://***@github.com')
    })

    it('masks Authorization header values', () => {
        const input = 'fatal: Authorization: basic TOP_SECRET_TOKEN_VALUE_HERE'
        const output = sanitizeErrorMessage(input)
        expect(output).not.toContain('TOP_SECRET_TOKEN_VALUE_HERE')
        expect(output).toContain('Authorization: basic ***')
    })

    it('leaves clean messages unchanged', () => {
        const input = 'fatal: repository not found'
        expect(sanitizeErrorMessage(input)).toBe(input)
    })
})
