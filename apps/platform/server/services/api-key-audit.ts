import type { DataSource } from 'typeorm'
import { AuditEvent, type AuditEventType } from '#server/entities/audit-event'

/**
 * 登记组织级只读 API key 的创建 / 吊销审计。
 *
 * 背景：`dfk_` key 是 v1 只读面与 MCP remote 的唯一凭据；创建与吊销属凭据生命周期变更，
 * 必须可追溯（口径见 [platform-public-api.md §5](../../../../docs/design/governance/platform-public-api.md)）。
 *
 * 设计要点：
 * - 与 credential-audit / repository-audit 同策略：**审计失败仅日志，不抛错**，避免 key 已落库但接口 500
 * - severity 固定 info（正常运维配置变更）
 * - payload 只含 `action` / `keyId` / `keyName` / `keyPrefix`：**不得包含明文、哈希或完整 key**
 */

export type ApiKeyAuditAction = 'created' | 'deleted'

const AUDIT_TYPE: Record<ApiKeyAuditAction, AuditEventType> = {
    created: 'api_key_created',
    deleted: 'api_key_deleted',
}

export interface ApiKeyAuditParams {
    action: ApiKeyAuditAction
    keyId: string
    keyName: string
    keyPrefix: string
}

export const recordApiKeyAudit = async (ds: DataSource, params: ApiKeyAuditParams): Promise<void> => {
    try {
        const auditRepo = ds.getRepository(AuditEvent)
        await auditRepo.save(auditRepo.create({
            type: AUDIT_TYPE[params.action],
            severity: 'info',
            repositoryId: null,
            scanRunId: null,
            payloadJson: JSON.stringify({
                action: params.action,
                keyId: params.keyId,
                keyName: params.keyName,
                keyPrefix: params.keyPrefix,
            }),
            notified: false,
            notifiedVia: null,
        } as AuditEvent))
    } catch (error) {
        console.error('[api-key][audit] failed to record audit event:', error)
    }
}
