import { createMailerTransport } from './transport'
import { renderTemplate, DEFAULT_LOCALE, type MailTemplateKind, type MailLocale, type MailTemplateData, type RenderedTemplate } from './templates'

/**
 * 邮件发送统一接口（mailer service 入口）。
 *
 * 设计要点：
 * - 三层降级：transport 未配置 → noop（log + 返回 delivered=false）；transport 失败 → 抛 AppError（fail-closed）
 * - SMTP 凭据（pass）仅从 `useRuntimeConfig()` 读取；不暴露任何 SMTP 错误细节给 caller（避免泄露内部配置）
 * - 调用方：apps/platform/server/utils/auth.ts 的 sendVerificationEmail / sendResetPassword / sendChangeEmailConfirmation
 *
 * fail-closed 语义：
 * - SMTP 未配置 → noop：better-auth 邮件回调链路静默通过（保留 console.warn 观测点，便于部署前发现）
 * - SMTP 配置但 sendMail 失败 → throw：better-auth 捕获异常不阻塞流程，但日志详细记录（messageId 缺失 + 错误码）
 */

export interface SendMailParams {
    to: string
    subject: string
    html: string
    text: string
}

export interface SendMailResult {
    /** true = 邮件已投递到 SMTP server；false = noop 降级（SMTP 未配置） */
    delivered: boolean
    /** 'smtp' = 真实发送；'noop' = SMTP 未配置 */
    mode: 'smtp' | 'noop'
    /** nodemailer messageId（仅 mode='smtp' 时存在） */
    messageId?: string
}

/** mailer 错误（含 SMTP 投递失败、模板渲染失败等） */
export class MailerError extends Error {
    constructor(
        public readonly code: 'MAIL_SEND_FAILED' | 'MAIL_TEMPLATE_INVALID' | 'MAIL_NOT_CONFIGURED',
        message: string,
        // ES2022 起 Error 基类已含 `cause` 字段；子类需显式 override 以避免与基类冲突
        public override readonly cause?: unknown,
    ) {
        super(message)
        this.name = 'MailerError'
    }
}

/**
 * 发送邮件。
 *
 * @throws {MailerError('MAIL_TEMPLATE_INVALID')} 模板渲染失败（fail-closed：不发半成品）
 * @throws {MailerError('MAIL_SEND_FAILED')} SMTP 投递失败（fail-closed：日志记录但不暴露 SMTP 错误细节）
 */
export async function sendMail(params: SendMailParams): Promise<SendMailResult> {
    const config = useRuntimeConfig()
    const transport = createMailerTransport({
        host: config.smtpHost,
        port: config.smtpPort,
        user: config.smtpUser,
        pass: config.smtpPass,
    })

    if (!transport) {
        // SMTP 未配置：noop 降级（保留 console.warn 观测点）
        console.warn(`[mailer:noop] SMTP 未配置，邮件未发送：to=${params.to} subject=${params.subject}`)
        return { delivered: false, mode: 'noop' }
    }

    const from = config.smtpFrom || config.smtpUser || 'noreply@dependfix.local'

    try {
        const info = await transport.sendMail({
            from,
            to: params.to,
            subject: params.subject,
            html: params.html,
            text: params.text,
        })
        console.info(`[mailer:delivered] to=${params.to} subject=${params.subject} messageId=${info.messageId}`)
        return {
            delivered: true,
            mode: 'smtp',
            messageId: typeof info.messageId === 'string' ? info.messageId : undefined,
        }
    } catch (error) {
        // fail-closed：日志详细（含 cause，便于排障），抛 MailerError 给 caller
        // 注意：MailerError.message 仅含 to/subject 等非敏感字段，不透传 SMTP server 错误详情
        // （SMTP server 错误消息可能含客户端标识信息，避免进入应用日志/堆栈）
        console.error(`[mailer:failed] to=${params.to} subject=${params.subject}`, error)
        throw new MailerError(
            'MAIL_SEND_FAILED',
            `Failed to send email to ${params.to}`,
            error,
        )
    }
}

/**
 * 渲染模板并发送（auth 回调便捷方法）。
 *
 * @param locale 语言（默认 en-US；user 实体暂无 locale 字段，未来扩展）
 * @param kind 模板类型（verification / reset-password / change-email）
 * @param data 模板数据（email/url/expirationMinutes/appName 等）
 */
export async function sendTemplateMail(
    locale: MailLocale,
    kind: MailTemplateKind,
    data: MailTemplateData & { newEmail?: string },
): Promise<SendMailResult> {
    const effectiveLocale: MailLocale = locale ?? DEFAULT_LOCALE
    let rendered: RenderedTemplate
    try {
        rendered = renderTemplate(effectiveLocale, kind, data)
    } catch (error) {
        throw new MailerError(
            'MAIL_TEMPLATE_INVALID',
            error instanceof Error ? error.message : String(error),
            error,
        )
    }
    return sendMail({
        to: data.email,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
    })
}

// re-export 子模块接口（便于测试与扩展）
export { createMailerTransport, resetMailerTransportCache, type MailerTransport } from './transport'
export { renderTemplate, DEFAULT_LOCALE, type MailTemplateKind, type MailLocale, type MailTemplateData } from './templates'
