/**
 * 通知渠道注册表 + 平台事件 fire-and-forget 入口。
 *
 * 业务通知统一入口见 `delivery.ts#dispatchNotification`；本文件保留 `notifyEnvEvent`
 * 的平台事件语义（audit_event.notified + 渠道循环），并补投递记录 / 每小时上限。
 */
import { MoreThanOrEqual, Not } from 'typeorm'
import { shouldNotifyEnvEvent } from './policy'
import { NotificationError, type NotificationEvent } from './channel'
import { listNotificationChannels, ensureNotificationChannelsRegistered } from './registry'
import { buildPlatformDeliveryKey, isNotificationThrottled } from './dedupe'
import { loadOrganizationNotificationSettings, reclaimStaleSendingLog, recordNotificationLog, updateNotificationLog } from './delivery'
import { resolveNotificationRecipients } from './recipients'
import { renderEnvAlertTemplate } from './templates'
import { isDeploymentNotificationEnabled } from './preferences'
import { NotificationLog } from '#server/entities/notification-log'
import { AuditEvent } from '#server/entities/audit-event'
import { ensureDatabaseInitialized } from '#server/database'
import { logger } from '#server/utils/logger'
import { captureLifecycleError } from '#server/utils/observability'

export { ensureNotificationChannelsRegistered, listNotificationChannels, registerNotificationChannel, unregisterNotificationChannel } from './registry'

const isUniqueViolation = (error: unknown): boolean => {
    const code = (error as { code?: string })?.code ?? ''
    const message = error instanceof Error ? error.message : String(error)
    return code === 'SQLITE_CONSTRAINT_UNIQUE'
        || code === '23505'
        || code === 'ER_DUP_ENTRY'
        || message.includes('UNIQUE constraint failed')
        || message.includes('duplicate key value')
}

/**
 * 平台事件通知（必选类别，仅受部署总开关约束）：
 * - 策略白名单 → 收件人（env 覆盖 / 管理员）→ 每小时上限 → 渠道循环
 * - 每条 AuditEvent 幂等键 `platform:<id>:<channel>`；渠道不可用记 noop
 * - 异常仅日志 + audit_event.notified=false，不阻塞扫描
 */
export const notifyEnvEvent = async (event: NotificationEvent): Promise<void> => {
    if (!shouldNotifyEnvEvent(event.type)) {
        logger.warn(`[notification] event type '${event.type}' is audit-only; skip notify for event ${event.id}`)
        return
    }

    if (!isDeploymentNotificationEnabled()) {
        await recordNotificationLog({
            deliveryKey: null,
            category: 'platform_incident',
            scopeType: 'platform',
            scopeId: event.id,
            channel: 'email',
            fingerprint: null,
            recipients: [],
            status: 'noop',
        })
        await markNotified(event.id, false, null)
        return
    }

    const { settings } = await loadOrganizationNotificationSettings()
    const recipients = await resolveNotificationRecipients({
        category: 'platform_incident',
        settings,
    })
    if (recipients.length === 0) {
        logger.warn(`[notification] no recipients configured for event ${event.id}; skip`)
        await recordNotificationLog({
            deliveryKey: null,
            category: 'platform_incident',
            scopeType: 'platform',
            scopeId: event.id,
            channel: 'email',
            fingerprint: null,
            recipients: [],
            status: 'skipped_no_recipient',
        })
        await markNotified(event.id, false, null)
        return
    }

    const ds = await ensureDatabaseInitialized()
    const sentInLastHour = await ds.getRepository(NotificationLog).count({
        where: {
            status: 'sent',
            // 周报逐封写入的 sent 行不占用平台事件的共享上限
            category: Not('weekly_digest'),
            createdAt: MoreThanOrEqual(new Date(Date.now() - 3_600_000)),
        },
    })
    if (isNotificationThrottled(sentInLastHour, settings.maxPerHour)) {
        await recordNotificationLog({
            deliveryKey: null,
            category: 'platform_incident',
            scopeType: 'platform',
            scopeId: event.id,
            channel: 'email',
            fingerprint: null,
            recipients: recipients.map((recipient) => recipient.email),
            status: 'skipped_throttled',
        })
        await markNotified(event.id, false, null)
        return
    }

    const emails = recipients.map((recipient) => recipient.email)
    const rendered = renderEnvAlertTemplate({
        type: event.type,
        severity: event.severity,
        repository: event.repository,
        scanRunId: event.scanRunId,
        message: event.message,
        createdAt: event.createdAt.toISOString(),
    }, event.locale ?? 'zh-CN')

    for (const channel of listNotificationChannels()) {
        if (!channel.isAvailable()) {
            await recordNotificationLog({
                deliveryKey: null,
                category: 'platform_incident',
                scopeType: 'platform',
                scopeId: event.id,
                channel: channel.name,
                fingerprint: null,
                recipients: emails,
                status: 'noop',
            })
            continue
        }
        let log: NotificationLog | null = null
        try {
            const platformKey = channel.name === 'email'
                ? buildPlatformDeliveryKey(event.id)
                : `${buildPlatformDeliveryKey(event.id)}:${channel.name}`
            await reclaimStaleSendingLog(platformKey)
            log = await recordNotificationLog({
                deliveryKey: platformKey,
                category: 'platform_incident',
                scopeType: 'platform',
                scopeId: event.id,
                channel: channel.name,
                fingerprint: null,
                recipients: emails,
                status: 'sending',
            })
            if (!log) {
                continue
            }
            const result = channel.sendMessage
                ? await channel.sendMessage(rendered, emails)
                : await channel.send(event, emails)
            if (result.delivered) {
                await updateNotificationLog(log, { status: 'sent', sentAt: new Date() })
            } else {
                await updateNotificationLog(log, { status: 'noop', deliveryKey: null })
            }
            await markNotified(event.id, result.delivered, channel.name)
        } catch (e) {
            const code = e instanceof NotificationError ? e.code : 'NOTIFICATION_SEND_FAILED'
            logger.error(`[notification] channel '${channel.name}' send failed for event ${event.id} (${code})`, { error: e })
            // 可观测性通道：通知投递失败（渠道故障 / 凭据失效）上报异常事件；
            // DSN 未配置时为 no-op，不改变既有通知日志与审计语义
            captureLifecycleError(e, {
                source: 'notification',
                eventId: event.id,
                channel: channel.name,
                code,
            })
            if (isUniqueViolation(e)) {
                await recordNotificationLog({
                    deliveryKey: null,
                    category: 'platform_incident',
                    scopeType: 'platform',
                    scopeId: event.id,
                    channel: channel.name,
                    fingerprint: null,
                    recipients: emails,
                    status: 'skipped_duplicate',
                })
                // 重复键说明其他进程已占位 / 已投递：不要降级 audit 的 notified 状态
            } else {
                await updateNotificationLog(log, {
                    status: 'failed',
                    deliveryKey: null,
                    errorMessage: e instanceof Error ? e.message.slice(0, 500) : String(e).slice(0, 500),
                })
                await markNotified(event.id, false, channel.name)
            }
        }
    }
}

/** 更新 AuditEvent 通知状态（best-effort，失败仅日志）。 */
async function markNotified(eventId: string, delivered: boolean, channelName: string | null): Promise<void> {
    try {
        const ds = await ensureDatabaseInitialized()
        await ds.getRepository(AuditEvent).update(eventId, {
            notified: delivered,
            notifiedVia: channelName,
        })
    } catch (e) {
        logger.error(`[notification] failed to update audit_event ${eventId} notified status`, { error: e })
    }
}

ensureNotificationChannelsRegistered()
