/**
 * 可观测性运行时配置（App 与 server 共享，故位于 `shared/`）。
 *
 * 单一职责：把 env / 构建期版本戳归一化为 Sentry 初始化所需的取值，并给出统一的
 * 「未配置 DSN 即完全关闭」判据。真正的 SDK 初始化与事件转发分别在
 * `sentry.server.config.ts` / `sentry.client.config.ts` 与 `server/utils/observability.ts`，
 * 本模块不 import 任何 Sentry 包，便于单测与浏览器 / Node 双端复用。
 *
 * 环境变量（口径见 docs/design/governance/platform-observability.md §3）：
 * - `SENTRY_DSN`：服务端 DSN；为空即关闭通道（零初始化、零出网）
 * - `NUXT_PUBLIC_SENTRY_DSN`：浏览器端 DSN（运行时 `NUXT_PUBLIC_` 覆盖通道）
 * - `SENTRY_ENVIRONMENT`：环境名（缺省取 `NODE_ENV`，再缺省 `development`）
 * - `SENTRY_ERRORS_SAMPLE_RATE`：错误事件采样率（0-1，缺省 1）
 * - `SENTRY_TRACES_SAMPLE_RATE`：事务 / Web Vitals 采样率（0-1，缺省 0.1）
 */
import type { DataCollection } from '@sentry/core'

/** 错误事件缺省采样率（全量采集：错误是低频高价值信号） */
export const DEFAULT_ERROR_SAMPLE_RATE = 1

/** 事务 / Web Vitals 缺省采样率（十取一：性能数据量大，先看趋势） */
export const DEFAULT_TRACES_SAMPLE_RATE = 0.1

/** 采样率解析结果：`invalid` 保留原始值，便于调用方输出一次 warn（非法值静默回退会掩盖配置错误） */
export interface SampleRateParseResult {
    value: number
    invalid: string | null
}

/**
 * 解析 0-1 采样率。
 * 空串 / 未设置 → 缺省值；越界或非数字 → 缺省值 + 原始值（不 throw：可观测性配置错误不得阻断启动）。
 */
export function parseSampleRate(
    raw: string | number | null | undefined,
    fallback: number,
): SampleRateParseResult {
    if (raw === null || raw === undefined) {
        return { value: fallback, invalid: null }
    }
    const text = typeof raw === 'number' ? String(raw) : raw.trim()
    if (text === '') {
        return { value: fallback, invalid: null }
    }
    const value = Number(text)
    if (!Number.isFinite(value) || value < 0 || value > 1) {
        return { value: fallback, invalid: text }
    }
    return { value, invalid: null }
}

/** 归一化字符串取值：非字符串 / 空串 / 仅空白 → null */
const normalizeOptional = (value: unknown): string | null => {
    if (typeof value !== 'string') {
        return null
    }
    const trimmed = value.trim()
    return trimmed === '' ? null : trimmed
}

/** 可观测性原始输入（env 取值 + 构建期版本戳；服务端与浏览器端各自组装） */
export interface ObservabilitySettingsInput {
    dsn?: unknown
    environment?: unknown
    /** 部署产物版本（Sentry release） */
    release?: unknown
    /** 部署产物 commit（Sentry tag） */
    commit?: unknown
    errorSampleRate?: string | number | null
    tracesSampleRate?: string | number | null
}

/** 归一化后的可观测性设置（跨端同构，不含 SDK 专属字段） */
export interface ObservabilitySettings {
    /** DSN 非空即启用；为空时所有采集入口必须是 no-op */
    enabled: boolean
    dsn: string | null
    environment: string
    release: string
    commit: string
    errorSampleRate: number
    tracesSampleRate: number
}

/**
 * 归一化可观测性设置。
 * `enabled` 只由 DSN 决定——这是「未配置零出网」的唯一判据，不能由采样率或环境名推导。
 */
export function resolveObservabilitySettings(input: ObservabilitySettingsInput): ObservabilitySettings {
    const dsn = normalizeOptional(input.dsn)
    const errorRate = parseSampleRate(input.errorSampleRate, DEFAULT_ERROR_SAMPLE_RATE)
    const tracesRate = parseSampleRate(input.tracesSampleRate, DEFAULT_TRACES_SAMPLE_RATE)
    return {
        enabled: dsn !== null,
        dsn,
        environment: normalizeOptional(input.environment) ?? 'development',
        release: normalizeOptional(input.release) ?? 'unknown',
        commit: normalizeOptional(input.commit) ?? 'unknown',
        errorSampleRate: errorRate.value,
        tracesSampleRate: tracesRate.value,
    }
}

/**
 * 自动采集面关闭项（Sentry v11 的 `dataCollection`，替代已不存在的 `sendDefaultPii`）。
 *
 * 文档注释里「关闭 URL query / Cookie / 请求体 / 用户信息」的承诺**只由本对象兑现**：
 * SDK 默认全开，`beforeSend` 只覆盖错误事件，事务 / span 走 `beforeSendSpan`，两处必须同时配置
 * （见 platform-observability.md §3.3）。用 SDK 的 `DataCollection` 类型做 `satisfies` 检查——
 * 字段改名 / 拼错会在编译期报错，不重复 `sendDefaultPii` 的静默失效。
 */
export const SENTRY_DATA_COLLECTION = {
    userInfo: false,
    cookies: false,
    httpHeaders: false,
    httpBodies: [],
    urlQueryParams: false,
    graphQL: { document: false, variables: false },
    genAI: { inputs: false, outputs: false },
    mcp: { inputs: false, outputs: false },
    databaseQueryData: false,
    queues: false,
    stackFrameVariables: false,
    frameContextLines: 0,
} satisfies DataCollection

/** Sentry 初始化公共选项（服务端 / 浏览器端在其上追加端专属选项） */
export interface SentryBaseOptions {
    dsn: string
    environment: string
    release: string
    /** 错误事件采样率 */
    sampleRate: number
    /** 事务 / Web Vitals 采样率 */
    tracesSampleRate: number
    /** 自动采集面全关闭（PII / Cookie / 请求头 / 请求体 / URL query / DB / 队列） */
    dataCollection: DataCollection
}

/**
 * 构造端无关的 Sentry 初始化选项（调用方保证 `settings.enabled === true`）。
 * `dsn` 为空时抛错而非返回禁用选项——静默初始化会掩盖「以为开了其实没开」的配置错误。
 */
export function buildSentryBaseOptions(settings: ObservabilitySettings): SentryBaseOptions {
    if (!settings.enabled || !settings.dsn) {
        throw new Error('buildSentryBaseOptions requires an enabled observability settings object')
    }
    return {
        dsn: settings.dsn,
        environment: settings.environment,
        release: settings.release,
        sampleRate: settings.errorSampleRate,
        tracesSampleRate: settings.tracesSampleRate,
        dataCollection: SENTRY_DATA_COLLECTION,
    }
}
