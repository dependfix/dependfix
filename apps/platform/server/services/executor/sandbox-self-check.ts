import { sanitizeString } from '../../utils/sanitize'
import type { RuntimeAdapter, RuntimeProbe } from './runtime-adapter'

/**
 * 沙箱自检报告（只读；不返回 token / 凭据，仅域名与镜像名）。
 *
 * 从 `sandbox-executor` 抽出以控制单文件行数，并让自检可独立单测。
 */
export interface SandboxSelfCheck {
    available: boolean
    reason?: RuntimeProbe['reason']
    detail?: string
    serverVersion?: string
    runtimeName: string
    modes: string[]
    imageCandidates: string[]
    /** 本地镜像存在性（true/false；null = adapter 不支持只读探测） */
    imagePresence: { image: string, present: boolean | null }[]
    egress: {
        enabled: boolean
        /** 只展示主机名（不含凭据 / 完整 URL） */
        allowlist: string[]
        fixRequiresEgress: boolean
    }
}

/** 探测 daemon；adapter 抛错时收敛为 runtime_error（不得打穿编排层）。 */
export async function probeRuntime(adapter: RuntimeAdapter): Promise<RuntimeProbe> {
    try {
        return adapter.probe
            ? await adapter.probe()
            : { available: await adapter.isAvailable() }
    } catch (error) {
        return {
            available: false,
            reason: 'runtime_error',
            detail: sanitizeString(error instanceof Error ? error.message : String(error)).slice(0, 200),
        }
    }
}

/** 组装只读自检报告；镜像只做本地 inspect（不拉取）。 */
export async function buildSandboxSelfCheck(input: {
    adapter: RuntimeAdapter
    imageCandidates: string[]
    egress: { enabled: boolean, allowlist: string[] }
    modes: string[]
}): Promise<SandboxSelfCheck> {
    const probe = await probeRuntime(input.adapter)
    const imagePresence = await Promise.all(input.imageCandidates.map(async (image) => ({
        image,
        present: input.adapter.imagePresent ? await input.adapter.imagePresent(image) : null,
    })))
    return {
        available: probe.available,
        ...(probe.reason ? { reason: probe.reason } : {}),
        ...(probe.detail ? { detail: probe.detail } : {}),
        ...(probe.serverVersion ? { serverVersion: probe.serverVersion } : {}),
        runtimeName: input.adapter.name,
        modes: [...input.modes],
        imageCandidates: [...input.imageCandidates],
        imagePresence,
        egress: {
            enabled: input.egress.enabled,
            allowlist: [...input.egress.allowlist],
            fixRequiresEgress: input.egress.enabled && input.egress.allowlist.length > 0,
        },
    }
}

/** 降级原因 → 可操作中文说明（自检端点与运行详情共用同一口径）。 */
export function sandboxUnavailableReasonLabel(reason?: RuntimeProbe['reason']): string {
    switch (reason) {
        case 'docker_cli_missing':
            return '未找到 docker CLI（容器镜像需以 WITH_DOCKER_CLI=true 构建）'
        case 'daemon_unreachable':
            return '无法连接 docker daemon'
        case 'socket_permission_denied':
            return 'docker socket 权限不足'
        case 'daemon_timeout':
            return 'docker daemon 响应超时'
        case 'runtime_error':
            return 'docker 探测失败'
        default:
            return 'docker daemon 不可用'
    }
}
