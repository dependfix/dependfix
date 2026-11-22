/**
 * 平台可观测性运行时（Sentry 事件转发 + 零配置关闭）。
 *
 * 设计要点（口径见 docs/design/governance/platform-observability.md）：
 * - **未配置 DSN 即完全关闭**：`initializeServerObservability` 在 DSN 为空时不调用 `init`、
 *   不登记 sink；所有 `captureLifecycle*` 入口退化为 no-op（零初始化、零出网）。
 * - **可注入**：`init` / `sink` 由调用方传入，单测用 stub 断言调用次数与载荷，不触网、不依赖环境变量。
 * - **全局单例**：状态挂在 `globalThis` 的 symbol 键上。Nitro 打包可能让同一模块出现多份实例
 *   （server config 与 plugin / service 分属不同 chunk），模块级变量会导致「初始化了但采集端看不见」。
 * - **脱敏前置**：事件上下文在进入 sink 之前过 `sanitizeSentryEvent`，SDK 自动采集面再由
 *   `beforeSend` 同一函数兜底（sentry.server.config.ts）。
 * - **不阻断业务**：sink 抛错只返回 false，绝不把观测故障升级为业务故障。
 */
import {
    DEFAULT_ERROR_SAMPLE_RATE,
    DEFAULT_TRACES_SAMPLE_RATE,
    buildSentryBaseOptions,
    parseSampleRate,
    resolveObservabilitySettings,
    type ObservabilitySettings,
    type SentryBaseOptions,
} from '#shared/observability'
import { sanitizeSentryEvent } from '#shared/sentry-sanitize'

/** 生命周期事件级别（Sentry severity 的子集） */
export type ObservabilityLevel = 'info' | 'warning' | 'error'

/** 事件上下文（键值会被脱敏后上报；release / commit / environment 由运行时注入，调用方不可覆盖） */
export type ObservabilityContext = Record<string, unknown>

/** 采集 sink 契约（生产实现为 Sentry，单测可注入 stub） */
export interface ObservabilitySink {
    captureEvent: (payload: { message: string, level: ObservabilityLevel, context: ObservabilityContext }) => void
    captureException: (error: unknown, context: ObservabilityContext) => void
    flush?: (timeoutMs: number) => Promise<boolean>
}

/** 可观测性环境变量读取结果 */
export interface ObservabilityEnvRead {
    settings: ObservabilitySettings
    /** 非法的采样率原始值（非空时调用方应输出一次 warn） */
    invalidSampleRates: string[]
}

/**
 * 从 env 读取可观测性设置。
 * 服务端读 `SENTRY_DSN`（运行时注入）；release / commit 复用构建期版本戳
 * （`NUXT_BUILD_VERSION` / `NUXT_BUILD_COMMIT`，由容器入口导出，缺省 unknown）。
 */
export function readObservabilityEnv(
    env: NodeJS.ProcessEnv = process.env,
): ObservabilityEnvRead {
    const errorRate = parseSampleRate(env.SENTRY_ERRORS_SAMPLE_RATE, DEFAULT_ERROR_SAMPLE_RATE)
    const tracesRate = parseSampleRate(env.SENTRY_TRACES_SAMPLE_RATE, DEFAULT_TRACES_SAMPLE_RATE)
    const settings = resolveObservabilitySettings({
        dsn: env.SENTRY_DSN,
        // 空串（compose 白名单未设值）按「未配置」处理，回落到 NODE_ENV 而不是 development
        environment: env.SENTRY_ENVIRONMENT?.trim() || env.NODE_ENV,
        release: env.NUXT_BUILD_VERSION,
        commit: env.NUXT_BUILD_COMMIT,
        errorSampleRate: errorRate.value,
        tracesSampleRate: tracesRate.value,
    })
    return {
        settings,
        invalidSampleRates: [errorRate.invalid, tracesRate.invalid]
            .filter((value): value is string => value !== null),
    }
}

/** 服务端 Sentry 初始化选项（在公共选项上追加端专属字段） */
export interface ServerSentryOptions extends SentryBaseOptions {
    /** 关闭 SDK 自带的 Nitro error handler：API 5xx 由本模块的插件钩子统一脱敏上报，避免重复事件 */
    enableNitroErrorHandler: false
    /** 全局 tag：commit 供 Sentry 按部署产物过滤（release 已在顶层） */
    initialScope: { tags: Record<string, string> }
}

/** 构造服务端 Sentry 初始化选项（调用方保证 settings.enabled） */
export function buildServerSentryOptions(settings: ObservabilitySettings): ServerSentryOptions {
    return {
        ...buildSentryBaseOptions(settings),
        enableNitroErrorHandler: false,
        initialScope: { tags: { commit: settings.commit } },
    }
}

/** Sentry 初始化函数签名（生产为 `Sentry.init`，单测为 spy） */
export type SentryInitLike = (options: ServerSentryOptions) => unknown

/** `initializeServerObservability` 输入 */
export interface InitializeServerObservabilityInput {
    env?: NodeJS.ProcessEnv
    init: SentryInitLike
    sink: ObservabilitySink
    /** 非法配置告警出口（默认 console.warn；日志通道初始化前也可能调用本函数） */
    warn?: (message: string) => void
}

/** `initializeServerObservability` 结果（供启动行 / 单测断言） */
export interface InitializeServerObservabilityResult {
    enabled: boolean
    initialized: boolean
    settings: ObservabilitySettings
}

interface ObservabilityState {
    settings: ObservabilitySettings
    sink: ObservabilitySink | null
}

const STATE_KEY = Symbol.for('dependfix.platform.observability')

type ObservabilityGlobal = typeof globalThis & Record<symbol, ObservabilityState | undefined>

const DISABLED_SETTINGS: ObservabilitySettings = {
    enabled: false,
    dsn: null,
    environment: 'development',
    release: 'unknown',
    commit: 'unknown',
    errorSampleRate: DEFAULT_ERROR_SAMPLE_RATE,
    tracesSampleRate: DEFAULT_TRACES_SAMPLE_RATE,
}

const readState = (): ObservabilityState =>
    (globalThis as ObservabilityGlobal)[STATE_KEY] ?? { settings: DISABLED_SETTINGS, sink: null }

/**
 * 初始化服务端可观测性（DSN 为空时保持关闭）。
 * `init` 只在 enabled 时调用；同一 DSN 的重复调用（dev 热重载 / 测试）短路，不叠加 SDK 集成。
 */
export function initializeServerObservability(
    input: InitializeServerObservabilityInput,
): InitializeServerObservabilityResult {
    const { settings, invalidSampleRates } = readObservabilityEnv(input.env ?? process.env)
    const warn = input.warn ?? console.warn
    if (invalidSampleRates.length > 0) {
        warn(`[observability] 非法采样率（仅接受 0-1，已回退缺省值）：${invalidSampleRates.join(', ')}`)
    }
    if (!settings.enabled) {
        resetObservability()
        return { enabled: false, initialized: false, settings }
    }
    const existing = readState()
    if (existing.settings.enabled && existing.sink !== null && existing.settings.dsn === settings.dsn) {
        // dev 热重载 / 重复执行：同一 DSN 已初始化，跳过 Sentry.init（重复 init 会叠加集成与 transport）
        return { enabled: true, initialized: false, settings }
    }
    try {
        input.init(buildServerSentryOptions(settings))
    } catch (error) {
        // 观测通道初始化失败不得阻断平台启动：降级为关闭（无既有可用通道时清空状态）
        warn(`[observability] Sentry 初始化失败，通道降级为关闭：${error instanceof Error ? error.message : String(error)}`)
        if (!existing.settings.enabled || existing.sink === null) {
            resetObservability()
        }
        return {
            enabled: existing.settings.enabled && existing.sink !== null,
            initialized: false,
            settings,
        }
    }
    configureObservability(settings, input.sink)
    return { enabled: true, initialized: true, settings }
}

/** 登记可观测性设置与 sink（生产由 initializeServerObservability 调用；测试可直接注入） */
export function configureObservability(settings: ObservabilitySettings, sink: ObservabilitySink): void {
    ;(globalThis as ObservabilityGlobal)[STATE_KEY] = { settings, sink }
}

/** 清空可观测性状态（DSN 关闭 / 测试隔离） */
export function resetObservability(): void {
    delete (globalThis as ObservabilityGlobal)[STATE_KEY]
}

/** 当前可观测性状态快照（不含 sink 本体，避免调用方绕过采集入口直接上报） */
export function getObservabilityState(): {
    enabled: boolean
    environment: string
    release: string
    commit: string
    sinkConfigured: boolean
} {
    const state = readState()
    return {
        enabled: state.settings.enabled && state.sink !== null,
        environment: state.settings.environment,
        release: state.settings.release,
        commit: state.settings.commit,
        sinkConfigured: state.sink !== null,
    }
}

/** 是否启用（DSN 已配置且 sink 已登记） */
export const isObservabilityEnabled = (): boolean => getObservabilityState().enabled

/** 事件上下文脱敏 + 运行时字段注入（release / commit / environment 不可被调用方覆盖） */
const buildSafeContext = (
    settings: ObservabilitySettings,
    context: ObservabilityContext,
): ObservabilityContext => {
    const sanitized = sanitizeSentryEvent({
        extra: {
            ...context,
            release: settings.release,
            commit: settings.commit,
            environment: settings.environment,
        },
    }) as { extra?: ObservabilityContext }
    return sanitized.extra ?? {}
}

/**
 * 转发一条生命周期事件（启动 / 队列 / 执行失败 / 通知失败等）。
 * @returns 是否实际进入 sink（关闭状态 / sink 抛错为 false）
 */
export function captureLifecycleEvent(
    name: string,
    level: ObservabilityLevel,
    context: ObservabilityContext = {},
): boolean {
    const state = readState()
    if (!state.settings.enabled || !state.sink) {
        return false
    }
    const message = `[platform] ${name}`
    try {
        state.sink.captureEvent({
            message,
            level,
            context: buildSafeContext(state.settings, context),
        })
        return true
    } catch {
        // 观测通道故障不得影响业务主流程
        return false
    }
}

/**
 * 转发一条异常（未捕获错误 / 执行失败 / 通知失败）。
 * @returns 是否实际进入 sink
 */
export function captureLifecycleError(
    error: unknown,
    context: ObservabilityContext = {},
): boolean {
    const state = readState()
    if (!state.settings.enabled || !state.sink) {
        return false
    }
    try {
        state.sink.captureException(error, buildSafeContext(state.settings, context))
        return true
    } catch {
        return false
    }
}

/** 冲刷待发送事件（进程退出前调用；无 flush 实现时视为已冲刷） */
export async function flushObservability(timeoutMs = 2000): Promise<boolean> {
    const state = readState()
    if (!state.settings.enabled || !state.sink) {
        return true
    }
    try {
        return state.sink.flush ? await state.sink.flush(timeoutMs) : true
    } catch {
        return false
    }
}

/** Sentry 采集函数子集（生产为 `@sentry/nuxt` 命名空间，单测为 spy） */
export interface SentryCaptureLike {
    captureEvent?: (event: {
        message: string
        level: ObservabilityLevel
        extra: ObservabilityContext
        tags: Record<string, string>
    }) => unknown
    captureException?: (error: unknown, context: {
        extra: ObservabilityContext
        tags: Record<string, string>
    }) => unknown
    flush?: (timeout?: number) => Promise<boolean>
}

/** 取上下文字符串字段（非字符串回退占位，避免对象被 String() 成 [object Object]） */
const readContextString = (value: unknown): string => (typeof value === 'string' ? value : 'unknown')

/**
 * 构造 Sentry sink。
 * tags 只放 source / commit（低基数、可过滤）；其余上下文走 extra（已脱敏）。
 */
export function createSentrySink(sentry: SentryCaptureLike): ObservabilitySink {
    return {
        captureEvent(payload) {
            sentry.captureEvent?.({
                message: payload.message,
                level: payload.level,
                extra: payload.context,
                tags: {
                    source: 'lifecycle',
                    commit: readContextString(payload.context.commit),
                },
            })
        },
        captureException(error, context) {
            sentry.captureException?.(error, {
                extra: context,
                tags: {
                    source: 'lifecycle',
                    commit: readContextString(context.commit),
                },
            })
        },
        flush(timeoutMs) {
            return sentry.flush?.(timeoutMs) ?? Promise.resolve(true)
        },
    }
}
