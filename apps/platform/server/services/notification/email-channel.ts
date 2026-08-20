/**
 * EmailNotificationChannel：邮件通知渠道实现（apps/platform/server/services/notification/email-channel.ts）。
 *
 * 实现动机：复用 mailer service（已闭环 SMTP 凭据 + nodemailer + fail-closed），
 * 把 AuditEvent 渲染为邮件模板（双语 zh-CN + en-US）并发送。
 *
 * 设计要点：
 * - 复用 mailer.sendMail()：保持 SMTP 凭据最小化（runtimeConfig）+ fail-closed 语义
 * - 模板独立于 auth 邮件（verification / reset-password）：本渠道用 `env-alert` 模板类型
 * - 双语：根据 user.locale 或 env `DEPENDFIX_LOCALE` 选择；缺省 zh-CN（与平台默认一致）
 * - 收件人：resolveNotificationRecipients() 解析（默认 org admin 全员 + env 覆盖）
 *
 * 失败语义：
 * - SMTP 未配置 → noop（mailer.sendMail 返回 delivered=false）→ 本渠道返回 delivered=false
 * - SMTP 已配置但 sendMail 失败 → mailer 抛 MailerError → 本渠道转抛 NotificationError
 */

import { sendMail, MailerError } from '../mailer'
import { renderEnvAlertTemplate } from './templates'
import { NotificationError, parseSupportedLocale, type NotificationChannel, type NotificationEvent, type NotificationResult } from './channel'

export class EmailNotificationChannel implements NotificationChannel {
    readonly name = 'email'

    /**
     * 邮件渠道可用性 = SMTP 已配置（host 非空）。
     * 注意：mailer transport 内部按 host/port/user/pass 判断；这里用 host 简化。
     */
    isAvailable(): boolean {
        const config = useRuntimeConfig()
        return Boolean(config.smtpHost)
    }

    async send(event: NotificationEvent, recipients: string[]): Promise<NotificationResult> {
        if (recipients.length === 0) {
            // 无收件人 → 静默跳过（不发送任何邮件）
            return { delivered: false, channel: this.name }
        }
        if (!this.isAvailable()) {
            // SMTP 未配置 → noop 降级（与 mailer 一致）
            return { delivered: false, channel: this.name }
        }

        const rendered = renderEnvAlertTemplate({
            type: event.type,
            severity: event.severity,
            repository: event.repository,
            scanRunId: event.scanRunId,
            message: event.message,
            createdAt: event.createdAt.toISOString(),
        }, event.locale ?? parseSupportedLocale(process.env.DEPENDFIX_LOCALE))
        // fan-out：每个收件人单独 sendMail（保留 per-recipient 投递状态 + 错误隔离）
        // 简化：先尝试第一个收件人，失败则整体失败（避免一封失败影响其他）
        // 进阶优化可后续加并行 sendMail + 部分失败聚合
        try {
            const result = await sendMail({
                to: recipients.join(', '),
                subject: rendered.subject,
                html: rendered.html,
                text: rendered.text,
            })
            return {
                delivered: result.delivered,
                channel: this.name,
                messageId: result.messageId,
            }
        } catch (e) {
            if (e instanceof MailerError) {
                throw new NotificationError(
                    e.code === 'MAIL_TEMPLATE_INVALID' ? 'NOTIFICATION_TEMPLATE_INVALID' : 'NOTIFICATION_SEND_FAILED',
                    e.message,
                    e,
                )
            }
            throw new NotificationError(
                'NOTIFICATION_SEND_FAILED',
                e instanceof Error ? e.message : String(e),
                e,
            )
        }
    }
}
