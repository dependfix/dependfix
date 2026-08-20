/**
 * 通知渠道接口（apps/platform/server/services/notification/channel.ts）。
 *
 * 设计动机：用户决策仅邮件实现，其他渠道（Slack/Webhook）留接口后续接入。
 * `NotificationChannel` 接口 + 注册表 `notificationChannels` 实现可扩展性：
 * - 当前仅注册 `EmailNotificationChannel`（复用 mailer service）
 * - Slack/Webhook 等占位 `register('slack', new SlackStubChannel())` 不实际发送（isAvailable()=false）
 * - 后续接入时新建实现类并注册即可，无需修改调用方
 *
 * fail-closed 语义：
 * - channel 不可用（isAvailable()=false）→ 静默跳过，不抛错（与 mailer service 一致）
 * - channel 发送失败 → 抛 NotificationError，由调用方决定重试/降级
 * - 调用方（scan-orchestrator）fire-and-forget：异常仅日志，不阻塞扫描流程
 */

/** 受信任通知 locale（白名单解析，避免任意 locale 字符串注入） */
export type SupportedLocale = 'zh-CN' | 'en-US'

/** locale 解析白名单（用于从 env 字符串解析） */
const SUPPORTED_LOCALES: readonly SupportedLocale[] = ['zh-CN', 'en-US'] as const

/**
 * 从字符串解析 locale；不在白名单内回退 zh-CN（RG-B07：避免任意 locale 字符串导致模板 fallback 失败）。
 */
export function parseSupportedLocale(value: string | undefined): SupportedLocale {
    if (value && (SUPPORTED_LOCALES as readonly string[]).includes(value)) {
        return value as SupportedLocale
    }
    return 'zh-CN'
}

/** 通知事件：环境/容器审计事件（与 AuditEvent 实体对齐） */
export interface NotificationEvent {
    /** 事件 id（关联 AuditEvent） */
    id: string
    /** 事件类型 */
    type: string
    /** 严重级别 */
    severity: 'info' | 'warn' | 'error' | 'critical'
    /** 人类可读消息（用于邮件模板详情字段） */
    message: string
    /** 关联仓库（owner/name） */
    repository?: string
    /** 关联 scan run id */
    scanRunId?: string
    /** 事件原始 payload（degradedReason / errno 等） */
    payload?: Record<string, unknown>
    /** 事件发生时间 */
    createdAt: Date
    /** 通知 locale（RG-B07：双语邮件按收件人偏好；缺省 zh-CN） */
    locale?: SupportedLocale
}

/** 渠道发送结果 */
export interface NotificationResult {
    /** 是否真正投递（false = noop 降级） */
    delivered: boolean
    /** 渠道名（email / slack / webhook 等） */
    channel: string
    /** 渠道返回的 messageId（邮件为 nodemailer messageId；slack 为 webhook response id；webhook 无） */
    messageId?: string
}

/** 通知错误（发送失败 / 模板渲染失败等） */
export class NotificationError extends Error {
    constructor(
        public readonly code: 'NOTIFICATION_CHANNEL_UNAVAILABLE' | 'NOTIFICATION_SEND_FAILED' | 'NOTIFICATION_TEMPLATE_INVALID',
        message: string,
        public override readonly cause?: unknown,
    ) {
        super(message)
        this.name = 'NotificationError'
    }
}

/**
 * 通知渠道接口。
 * - `name`：渠道标识（email / slack / webhook 等）
 * - `isAvailable()`：渠道是否可用（SMTP 未配置 → email false；slack 占位 false）
 * - `send()`：发送事件；不可用时静默跳过（return { delivered: false }），失败时抛 NotificationError
 */
export interface NotificationChannel {
    readonly name: string
    isAvailable(): boolean
    send(event: NotificationEvent, recipients: string[]): Promise<NotificationResult>
}
