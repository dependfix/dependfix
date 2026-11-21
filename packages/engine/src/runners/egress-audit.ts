// egress-audit.ts — 运行级外联审计的单一入口（安装链 / 验证链 / 交付命令共用）。
//
// 背景：审计代理原先只在 `runVerification` 内启动，安装链（pnpm install / override 写盘）与
// 交付类 git 命令（clone 之外的 push）不在审计面内——沙箱 fix 放行后这是缺口。
// 这里把代理提升到「每次 DependfixApp.run() 一次」：
// - `runTrackedCommand` 默认注入代理 env（尊重用户既有代理，不覆盖）；
// - 验证链复用同一代理并把记录并入同一审计，不再自建第二份；
// - 运行结束时把 entries / violations 交给 RunResult（报告、平台运行详情与导出消费）。
//
// 环境无既有代理时才注入（覆盖用户代理会破坏其网络行为，稳定性优先）；已有代理时仍启动审计
// 代理但只作为「命令输出 URL 提取」的收集面，不改变子进程网络路径。

import type { NetworkAuditEntry } from '@dependfix/core'
import { startNetworkAudit, type NetworkAudit } from './network-audit'

/**
 * 审计代理注入状态（运行结果披露用）：
 * - `injected`：已把审计代理注入子进程环境
 * - `existing-proxy`：环境已有代理，未注入（审计仅保留命令输出 URL 提取，deny-by-default 不生效）
 */
export type EgressInjectionStatus = 'injected' | 'existing-proxy'

export interface RunEgressSnapshot {
    entries: NetworkAuditEntry[]
    violations: NetworkAuditEntry[]
    injection: EgressInjectionStatus
}

interface ActiveEgress {
    audit: NetworkAudit
    /** 注入给子进程的代理地址（未注入时为 undefined：环境已有代理） */
    proxyUrl?: string
    injection: EgressInjectionStatus
}

/** 审计代理的 NO_PROXY 基线：代理自身与本地服务不经二次转发。 */
export const AUDIT_LOOPBACK_NO_PROXY = '127.0.0.1,localhost,::1'

/**
 * 合并用户已有 NO_PROXY 与审计回环项（去重、保序：用户项在前）。
 *
 * 三个调用点（运行级代理 env / 验证链 / 平台派生子进程）共用同一语义——此前验证链
 * 在注入代理时把 `NO_PROXY` 置空，会抹掉用户配置的直连域。
 */
export function mergeNoProxy(existing?: string): string {
    const entries = new Set<string>()
    for (const item of [...(existing ?? '').split(','), ...AUDIT_LOOPBACK_NO_PROXY.split(',')]) {
        const trimmed = item.trim()
        if (trimmed) {
            entries.add(trimmed)
        }
    }
    return [...entries].join(',')
}

/**
 * 构造审计代理 env（含大小写两套键）。`existingNoProxy` 为用户已有值，与回环项合并而非覆盖。
 */
export function buildAuditProxyEnv(proxyUrl: string, existingNoProxy?: string): NodeJS.ProcessEnv {
    const noProxy = mergeNoProxy(existingNoProxy)
    return {
        HTTP_PROXY: proxyUrl,
        HTTPS_PROXY: proxyUrl,
        ALL_PROXY: proxyUrl,
        http_proxy: proxyUrl,
        https_proxy: proxyUrl,
        all_proxy: proxyUrl,
        NO_PROXY: noProxy,
        no_proxy: noProxy,
    }
}

let active: ActiveEgress | undefined

/** 是否被显式关闭（`DEPENDFIX_NETWORK_AUDIT=false`；平台 / CLI 均可设）。 */
export function isRunEgressAuditDisabled(env: NodeJS.ProcessEnv = process.env): boolean {
    return env.DEPENDFIX_NETWORK_AUDIT?.trim().toLowerCase() === 'false'
}

function hasExistingProxy(env: NodeJS.ProcessEnv = process.env): boolean {
    return Boolean(
        env.HTTP_PROXY || env.HTTPS_PROXY || env.ALL_PROXY
        || env.http_proxy || env.https_proxy || env.all_proxy,
    )
}

/**
 * 启动运行级审计代理（幂等）。
 *
 * @param extraAllowedDomains 追加白名单（如 workDir 配置面动态发现的 registry host）
 */
export async function startRunEgressAudit(options: { extraAllowedDomains?: string[] } = {}): Promise<void> {
    if (active || isRunEgressAuditDisabled()) {
        return
    }
    const audit = await startNetworkAudit({ extraAllowedDomains: options.extraAllowedDomains })
        .catch(() => undefined)
    if (!audit) {
        return
    }
    const useExistingProxy = hasExistingProxy()
    active = {
        audit,
        ...(useExistingProxy ? {} : { proxyUrl: audit.proxyUrl }),
        injection: useExistingProxy ? 'existing-proxy' : 'injected',
    }
}

/** 当前生效的代理地址（未启动 / 环境已有代理时为 undefined）。 */
export function getEgressProxyUrl(): string | undefined {
    return active?.proxyUrl
}

/**
 * 注入子进程的代理环境变量（无生效代理时返回 undefined，调用方保持原有 env）。
 *
 * `NO_PROXY` 保留回环：审计代理自身与本地服务不经二次转发。
 */
export function getEgressProxyEnv(): NodeJS.ProcessEnv | undefined {
    const proxyUrl = active?.proxyUrl
    if (!proxyUrl) {
        return undefined
    }
    return buildAuditProxyEnv(proxyUrl)
}

/** 运行级审计是否处于活动状态（验证链据此复用代理而非自建）。 */
export function hasActiveEgressAudit(): boolean {
    return active !== undefined
}

/** 活动中的审计对象（验证链复用同一份 entries / violations）。 */
export function getActiveEgressAudit(): NetworkAudit | undefined {
    return active?.audit
}

/** 追加记录（命令输出 URL 提取 / 外部代理转发）。 */
export function addEgressEntries(entries: NetworkAuditEntry[]): void {
    active?.audit.addEntries(entries)
}

/** 追加违规外联（deny-by-default 拦截）。 */
export function addEgressViolation(entry: NetworkAuditEntry): void {
    active?.audit.addViolation(entry)
}

/** 读取当前快照（不停止审计）。 */
export function getRunEgressSnapshot(): RunEgressSnapshot | undefined {
    if (!active) {
        return undefined
    }
    return {
        entries: [...active.audit.entries],
        violations: [...active.audit.violations],
        injection: active.injection,
    }
}

/** 停止审计并返回最终快照（幂等；未启动时返回 undefined）。 */
export async function stopRunEgressAudit(): Promise<RunEgressSnapshot | undefined> {
    if (!active) {
        return undefined
    }
    const snapshot: RunEgressSnapshot = {
        entries: [...active.audit.entries],
        violations: [...active.audit.violations],
        injection: active.injection,
    }
    const { audit } = active
    active = undefined
    await audit.stop().catch(() => { /* 停止失败静默：记录已取快照 */ })
    return snapshot
}

/** 复位运行级状态（仅测试用：不停止代理的语义由 `stopRunEgressAudit` 承担）。 */
export function resetRunEgressAuditStateForTest(): void {
    active = undefined
}
