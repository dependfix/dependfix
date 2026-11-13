// sandbox-fix-real.test.ts — 沙箱 fix 的**真实容器**冒烟（gated）。
//
// 启用：`SANDBOX_FIX_E2E=true`，且本机 Docker daemon 可用、镜像内含自包含入口
// （默认 `dependfix-sandbox:m59`；构建方式：`pnpm --filter dependfix build:sandbox` 后由
//  `FROM dependfix-platform:e2e` + `COPY packages/cli/sandbox /app/sandbox` 生成）。
//
// 本用例不依赖 GitHub token：对公开仓库做匿名 clone（GitLab 夹具，github.com 在本环境被阻断），证明
//   ① 出站策略就位（未被第二道闸拒绝）→ ② 容器内 clone 成功 → ③ 自包含 CLI 启动并经哨兵回传结构化结果
// 完整「clone → 安装 → 修复 → 验证」需可用 token（Dependabot API），由 `SANDBOX_E2E_TOKEN` 的
// Playwright gated e2e 覆盖（sandbox-report.e2e.test.ts 扩展）。
import { describe, expect, it } from 'vitest'
import type { ScanExecutorContext } from './types'
import { SandboxExecutor, resolveEgressPolicy } from './sandbox-executor'

const enabled = process.env.SANDBOX_FIX_E2E === 'true'
const image = process.env.SANDBOX_FIX_E2E_IMAGE ?? 'dependfix-sandbox:m59'
const repo = process.env.SANDBOX_FIX_E2E_REPO ?? 'gitlab-org/gitlab-test'
// 本环境 github.com 被网络策略阻断（api / codeload 可达），用 GitLab 公开夹具验证容器内 clone
const cloneBaseUrl = process.env.SANDBOX_FIX_E2E_CLONE_BASE ?? 'https://gitlab.com'

const makeCtx = (): ScanExecutorContext => {
    const [owner = '', name = ''] = repo.split('/')
    return {
        runId: 'run-sandbox-fix-real',
        repository: { owner, name, defaultBranch: 'main' },
        config: {
            mode: 'fix',
            severityThreshold: 'high',
            repositories: [repo],
            dryRun: false,
            createPullRequest: false,
            commit: false,
            cleanupBranches: false,
            cleanupBranchesAuto: false,
            githubToken: '',
            alertSource: 'github-dependabot',
            codeScanningEnabled: false,
            codeQualityEnabled: false,
            allowMajorUpgrade: false,
            maxAlertsPerRepository: 20,
            maxConcurrency: 1,
            maxRetries: 3,
            maxBackoffMs: 30_000,
            maxRepos: 100,
        },
        // 无真实凭据：注入占位 token 让 CLI 完成参数校验并写出结果契约（API 调用会 401）
        credential: { token: 'ghp_e2e_dummy' },
        workDir: 'run-sandbox-fix-real',
    }
}

describe.runIf(enabled)('sandbox fix real bootstrap (gated)', () => {
    it('clones inside the container without host mounts and reaches the CLI', async () => {
        const executor = new SandboxExecutor({ image, entry: '/app/sandbox/bin.mjs', timeoutMs: 240_000, cloneBaseUrl })

        expect(await executor.isAvailable()).toBe(true)
        // 出站策略就位（默认启用 + 必需域）
        const policy = resolveEgressPolicy()
        expect(policy.enabled).toBe(true)
        expect(policy.allowlist.length).toBeGreaterThan(0)

        const ctx = makeCtx()
        // 审计面：不挂载宿主目录
        expect(executor.buildSpec(ctx).mounts).toBeUndefined()

        const result = await executor.execute(ctx)

        // 结构化结果经哨兵回传（transport 未失败）→ bootstrap 与入口都可用
        expect(result.error).toBeUndefined()
        // 占位 token：CLI 在 clone 之后启动，API 401 → 非零退出 + 结果契约完整（不是「结果缺失 / 沙箱不可用 / 策略拒绝」）
        expect(result.exitCode).toBeGreaterThan(0)
        expect(result.result?.errors?.length ?? 0).toBeGreaterThan(0)
        // clone 真的发生在容器内（日志含 /tmp/repo），且未发生宿主挂载
        expect(result.logsJson ?? '').toContain('/tmp/repo')
    }, 300_000)
})
