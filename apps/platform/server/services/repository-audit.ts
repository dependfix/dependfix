import type { DataSource } from 'typeorm'
import { AuditEvent } from '#server/entities/audit-event'

/**
 * 登记 Repository 自定义验证命令（verifyCommands）变更审计。
 *
 * 背景：verifyCommands 等价于「远程命令执行面」——容器执行器把命令原样交给引擎验证链
 * （`spawn(command, { shell: true })`，与 CLI `--commands` 语义一致），因此变更必须留痕。
 *
 * 设计要点：
 * - 与 scan-orchestrator 的 recordEnvAuditEvent 同策略：**审计失败仅日志，不抛错**——
 *   避免「变更已落库但接口 500」的读写不一致（仓库配置保存不应被审计副作用阻断）
 * - severity 固定 info（配置变更属正常运维信号，非异常事件）
 * - payload 记录前 / 后命令数组，便于回溯「谁把哪些命令加进了验证链」
 * - 由 API 层在「实际发生变化」（创建时非空 / 更新时与旧值不同）时调用，避免无变更噪声
 *
 * 设计口径见 docs/standards/platform.md §3.8（仓库级自定义验证命令）。
 */

export interface VerifyCommandsAuditParams {
    repositoryId: string
    owner: string
    name: string
    /** 变更前命令数组（创建场景为空数组） */
    previous: string[]
    /** 变更后命令数组 */
    next: string[]
}

export const recordVerifyCommandsAudit = async (
    ds: DataSource,
    params: VerifyCommandsAuditParams,
): Promise<void> => {
    try {
        const auditRepo = ds.getRepository(AuditEvent)
        await auditRepo.save(auditRepo.create({
            type: 'verify_commands_update',
            severity: 'info',
            repositoryId: params.repositoryId,
            scanRunId: null,
            payloadJson: JSON.stringify({
                repository: `${params.owner}/${params.name}`,
                previous: params.previous,
                next: params.next,
            }),
            notified: false,
            notifiedVia: null,
        } as AuditEvent))
    } catch (error) {
        console.error('[repos][verify_commands_update] failed to record audit event:', error)
    }
}

/**
 * 登记仓库级执行预算与超时变更审计。
 *
 * 口径见 [repo-execution-limits.md §8.2](../../../../docs/design/governance/repo-execution-limits.md)：
 * 与 verifyCommands 同策略——审计失败只日志、不阻断保存；仅在**实际发生变化**时登记。
 */
export interface ExecutionLimitsAuditParams {
    repositoryId: string
    owner: string
    name: string
    previous: ExecutionLimitsSnapshot
    next: ExecutionLimitsSnapshot
}

export interface ExecutionLimitsSnapshot {
    executionTimeoutMs: number | null
    verifyCommandTimeoutMs: number | null
    installTimeoutMs: number | null
    cloneTimeoutMs: number | null
}

export const recordExecutionLimitsAudit = async (
    ds: DataSource,
    params: ExecutionLimitsAuditParams,
): Promise<void> => {
    try {
        const auditRepo = ds.getRepository(AuditEvent)
        await auditRepo.save(auditRepo.create({
            type: 'execution_limits_update',
            severity: 'info',
            repositoryId: params.repositoryId,
            scanRunId: null,
            payloadJson: JSON.stringify({
                repository: `${params.owner}/${params.name}`,
                previous: params.previous,
                next: params.next,
            }),
            notified: false,
            notifiedVia: null,
        } as AuditEvent))
    } catch (error) {
        console.error('[repos][execution_limits_update] failed to record audit event:', error)
    }
}

/**
 * 登记仓库级跨大版本升级授权变更审计。
 *
 * 只在授权值实际变化时登记；策略变更影响交付语义（是否提交跨 major 升级），必须留痕。
 */
export interface MajorUpgradePolicyAuditParams {
    repositoryId: string
    owner: string
    name: string
    previous: boolean
    next: boolean
}

export const recordMajorUpgradePolicyAudit = async (
    ds: DataSource,
    params: MajorUpgradePolicyAuditParams,
): Promise<void> => {
    try {
        const auditRepo = ds.getRepository(AuditEvent)
        await auditRepo.save(auditRepo.create({
            type: 'major_upgrade_policy_update',
            severity: 'info',
            repositoryId: params.repositoryId,
            scanRunId: null,
            payloadJson: JSON.stringify({
                repository: `${params.owner}/${params.name}`,
                previous: params.previous,
                next: params.next,
            }),
            notified: false,
            notifiedVia: null,
        } as AuditEvent))
    } catch (error) {
        console.error('[repos][major_upgrade_policy_update] failed to record audit event:', error)
    }
}
