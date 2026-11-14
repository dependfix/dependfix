import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { SandboxExecutor, resolveDefaultSandboxImage, resolveEgressPolicy, resolveSandboxImageCandidates, shouldInjectCloneCredential } from './sandbox-executor'
import type { ScanExecutorContext } from './types'
import {
    SpyRuntimeAdapter,
    type ContainerRunResult,
    type ContainerSpec,
    type RuntimeAdapter,
} from './runtime-adapter'

const defaultRuntimeConfig = {
    mode: 'report-only' as const,
    severityThreshold: 'high' as const,
    repositories: ['owner-a/repo-b'],
    dryRun: false,
    createPullRequest: false,
    commit: false,
    cleanupBranches: false,
    cleanupBranchesAuto: false,
    githubToken: 'ghp_test',
    alertSource: 'github-dependabot' as const,
    codeScanningEnabled: false,
    codeQualityEnabled: false,
    allowMajorUpgrade: false,
    maxAlertsPerRepository: 20,
    maxConcurrency: 1,
    maxRetries: 3,
    maxBackoffMs: 30_000,
    maxRepos: 100,
}

const makeCtx = (overrides: Partial<ScanExecutorContext> = {}): ScanExecutorContext => ({
    runId: 'run-sandbox-1',
    repository: {
        owner: 'owner-a',
        name: 'repo-b',
        defaultBranch: 'main',
    },
    config: defaultRuntimeConfig,
    credential: { token: 'ghp_test' },
    workDir: '/tmp/runs/run-sandbox-1',
    ...overrides,
})

/** 构造合法 RunResult（供结果哨兵使用，使 parseRunResult 走完整成功路径） */
const makeLegalRunResult = (ctx: ScanExecutorContext) => {
    const repo = `${ctx.repository.owner}/${ctx.repository.name}`
    return {
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
            alertsFound: 2,
            alertsFixable: 2,
            alertsFixed: 0,
            alertsUnfixed: 2,
            alertsFailed: 0,
            alertsSkipped: 0,
            alertsSkippedByReason: {},
            alertsConverged: 0,
            environmentalFailures: 0,
            alertsTruncated: 0,
            alertsTruncatedBySeverity: {},
            lockfileRepairs: 0,
            verificationsPassed: 0,
            verificationsFailed: 0,
        },
        repositories: [{
            repository: repo,
            defaultBranch: ctx.repository.defaultBranch,
            alertsCount: 2,
            fixable: 2,
            fixed: 0,
            failed: 0,
            lockfileRepaired: false,
            durationMs: 10,
        }],
        alerts: [],
        actions: [],
        errors: [],
    }
}

const legalPayload = (ctx: ScanExecutorContext, exitCode = 0): string =>
    JSON.stringify({ exitCode, result: makeLegalRunResult(ctx) })

/** 模拟容器 stdout：CLI 日志 + 哨兵结果（与真实 buildCmd 输出同形） */
const wrapWithSentinel = (payload: string, logs = '[sandbox] log line'): string =>
    `${logs}\n__DEPENDFIX_RESULT_JSON_START__\n${payload}\n__DEPENDFIX_RESULT_JSON_END__\n`

/** 真实 buildCmd 的输出顺序：资源读数哨兵在前，结果哨兵在后 */
const wrapWithResource = (payload: string, resource: string, logs = '[sandbox] log line'): string =>
    `${logs}\n__DEPENDFIX_RESOURCE_JSON_START__\n${resource}\n__DEPENDFIX_RESOURCE_JSON_END__\n`
    + `__DEPENDFIX_RESULT_JSON_START__\n${payload}\n__DEPENDFIX_RESULT_JSON_END__\n`

interface SimulatedAdapterOptions {
    available?: boolean
    stdout?: string
    stderr?: string
    transportExitCode?: number
    throwError?: Error
}

class SimulatedSandboxAdapter implements RuntimeAdapter {
    readonly name = 'simulated'
    readonly calls: { spec: ContainerSpec, cmd: string[] }[] = []
    private readonly options: SimulatedAdapterOptions

    constructor(options: SimulatedAdapterOptions = {}) {
        this.options = options
    }

    async isAvailable(): Promise<boolean> {
        return this.options.available ?? true
    }

    async run(spec: ContainerSpec, cmd: string[]): Promise<ContainerRunResult> {
        this.calls.push({ spec, cmd })
        if (this.options.throwError) {
            throw this.options.throwError
        }
        return {
            stdout: this.options.stdout ?? '',
            stderr: this.options.stderr ?? '',
            exitCode: this.options.transportExitCode ?? 0,
        }
    }
}

describe('SandboxExecutor', () => {
    describe('kind 路由（与 ContainerExecutor 并存）', () => {
        it('declares kind as "sandbox" (distinct from "container")', () => {
            const executor = new SandboxExecutor({ runtimeAdapter: new SpyRuntimeAdapter() })
            expect(executor.kind).toBe('sandbox')
        })

        it('coexists with ContainerExecutor via distinct kind identifier', async () => {
            const sandbox = new SandboxExecutor({ runtimeAdapter: new SpyRuntimeAdapter() })
            const { ContainerExecutor } = await import('./container-executor')
            const container = new ContainerExecutor({ workRoot: '/tmp' })
            expect(sandbox.kind).not.toBe(container.kind)
            expect(sandbox.kind).toBe('sandbox')
            expect(container.kind).toBe('container')
        })
    })

    describe('isAvailable（docker host 不可用降级）', () => {
        it('returns true when RuntimeAdapter is available', async () => {
            const executor = new SandboxExecutor({ runtimeAdapter: new SpyRuntimeAdapter({ available: true }) })
            expect(await executor.isAvailable()).toBe(true)
        })

        it('returns false when RuntimeAdapter is unavailable (caller should fallback to ContainerExecutor)', async () => {
            const executor = new SandboxExecutor({ runtimeAdapter: new SpyRuntimeAdapter({ available: false }) })
            expect(await executor.isAvailable()).toBe(false)
        })
    })

    describe('execute() 接口契约', () => {
        it('uses a container-private workdir and no host mount (deployment path independent)', async () => {
            const adapter = new SimulatedSandboxAdapter()
            const executor = new SandboxExecutor({ runtimeAdapter: adapter, image: 'dependfix:test' })
            await executor.execute(makeCtx())

            const call = adapter.calls[0]
            expect(call?.spec.workDir).toBe('/tmp')
            expect(call?.spec.mounts).toBeUndefined()
            expect(call?.spec.image).toBe('dependfix:test')
        })

        it('passes sandboxLimits through to ContainerSpec', async () => {
            const adapter = new SimulatedSandboxAdapter()
            const executor = new SandboxExecutor({
                runtimeAdapter: adapter,
                sandboxLimits: { memoryMb: 1024, cpu: 0.5 },
            })
            await executor.execute(makeCtx())
            const call = adapter.calls[0]
            expect(call?.spec.memoryMb).toBe(1024)
            expect(call?.spec.cpu).toBe(0.5)
        })

        it('cgroup 限额透传——memoryMb / cpu 通过 DockerAdapter.buildRunArgs 落到 docker CLI', async () => {
            const { DockerAdapter } = await import('./runtime-adapter')
            const executor = new SandboxExecutor({
                runtimeAdapter: new SpyRuntimeAdapter(),
                sandboxLimits: { memoryMb: 1024, cpu: 2.0 },
                image: 'alpine:3',
            })
            const spec = executor.buildSpec(makeCtx())
            const args = new DockerAdapter().buildRunArgs(spec, ['node', '/app/sandbox/bin.mjs', '--version'])
            const memIdx = args.indexOf('--memory')
            expect(args[memIdx + 1]).toBe('1024m')
            const cpuIdx = args.indexOf('--cpus')
            expect(args[cpuIdx + 1]).toBe('2')
            expect(args.join(' ')).not.toContain(':1024')
        })

        it('injects GITHUB_TOKEN and skills dir via spec.env (not via cmd argv)', async () => {
            const adapter = new SimulatedSandboxAdapter()
            const executor = new SandboxExecutor({ runtimeAdapter: adapter })
            await executor.execute(makeCtx({ credential: { token: 'ghp_SECRET' } }))
            const call = adapter.calls[0]
            expect(call?.spec.env?.GITHUB_TOKEN).toBe('ghp_SECRET')
            expect(call?.spec.env?.DEPENDFIX_SKILLS_DIR).toBe('/app/sandbox/skills')
            expect(call?.cmd.join(' ')).not.toContain('ghp_SECRET')
        })

        it('report-only 不注入组织级 AI Key（最小注入）', async () => {
            const adapter = new SimulatedSandboxAdapter()
            const executor = new SandboxExecutor({ runtimeAdapter: adapter })
            await executor.execute(makeCtx({
                config: {
                    ...defaultRuntimeConfig,
                    ai: {
                        enabled: true,
                        provider: 'openai-compatible',
                        model: 'deepseek-v4-flash',
                        apiKey: 'sk-deepseek-secret',
                        baseUrl: 'https://api.deepseek.com',
                        trigger: 'both',
                    },
                },
            }))
            const env = adapter.calls[0]?.spec.env ?? {}
            expect(env.DEPENDFIX_AI).toBeUndefined()
            expect(env.DEPENDFIX_AI_API_KEY).toBeUndefined()
        })

        it('fix 模式 buildSpec 保留 AI env 注入（当前执行前被 mode 闸拒绝）', () => {
            const executor = new SandboxExecutor({ runtimeAdapter: new SpyRuntimeAdapter() })
            const spec = executor.buildSpec(makeCtx({
                config: {
                    ...defaultRuntimeConfig,
                    mode: 'fix',
                    ai: {
                        enabled: true,
                        provider: 'anthropic',
                        model: 'claude-3-5-sonnet',
                        apiKey: 'sk-ant-secret',
                        baseUrl: 'https://api.deepseek.com',
                        apiUrl: 'https://api.anthropic.com/v1/messages',
                        trigger: 'failure',
                    },
                },
            }))
            expect(spec.env?.DEPENDFIX_AI).toBe('true')
            expect(spec.env?.DEPENDFIX_AI_PROVIDER).toBe('anthropic')
            expect(spec.env?.DEPENDFIX_AI_API_URL).toBe('https://api.anthropic.com/v1/messages')
        })

        it('report-only 使用 bridge：GitHub API 拉取告警需要出站', async () => {
            const adapter = new SimulatedSandboxAdapter()
            const executor = new SandboxExecutor({ runtimeAdapter: adapter })
            await executor.execute(makeCtx())
            expect(adapter.calls[0]?.spec.network).toBe('bridge')
        })

        it('parses sentinel-delimited result as structured success result', async () => {
            const ctx = makeCtx()
            const adapter = new SimulatedSandboxAdapter({ stdout: wrapWithSentinel(legalPayload(ctx)) })
            const executor = new SandboxExecutor({ runtimeAdapter: adapter })
            const result = await executor.execute(ctx)
            expect(result.exitCode).toBe(0)
            expect(result.result?.repositories[0]?.repository).toBe('owner-a/repo-b')
            expect(result.result?.summary.alertsFound).toBe(2)
            expect(result.error).toBeUndefined()
            expect(result.logsJson).toContain('log line')
            expect(result.logsJson).not.toContain('__DEPENDFIX_RESULT_JSON')
        })

        it('attaches the cgroup resource snapshot and strips its sentinel from logs', async () => {
            const ctx = makeCtx()
            const resource = JSON.stringify({
                memoryMaxBytes: 2 * 1024 ** 3,
                peakRssBytes: 64 * 1024 * 1024,
                oomKilled: false,
                samples: 21,
                source: 'cgroup-v2',
                limitReason: '',
            })
            const adapter = new SimulatedSandboxAdapter({ stdout: wrapWithResource(legalPayload(ctx), resource) })
            const result = await new SandboxExecutor({ runtimeAdapter: adapter }).execute(ctx)
            expect(result.resource).toMatchObject({
                memoryMaxBytes: 2 * 1024 ** 3,
                peakRssBytes: 64 * 1024 * 1024,
                oomKilled: false,
                samples: 21,
                source: 'cgroup-v2',
            })
            expect(result.resource?.degradedReason).toBeUndefined()
            expect(result.logsJson ?? '').not.toContain('DEPENDFIX_RESOURCE_JSON')
        })

        it('marks missing resource readings as unavailable instead of zero', async () => {
            const ctx = makeCtx()
            const adapter = new SimulatedSandboxAdapter({ stdout: wrapWithSentinel(legalPayload(ctx)) })
            const result = await new SandboxExecutor({ runtimeAdapter: adapter }).execute(ctx)
            expect(result.resource).toMatchObject({
                memoryMaxBytes: null,
                peakRssBytes: null,
                oomKilled: null,
                source: 'none',
            })
            expect(result.resource?.degradedReason).toContain('cgroup')
        })

        it('treats a malformed resource payload as unavailable', async () => {
            const ctx = makeCtx()
            const adapter = new SimulatedSandboxAdapter({ stdout: wrapWithResource(legalPayload(ctx), 'not-json') })
            const result = await new SandboxExecutor({ runtimeAdapter: adapter }).execute(ctx)
            expect(result.exitCode).toBe(0)
            expect(result.resource?.source).toBe('none')
            expect(result.resource?.degradedReason).toMatch(/cgroup|采样/)
        })

        it('sanitizes credentials in logsJson (stdout/stderr tail)', async () => {
            const ctx = makeCtx()
            const adapter = new SimulatedSandboxAdapter({
                stdout: wrapWithSentinel(legalPayload(ctx), 'fetch https://x-access-token:SECRET@github.com/o/r.git failed'),
                stderr: 'Authorization: token ghp_LOGSECRET',
            })
            const executor = new SandboxExecutor({ runtimeAdapter: adapter })
            const result = await executor.execute(ctx)
            expect(result.logsJson).not.toContain('SECRET')
            expect(result.logsJson).not.toContain('ghp_LOGSECRET')
        })

        it('returns partial failure exitCode with result when CLI exits 1', async () => {
            const ctx = makeCtx()
            const adapter = new SimulatedSandboxAdapter({
                stdout: wrapWithSentinel(legalPayload(ctx, 1)),
                transportExitCode: 1,
            })
            const executor = new SandboxExecutor({ runtimeAdapter: adapter })
            const result = await executor.execute(ctx)
            expect(result.exitCode).toBe(1)
            expect(result.result?.summary.alertsFound).toBe(2)
            expect(result.error).toBeUndefined()
        })

        it('requests commit + push for fix mode (self-contained delivery)', () => {
            const script = new SandboxExecutor({ runtimeAdapter: new SpyRuntimeAdapter() })
                .buildCmd(makeCtx({ config: { ...defaultRuntimeConfig, mode: 'fix' } })).join(' ')
            expect(script).toContain('--commit')
            expect(script).toContain('--push')
            // 容器内 push 复用 env token：credential helper 只写命令、限定 github.com，不含密钥
            expect(script).toContain('credential.https://github.com.helper')
            expect(script).toContain('$GITHUB_TOKEN')
        })

        it('does not request push for non-GitHub clone sources (no push credential)', () => {
            const script = new SandboxExecutor({
                runtimeAdapter: new SpyRuntimeAdapter(),
                cloneBaseUrl: 'https://gitlab.com',
                egress: { allowlist: ['gitlab.com'] },
            }).buildCmd(makeCtx({ config: { ...defaultRuntimeConfig, mode: 'fix' } })).join(' ')
            expect(script).toContain('--commit')
            expect(script).not.toContain('--push')
            expect(script).not.toContain('credential.https://github.com.helper')
        })

        it('does not request commit/push for report-only or fix-and-pr', () => {
            const build = (mode: 'report-only' | 'fix-and-pr') => new SandboxExecutor({ runtimeAdapter: new SpyRuntimeAdapter() })
                .buildCmd(makeCtx({ config: { ...defaultRuntimeConfig, mode } })).join(' ')
            expect(build('report-only')).not.toContain('--commit')
            expect(build('fix-and-pr')).not.toContain('--commit')
            // fix-and-pr 由引擎在容器内 push + 建 PR：同样需要 credential helper
            expect(build('fix-and-pr')).toContain('credential.https://github.com.helper')
            expect(build('report-only')).not.toContain('credential.helper')
        })

        it('maps a self-contained PR delivery to runUrl and prNumber', async () => {
            const ctx = makeCtx({ config: { ...defaultRuntimeConfig, mode: 'fix-and-pr' } })
            const payload = JSON.stringify({
                exitCode: 0,
                result: {
                    ...makeLegalRunResult(ctx),
                    delivery: {
                        deliveredBy: 'engine',
                        status: 'pr-created',
                        branch: 'dependfix/auto-fix-abcd1234',
                        commitSha: 'deadbeef',
                        prUrl: 'https://github.com/owner-a/repo-b/pull/9',
                        prNumber: 9,
                    },
                },
            })
            const executor = new SandboxExecutor({ runtimeAdapter: new SimulatedSandboxAdapter({ stdout: wrapWithSentinel(payload) }) })
            const result = await executor.execute(ctx)
            expect(result.runUrl).toBe('https://github.com/owner-a/repo-b/pull/9')
            expect(result.prNumber).toBe(9)
        })

        it('maps a pushed branch delivery to the branch page', async () => {
            const ctx = makeCtx({ config: { ...defaultRuntimeConfig, mode: 'fix' } })
            const payload = JSON.stringify({
                exitCode: 0,
                result: {
                    ...makeLegalRunResult(ctx),
                    delivery: { deliveredBy: 'engine', status: 'pushed', branch: 'main', commitSha: 'deadbeef' },
                },
            })
            const executor = new SandboxExecutor({ runtimeAdapter: new SimulatedSandboxAdapter({ stdout: wrapWithSentinel(payload) }) })
            const result = await executor.execute(ctx)
            expect(result.runUrl).toBe('https://github.com/owner-a/repo-b/tree/main')
            expect(result.prNumber).toBeUndefined()
        })

        it('leaves runUrl empty when the result carries no delivery record', async () => {
            const ctx = makeCtx()
            const executor = new SandboxExecutor({ runtimeAdapter: new SimulatedSandboxAdapter({ stdout: wrapWithSentinel(legalPayload(ctx)) }) })
            const result = await executor.execute(ctx)
            expect(result.runUrl).toBeUndefined()
        })

        it('builds CLI command with explicit result contract, sentinel and no credentials in argv', () => {
            const executor = new SandboxExecutor({
                runtimeAdapter: new SpyRuntimeAdapter(),
                entry: '/app/sandbox/bin.mjs',
            })
            const cmd = executor.buildCmd(makeCtx())
            const script = cmd.join(' ')
            expect(cmd[0]).toBe('sh')
            expect(cmd[1]).toBe('-c')
            expect(script).toContain('/app/sandbox/bin.mjs')
            expect(script).toContain('report-only')
            expect(script).toContain('--repo')
            expect(script).toContain('owner-a/repo-b')
            expect(script).toContain('--result-json')
            expect(script).toContain('/tmp/result.json')
            expect(script).toContain('__DEPENDFIX_RESULT_JSON_START__')
            // 资源采样：cgroup v2 / v1 双路径 + 停止标记 + 读数哨兵
            expect(script).toContain('/sys/fs/cgroup/memory.current')
            expect(script).toContain('/sys/fs/cgroup/memory/memory.usage_in_bytes')
            expect(script).toContain('/tmp/dependfix-resource.stop')
            expect(script).toContain('__DEPENDFIX_RESOURCE_JSON_START__')
            expect(script).not.toContain('ghp_')
            expect(script).not.toContain('dependfix-reports')
        })
    })

    describe('fix 模式的出站策略与容器内 bootstrap', () => {
        it('injects the allowlist env for fix mode', () => {
            const executor = new SandboxExecutor({
                runtimeAdapter: new SpyRuntimeAdapter(),
                egress: { enabled: true, allowlist: ['github.com', 'registry.example.com'] },
                npmRegistry: '',
            })
            const spec = executor.buildSpec(makeCtx({ config: { ...defaultRuntimeConfig, mode: 'fix' } }))
            expect(spec.env?.DEPENDFIX_ALLOWED_DOMAINS).toContain('github.com')
            expect(spec.env?.DEPENDFIX_ALLOWED_DOMAINS).toContain('registry.example.com')
        })

        it('injects npm registry override and auto-allows its host', () => {
            const executor = new SandboxExecutor({
                runtimeAdapter: new SpyRuntimeAdapter(),
                egress: { enabled: true, allowlist: ['github.com'] },
                npmRegistry: 'https://registry.npmmirror.com',
                image: 'alpine:3',
            })
            const spec = executor.buildSpec(makeCtx({ config: { ...defaultRuntimeConfig, mode: 'fix' } }))
            expect(spec.env?.pnpm_config_registry).toBe('https://registry.npmmirror.com')
            expect(spec.env?.npm_config_registry).toBe('https://registry.npmmirror.com')
            expect(spec.env?.NPM_CONFIG_REGISTRY).toBe('https://registry.npmmirror.com')
            // 镜像站未显式加入白名单也要放行，否则安装必然 502
            expect(spec.env?.DEPENDFIX_ALLOWED_DOMAINS).toContain('registry.npmmirror.com')
        })

        it('ignores a plaintext or credentialed registry hint entirely', () => {
            for (const npmRegistry of ['http://registry.example.com', 'https://user:pass@registry.example.com']) {
                const executor = new SandboxExecutor({
                    runtimeAdapter: new SpyRuntimeAdapter(),
                    egress: { enabled: true, allowlist: ['github.com'] },
                    npmRegistry,
                    image: 'alpine:3',
                })
                const spec = executor.buildSpec(makeCtx({ config: { ...defaultRuntimeConfig, mode: 'fix' } }))
                expect(spec.env?.pnpm_config_registry).toBeUndefined()
                expect(spec.env?.DEPENDFIX_ALLOWED_DOMAINS).not.toContain('registry.example.com')
            }
        })

        it('leaves registry env untouched when no override is configured', () => {
            const executor = new SandboxExecutor({ runtimeAdapter: new SpyRuntimeAdapter(), image: 'alpine:3', npmRegistry: '' })
            const spec = executor.buildSpec(makeCtx({ config: { ...defaultRuntimeConfig, mode: 'fix' } }))
            expect(spec.env?.pnpm_config_registry).toBeUndefined()
            expect(spec.env?.npm_config_registry).toBeUndefined()
            expect(spec.env?.NPM_CONFIG_REGISTRY).toBeUndefined()
        })

        it('does not inject the allowlist env for report-only', () => {
            const executor = new SandboxExecutor({ runtimeAdapter: new SpyRuntimeAdapter() })
            const spec = executor.buildSpec(makeCtx())
            expect(spec.env?.DEPENDFIX_ALLOWED_DOMAINS).toBeUndefined()
        })

        it('clones into the container-private repo dir before running the CLI', () => {
            const executor = new SandboxExecutor({
                runtimeAdapter: new SpyRuntimeAdapter(),
                entry: '/app/sandbox/bin.mjs',
            })
            const script = executor.buildCmd(makeCtx({ config: { ...defaultRuntimeConfig, mode: 'fix' } })).join(' ')

            expect(script).toContain('clone --depth 1')
            expect(script).toContain('https://github.com/owner-a/repo-b.git')
            expect(script).toContain('/tmp/repo')
            expect(script).toContain('cd /tmp/repo')
            // 凭据不进 argv / 脚本明文：只从 env 读取后转成 basic header
            expect(script).not.toContain('ghp_')
            expect(script).toContain('$GITHUB_TOKEN')
            // 采样必须先于 bootstrap：窗口覆盖容器内 clone；bootstrap 失败也先回传读数
            expect(script.indexOf('/sys/fs/cgroup/memory.current')).toBeLessThan(script.indexOf('clone --depth 1'))
            expect(script).toContain('|| { touch /tmp/dependfix-resource.stop')
        })

        it.skipIf(process.platform === 'win32')('produces a valid resource JSON when the sampler runs under a real shell', () => {
            const root = mkdtempSync(join(tmpdir(), 'sandbox-cgroup-'))
            try {
                const cgroup = join(root, 'cgroup')
                mkdirSync(cgroup)
                writeFileSync(join(cgroup, 'memory.current'), '12345678\n')
                writeFileSync(join(cgroup, 'memory.max'), 'max\n')
                writeFileSync(join(cgroup, 'memory.events'), 'low 0\nhigh 0\noom 0\noom_kill 0\n')
                const resourcePath = join(root, 'resource.json')
                const stopPath = join(root, 'resource.stop')

                const executor = new SandboxExecutor({ runtimeAdapter: new SpyRuntimeAdapter() })
                const script = executor.buildCmd(makeCtx())[2]!
                    .split('\n')
                    // 只验证采样器本身：CLI 行替换为固定睡眠
                    .map((line) => line.includes('\'--result-json\'') ? 'sleep 0.5' : line)
                    .join('\n')
                    .replaceAll('/sys/fs/cgroup', cgroup)
                    .replaceAll('/tmp/dependfix-resource.json', resourcePath)
                    .replaceAll('/tmp/dependfix-resource.stop', stopPath)

                execFileSync('sh', ['-c', script], { stdio: 'ignore', timeout: 15_000 })
                const raw = JSON.parse(readFileSync(resourcePath, 'utf8')) as Record<string, unknown>
                expect(raw).toMatchObject({
                    memoryMaxBytes: null,
                    peakRssBytes: 12345678,
                    oomKilled: false,
                    source: 'cgroup-v2',
                    limitReason: 'unlimited',
                })
                expect(raw.samples as number).toBeGreaterThan(0)
            } finally {
                rmSync(root, { recursive: true, force: true })
            }
        })

        it('does not clone in report-only mode', () => {
            const executor = new SandboxExecutor({ runtimeAdapter: new SpyRuntimeAdapter() })
            const script = executor.buildCmd(makeCtx()).join(' ')
            expect(script).not.toContain('clone')
        })

        it('only injects the credential header for https github.com sources', () => {
            const build = (baseUrl: string) => new SandboxExecutor({
                runtimeAdapter: new SpyRuntimeAdapter(),
                cloneBaseUrl: baseUrl,
            }).buildCmd(makeCtx({ config: { ...defaultRuntimeConfig, mode: 'fix' } })).join(' ')

            // 非 GitHub 源：匿名 clone（脚本里没有 extraheader 分支）
            expect(build('https://gitlab.com')).not.toContain('extraheader')
            expect(build('https://gitlab.com')).toContain('git clone --depth 1')
            // GitHub 源：注入 basic header，且 token 只从 env 读取
            expect(build('https://github.com')).toContain('extraheader')
            expect(build('https://github.com')).toContain('$GITHUB_TOKEN')
        })

        it('decides credential injection from protocol + hostname only', () => {
            expect(shouldInjectCloneCredential('https://github.com')).toBe(true)
            expect(shouldInjectCloneCredential('https://github.com/')).toBe(true)
            expect(shouldInjectCloneCredential('http://github.com')).toBe(false)
            expect(shouldInjectCloneCredential('https://gitlab.com')).toBe(false)
            expect(shouldInjectCloneCredential('https://github.com.evil.example')).toBe(false)
            expect(shouldInjectCloneCredential('not-a-url')).toBe(false)
        })

        it('rejects a clone base outside the allowlist (fail-closed)', async () => {
            const adapter = new SimulatedSandboxAdapter()
            const executor = new SandboxExecutor({
                runtimeAdapter: adapter,
                cloneBaseUrl: 'https://evil.example.com',
            })
            const result = await executor.execute(makeCtx({ config: { ...defaultRuntimeConfig, mode: 'fix' } }))
            expect(result.error?.code).toBe('sandbox_clone_host_not_allowed')
            expect(adapter.calls).toHaveLength(0)
        })

        it('rejects a plaintext http clone base (fail-closed)', async () => {
            const adapter = new SimulatedSandboxAdapter()
            const executor = new SandboxExecutor({
                runtimeAdapter: adapter,
                cloneBaseUrl: 'http://github.com',
            })
            const result = await executor.execute(makeCtx({ config: { ...defaultRuntimeConfig, mode: 'fix' } }))
            expect(result.error?.code).toBe('sandbox_clone_host_not_allowed')
            expect(adapter.calls).toHaveLength(0)
        })

        it('rejects an invalid clone base URL (fail-closed)', async () => {
            const adapter = new SimulatedSandboxAdapter()
            const executor = new SandboxExecutor({
                runtimeAdapter: adapter,
                cloneBaseUrl: 'not-a-url',
            })
            const result = await executor.execute(makeCtx({ config: { ...defaultRuntimeConfig, mode: 'fix' } }))
            expect(result.error?.code).toBe('sandbox_clone_host_not_allowed')
            expect(adapter.calls).toHaveLength(0)
        })

        it('never injects the credential header for non-https github sources', () => {
            const script = new SandboxExecutor({
                runtimeAdapter: new SpyRuntimeAdapter(),
                cloneBaseUrl: 'http://github.com',
            }).buildCmd(makeCtx({ config: { ...defaultRuntimeConfig, mode: 'fix' } })).join(' ')
            // 明文 http 源整体走匿名 clone，脚本里连 token 都不出现
            expect(script).not.toContain('extraheader')
            expect(script).not.toContain('$GITHUB_TOKEN')
        })

        it('matches wildcard allowlist entries by suffix only', async () => {
            const cases = [
                { base: 'https://gitlab.example.com', allowlist: ['*.example.com'], allowed: true },
                { base: 'https://example.com', allowlist: ['*.example.com'], allowed: false },
                { base: 'https://evilexample.com', allowlist: ['*.example.com'], allowed: false },
            ]
            for (const item of cases) {
                const adapter = new SimulatedSandboxAdapter()
                const executor = new SandboxExecutor({
                    runtimeAdapter: adapter,
                    cloneBaseUrl: item.base,
                    egress: { allowlist: item.allowlist },
                })
                const result = await executor.execute(makeCtx({ config: { ...defaultRuntimeConfig, mode: 'fix' } }))
                if (item.allowed) {
                    expect(result.error?.code).not.toBe('sandbox_clone_host_not_allowed')
                    expect(adapter.calls).toHaveLength(1)
                } else {
                    expect(result.error?.code).toBe('sandbox_clone_host_not_allowed')
                    expect(adapter.calls).toHaveLength(0)
                }
            }
        })

        it('ignores the port when matching the clone host against the allowlist', async () => {
            const adapter = new SimulatedSandboxAdapter()
            const executor = new SandboxExecutor({
                runtimeAdapter: adapter,
                cloneBaseUrl: 'https://github.com:443',
                egress: { allowlist: ['github.com'] },
            })
            const result = await executor.execute(makeCtx({ config: { ...defaultRuntimeConfig, mode: 'fix' } }))
            expect(result.error?.code).not.toBe('sandbox_clone_host_not_allowed')
            expect(adapter.calls).toHaveLength(1)
        })

        it('resolveEgressPolicy merges required domains and honors the audit switch', () => {
            vi.stubEnv('DEPENDFIX_ALLOWED_DOMAINS', 'registry.example.com')
            try {
                const policy = resolveEgressPolicy()
                expect(policy.allowlist).toEqual(expect.arrayContaining([
                    'github.com', 'api.github.com', '*.npmjs.org', 'registry.example.com',
                ]))
            } finally {
                vi.unstubAllEnvs()
            }
            expect(resolveEgressPolicy({ enabled: false }).enabled).toBe(false)
            // 显式白名单（含空数组）以其为准：操作方清空 → 第二道闸拒绝 fix
            expect(resolveEgressPolicy({ allowlist: [] }).allowlist).toEqual([])
        })
    })

    describe('execute() fail-closed 错误分类', () => {
        it('returns sandbox_fix_requires_egress_policy when the egress policy is disabled (no adapter call)', async () => {
            const adapter = new SimulatedSandboxAdapter()
            const executor = new SandboxExecutor({
                runtimeAdapter: adapter,
                egress: { enabled: false, allowlist: ['github.com'] },
            })
            const result = await executor.execute(makeCtx({
                config: { ...defaultRuntimeConfig, mode: 'fix' },
            }))
            expect(result.exitCode).toBe(2)
            expect(result.error?.code).toBe('sandbox_fix_requires_egress_policy')
            expect(adapter.calls).toHaveLength(0)
        })

        it('returns sandbox_fix_requires_egress_policy when the allowlist is empty', async () => {
            const adapter = new SimulatedSandboxAdapter()
            const executor = new SandboxExecutor({
                runtimeAdapter: adapter,
                egress: { enabled: true, allowlist: [] },
            })
            const result = await executor.execute(makeCtx({
                config: { ...defaultRuntimeConfig, mode: 'fix' },
            }))
            expect(result.error?.code).toBe('sandbox_fix_requires_egress_policy')
            expect(adapter.calls).toHaveLength(0)
        })

        it('runs fix mode inside the sandbox when the egress policy is in place', async () => {
            const adapter = new SimulatedSandboxAdapter({ available: true })
            const executor = new SandboxExecutor({ runtimeAdapter: adapter })
            const result = await executor.execute(makeCtx({
                config: { ...defaultRuntimeConfig, mode: 'fix' },
            }))
            // 适配器返回空 stdout：结果缺失按 execution_failed 归类（关键断言是「已调用适配器」）
            expect(adapter.calls).toHaveLength(1)
            expect(result.error?.code).toBe('execution_failed')
        })

        it('returns sandbox_alert_source_unsupported for pnpm-audit (would execute repo code)', async () => {
            const adapter = new SimulatedSandboxAdapter()
            const executor = new SandboxExecutor({ runtimeAdapter: adapter })
            const result = await executor.execute(makeCtx({
                config: { ...defaultRuntimeConfig, alertSource: 'pnpm-audit' },
            }))
            expect(result.exitCode).toBe(2)
            expect(result.error?.code).toBe('sandbox_alert_source_unsupported')
            expect(adapter.calls).toHaveLength(0)
        })

        it('returns sandbox_image_unavailable when docker cannot find the image (exit 125)', async () => {
            const adapter = new SimulatedSandboxAdapter({
                transportExitCode: 125,
                stderr: 'docker: Error response from daemon: manifest unknown',
            })
            const executor = new SandboxExecutor({ runtimeAdapter: adapter })
            const result = await executor.execute(makeCtx())
            expect(result.exitCode).toBe(2)
            expect(result.error?.code).toBe('sandbox_image_unavailable')
        })

        it('returns execution_failed when result sentinel is missing', async () => {
            const adapter = new SimulatedSandboxAdapter({ stdout: 'plain logs only', stderr: 'boom' })
            const executor = new SandboxExecutor({ runtimeAdapter: adapter })
            const result = await executor.execute(makeCtx())
            expect(result.exitCode).toBe(2)
            expect(result.error?.code).toBe('execution_failed')
            expect(result.error?.message).toContain('未回传显式结果')
        })

        it('sanitizes credentials in stdout/stderr when result is missing', async () => {
            const malicious = 'fatal: cannot access https://x-access-token:SECRET@github.com/o/r.git'
            const adapter = new SimulatedSandboxAdapter({ stdout: malicious, stderr: malicious })
            const executor = new SandboxExecutor({ runtimeAdapter: adapter })
            const result = await executor.execute(makeCtx())
            expect(result.error?.code).toBe('execution_failed')
            expect(result.error?.message).not.toContain('SECRET')
            expect(result.error?.message).toContain('https://***@')
        })

        it('returns execution_failed when sentinel payload is not valid JSON', async () => {
            const adapter = new SimulatedSandboxAdapter({ stdout: wrapWithSentinel('this is not JSON') })
            const executor = new SandboxExecutor({ runtimeAdapter: adapter })
            const result = await executor.execute(makeCtx())
            expect(result.exitCode).toBe(2)
            expect(result.error?.code).toBe('execution_failed')
            expect(result.error?.message).toContain('非 JSON')
        })

        it('returns execution_failed when payload result is malformed (missing required fields)', async () => {
            const adapter = new SimulatedSandboxAdapter({
                stdout: wrapWithSentinel(JSON.stringify({ exitCode: 0, result: { repositories: [] } })),
            })
            const executor = new SandboxExecutor({ runtimeAdapter: adapter })
            const result = await executor.execute(makeCtx())
            expect(result.exitCode).toBe(2)
            expect(result.error?.code).toBe('execution_failed')
            expect(result.error?.message).toContain('校验失败')
        })

        it('returns execution_failed when transport exitCode != 0 but payload exitCode === 0 (forgery detection)', async () => {
            const ctx = makeCtx()
            const adapter = new SimulatedSandboxAdapter({
                stdout: wrapWithSentinel(legalPayload(ctx, 0)),
                transportExitCode: 1,
            })
            const executor = new SandboxExecutor({ runtimeAdapter: adapter })
            const result = await executor.execute(ctx)
            expect(result.exitCode).toBe(2)
            expect(result.error?.code).toBe('execution_failed')
            expect(result.error?.message).toContain('矛盾')
        })

        it('returns execution_timeout when adapter returns exitCode 124', async () => {
            const adapter = new SimulatedSandboxAdapter({ transportExitCode: 124, stderr: '[docker] execution timeout' })
            const executor = new SandboxExecutor({ runtimeAdapter: adapter, timeoutMs: 5_000 })
            const result = await executor.execute(makeCtx())
            expect(result.exitCode).toBe(2)
            expect(result.error?.code).toBe('execution_timeout')
            expect(result.error?.message).toContain('5000ms')
        })

        it('returns execution_timeout when outer withTimeout triggers (adapter never resolves)', async () => {
            class NeverResolveAdapter implements RuntimeAdapter {
                readonly name = 'never-resolve'
                async isAvailable() { return true }
                async run(): Promise<ContainerRunResult> {
                    return new Promise(() => { /* never resolve */ })
                }
            }
            const executor = new SandboxExecutor({
                runtimeAdapter: new NeverResolveAdapter(),
                timeoutMs: 50,
                timeoutGraceMs: 10,
            })
            const result = await executor.execute(makeCtx())
            expect(result.exitCode).toBe(2)
            expect(result.error?.code).toBe('execution_timeout')
            expect(result.error?.message).toContain('50ms')
        })

        it('returns sandbox_unavailable for ENOENT/ENOTCONN/EACCES/ECONNREFUSED errno', async () => {
            for (const errno of ['ENOENT', 'ENOTCONN', 'EACCES', 'ECONNREFUSED']) {
                const adapter = new SimulatedSandboxAdapter({
                    throwError: Object.assign(new Error(`docker daemon ${errno}`), { code: errno }),
                })
                const executor = new SandboxExecutor({ runtimeAdapter: adapter })
                const result = await executor.execute(makeCtx())
                expect(result.exitCode).toBe(2)
                expect(result.error?.code).toBe('sandbox_unavailable')
            }
        })

        it('returns execution_failed (not sandbox_unavailable) for other adapter errors', async () => {
            const adapter = new SimulatedSandboxAdapter({
                throwError: Object.assign(new Error('manifest unknown'), { code: 'EBADRPC' }),
            })
            const executor = new SandboxExecutor({ runtimeAdapter: adapter })
            const result = await executor.execute(makeCtx())
            expect(result.exitCode).toBe(2)
            expect(result.error?.code).toBe('execution_failed')
        })

        it('returns execution_failed when runId contains path traversal characters', async () => {
            const adapter = new SpyRuntimeAdapter()
            const executor = new SandboxExecutor({ runtimeAdapter: adapter })
            const result = await executor.execute(makeCtx({ runId: '../etc/passwd' }))
            expect(result.exitCode).toBe(2)
            expect(result.error?.code).toBe('execution_failed')
            expect(adapter.calls).toHaveLength(0)
        })
    })
})

describe('resolveSandboxImageCandidates', () => {
    it('follows the platform image registry first, then publishes fallbacks', () => {
        const candidates = resolveSandboxImageCandidates({
            DEPENDFIX_IMAGE: 'registry.cn-hangzhou.aliyuncs.com/caomeiyouren/dependfix:platform-2.0.0',
        } as NodeJS.ProcessEnv)
        // 平台走 ACR → 沙箱先走 ACR；回退依次 Docker Hub、ghcr（ACR 置末且与首项去重）
        expect(candidates).toEqual([
            'registry.cn-hangzhou.aliyuncs.com/caomeiyouren/dependfix-sandbox:2.0.0',
            'caomeiyouren/dependfix-sandbox:2.0.0',
            'ghcr.io/dependfix/dependfix-sandbox:2.0.0',
        ])
    })

    it('follows a ghcr platform and keeps ACR as the last fallback', () => {
        const candidates = resolveSandboxImageCandidates({
            DEPENDFIX_IMAGE: 'ghcr.io/dependfix/dependfix:platform-2.0.0',
        } as NodeJS.ProcessEnv)
        expect(candidates).toEqual([
            'ghcr.io/dependfix/dependfix-sandbox:2.0.0',
            'caomeiyouren/dependfix-sandbox:2.0.0',
            'registry.cn-hangzhou.aliyuncs.com/caomeiyouren/dependfix-sandbox:2.0.0',
        ])
    })

    it('uses a single explicit image when SANDBOX_IMAGE is set', () => {
        expect(resolveSandboxImageCandidates({
            SANDBOX_IMAGE: 'local/sandbox:1',
            DEPENDFIX_IMAGE: 'ghcr.io/dependfix/dependfix:latest',
        } as NodeJS.ProcessEnv)).toEqual(['local/sandbox:1'])
    })

    it('does not derive from a local platform image name', () => {
        const candidates = resolveSandboxImageCandidates({
            DEPENDFIX_IMAGE: 'dependfix-platform:local',
            SANDBOX_IMAGE_TAG: 'edge',
        } as NodeJS.ProcessEnv)
        expect(candidates).toEqual([
            'caomeiyouren/dependfix-sandbox:edge',
            'ghcr.io/dependfix/dependfix-sandbox:edge',
            'registry.cn-hangzhou.aliyuncs.com/caomeiyouren/dependfix-sandbox:edge',
        ])
    })

    it('resolves the pull timeout from env with a safe fallback', async () => {
        const { resolveImagePullTimeoutMs } = await import('./sandbox-image')
        expect(resolveImagePullTimeoutMs({ SANDBOX_IMAGE_PULL_TIMEOUT_MS: '45000' } as NodeJS.ProcessEnv)).toBe(45_000)
        expect(resolveImagePullTimeoutMs({ SANDBOX_IMAGE_PULL_TIMEOUT_MS: 'nope' } as NodeJS.ProcessEnv)).toBe(300_000)
        expect(resolveImagePullTimeoutMs({} as NodeJS.ProcessEnv)).toBe(300_000)
    })

    it('ignores non-published platform tags (local / dev) and falls back to latest', () => {
        const candidates = resolveSandboxImageCandidates({
            DEPENDFIX_IMAGE: 'ghcr.io/team/dependfix:local',
        } as NodeJS.ProcessEnv)
        expect(candidates[0]).toBe('ghcr.io/team/dependfix-sandbox:latest')
    })
})

describe('deriveSandboxRepoFromPlatformImage', () => {
    it('maps published platform images in any registry', async () => {
        const { deriveSandboxRepoFromPlatformImage } = await import('./sandbox-image')
        expect(deriveSandboxRepoFromPlatformImage('ghcr.io/dependfix/dependfix:latest'))
            .toBe('ghcr.io/dependfix/dependfix-sandbox')
        expect(deriveSandboxRepoFromPlatformImage('registry.example.com:5000/team/dependfix-platform:platform-1.0.0'))
            .toBe('registry.example.com:5000/team/dependfix-sandbox')
        expect(deriveSandboxRepoFromPlatformImage(`dependfix/dependfix@sha256:${'a'.repeat(64)}`))
            .toBe('dependfix/dependfix-sandbox')
    })

    it('ignores local names and unrelated repositories', async () => {
        const { deriveSandboxRepoFromPlatformImage } = await import('./sandbox-image')
        expect(deriveSandboxRepoFromPlatformImage('dependfix-platform:local')).toBeNull()
        expect(deriveSandboxRepoFromPlatformImage('ghcr.io/team/my-app:1')).toBeNull()
        expect(deriveSandboxRepoFromPlatformImage(undefined)).toBeNull()
    })
})

describe('resolveDefaultSandboxImage', () => {
    it('prefers an explicit SANDBOX_IMAGE', () => {
        expect(resolveDefaultSandboxImage({ SANDBOX_IMAGE: ' local/sandbox:1 ' } as NodeJS.ProcessEnv))
            .toBe('local/sandbox:1')
    })

    it('builds the published sandbox image from repo + platform version', () => {
        expect(resolveDefaultSandboxImage({
            SANDBOX_IMAGE_REPO: 'registry.example.com/team/dependfix-sandbox',
            NUXT_BUILD_VERSION: '2.3.4',
        } as NodeJS.ProcessEnv)).toBe('registry.example.com/team/dependfix-sandbox:2.3.4')
        expect(resolveDefaultSandboxImage({ NUXT_BUILD_VERSION: '2.3.4' } as NodeJS.ProcessEnv))
            .toBe('caomeiyouren/dependfix-sandbox:2.3.4')
    })

    it('treats blank values as unset and tolerates a trailing slash on the repo', () => {
        expect(resolveDefaultSandboxImage({
            SANDBOX_IMAGE: '',
            SANDBOX_IMAGE_REPO: 'registry.example.com/team/dependfix-sandbox/',
            NUXT_BUILD_VERSION: '2.3.4',
        } as NodeJS.ProcessEnv)).toBe('registry.example.com/team/dependfix-sandbox:2.3.4')
        expect(resolveDefaultSandboxImage({
            SANDBOX_IMAGE: '   ',
            NUXT_BUILD_VERSION: '',
        } as NodeJS.ProcessEnv)).toBe('caomeiyouren/dependfix-sandbox:latest')
    })

    it('falls back to latest when the build version is unknown, and honors an explicit tag', () => {
        expect(resolveDefaultSandboxImage({ NUXT_BUILD_VERSION: 'unknown' } as NodeJS.ProcessEnv))
            .toBe('caomeiyouren/dependfix-sandbox:latest')
        expect(resolveDefaultSandboxImage({ NUXT_BUILD_VERSION: '2.3.4', SANDBOX_IMAGE_TAG: 'edge' } as NodeJS.ProcessEnv))
            .toBe('caomeiyouren/dependfix-sandbox:edge')
    })
})
