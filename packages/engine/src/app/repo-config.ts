// repo-config.ts
// 目标仓库专属配置（`.github/dependfix.yml`）的读取与合并。
// 范式与 `dependabot.yml` / `mergify.yml` 一致：配置随仓库走，管理大量仓库时无需中央维护名单。
// 合并口径为**中央配置优先**（防目标仓库绕过中央保护策略）：目标仓库声明仅在中央未指定时生效。
// 非法 / 缺失一律降级为「未引入本配置前」的行为，不中断修复。
// 设计见 docs/design/modules/dependency-fixer.md §12.7。

import { lstatSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { toErrorMessage, type Logger } from '@dependfix/core'
import { z } from 'zod'
import { parse as parseYaml } from 'yaml'
import type { RuntimeConfig } from '../config'
import { isSafePrototypeKey } from '../github/repo-policy'

/**
 * 目标仓库专属配置路径（相对工作区根）。工作区即目标仓库检出：
 * 平台在 clone 之后才构造 `DependfixApp`，CLI 则直接在工作区内运行。
 */
export const DEPENDFIX_CONFIG_PATH = '.github/dependfix.yml'

/**
 * 配置文件大小上限。目标仓库对该文件有完全控制权，超限直接降级而非读入内存
 * （正常配置为几十行 YAML，256 KiB 已是数量级余量）。
 */
const REPO_CONFIG_MAX_BYTES = 256 * 1024

/** 日志中回显的错误摘要上限：YAML 解析错误会携带文件片段，避免把检出内容整段写进日志 */
const ERROR_SUMMARY_MAX_CHARS = 200

/**
 * 目标仓库配置 schema（首批仅支持 `overrideProtect`，与中央配置同名同语义）。
 *
 * 未知键**不视为错误**（向前兼容后续版本新增字段），但读取时会告警列出，避免拼写错误静默失效。
 */
export const repoConfigSchema = z.object({
    overrideProtect: z.record(z.string(), z.array(z.string())).optional(),
})

export type RepoConfig = z.infer<typeof repoConfigSchema>

/** overrideProtect 的生效来源（用于日志与测试断言）。 */
export type OverrideProtectSource = 'central' | 'repo' | 'none'

export interface OverrideProtectResolution {
    value?: Record<string, string[]>
    source: OverrideProtectSource
    /** 中央优先时被忽略的仓库声明（仅用于可观测性，无功能含义） */
    ignoredRepoValue?: Record<string, string[]>
}

/** 截断后的错误摘要（日志安全：不整段回显文件内容）。 */
function summarizeError(error: unknown): string {
    const message = toErrorMessage(error)
    return message.length > ERROR_SUMMARY_MAX_CHARS ? `${message.slice(0, ERROR_SUMMARY_MAX_CHARS)}…` : message
}

/**
 * 过滤 `overrideProtect` 中的原型链风险键并告警（与 env / CLI 入口共用 `isSafePrototypeKey` 口径）。
 * 返回**新对象**（无风险键时原样返回入参），避免以动态键删除属性。
 */
function filterUnsafeOverrideProtectKeys(value: unknown, logger: Logger): unknown {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return value
    }
    const record = value as Record<string, unknown>
    const unsafeKeys = Object.keys(record).filter((key) => !isSafePrototypeKey(key))
    if (unsafeKeys.length === 0) {
        return value
    }
    logger.warn(`Unsafe keys in ${DEPENDFIX_CONFIG_PATH} overrideProtect ignored: ${unsafeKeys.join(', ')}`)
    return Object.fromEntries(Object.entries(record).filter(([key]) => isSafePrototypeKey(key)))
}

/**
 * 读取目标仓库配置。
 *
 * 降级路径（均返回 `undefined`，调用方继续使用中央配置，不抛错中断 run）：
 * - 文件不存在（预期常态，仅 debug 日志）
 * - 非普通文件（符号链接 / 目录）→ `warn`（不跟随链接读取检出目录之外的内容）
 * - 超过大小上限 → `warn`
 * - 读取失败 / YAML 解析失败 / schema 不匹配 → `warn`
 *
 * @param workDir - 目标仓库检出目录
 * @param logger - 运行日志器（降级告警出口）
 */
export function readRepoConfig(workDir: string, logger: Logger): RepoConfig | undefined {
    const filePath = join(workDir, DEPENDFIX_CONFIG_PATH)

    let fileStat: ReturnType<typeof lstatSync>
    try {
        fileStat = lstatSync(filePath)
    } catch (error: unknown) {
        if ((error as { code?: string }).code === 'ENOENT') {
            logger.debug(`No ${DEPENDFIX_CONFIG_PATH} in workspace; using central config only`)
            return undefined
        }
        logger.warn(`Failed to inspect ${DEPENDFIX_CONFIG_PATH}: ${summarizeError(error)}; falling back to central config`)
        return undefined
    }

    if (!fileStat.isFile()) {
        logger.warn(`${DEPENDFIX_CONFIG_PATH} is not a regular file (symlink / directory?); ignoring repo config`)
        return undefined
    }

    if (fileStat.size > REPO_CONFIG_MAX_BYTES) {
        logger.warn(
            `${DEPENDFIX_CONFIG_PATH} is too large (${fileStat.size} bytes > ${REPO_CONFIG_MAX_BYTES}); ignoring repo config`,
        )
        return undefined
    }

    let raw: string
    try {
        raw = readFileSync(filePath, 'utf8')
    } catch (error: unknown) {
        logger.warn(`Failed to read ${DEPENDFIX_CONFIG_PATH}: ${summarizeError(error)}; falling back to central config`)
        return undefined
    }

    let parsed: unknown
    try {
        parsed = parseYaml(raw)
    } catch (error: unknown) {
        logger.warn(`Invalid YAML in ${DEPENDFIX_CONFIG_PATH}: ${summarizeError(error)}; ignoring repo config`)
        return undefined
    }

    // 空文件（YAML 解析为 null）等价于未声明任何配置
    if (parsed === null || parsed === undefined) {
        return undefined
    }

    if (typeof parsed === 'object' && !Array.isArray(parsed)) {
        const configRecord = parsed as Record<string, unknown>
        if (Object.hasOwn(configRecord, 'overrideProtect')) {
            configRecord.overrideProtect = filterUnsafeOverrideProtectKeys(configRecord.overrideProtect, logger)
        }
    }

    const result = repoConfigSchema.safeParse(parsed)
    if (!result.success) {
        const issues = result.error.issues
            .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
            .join('; ')
        logger.warn(`Invalid ${DEPENDFIX_CONFIG_PATH} schema: ${issues}; ignoring repo config`)
        return undefined
    }

    const unknownKeys = Object.keys(parsed as Record<string, unknown>)
        .filter((key) => !Object.hasOwn(repoConfigSchema.shape, key))
    if (unknownKeys.length > 0) {
        logger.warn(`Unknown keys in ${DEPENDFIX_CONFIG_PATH} ignored: ${unknownKeys.join(', ')}`)
    }

    return result.data
}

/**
 * 解析 overrideProtect 的生效值：**中央配置优先**。
 *
 * 语义（P 阶段裁定）：中央配置（env / CLI）一旦指定该字段，目标仓库声明即被整体忽略——
 * 不按仓库 glob 逐条合并，避免目标仓库通过声明弱化中央保护策略。
 * 中央未指定（或解析为空）时才使用目标仓库声明。
 */
export function resolveOverrideProtect(
    central: Record<string, string[]> | undefined,
    repoDeclared: Record<string, string[]> | undefined,
): OverrideProtectResolution {
    const hasCentral = central !== undefined && Object.keys(central).length > 0
    if (hasCentral) {
        return { value: central, source: 'central', ignoredRepoValue: repoDeclared }
    }
    const hasRepo = repoDeclared !== undefined && Object.keys(repoDeclared).length > 0
    if (hasRepo) {
        return { value: repoDeclared, source: 'repo' }
    }
    return { value: undefined, source: 'none' }
}

/**
 * 将目标仓库配置合并进运行时配置（当前仅 `overrideProtect`）。
 *
 * 无需变更时**原样返回入参**（保持对象标识，调用方可安全以引用比较判断是否合并）。
 */
export function applyRepoConfig(config: RuntimeConfig, workDir: string, logger: Logger): RuntimeConfig {
    const repoConfig = readRepoConfig(workDir, logger)
    if (!repoConfig) {
        return config
    }

    const { value, source, ignoredRepoValue } = resolveOverrideProtect(
        config.overrideProtect,
        repoConfig.overrideProtect,
    )

    if (source === 'central') {
        if (ignoredRepoValue !== undefined && Object.keys(ignoredRepoValue).length > 0) {
            logger.debug(
                `Central overrideProtect takes precedence over ${DEPENDFIX_CONFIG_PATH}; repo declaration ignored`,
            )
        }
        return config
    }

    if (source === 'repo' && value !== undefined) {
        logger.info(
            `Using repo-level overrideProtect from ${DEPENDFIX_CONFIG_PATH} (central config not specified)`,
            { patterns: Object.keys(value) },
        )
        return { ...config, overrideProtect: value }
    }

    return config
}
