import type { DataSource } from 'typeorm'
import { AuditEvent } from '#server/entities/audit-event'
import { PROVIDER_LOG_CREDENTIAL_TYPES, type CredentialType } from '#server/entities/credential'

/**
 * 登记组织级 provider 只读凭据的创建 / 更新 / 删除审计。
 *
 * 背景：`vercel-token` / `cloudflare-token` 是 PR Check 失败日志富化（Layer 5）的凭据面扩张，
 * 用途限定为只读拉取日志；一旦被替换成写权限 token，影响面不再局限于展示，故写入必须留痕
 * （口径见 [pr-build-deploy-signals.md §3.12](../../../../docs/design/governance/pr-build-deploy-signals.md)）。
 *
 * 设计要点：
 * - 与 repository-audit / scan-orchestrator 同策略：**审计失败仅日志，不抛错**——避免「凭据已落库但接口 500」
 * - severity 固定 info（正常运维配置变更）
 * - payload 只含 `action` / `credentialId` / `providerType`：**不得包含 token、密文或 ownerLogin**
 */

/** provider 日志凭据类型（`CredentialType` 的 provider 分支；单一事实源在实体枚举） */
export type ProviderLogCredentialType = Extract<CredentialType, 'vercel-token' | 'cloudflare-token'>

/** 判定凭据类型是否属于 provider 日志富化面（其它类型不产生本类审计） */
export const isProviderLogCredentialType = (type: string | null | undefined): type is ProviderLogCredentialType =>
    typeof type === 'string' && (PROVIDER_LOG_CREDENTIAL_TYPES as readonly string[]).includes(type)

export type ProviderLogCredentialAuditAction = 'created' | 'updated' | 'deleted'

export interface ProviderLogCredentialAuditParams {
    action: ProviderLogCredentialAuditAction
    credentialId: string
    providerType: ProviderLogCredentialType
}

export const recordProviderLogCredentialAudit = async (
    ds: DataSource,
    params: ProviderLogCredentialAuditParams,
): Promise<void> => {
    try {
        const auditRepo = ds.getRepository(AuditEvent)
        await auditRepo.save(auditRepo.create({
            type: 'provider_log_credential_update',
            severity: 'info',
            repositoryId: null,
            scanRunId: null,
            payloadJson: JSON.stringify({
                action: params.action,
                credentialId: params.credentialId,
                providerType: params.providerType,
            }),
            notified: false,
            notifiedVia: null,
        } as AuditEvent))
    } catch (error) {
        console.error('[credentials][provider_log_credential_update] failed to record audit event:', error)
    }
}
