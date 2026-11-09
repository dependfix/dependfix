import { parseDurationMs } from '@dependfix/core'

// execution-limits.ts — 仓库级执行预算与超时的解析（单一事实源）。
//
// 口径见 [repo-execution-limits.md](../../../../docs/design/governance/repo-execution-limits.md) §5：
// 优先级 = 仓库值（非 null）> env > 内置默认；执行上限另有平台封顶（默认 60 分钟，可经
// `DEPENDFIX_MAX_EXECUTION_TIMEOUT_MS` 调整）。解析函数为纯函数 + 显式 env 注入，便于单测无环境依赖。

/** 执行上限下限（1 分钟）。 */
export const MIN_EXECUTION_TIMEOUT_MS = 60_000
/** 执行上限内置默认（30 分钟，与 `EXECUTION_TIMEOUT_MS` 缺省一致）。 */
export const DEFAULT_EXECUTION_TIMEOUT_MS = 1_800_000
/** 封顶值默认（60 分钟）。 */
export const DEFAULT_MAX_EXECUTION_TIMEOUT_MS = 3_600_000
/** 封顶值下限 / 上限（30 分钟 / 4 小时）。 */
export const MIN_MAX_EXECUTION_TIMEOUT_MS = 1_800_000
export const MAX_MAX_EXECUTION_TIMEOUT_MS = 14_400_000

/** 单条验证命令 / 安装命令 / clone 的边界与默认值。 */
export const MIN_COMMAND_TIMEOUT_MS = 10_000
export const MAX_COMMAND_TIMEOUT_MS = 1_800_000
export const DEFAULT_COMMAND_TIMEOUT_MS = 600_000
export const MIN_INSTALL_TIMEOUT_MS = 10_000
export const MAX_INSTALL_TIMEOUT_MS = 1_800_000
export const DEFAULT_INSTALL_TIMEOUT_MS = 300_000
export const MIN_CLONE_TIMEOUT_MS = 60_000
export const MAX_CLONE_TIMEOUT_MS = 1_800_000
export const DEFAULT_CLONE_TIMEOUT_MS = 300_000

/** 仓库侧可覆盖字段（`null` / 缺省 = 继承全局）。 */
export interface ExecutionLimitOverrides {
    executionTimeoutMs?: number | null
    verifyCommandTimeoutMs?: number | null
    installTimeoutMs?: number | null
    cloneTimeoutMs?: number | null
}

/** 解析后的有效值（运行时与前端只读端点共用）。 */
export interface ResolvedExecutionLimits {
    executionTimeoutMs: number
    verifyCommandTimeoutMs: number
    installTimeoutMs: number
    cloneTimeoutMs: number
    ceilingMs: number
    /** 越界 / 封顶截断等非致命提示（写入日志，不阻断运行） */
    warnings: string[]
}

type Env = Record<string, string | undefined>

/**
 * 时长环境变量解析：支持纯数字毫秒（历史口径）与 `30m` / `1h` / `90s` 等单位写法。
 *
 * 纯数字默认按毫秒——变量名均以 `_MS` 结尾，且既有部署文档以毫秒示例；
 * 非法 / 非正数返回 undefined，由调用方回退默认值（不阻断启动）。
 */
function parseDurationEnvMs(raw: string | undefined): number | undefined {
    return parseDurationMs(raw, { defaultUnit: 'ms' })
}

/** 数值夹取到 [min, max]。 */
export function clampToBounds(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max)
}

/**
 * 封顶值解析：`DEPENDFIX_MAX_EXECUTION_TIMEOUT_MS`（默认 60 分钟，范围 [30min, 4h]）。
 * 越界 / 非法回退默认值——封顶配置错误不应让平台不可用。
 */
export function resolveExecutionCeilingMs(env: Env = process.env): number {
    const raw = parseDurationEnvMs(env.DEPENDFIX_MAX_EXECUTION_TIMEOUT_MS)
    if (raw === undefined) {
        return DEFAULT_MAX_EXECUTION_TIMEOUT_MS
    }
    if (raw < MIN_MAX_EXECUTION_TIMEOUT_MS || raw > MAX_MAX_EXECUTION_TIMEOUT_MS) {
        return DEFAULT_MAX_EXECUTION_TIMEOUT_MS
    }
    return raw
}

/** 全局执行默认值（`EXECUTION_TIMEOUT_MS`，缺省 30 分钟），并按封顶截断。 */
export function resolveGlobalExecutionTimeoutMs(env: Env, ceilingMs: number): number {
    const raw = parseDurationEnvMs(env.EXECUTION_TIMEOUT_MS) ?? DEFAULT_EXECUTION_TIMEOUT_MS
    return clampToBounds(raw, MIN_EXECUTION_TIMEOUT_MS, ceilingMs)
}

/**
 * 解析某仓库的有效执行限制。
 *
 * - 执行上限：仓库值 ?? 全局默认，clamp 到 `[1min, ceiling]`
 * - 验证 / 安装 / clone：仓库值 ?? env / 内置默认，clamp 到各自边界且 `<= 执行上限`
 * - 越界截断写入 `warnings`（运行期宽容处理，不中断运行）
 *
 * @param repo 仓库侧覆盖（`null` / `undefined` = 继承）
 * @param env 显式注入的环境变量面（缺省 `process.env`）
 */
export function resolveExecutionLimits(
    repo: ExecutionLimitOverrides | null | undefined,
    env: Env = process.env,
): ResolvedExecutionLimits {
    const warnings: string[] = []
    const ceilingMs = resolveExecutionCeilingMs(env)
    const globalExecution = resolveGlobalExecutionTimeoutMs(env, ceilingMs)

    const resolveBase = (input: {
        label: string
        override: number | null | undefined
        envValue: number | undefined
        fallback: number
        min: number
        max: number
    }): number => {
        const requested = input.override ?? input.envValue ?? input.fallback
        const bounded = clampToBounds(requested, input.min, input.max)
        if (bounded !== requested) {
            warnings.push(
                `${input.label}: ${requested}ms clamped to ${bounded}ms (bounds ${input.min}-${input.max}ms)`,
            )
        }
        return bounded
    }

    const executionTimeoutMs = resolveBase({
        label: 'executionTimeoutMs',
        override: repo?.executionTimeoutMs,
        envValue: parseDurationEnvMs(env.EXECUTION_TIMEOUT_MS),
        fallback: globalExecution,
        min: MIN_EXECUTION_TIMEOUT_MS,
        max: ceilingMs,
    })
    const verifyCommandTimeoutMs = resolveBase({
        label: 'verifyCommandTimeoutMs',
        override: repo?.verifyCommandTimeoutMs,
        envValue: parseDurationEnvMs(env.DEPENDFIX_VERIFY_TIMEOUT_MS),
        fallback: DEFAULT_COMMAND_TIMEOUT_MS,
        min: MIN_COMMAND_TIMEOUT_MS,
        max: Math.min(MAX_COMMAND_TIMEOUT_MS, executionTimeoutMs),
    })
    const installTimeoutMs = resolveBase({
        label: 'installTimeoutMs',
        override: repo?.installTimeoutMs,
        envValue: parseDurationEnvMs(env.DEPENDFIX_INSTALL_TIMEOUT_MS),
        fallback: DEFAULT_INSTALL_TIMEOUT_MS,
        min: MIN_INSTALL_TIMEOUT_MS,
        max: Math.min(MAX_INSTALL_TIMEOUT_MS, executionTimeoutMs),
    })
    const cloneTimeoutMs = resolveBase({
        label: 'cloneTimeoutMs',
        override: repo?.cloneTimeoutMs,
        envValue: undefined,
        fallback: DEFAULT_CLONE_TIMEOUT_MS,
        min: MIN_CLONE_TIMEOUT_MS,
        max: Math.min(MAX_CLONE_TIMEOUT_MS, executionTimeoutMs),
    })

    return {
        executionTimeoutMs,
        verifyCommandTimeoutMs,
        installTimeoutMs,
        cloneTimeoutMs,
        ceilingMs,
        warnings,
    }
}
