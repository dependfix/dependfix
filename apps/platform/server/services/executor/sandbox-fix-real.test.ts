// sandbox-fix-real.test.ts — 沙箱 fix 的**真实容器**冒烟（gated）。
//
// 启用：`SANDBOX_FIX_E2E=true`（未启用时整组 skip，报告可见），且本机 Docker daemon 可用、镜像内含自包含入口
// （默认 `dependfix-sandbox:local`；构建方式：`pnpm --filter dependfix build:sandbox` 后由
//  `FROM dependfix-platform:e2e` + `COPY packages/cli/sandbox /app/sandbox` 生成）。
//
// 本用例不依赖 GitHub token：对公开仓库做匿名 clone（GitLab 夹具，github.com 在本环境被阻断），证明
//   ① 出站策略就位（未被第二道闸拒绝）→ ② 容器内 clone 成功 → ③ 自包含 CLI 启动并经哨兵回传结构化结果
// 完整「clone → 安装 → 修复 → 验证」需可用 token（Dependabot API），由 `SANDBOX_E2E_TOKEN` 的
// Playwright gated e2e 覆盖（sandbox-report.e2e.test.ts 扩展）。
//
// 夹具 host 不在平台默认白名单内：用例把 clone host 并入 allowlist（生产等价做法是把该域加入
// `DEPENDFIX_ALLOWED_DOMAINS`，否则执行器以 `sandbox_clone_host_not_allowed` 拒绝）。
import { describe, expect, it } from 'vitest'
import type { ScanExecutorContext } from './types'
import { SandboxExecutor, resolveEgressPolicy } from './sandbox-executor'

const enabled = process.env.SANDBOX_FIX_E2E === 'true'
const image = process.env.SANDBOX_FIX_E2E_IMAGE ?? 'dependfix-sandbox:local'
const repo = process.env.SANDBOX_FIX_E2E_REPO ?? 'gitlab-org/gitlab-test'
// 本环境 github.com 被网络策略阻断（api / codeload 可达），用 GitLab 公开夹具验证容器内 clone
const cloneBaseUrl = process.env.SANDBOX_FIX_E2E_CLONE_BASE ?? 'https://gitlab.com'
/** 夹具地址必须是合法 URL（缺 scheme 时给出可读错误，而不是模块加载期抛 TypeError） */
const cloneHostname = (() => {
    try {
        return new URL(cloneBaseUrl).hostname
    } catch {
        throw new Error(`SANDBOX_FIX_E2E_CLONE_BASE 必须是合法 URL（含 scheme）：${cloneBaseUrl}`)
    }
})()

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

describe.skipIf(!enabled)('sandbox fix real bootstrap (gated)', () => {
    it('clones inside the container without host mounts and reaches the CLI', async () => {
        // 出站策略就位（默认启用 + 必需域），再并入夹具 clone host（生产等价：DEPENDFIX_ALLOWED_DOMAINS）
        const policy = resolveEgressPolicy()
        expect(policy.enabled).toBe(true)
        expect(policy.allowlist.length).toBeGreaterThan(0)
        // 默认白名单不含夹具 host（记录这次显式偏离），并入后再交给执行器
        expect(policy.allowlist).not.toContain(cloneHostname)
        const allowlist = [...new Set([...policy.allowlist, cloneHostname])]

        const executor = new SandboxExecutor({
            image,
            entry: '/app/sandbox/bin.mjs',
            timeoutMs: 240_000,
            cloneBaseUrl,
            egress: { allowlist },
        })

        expect(await executor.isAvailable()).toBe(true)

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
        // 资源读数：容器内 cgroup 采样必须给出真实读数（不可读时 source=none + 原因）。
        // 这是人工门控证据（SANDBOX_FIX_E2E），不进门禁；上界断言用于捕获「读到父 cgroup」的放大
        expect(result.resource?.source, result.resource?.degradedReason).not.toBe('none')
        expect(result.resource?.samples ?? 0).toBeGreaterThan(0)
        expect(result.resource?.peakRssBytes ?? 0).toBeGreaterThan(0)
        if (result.resource?.memoryMaxBytes !== null && result.resource?.memoryMaxBytes !== undefined) {
            expect(result.resource.peakRssBytes ?? 0).toBeLessThanOrEqual(result.resource.memoryMaxBytes)
        }
    }, 300_000)
})
