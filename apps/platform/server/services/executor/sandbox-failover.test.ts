import { describe, expect, it } from 'vitest'
import { SandboxExecutor, resolveSandboxImageCandidates } from './sandbox-executor'
import type { ScanExecutorContext } from './types'
import type { ContainerRunResult, ContainerSpec, RuntimeAdapter } from './runtime-adapter'

/** 与主测试文件同形的运行时配置（failover 用例只需 report-only 守卫通过 / 154 元数据齐全） */
const defaultRuntimeConfig = {
    mode: 'fix' as const,
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
    repository: { owner: 'owner-a', name: 'repo-b', defaultBranch: 'main' },
    config: defaultRuntimeConfig,
    credential: { token: 'ghp_test' },
    workDir: '/tmp/runs/run-sandbox-1',
    ...overrides,
})

/** 只回固定结果的 adapter（transport 超时 / 输出回传用例） */
class StubAdapter implements RuntimeAdapter {
    readonly name = 'stub'
    constructor(private readonly result: ContainerRunResult) {}

    async isAvailable(): Promise<boolean> {
        return true
    }

    async run(): Promise<ContainerRunResult> {
        return this.result
    }
}

describe('sandbox image failover', () => {
    class ImageAwareAdapter implements RuntimeAdapter {
        readonly name = 'image-aware'
        readonly attempts: string[] = []
        private readonly availability: boolean[]

        constructor(availability: boolean[]) {
            this.availability = [...availability]
        }

        async isAvailable(): Promise<boolean> {
            return true
        }

        async ensureImage(image: string): Promise<boolean> {
            this.attempts.push(image)
            return this.availability.shift() ?? false
        }

        async run(spec: ContainerSpec): Promise<ContainerRunResult> {
            this.attempts.push(`run:${spec.image}`)
            return { stdout: '', stderr: '', exitCode: 0 }
        }
    }

    it('falls back to the next registry when a candidate cannot be pulled', async () => {
        const candidates = resolveSandboxImageCandidates()
        const adapter = new ImageAwareAdapter([false, true])
        const executor = new SandboxExecutor({
            runtimeAdapter: adapter,
            egress: { allowlist: ['github.com'] },
            cloneBaseUrl: 'https://github.com',
        })
        await executor.execute(makeCtx())
        // 逐源预检：首个失败 → 第二个成功 → 用第二个镜像启动容器
        expect(adapter.attempts[0]).toBe(candidates[0])
        expect(adapter.attempts[1]).toBe(candidates[1])
        expect(adapter.attempts[2]).toBe(`run:${candidates[1]}`)
    })

    it('reports sandbox_image_unavailable when every candidate fails', async () => {
        const adapter = new ImageAwareAdapter([false, false, false, false])
        const executor = new SandboxExecutor({ runtimeAdapter: adapter })
        const result = await executor.execute(makeCtx())
        expect(result.error?.code).toBe('sandbox_image_unavailable')
        expect(result.error?.message).toContain('已尝试')
        expect(adapter.attempts.some((item) => item.startsWith('run:'))).toBe(false)
    })
})

describe('sandbox execution timeout diagnostics', () => {
    it('returns the captured container output tail when the transport times out', async () => {
        const adapter = new StubAdapter({
            exitCode: 124,
            stdout: '[baseline] Sampling pre-fix verification baseline\n[install] pnpm install --frozen-lockfile\n',
            stderr: 'ERR_PNPM_FETCH_ECONNRESET registry.npmjs.org',
        })
        const executor = new SandboxExecutor({ runtimeAdapter: adapter, image: 'alpine:3', npmRegistry: '' })
        const result = await executor.execute(makeCtx({ config: { ...defaultRuntimeConfig, mode: 'fix' } }))

        expect(result.error?.code).toBe('execution_timeout')
        expect(result.error?.message).toContain('容器输出')
        expect(result.error?.message).toContain('stderr 末尾')
        expect(result.error?.message).toContain('ERR_PNPM_FETCH_ECONNRESET')
        expect(result.logsJson).toContain('pnpm install')
        // 超时且无采样哨兵：读数显式 unavailable，不得伪造 0
        expect(result.resource?.source).toBe('none')
        expect(result.resource?.degradedReason).toBeTruthy()
    })
})
