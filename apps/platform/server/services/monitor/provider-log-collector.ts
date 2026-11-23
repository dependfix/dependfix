import type { DataSource } from 'typeorm'
import {
    fetchProviderLog,
    resolveProviderLogProvider,
    type ProviderLogFetch,
    type ProviderLogProvider,
    type ProviderLogRequest,
    type ProviderLogResult,
} from '@dependfix/engine'
import type { UnifiedBuildSignal } from './types'
import { Credential, type CredentialType } from '#server/entities/credential'
import type { Repository } from '#server/entities/repository'
import { decryptToken, getEncryptionKey } from '#server/services/credential.service'

/**
 * PR Check 失败信号的 provider 原生日志富化采集（Layer 5）。
 *
 * 职责边界：
 * - 只在**已确认失败**（`overallStatus === 'failure'`）且存在可支持的失败信号时工作；
 * - 无失败信号 / 无仓库级目标 / 同组织无同类型凭据 → 返回 `null`（**零请求**）；
 * - 单次只富化**第一条**可支持的失败信号（不做多 provider 并发，避免配额与请求放大）；
 * - 拉取失败与异常一律降级为「不可用 + 原因」，不抛错、不影响 `overallStatus` / 告警状态机。
 *
 * 契约与脱敏 / 截尾均由引擎 `packages/engine/src/github/pr-check-logs` 负责；
 * 口径见 [pr-build-deploy-signals.md §3.12](../../../../docs/design/governance/pr-build-deploy-signals.md)。
 */

/** 失败信号状态（`error` 与 `failure` 同属失败面） */
const FAILED_SIGNAL_STATES: ReadonlySet<string> = new Set(['failure', 'error'])

/** provider → 凭据类型（组织级只读 token） */
export const PROVIDER_LOG_CREDENTIAL_TYPE: Readonly<Record<ProviderLogProvider, CredentialType>> = {
    vercel: 'vercel-token',
    cloudflare: 'cloudflare-token',
}

/**
 * 持久化到 `PRCheck.providerLogsJson` 的记录形态。
 *
 * `tail` 已由引擎按 8 KB 截尾并脱敏；不可用时只保留稳定 `reason` 与可选 HTTP `status`。
 */
export interface ProviderLogRecord {
    available: boolean
    provider: string
    tail?: string
    truncated?: boolean
    reason?: string
    status?: number
    /** 采集时刻（ISO 8601；UI 展示「日志采集时间」） */
    fetchedAt: string
}

export interface ProviderLogCollectInput {
    repository: Pick<Repository, 'organizationId' | 'vercelProjectId' | 'cloudflareAccountId' | 'cloudflareWorkerTag'>
    headSha: string
    overallStatus: string | null
    signals: readonly UnifiedBuildSignal[] | null | undefined
}

export interface ProviderLogCollectorDeps {
    /** 引擎调度函数（单测注入 stub，避免真实出网） */
    fetchProviderLog?: (request: ProviderLogRequest, deps?: { fetch?: ProviderLogFetch }) => Promise<ProviderLogResult>
    /** 读取同组织 + 同 provider 类型的只读 token（返回 null = 未配置 / 不可解密） */
    loadProviderToken?: (provider: ProviderLogProvider, organizationId: string | null) => Promise<string | null>
    /** 采集时刻（单测固定时间） */
    now?: () => Date
}

/** 解析 provider 的仓库级目标；缺任一项即视为未启用（引擎侧也会返回 `unsupported_target` 且零请求） */
const hasProviderTargets = (provider: ProviderLogProvider, repository: ProviderLogCollectInput['repository']): boolean =>
    provider === 'vercel'
        ? Boolean(repository.vercelProjectId)
        : Boolean(repository.cloudflareAccountId && repository.cloudflareWorkerTag)

export class ProviderLogCollector {
    private readonly ds: DataSource
    private readonly deps: ProviderLogCollectorDeps

    constructor(ds: DataSource, deps: ProviderLogCollectorDeps = {}) {
        this.ds = ds
        this.deps = deps
    }

    /** 读取组织级 provider 只读 token（任一步失败按「未配置」处理，不阻断轮询） */
    private async loadProviderToken(provider: ProviderLogProvider, organizationId: string | null): Promise<string | null> {
        const injected = this.deps.loadProviderToken
        if (injected) {
            return await injected(provider, organizationId)
        }
        // provider 凭据是组织级资源：无组织归属时不跨组织猜测（零请求）
        if (!organizationId) {
            return null
        }
        try {
            const credential = await this.ds.getRepository(Credential).findOne({
                where: { organizationId, type: PROVIDER_LOG_CREDENTIAL_TYPE[provider] },
                order: { createdAt: 'DESC' },
            })
            if (!credential?.encryptedToken) {
                return null
            }
            const token = decryptToken(credential.encryptedToken, getEncryptionKey())
            return token.trim() === '' ? null : token
        } catch (error) {
            console.warn(`[provider-log] 读取 ${provider} 只读凭据失败（按未配置处理）：`, error)
            return null
        }
    }

    /** 第一条可支持的失败信号（provider 可识别 + 仓库级目标齐备） */
    private pickSignal(
        signals: ProviderLogCollectInput['signals'],
        repository: ProviderLogCollectInput['repository'],
    ): { provider: ProviderLogProvider, signal: UnifiedBuildSignal } | null {
        for (const signal of signals ?? []) {
            if (!FAILED_SIGNAL_STATES.has(signal.state)) {
                continue
            }
            // 归一化走引擎同一函数（去空白 / 小写 / 去 `<安装号>+` 前缀与 `[bot]` 后缀）
            const provider = resolveProviderLogProvider(signal.provider)
            if (!provider || !hasProviderTargets(provider, repository)) {
                continue
            }
            return { provider, signal }
        }
        return null
    }

    async collect(input: ProviderLogCollectInput): Promise<ProviderLogRecord | null> {
        if (input.overallStatus !== 'failure') {
            return null
        }
        const picked = this.pickSignal(input.signals, input.repository)
        if (!picked) {
            return null
        }
        const { provider } = picked
        const now = (this.deps.now ?? (() => new Date()))()

        const token = await this.loadProviderToken(provider, input.repository.organizationId)
        if (!token) {
            return null
        }

        const request: ProviderLogRequest = {
            provider,
            token,
            headSha: input.headSha,
            targets: {
                vercelProjectId: input.repository.vercelProjectId ?? undefined,
                cloudflareAccountId: input.repository.cloudflareAccountId ?? undefined,
                cloudflareWorkerTag: input.repository.cloudflareWorkerTag ?? undefined,
            },
        }
        const run = this.deps.fetchProviderLog ?? fetchProviderLog

        try {
            const result = await run(request)
            return toProviderLogRecord(result, now)
        } catch (error) {
            // 引擎内部已捕获 HTTP / 超时；此处兜住未预期异常，保证不向轮询链路抛错
            console.warn(`[provider-log] ${provider} 日志采集异常（降级为不可用）：`, error)
            return { available: false, provider, reason: 'http_error', fetchedAt: now.toISOString() }
        }
    }
}

/**
 * 引擎结果 → 持久化记录（可用结果保留 tail / truncated，不可用结果保留 reason / status）。
 */
export const toProviderLogRecord = (result: ProviderLogResult, now: Date): ProviderLogRecord => {
    const fetchedAt = now.toISOString()
    if (result.available) {
        return {
            available: true,
            provider: result.provider,
            tail: result.tail,
            truncated: result.truncated,
            fetchedAt,
        }
    }
    return {
        available: false,
        provider: result.provider,
        reason: result.reason,
        ...(typeof result.status === 'number' ? { status: result.status } : {}),
        fetchedAt,
    }
}
