/**
 * 通知渠道注册表 + 便捷 API（apps/platform/server/services/notification/index.ts）。
 *
 * 设计要点：
 * - 单例注册表：notificationChannels 暴露所有已注册渠道
 * - fire-and-forget API（`notifyEnvEvent`）：异常仅日志，不阻塞调用方（scan-orchestrator）
 * - 收件人解析：resolveNotificationRecipients() 默认 org admin 全员 + env 覆盖
 * - 多渠道并发：当前仅 email 注册；后续 slack/webhook 接入时加 channel 名分发逻辑
 *
 * 失败语义：
 * - 任一 channel.send() 失败 → 记录日志 + 更新 audit_event.notified=false（不抛错）
 * - 后续审计事件列表可按 notified=false 过滤 + 重试（不在本批次范围）
 */

import { EmailNotificationChannel } from './email-channel'
import { SlackStubChannel, WebhookStubChannel } from './stub-channels'
import { resolveNotificationRecipients } from './notification-recipients'
import { NotificationError, type NotificationChannel, type NotificationEvent } from './channel'
import { ensureDatabaseInitialized } from '#server/database'
import { AuditEvent } from '#server/entities/audit-event'

const channels = new Map<string, NotificationChannel>()

/** 注册渠道（重复注册抛错，避免覆盖） */
export const registerNotificationChannel = (channel: NotificationChannel): void => {
    if (channels.has(channel.name)) {
        throw new Error(`Notification channel '${channel.name}' already registered`)
    }
    channels.set(channel.name, channel)
}

/** 注销渠道（测试用） */
export const unregisterNotificationChannel = (name: string): void => {
    channels.delete(name)
}

/** 列出所有已注册渠道 */
export const listNotificationChannels = (): NotificationChannel[] => Array.from(channels.values())

/**
 * fire-and-forget 通知入口：
 * 1. 解析收件人（admin 邮箱 / env 覆盖）
 * 2. 遍历已注册渠道：可用 → send；不可用 → skip
 * 3. 任一异常仅日志 + 更新 audit_event.notified=false，不抛错阻塞调用方
 *
 * 注意：本批次仅实现 EmailNotificationChannel，其他渠道（Slack/Webhook）留接口待后续接入。
 */
export const notifyEnvEvent = async (event: NotificationEvent): Promise<void> => {
    const recipients = await resolveNotificationRecipients()
    if (recipients.length === 0) {
        console.warn(`[notification] no recipients configured for event ${event.id}; skip`)
        await markNotified(event.id, false, null)
        return
    }

    for (const channel of channels.values()) {
        try {
            if (!channel.isAvailable()) {
                console.warn(`[notification] channel '${channel.name}' unavailable; skip event ${event.id}`)
                continue
            }
            const result = await channel.send(event, recipients)
            await markNotified(event.id, result.delivered, channel.name)
        } catch (e) {
            // fail-closed：异常仅日志，不阻塞扫描流程
            const code = e instanceof NotificationError ? e.code : 'NOTIFICATION_SEND_FAILED'
            console.error(`[notification] channel '${channel.name}' send failed for event ${event.id} (${code}):`, e)
            await markNotified(event.id, false, channel.name)
        }
    }
}

/** 更新 AuditEvent 通知状态（best-effort，失败仅日志） */
async function markNotified(eventId: string, delivered: boolean, channelName: string | null): Promise<void> {
    try {
        const ds = await ensureDatabaseInitialized()
        await ds.getRepository(AuditEvent).update(eventId, {
            notified: delivered,
            notifiedVia: channelName,
        })
    } catch (e) {
        console.error(`[notification] failed to update audit_event ${eventId} notified status:`, e)
    }
}

// 初始化默认渠道（模块加载时执行一次）
let initialized = false
export const ensureNotificationChannelsRegistered = (): void => {
    if (initialized) {
        return
    }
    initialized = true
    registerNotificationChannel(new EmailNotificationChannel())
    // 接口预留：Slack / Webhook 占位注册（isAvailable()=false，不实际发送）
    // 后续接入时：替换为真实实现类 + 在 isAvailable() 中读取配置 + 实现 send()
    registerNotificationChannel(new SlackStubChannel())
    registerNotificationChannel(new WebhookStubChannel())
}

ensureNotificationChannelsRegistered()
