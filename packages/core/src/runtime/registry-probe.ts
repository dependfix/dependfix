// registry-probe.ts — 安装源连通性预检的共享契约（CLI 执行 + 平台解析）。
//
// 背景：registry 被阻断时 `pnpm install` 会停在 TCP 连接阶段（ETIMEDOUT），逐条命令各吃满
// 超时，最终整仓 `execution_timeout` 且结果缺失。沙箱 fix 路径在 clone / 安装前做一次短超时
// TCP 预检，不可达即快速失败并给出可读原因。
//
// 哨兵放在 stdout（容器日志同流）：平台按「预检退出码 3 + 哨兵」双条件识别失败原因——
// 目标仓库日志可能原样打印哨兵文本，单看哨兵会抢占其它失败分类。

/** 预检成功哨兵。 */
export const REGISTRY_PROBE_OK_SENTINEL = '__DEPENDFIX_REGISTRY_PROBE_OK__'

/** 预检失败哨兵（其后跟 host:port code durationMs）。 */
export const REGISTRY_PROBE_FAILED_SENTINEL = '__DEPENDFIX_REGISTRY_PROBE_FAILED__'

/** 预检命令不可用哨兵（旧版沙箱镜像不认识 `--probe-registry` 时输出）。 */
export const REGISTRY_PROBE_UNAVAILABLE_SENTINEL = '__DEPENDFIX_REGISTRY_PROBE_UNAVAILABLE__'

/** 默认预检超时（毫秒）。 */
export const REGISTRY_PROBE_DEFAULT_TIMEOUT_MS = 5_000

/** 预检超时上下限（与平台 env 解析同源）。 */
export const REGISTRY_PROBE_MIN_TIMEOUT_MS = 1_000
export const REGISTRY_PROBE_MAX_TIMEOUT_MS = 30_000

/** 解析后的预检失败信息。 */
export interface RegistryProbeFailure {
    host: string
    port: number
    /** errno（如 ETIMEDOUT / ENOTFOUND）或 `timeout` */
    code: string
    durationMs: number
}

/** 把失败信息编码成一行哨兵（CLI 侧输出）。 */
export function formatRegistryProbeFailure(failure: RegistryProbeFailure): string {
    return `${REGISTRY_PROBE_FAILED_SENTINEL} ${failure.host}:${failure.port} ${failure.code} ${failure.durationMs}ms`
}

/** 从输出（stdout + stderr）解析预检失败；未命中返回 undefined。 */
export function parseRegistryProbeFailure(output: string): RegistryProbeFailure | undefined {
    const index = output.lastIndexOf(REGISTRY_PROBE_FAILED_SENTINEL)
    if (index < 0) {
        return undefined
    }
    const rest = output.slice(index + REGISTRY_PROBE_FAILED_SENTINEL.length).trim()
    const match = /^(\S+?):(\d+)\s+(\S+)\s+(\d+)ms\b/.exec(rest)
    if (!match) {
        return undefined
    }
    return {
        host: match[1]!,
        port: Number.parseInt(match[2]!, 10),
        code: match[3]!,
        durationMs: Number.parseInt(match[4]!, 10),
    }
}

/** 解析可配置预检超时（非法 / 越界回退默认；只认正整数毫秒）。 */
export function resolveRegistryProbeTimeoutMs(raw: string | undefined): number {
    if (!raw) {
        return REGISTRY_PROBE_DEFAULT_TIMEOUT_MS
    }
    const value = Number.parseInt(raw, 10)
    if (!Number.isFinite(value) || value < REGISTRY_PROBE_MIN_TIMEOUT_MS || value > REGISTRY_PROBE_MAX_TIMEOUT_MS) {
        return REGISTRY_PROBE_DEFAULT_TIMEOUT_MS
    }
    return value
}
