import { notifyEnvEvent } from './notification'
import type { NotificationEvent } from './notification/channel'
import type { resolveScanRunState } from './scan-run-state'
import { AuditEvent, type AuditEventType } from '#server/entities/audit-event'
import { ensureDatabaseInitialized } from '#server/database'
import { logger } from '#server/utils/logger'
import type { ScanRun } from '#server/entities/scan-run'

/**
 * 环境事件审计：执行器 / 执行环境异常时落 AuditEvent + fire-and-forget 通知。
 *
 * 触发场景（与「运行失败分类」边界见 audit-event.ts 类型注释）：
 * - A 场景（sandbox 启动降级）→ sandbox_degraded / warn
 * - fix 类出站策略偏离（策略缺失 / clone 基地址未命中白名单，执行器执行前拒绝）→ sandbox_egress_blocked / warn
 * - B 场景（sandbox 运行时失败）→ sandbox_unavailable / error
 * - C 场景（container 执行器环境不可用）→ container_unavailable / error
 *
 * 通知策略：配置偏离类（`sandbox_egress_blocked`）只落库、不发通知（`notificationSuppressed`）；
 * 启动降级（A）与环境事故（B / C）照常通知。
 *
 * 单次运行结果类错误（execution_timeout / clone_timeout / execution_failed 等）
 * 不在此落事件——它们由 failure_code / failure_stage / failure_kind 承载。
 *
 * 设计要点：
 * - 不抛错（fail-closed）：审计失败仅日志，不影响扫描主流程
 * - 通知 fire-and-forget：notifyEnvEvent 内部已捕获 channel 异常 + 按类型策略判定（policy.ts）
 * - A 场景沙箱降级但业务结果完整（degraded），B / C 场景环境不可用（failed）
 */
export async function recordEnvAuditEvent(
    persistedRun: ScanRun,
    decision: ReturnType<typeof resolveScanRunState>,
    degradedReason: { code: string, message: string } | undefined,
    error: { code: string, message: string } | undefined,
): Promise<void> {
    let eventType: AuditEventType | null = null
    let severity: 'info' | 'warn' | 'error' | 'critical' = 'warn'
    let payload: Record<string, unknown> = {}

    if (decision.status === 'degraded' && degradedReason?.code === 'sandbox_unavailable') {
        // sandbox 启动时不可用，已自动降级 ContainerExecutor（业务完整，环境信号保留通知）
        eventType = 'sandbox_degraded'
        severity = 'warn'
        payload = { degradedReason, fallback: 'container', notificationSuppressed: false }
    } else if (decision.status === 'failed'
        && (error?.code === 'sandbox_fix_requires_egress_policy' || error?.code === 'sandbox_clone_host_not_allowed')) {
        // fix 类出站策略偏离（审计关闭 / 白名单被清空 / clone 基地址未命中白名单）：执行器执行前拒绝——
        // 属配置偏离而非运行事故，用专用事件类型（不与「降级」语义混淆）
        eventType = 'sandbox_egress_blocked'
        severity = 'warn'
        payload = { code: error.code, message: error.message, fallback: 'none', notificationSuppressed: true }
    } else if (decision.status === 'failed' && error?.code === 'container_unavailable') {
        // C 场景：container 执行器环境不可用（工作根不可写 / 磁盘满 / 只读 FS）——默认部署下的环境健康信号
        eventType = 'container_unavailable'
        severity = 'error'
        payload = { code: error.code, executor: 'container', message: error.message }
    } else if (decision.status === 'failed' && error?.code === 'sandbox_unavailable') {
        // B 场景：sandbox 运行时偶发故障，不静默降级（避免掩盖真实错误）
        eventType = 'sandbox_unavailable'
        severity = 'error'
        // payload 包含 errno + code + adapter + message 便于事故溯源
        // adapter 当前固定 docker（唯一已实现的 RuntimeAdapter；未来加 sysbox/kata 时按 executor 注入）
        payload = {
            errno: error.code,
            code: error.code,
            adapter: 'docker',
            message: error.message,
        }
    }

    if (!eventType) {
        return
    }

    try {
        const ds = await ensureDatabaseInitialized()
        const eventRepo = ds.getRepository(AuditEvent)
        const audit = await eventRepo.save(eventRepo.create({
            type: eventType,
            severity,
            repositoryId: persistedRun.repositoryId,
            scanRunId: persistedRun.id,
            payloadJson: JSON.stringify(payload),
            notified: false,
            notifiedVia: null,
        }))

        // 触发通知（fire-and-forget，不 await，避免阻塞扫描主流程）
        // 出站策略缺失（预期配置状态）只落库、不通知；启动不可用与环境事故仍照常通知。
        if (payload.notificationSuppressed === true) {
            return
        }
        const notificationEvent: NotificationEvent = {
            id: audit.id,
            type: eventType,
            severity,
            message: (payload.degradedReason as { message?: string } | undefined)?.message
                ?? (payload.message as string | undefined)
                ?? `${eventType} for ${persistedRun.repositoryId}`,
            scanRunId: persistedRun.id,
            payload,
            createdAt: audit.createdAt,
        }
        // 异步触发：失败由 notifyEnvEvent 内部捕获（fail-closed）
        notifyEnvEvent(notificationEvent).catch((e) => {
            logger.error(`[scan-orchestrator] notifyEnvEvent fire-and-forget failed for audit ${audit.id}`, { error: e })
        })
    } catch (e) {
        logger.error('[scan-orchestrator] failed to record env audit event', { error: e })
    }
}

