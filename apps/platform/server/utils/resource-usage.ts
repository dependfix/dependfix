import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ExecutorResourceUsage, ResourceSource } from '#server/services/executor/types'

/**
 * 执行期内存资源采集（cgroup v1 / v2）。
 *
 * 目的：让安装 / 验证进程被 `SIGKILL` 时，运行记录能区分「容器 OOM」与「执行超时 / 代码缺陷」。
 * - `memoryMaxBytes`：cgroup 内存上限；`max` / 超大哨兵值 → null（`limitReason='unlimited'`）。
 * - `peakRssBytes`：执行窗口内 `memory.current` 的采样峰值（cgroup working set，含页缓存）；
 *   不是单进程 RSS，不能与 `process.memoryUsage().rss` 直接比较。
 * - `oomKilled`：执行前后 `oom_kill` 计数是否增加；计数不可读 → null（不伪造 false）。
 * - 非 Linux / 无 cgroup 文件 → 全部指标 null + `degradedReason`，调用方落库为 NULL 并保留原因。
 *
 * 已知边界：宿主级 OOM（容器未设 memory limit）不一定会增加容器 cgroup 的 `oom_kill` 计数；
 * 此时 `oomKilled` 可能为 false / null，需结合引擎 `SIGKILL` 审计与宿主 `journalctl -k` 判断。
 */

export interface CgroupMemoryState {
    source: ResourceSource
    memoryMaxBytes: number | null
    currentBytes: number | null
    oomKillCount: number | null
    limitReason?: string
    degradedReason?: string
}

export interface ResourceMonitor {
    /** 停止采样并返回本次执行窗口的资源快照；可重复调用。 */
    stop: () => ExecutorResourceUsage
}

export interface ResourceMonitorOptions {
    /** 采样间隔（毫秒；0 = 不启动定时器，仅 start/stop 两次采样） */
    intervalMs?: number
    /** cgroup 根目录（默认 `/sys/fs/cgroup`；测试注入临时目录） */
    cgroupRoot?: string
    /** 平台（默认 `process.platform`；测试注入 `win32` 验证降级） */
    platform?: NodeJS.Platform
    /** 文件读取函数（默认 `readFileSync(..., 'utf8')`；测试注入内存映射） */
    readFile?: (path: string) => string
}

const DEFAULT_SAMPLE_INTERVAL_MS = 5_000

/** cgroup v1 的「无限制」哨兵值（PAGE_COUNTER_MAX 量级）；大于 2^60 一律视为无限制。 */
const UNLIMITED_SENTINEL = 2 ** 60

const parseCount = (raw: string, pattern: RegExp): number | null => {
    const match = pattern.exec(raw)
    if (!match) {
        return null
    }
    const value = Number(match[1])
    return Number.isFinite(value) && value >= 0 ? value : null
}

const parseMemoryBytes = (raw: string): { bytes: number | null, reason?: string } => {
    const value = raw.trim()
    if (!value) {
        return { bytes: null, reason: 'empty memory limit file' }
    }
    if (value === 'max') {
        return { bytes: null, reason: 'unlimited' }
    }
    const numeric = Number(value)
    if (!Number.isFinite(numeric) || numeric <= 0) {
        return { bytes: null, reason: `invalid memory limit: ${value}` }
    }
    if (numeric > UNLIMITED_SENTINEL) {
        return { bytes: null, reason: 'unlimited' }
    }
    return { bytes: numeric }
}

const readOptional = (readFile: (path: string) => string, path: string): string | null => {
    try {
        return readFile(path)
    } catch {
        return null
    }
}

/**
 * 读取当前进程所在 cgroup 的内存状态。优先 v2，再回退 v1。
 * 文件不存在 / 不可读时返回 `source='none'`，不抛错。
 */
export const readCgroupMemoryState = (
    cgroupRoot = '/sys/fs/cgroup',
    readFile: (path: string) => string = (path) => readFileSync(path, 'utf8'),
): CgroupMemoryState => {
    const v2Max = readOptional(readFile, join(cgroupRoot, 'memory.max'))
    if (v2Max !== null) {
        const limit = parseMemoryBytes(v2Max)
        const currentRaw = readOptional(readFile, join(cgroupRoot, 'memory.current'))
        const eventsRaw = readOptional(readFile, join(cgroupRoot, 'memory.events'))
        const currentBytes = currentRaw === null ? null : parseCount(currentRaw, /^\s*(\d+)\s*$/mu)
        const oomKillCount = eventsRaw === null ? null : parseCount(eventsRaw, /^\s*oom_kill\s+(\d+)\s*$/mu)
        return {
            source: 'cgroup-v2',
            memoryMaxBytes: limit.bytes,
            currentBytes,
            oomKillCount,
            ...(limit.reason ? { limitReason: limit.reason } : {}),
            ...(currentBytes === null || oomKillCount === null
                ? {
                    degradedReason: [
                        currentBytes === null ? 'memory.current unavailable' : null,
                        oomKillCount === null ? 'memory.events oom_kill unavailable' : null,
                    ].filter(Boolean).join('; '),
                }
                : {}),
        }
    }

    const v1LimitRaw = readOptional(readFile, join(cgroupRoot, 'memory', 'memory.limit_in_bytes'))
    if (v1LimitRaw !== null) {
        const limit = parseMemoryBytes(v1LimitRaw)
        const currentRaw = readOptional(readFile, join(cgroupRoot, 'memory', 'memory.usage_in_bytes'))
        const oomRaw = readOptional(readFile, join(cgroupRoot, 'memory', 'memory.oom_control'))
        const currentBytes = currentRaw === null ? null : parseCount(currentRaw, /^\s*(\d+)\s*$/mu)
        const oomKillCount = oomRaw === null ? null : parseCount(oomRaw, /^\s*oom_kill\s+(\d+)\s*$/mu)
        return {
            source: 'cgroup-v1',
            memoryMaxBytes: limit.bytes,
            currentBytes,
            oomKillCount,
            ...(limit.reason ? { limitReason: limit.reason } : {}),
            ...(currentBytes === null || oomKillCount === null
                ? {
                    degradedReason: [
                        currentBytes === null ? 'memory.usage_in_bytes unavailable' : null,
                        oomKillCount === null ? 'memory.oom_control oom_kill unavailable' : null,
                    ].filter(Boolean).join('; '),
                }
                : {}),
        }
    }

    return {
        source: 'none',
        memoryMaxBytes: null,
        currentBytes: null,
        oomKillCount: null,
        degradedReason: 'cgroup memory files not found',
    }
}

/**
 * 启动执行期内存监控。Linux + cgroup 可用时按间隔采样 `memory.current` 并跟踪峰值；
 * 其他平台立即返回降级快照，不启动定时器。
 */
export const startResourceMonitor = (options: ResourceMonitorOptions = {}): ResourceMonitor => {
    const readFile = options.readFile ?? ((path: string) => readFileSync(path, 'utf8'))
    const platform = options.platform ?? process.platform
    const cgroupRoot = options.cgroupRoot ?? '/sys/fs/cgroup'
    const intervalMs = options.intervalMs ?? DEFAULT_SAMPLE_INTERVAL_MS

    let result: ExecutorResourceUsage | undefined

    if (platform !== 'linux') {
        const degraded: ExecutorResourceUsage = {
            memoryMaxBytes: null,
            peakRssBytes: null,
            oomKilled: null,
            source: 'none',
            degradedReason: `unsupported platform: ${platform}`,
        }
        return {
            stop: () => {
                result ??= degraded
                return result
            },
        }
    }

    const initial = readCgroupMemoryState(cgroupRoot, readFile)
    if (initial.source === 'none') {
        const degraded: ExecutorResourceUsage = {
            memoryMaxBytes: null,
            peakRssBytes: null,
            oomKilled: null,
            source: 'none',
            degradedReason: initial.degradedReason ?? 'cgroup memory unavailable',
        }
        return {
            stop: () => {
                result ??= degraded
                return result
            },
        }
    }

    let peakRssBytes = initial.currentBytes
    let samples = initial.currentBytes === null ? 0 : 1

    const sample = (): void => {
        const state = readCgroupMemoryState(cgroupRoot, readFile)
        if (state.currentBytes !== null) {
            samples++
            peakRssBytes = peakRssBytes === null
                ? state.currentBytes
                : Math.max(peakRssBytes, state.currentBytes)
        }
    }

    const timer = intervalMs > 0
        ? setInterval(sample, intervalMs)
        : undefined
    timer?.unref?.()

    return {
        stop: () => {
            if (result) {
                return result
            }
            if (timer) {
                clearInterval(timer)
            }
            sample()
            const end = readCgroupMemoryState(cgroupRoot, readFile)
            const startOom = initial.oomKillCount
            const endOom = end.oomKillCount
            const oomKilled = startOom === null || endOom === null
                ? null
                : endOom > startOom
            const reasons = [
                end.degradedReason,
                peakRssBytes === null ? 'peak memory unavailable' : null,
                oomKilled === null ? 'oom_kill counter unavailable' : null,
            ].filter((item): item is string => Boolean(item))
            result = {
                memoryMaxBytes: end.memoryMaxBytes ?? initial.memoryMaxBytes,
                peakRssBytes,
                oomKilled,
                source: end.source,
                ...(end.limitReason ?? initial.limitReason
                    ? { limitReason: end.limitReason ?? initial.limitReason }
                    : {}),
                ...(reasons.length > 0 ? { degradedReason: reasons.join('; ') } : {}),
                samples,
            }
            return result
        },
    }
}

/** 从执行结果错误文本中识别 SIGKILL（辅助归因；不单独断言 OOM）。 */
export const detectSigkill = (messages: (string | undefined | null)[]): boolean =>
    messages.some((message) => typeof message === 'string' && /sigkill/i.test(message))

/** 沙箱内采样器回传的原始资源读数（cgroup v2 / v1；缺字段表示不可读）。 */
export interface SandboxResourceSample {
    memoryMaxBytes?: number | null
    peakRssBytes?: number | null
    oomKilled?: boolean | null
    samples?: number
    /** 运行时白名单校验后才采用（JSON 来自容器内，不信任任意字符串） */
    source?: ResourceSource
    limitReason?: string
}

/**
 * 沙箱资源快照：把容器内采样器的原始读数映射为统一口径。
 *
 * - 缺失 / 非法一律 null（不伪造 0）；`source: none` 或峰值缺失时带 `degradedReason`
 * - `memoryMaxBytes` 为 `unlimited` 时保留 `limitReason`（与 container 执行器同口径）
 * - `oomKilled` 允许中继 `null`（v1 `oom_control` / v2 `memory.events` 不可读）
 */
export function buildSandboxResourceUsage(raw: SandboxResourceSample | null): ExecutorResourceUsage {
    // 容器内 JSON 不信任：source 只接受白名单枚举，数值必须有限
    const source: ResourceSource = raw?.source === 'cgroup-v2' || raw?.source === 'cgroup-v1' ? raw.source : 'none'
    const memoryMaxBytes = Number.isFinite(raw?.memoryMaxBytes) ? raw!.memoryMaxBytes! : null
    const peakRssBytes = Number.isFinite(raw?.peakRssBytes) ? raw!.peakRssBytes! : null
    const oomKilled = typeof raw?.oomKilled === 'boolean' ? raw.oomKilled : null
    const samples = Number.isInteger(raw?.samples) && (raw!.samples as number) >= 0 ? raw!.samples! : 0
    const reasons: string[] = []
    if (source === 'none') {
        reasons.push('sandbox cgroup 不可读（容器内 /sys/fs/cgroup 未暴露内存控制器）')
    } else if (samples === 0 || peakRssBytes === null) {
        reasons.push('sandbox 资源采样无有效读数')
    }
    if (samples > 0 && source !== 'none' && oomKilled === null) {
        reasons.push('sandbox oom_kill counter unavailable')
    }
    return {
        memoryMaxBytes,
        peakRssBytes,
        oomKilled,
        source,
        samples,
        ...(raw?.limitReason ? { limitReason: raw.limitReason } : {}),
        ...(reasons.length > 0 ? { degradedReason: reasons.join('；') } : {}),
    }
}

/** 供调用方兜底的空快照（B 模式 / 执行器未接入采集时）。 */
export const unavailableResourceUsage = (reason: string): ExecutorResourceUsage => ({
    memoryMaxBytes: null,
    peakRssBytes: null,
    oomKilled: null,
    source: 'none',
    degradedReason: reason,
})
