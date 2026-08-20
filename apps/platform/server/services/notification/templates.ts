/**
 * 环境事件邮件模板（apps/platform/server/services/notification/templates.ts）。
 *
 * 设计动机：auth 邮件模板已存在，但环境告警邮件（sandbox_unavailable / sandbox_degraded）
 * 需要独立的视觉风格与字段集合（关联仓库 / 错误码 / 建议动作）。
 *
 * 双语支持（zh-CN 默认 + en-US）：与平台 i18n 一致；调用方按 user.locale 或 env 注入。
 *
 * 视觉：inline style + 简洁表格（与 auth 邮件模板同源，邮件客户端兼容性最好）；
 * 严重级别颜色用色块（critical 红 / error 橙 / warn 黄 / info 蓝）。
 */

export type NotificationLocale = 'zh-CN' | 'en-US'

export const DEFAULT_NOTIFICATION_LOCALE: NotificationLocale = 'zh-CN'

export interface EnvAlertTemplateData {
    /** 事件类型（如 sandbox_unavailable） */
    type: string
    /** 严重级别（驱动色块颜色） */
    severity: 'info' | 'warn' | 'error' | 'critical'
    /** 关联仓库 owner/name */
    repository?: string
    /** 关联 scan run id */
    scanRunId?: string
    /** 事件 message（人类可读） */
    message: string
    /** 事件发生时间（ISO string） */
    createdAt: string
}

export interface RenderedEnvAlert {
    subject: string
    html: string
    text: string
}

interface LocaleStrings {
    subjectPrefix: Record<EnvAlertTemplateData['severity'], string>
    title: string
    severityLabel: Record<EnvAlertTemplateData['severity'], string>
    typeLabel: string
    repositoryLabel: string
    scanRunLabel: string
    messageLabel: string
    timeLabel: string
    footer: string
}

const SEVERITY_COLOR: Record<EnvAlertTemplateData['severity'], string> = {
    critical: '#dc2626', // red-600
    error: '#ea580c', // orange-600
    warn: '#ca8a04', // yellow-600
    info: '#2563eb', // blue-600
}

const LOCALES: Record<NotificationLocale, LocaleStrings> = {
    'zh-CN': {
        subjectPrefix: {
            critical: '[严重] 环境告警',
            error: '[错误] 环境告警',
            warn: '[警告] 环境告警',
            info: '[提示] 环境告警',
        },
        title: 'Dependfix 环境变化告警',
        severityLabel: {
            critical: '严重',
            error: '错误',
            warn: '警告',
            info: '提示',
        },
        typeLabel: '事件类型',
        repositoryLabel: '关联仓库',
        scanRunLabel: '扫描运行',
        messageLabel: '详情',
        timeLabel: '发生时间',
        footer: '此邮件由 Dependfix 平台自动发送。请登录平台查看完整事件列表与建议处理动作。',
    },
    'en-US': {
        subjectPrefix: {
            critical: '[Critical] Env Alert',
            error: '[Error] Env Alert',
            warn: '[Warn] Env Alert',
            info: '[Info] Env Alert',
        },
        title: 'Dependfix Environment Alert',
        severityLabel: {
            critical: 'Critical',
            error: 'Error',
            warn: 'Warning',
            info: 'Info',
        },
        typeLabel: 'Event Type',
        repositoryLabel: 'Repository',
        scanRunLabel: 'Scan Run',
        messageLabel: 'Details',
        timeLabel: 'Occurred At',
        footer: 'This email is sent automatically by the Dependfix platform. Please log in to view the full event list and recommended actions.',
    },
}

/**
 * 渲染环境告警邮件模板。
 */
export function renderEnvAlertTemplate(data: EnvAlertTemplateData, locale: NotificationLocale = DEFAULT_NOTIFICATION_LOCALE): RenderedEnvAlert {
    const strings = LOCALES[locale]
    const color = SEVERITY_COLOR[data.severity]
    const subject = `${strings.subjectPrefix[data.severity]} ${data.type} ${data.repository ? `(${data.repository})` : ''}`

    const repoRow = data.repository
        ? `<tr><td style="padding: 8px; font-weight: 600;">${strings.repositoryLabel}</td><td style="padding: 8px;">${escapeHtml(data.repository)}</td></tr>`
        : ''
    const runRow = data.scanRunId
        ? `<tr><td style="padding: 8px; font-weight: 600;">${strings.scanRunLabel}</td><td style="padding: 8px; font-family: monospace;">${escapeHtml(data.scanRunId)}</td></tr>`
        : ''

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #334155;">
    <div style="border-left: 4px solid ${color}; padding-left: 16px; margin-bottom: 24px;">
        <h2 style="margin: 0; font-size: 20px;">${escapeHtml(strings.title)}</h2>
        <p style="margin: 8px 0 0; color: ${color}; font-weight: 600;">${escapeHtml(strings.severityLabel[data.severity])}</p>
    </div>
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
        <tr><td style="padding: 8px; font-weight: 600; width: 120px;">${escapeHtml(strings.typeLabel)}</td><td style="padding: 8px; font-family: monospace;">${escapeHtml(data.type)}</td></tr>
        ${repoRow}
        ${runRow}
        <tr><td style="padding: 8px; font-weight: 600;">${escapeHtml(strings.messageLabel)}</td><td style="padding: 8px;">${escapeHtml(data.message)}</td></tr>
        <tr><td style="padding: 8px; font-weight: 600;">${escapeHtml(strings.timeLabel)}</td><td style="padding: 8px;">${escapeHtml(data.createdAt)}</td></tr>
    </table>
    <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;">
    <p style="font-size: 12px; color: #94a3b8;">${escapeHtml(strings.footer)}</p>
</body>
</html>`.trim()

    const text = [
        `${strings.title} [${strings.severityLabel[data.severity]}]`,
        '',
        `${strings.typeLabel}: ${data.type}`,
        data.repository ? `${strings.repositoryLabel}: ${data.repository}` : '',
        data.scanRunId ? `${strings.scanRunLabel}: ${data.scanRunId}` : '',
        `${strings.messageLabel}: ${data.message}`,
        `${strings.timeLabel}: ${data.createdAt}`,
        '',
        strings.footer,
    ].filter(Boolean).join('\n')

    return { subject, html, text }
}

/** HTML 转义（防 XSS） */
function escapeHtml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
}
