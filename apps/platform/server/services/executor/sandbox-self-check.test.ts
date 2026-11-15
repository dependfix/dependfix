import { describe, expect, it } from 'vitest'
import { SandboxExecutor } from './sandbox-executor'
import { SpyRuntimeAdapter, type RuntimeAdapter, type RuntimeProbe } from './runtime-adapter'

/**
 * 沙箱自检报告单测：daemon 原因、镜像候选 / 本地存在性、出站白名单概览。
 *
 * 约束：只读（不拉取镜像）、不返回 token / 凭据；adapter 未实现 probe / imagePresent 时回退。
 */

const setup = (options: {
    available?: boolean
    adapter?: RuntimeAdapter
    egress?: { enabled?: boolean, allowlist?: string[] }
} = {}) => {
    const adapter = options.adapter ?? new SpyRuntimeAdapter({ available: options.available ?? true })
    const executor = new SandboxExecutor({
        runtimeAdapter: adapter,
        image: 'dependfix-sandbox:test',
        egress: options.egress ?? { enabled: true, allowlist: ['github.com', 'registry.npmjs.org'] },
    })
    return { executor, adapter }
}

describe('SandboxExecutor.getSelfCheck', () => {
    it('可用时返回镜像候选 / 本地存在性 / 出站主机概览', async () => {
        const { executor } = setup()

        const report = await executor.getSelfCheck()

        expect(report.available).toBe(true)
        expect(report.reason).toBeUndefined()
        expect(report.serverVersion).toBe('spy')
        expect(report.runtimeName).toBe('spy')
        expect(report.imageCandidates).toEqual(['dependfix-sandbox:test'])
        expect(report.imagePresence).toEqual([{ image: 'dependfix-sandbox:test', present: true }])
        expect(report.egress).toEqual({
            enabled: true,
            allowlist: ['github.com', 'registry.npmjs.org'],
            fixRequiresEgress: true,
        })
        // 只暴露镜像名 / 主机名，不含凭据字段
        expect(JSON.stringify(report)).not.toMatch(/token|password|secret/i)
    })

    it('不可用时带结构化 reason / detail（供降级提示引用）', async () => {
        const { executor } = setup({ available: false })

        const report = await executor.getSelfCheck()

        expect(report.available).toBe(false)
        expect(report.reason).toBe('daemon_unreachable')
        expect(report.detail).toContain('spy')
    })

    it('adapter 未实现 probe / imagePresent 时回退（原因缺省、存在性 null）', async () => {
        const minimal: RuntimeAdapter = {
            name: 'minimal',
            isAvailable: async () => false,
            run: async () => ({ stdout: '', stderr: '', exitCode: 0 }),
        }
        const { executor } = setup({ adapter: minimal })

        const report = await executor.getSelfCheck()

        expect(report.available).toBe(false)
        expect(report.reason).toBeUndefined()
        expect(report.imagePresence).toEqual([{ image: 'dependfix-sandbox:test', present: null }])
    })

    it('出站策略关闭时 fixRequiresEgress=false（fix 会被第二道闸拒绝）', async () => {
        const { executor } = setup({ egress: { enabled: false, allowlist: ['github.com'] } })

        const report = await executor.getSelfCheck()

        expect(report.egress.enabled).toBe(false)
        expect(report.egress.fixRequiresEgress).toBe(false)
    })

    it('probeAvailability 只探测 daemon，不触碰镜像', async () => {
        let imageChecks = 0
        const adapter: RuntimeAdapter = {
            name: 'counting',
            isAvailable: async () => true,
            probe: async (): Promise<RuntimeProbe> => ({ available: true, serverVersion: '1.0' }),
            imagePresent: async () => {
                imageChecks += 1
                return true
            },
            run: async () => ({ stdout: '', stderr: '', exitCode: 0 }),
        }
        const { executor } = setup({ adapter })

        const probe = await executor.probeAvailability()

        expect(probe).toEqual({ available: true, serverVersion: '1.0' })
        expect(imageChecks).toBe(0)
    })
})

describe('sandboxUnavailableReasonLabel', () => {
    it('五类原因各给出可操作说明，未知原因回退通用文案', async () => {
        const { sandboxUnavailableReasonLabel } = await import('./sandbox-self-check')
        expect(sandboxUnavailableReasonLabel('docker_cli_missing')).toContain('WITH_DOCKER_CLI')
        expect(sandboxUnavailableReasonLabel('daemon_unreachable')).toContain('无法连接')
        expect(sandboxUnavailableReasonLabel('socket_permission_denied')).toContain('权限不足')
        expect(sandboxUnavailableReasonLabel('daemon_timeout')).toContain('超时')
        expect(sandboxUnavailableReasonLabel('runtime_error')).toContain('探测失败')
        expect(sandboxUnavailableReasonLabel(undefined)).toContain('不可用')
    })
})
