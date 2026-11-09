import { parseDurationMs } from '@dependfix/core'

// install-timeouts.ts — `pnpm install` 类调用（安装 / lockfile 诊断 / frozen 校验 / 修复策略）
// 的超时口径**单一事实源**。
//
// 背景（2026-10-16 生产复盘）：同一类 pnpm install 调用在四处各持一份超时值——安装 120s、
// lockfile 诊断 120s、frozen 校验 120s、修复策略 180s，而修复前基线与修复后验证链的单命令
// 上限是 10 分钟（`runners/verification-runner.ts` 的 `DEFAULT_COMMAND_TIMEOUT_MS`）。口径不一致的
// 后果是实测可见的：探针 install 的相邻日志间隔 2m01s / 2m39s 与 120s 上限吻合，即大量安装
// 是**被超时打断**而非"装完失败"；同一批次里成功 install 耗时为 30s–3min，被内核 OOM 杀死的
// 那些跑了 1–11min。
//
// 取值依据（300s 默认）：
// - 低端：实测成功的 install 最长约 3 分钟（大仓 / 冷 cache），120s 明显偏紧
// - 高端：单仓执行上限为 30 分钟（平台 `EXECUTION_TIMEOUT_MS`），且安装类调用在一个仓库内
//   可出现多次（修复前基线 + 探针 + 修复后验证 + lockfile 修复链），单值不能吃满整段预算；
//   超时后由运行级 abort 兜底终止（见 `runners/process-control.ts`），不会留下僵尸进程
// - 可覆盖：运维可通过 `DEPENDFIX_INSTALL_TIMEOUT_MS` 调整（越界 / 非法值回退默认，不中断运行）
//
// 边界：本模块只管安装类命令的超时值；验证链单命令超时（10 分钟）仍由
// `runners/verification-runner.ts` 的 `DEFAULT_COMMAND_TIMEOUT_MS` 持有，两者刻意不同源
// （前者是"装依赖"，后者是"跑目标仓库的脚本"，性质与预算分离）。
// **不在 engine 公共出口 re-export**（内部实现，不扩大公开 API）。

/** 安装类命令默认超时：5 分钟。 */
export const DEFAULT_INSTALL_TIMEOUT_MS = 300_000

/** 安装类命令超时下限（低于此值视为配置错误 → 回退默认）。 */
export const MIN_INSTALL_TIMEOUT_MS = 10_000

/** 安装类命令超时上限（30 分钟，与平台单仓执行上限同量级；超过即无意义）。 */
export const MAX_INSTALL_TIMEOUT_MS = 30 * 60 * 1000

/** 超时覆盖 env 名（运维面）。 */
export const INSTALL_TIMEOUT_ENV = 'DEPENDFIX_INSTALL_TIMEOUT_MS'

/**
 * 解析安装类命令超时：支持纯数字毫秒（历史口径）与 `5m` / `90s` 等单位写法。
 *
 * 口径与平台侧 `resolveExecutionTimeoutMs` 同族：解析成功且落在
 * `[MIN_INSTALL_TIMEOUT_MS, MAX_INSTALL_TIMEOUT_MS]` 内才采纳，否则回退默认。
 */
export function resolveInstallTimeoutMs(
    env: NodeJS.ProcessEnv = process.env,
    fallback: number = DEFAULT_INSTALL_TIMEOUT_MS,
): number {
    // 仓库级覆盖优先于 env（与平台 resolveExecutionLimits 的优先级一致）
    if (runOverrideMs !== undefined) {
        return runOverrideMs
    }
    const raw = env[INSTALL_TIMEOUT_ENV]?.trim()
    const value = parseDurationMs(raw, { defaultUnit: 'ms' })
    if (raw && (value === undefined || value < MIN_INSTALL_TIMEOUT_MS || value > MAX_INSTALL_TIMEOUT_MS)
        && warnedInvalidValue !== raw) {
        warnedInvalidValue = raw
        console.warn(`[install] ${INSTALL_TIMEOUT_ENV}="${raw}" 非法或越界，回退 ${fallback}ms`)
    }
    return value !== undefined && value >= MIN_INSTALL_TIMEOUT_MS && value <= MAX_INSTALL_TIMEOUT_MS
        ? value
        : fallback
}

/**
 * 运行级安装超时覆盖（仓库配置；`undefined` = 不覆盖）。
 *
 * 安装类调用（安装 / lockfile 诊断 / frozen 校验 / 修复策略）散布在无 ctx 的底层函数里，
 * 逐层透传签名会侵入 4 个模块；这里用与 `runners/process-control` 同类的运行级上下文承载，
 * 由 `DependfixApp.run()` 在开跑时设置、结束时重置（单进程单运行，无并发歧义）。
 */
let runOverrideMs: number | undefined

/** 已告警的非法 env 原值（避免同一进程内每次 install 调用重复刷屏）。 */
let warnedInvalidValue: string | undefined

/** 设置运行级安装超时覆盖（越界 / 非法按默认回退；`undefined` = 清除覆盖）。 */
export function setRunInstallTimeoutMs(overrideMs: number | undefined): void {
    runOverrideMs = overrideMs !== undefined
        && Number.isInteger(overrideMs)
        && overrideMs >= MIN_INSTALL_TIMEOUT_MS
        && overrideMs <= MAX_INSTALL_TIMEOUT_MS
        ? overrideMs
        : undefined
}

/** 当前运行级覆盖（供测试断言与诊断）。 */
export function getRunInstallTimeoutMs(): number | undefined {
    return runOverrideMs
}
