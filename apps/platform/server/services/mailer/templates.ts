/**
 * 邮件模板渲染（最小可用版）。
 *
 * 设计要点：
 * - 直接 string template（不引入 MJML/Handlebars 等模板引擎）——YAGNI 原则
 * - inline `<style>` + 简洁表格布局：邮件客户端兼容性最好；避免外部 CSS 加载失败
 * - 双语支持（en-US 默认激活；zh-CN 留扩展位与文案），未来从 user.locale 字段读取时无需重写
 * - 模板数据：email（用户邮箱）、url（better-auth 生成的链接）、expirationMinutes（过期分钟数）、appName（应用名）
 */

/** 支持的邮件类型 */
export type MailTemplateKind = 'verification' | 'reset-password' | 'change-email'

/** 支持的语言（初版仅 en-US 激活；zh-CN 留文案位） */
export type MailLocale = 'en-US' | 'zh-CN'

/** 默认语言（user 无 locale 字段时回退） */
export const DEFAULT_LOCALE: MailLocale = 'en-US'

export interface MailTemplateData {
    /** 收件人邮箱 */
    email: string
    /** better-auth 生成的链接（点击完成验证/重置/变更） */
    url: string
    /** 过期分钟数（better-auth 默认 1 小时） */
    expirationMinutes?: number
    /** 应用名（默认 dependfix） */
    appName?: string
}

export interface RenderedTemplate {
    subject: string
    html: string
    text: string
}

// ---------------------------------------------------------------------------
// 文案（en-US 主用；zh-CN 留扩展位）
// ---------------------------------------------------------------------------

interface LocaleStrings {
    subject: Record<MailTemplateKind, string>
    title: Record<MailTemplateKind, string>
    greeting: string
    body: Record<MailTemplateKind, string>
    button: Record<MailTemplateKind, string>
    fallbackHint: string
    expiration: (minutes: number) => string
    ignore: string
    footer: string
}

const EN_STRINGS: LocaleStrings = {
    subject: {
        verification: 'Verify your email address',
        'reset-password': 'Reset your password',
        'change-email': 'Confirm your new email address',
    },
    title: {
        verification: 'Welcome to {appName}',
        'reset-password': 'Password reset request',
        'change-email': 'Confirm email change',
    },
    greeting: 'Hi {email},',
    body: {
        verification: 'Thanks for signing up for {appName}! Please verify your email address by clicking the button below.',
        'reset-password': 'We received a request to reset the password for your {appName} account. Click the button below to choose a new password.',
        'change-email': 'You requested to change the email address on your {appName} account to {newEmail}. Click the button below to confirm the change.',
    },
    button: {
        verification: 'Verify email',
        'reset-password': 'Reset password',
        'change-email': 'Confirm new email',
    },
    fallbackHint: 'If the button does not work, paste this link into your browser:',
    expiration: (minutes) => `This link expires in ${minutes} minutes.`,
    ignore: 'If you didn\'t request this, you can safely ignore this email.',
    footer: '{appName} · Automated email, please do not reply.',
}

const ZH_STRINGS: LocaleStrings = {
    subject: {
        verification: '验证您的邮箱地址',
        'reset-password': '重置您的密码',
        'change-email': '确认您的新邮箱地址',
    },
    title: {
        verification: '欢迎使用 {appName}',
        'reset-password': '密码重置请求',
        'change-email': '确认邮箱变更',
    },
    greeting: '您好 {email}，',
    body: {
        verification: '感谢您注册 {appName}！请点击下方按钮验证您的邮箱地址。',
        'reset-password': '我们收到了重置您 {appName} 账户密码的请求。请点击下方按钮设置新密码。',
        'change-email': '您请求更换 {appName} 账户的邮箱地址至 {newEmail}。请点击下方按钮确认变更。',
    },
    button: {
        verification: '验证邮箱',
        'reset-password': '重置密码',
        'change-email': '确认新邮箱',
    },
    fallbackHint: '如果按钮无法点击，请将以下链接粘贴到浏览器：',
    expiration: (minutes) => `本链接 ${minutes} 分钟内有效。`,
    ignore: '如果您没有请求此操作，可以安全地忽略此邮件。',
    footer: '{appName} · 系统邮件，请勿直接回复。',
}

const STRINGS: Record<MailLocale, LocaleStrings> = {
    'en-US': EN_STRINGS,
    'zh-CN': ZH_STRINGS,
}

// ---------------------------------------------------------------------------
// 渲染
// ---------------------------------------------------------------------------

/**
 * 渲染邮件模板（纯函数，可单测）。
 *
 * @throws 当 `data.email` / `data.url` 缺失或 `data.url` scheme 非 http(s) 时抛
 *         `Error('MAIL_TEMPLATE_INVALID: ...')` —— fail-closed：不发送半成品邮件
 */
export function renderTemplate(
    locale: MailLocale,
    kind: MailTemplateKind,
    data: MailTemplateData & { newEmail?: string },
): RenderedTemplate {
    if (!data.email || !data.url) {
        throw new Error('MAIL_TEMPLATE_INVALID: email and url are required')
    }

    const s = STRINGS[locale]
    const appName = data.appName ?? 'dependfix'
    const expirationMinutes = data.expirationMinutes ?? 60

    const subject = s.subject[kind]
    const title = s.title[kind].replaceAll('{appName}', appName)
    const greeting = s.greeting.replaceAll('{email}', data.email)
    const body = s.body[kind]
        .replaceAll('{appName}', appName)
        .replaceAll('{newEmail}', data.newEmail ?? data.email)
    const buttonText = s.button[kind]

    // URL scheme 白名单（防御纵深）：URL 当前由 better-auth 内部生成（受信任上游），
    // 但 renderTemplate 作为公共契约暴露给 sendMail 调用方，未来扩展可能传入 user-controlled URL。
    // 仅允许 http(s)：javascript:/data:/vbscript: 等伪协议在支持 HTML 的邮件客户端有 XSS 风险。
    // 抛错而非静默改写（fail-closed 原则）。
    assertSafeUrl(data.url)

    const html = renderHtml({
        appName,
        title,
        greeting,
        body,
        buttonText,
        url: data.url,
        fallbackHint: s.fallbackHint,
        expiration: s.expiration(expirationMinutes),
        ignore: s.ignore,
        footer: s.footer.replaceAll('{appName}', appName),
        lang: locale,
    })

    const text = [
        greeting,
        '',
        body,
        '',
        `${buttonText}: ${data.url}`,
        '',
        s.expiration(expirationMinutes),
        s.ignore,
        '',
        s.footer.replaceAll('{appName}', appName),
    ].join('\n')

    return { subject, html, text }
}

interface HtmlParts {
    appName: string
    title: string
    greeting: string
    body: string
    buttonText: string
    url: string
    fallbackHint: string
    expiration: string
    ignore: string
    footer: string
    /** 邮件语言标签（影响邮件客户端自动翻译 / 读屏可访问性） */
    lang: MailLocale
}

function renderHtml(p: HtmlParts): string {
    // inline `<style>` 包裹：避免邮件客户端剥离 `<head>` 后样式丢失
    return `<!DOCTYPE html>
<html lang="${escapeAttr(p.lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(p.title)}</title>
<style>
body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f5f5f5; color: #1f2937; }
.container { max-width: 560px; margin: 24px auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
.header { padding: 24px 24px 0; }
.title { margin: 0; font-size: 20px; font-weight: 600; color: #111827; }
.content { padding: 16px 24px; line-height: 1.5; font-size: 14px; }
.greeting { margin: 0 0 12px; }
.body { margin: 0 0 20px; }
.button-wrap { padding: 0 24px 20px; }
.button { display: inline-block; background-color: #0d9488; color: #ffffff !important; text-decoration: none; padding: 10px 20px; border-radius: 6px; font-weight: 500; font-size: 14px; }
.fallback { padding: 0 24px 16px; font-size: 12px; color: #6b7280; word-break: break-all; }
.fallback a { color: #0d9488; }
.expiration { padding: 0 24px 16px; font-size: 12px; color: #6b7280; }
.ignore { padding: 0 24px 20px; font-size: 12px; color: #9ca3af; }
.footer { padding: 16px 24px; font-size: 12px; color: #9ca3af; border-top: 1px solid #e5e7eb; text-align: center; }
</style>
</head>
<body>
<div class="container">
<div class="header"><h1 class="title">${escapeHtml(p.title)}</h1></div>
<div class="content">
<p class="greeting">${escapeHtml(p.greeting)}</p>
<p class="body">${escapeHtml(p.body)}</p>
</div>
<div class="button-wrap">
<a class="button" href="${escapeAttr(p.url)}">${escapeHtml(p.buttonText)}</a>
</div>
<div class="fallback">
${escapeHtml(p.fallbackHint)}<br>
<a href="${escapeAttr(p.url)}">${escapeHtml(p.url)}</a>
</div>
<div class="expiration">${escapeHtml(p.expiration)}</div>
<div class="ignore">${escapeHtml(p.ignore)}</div>
<div class="footer">${escapeHtml(p.footer)}</div>
</div>
</body>
</html>`
}

/** HTML 文本节点转义 */
function escapeHtml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
}

/** HTML 属性值转义（含单/双引号） */
function escapeAttr(s: string): string {
    return escapeHtml(s).replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

/**
 * URL scheme 白名单校验（防御 javascript:/data:/vbscript: 等伪协议 XSS）。
 * 仅允许 http: 与 https:；其他 scheme（含无 scheme 的相对路径、javascript:、data: 等）抛错。
 *
 * 实现要点：手动解析 scheme（不依赖 `new URL()`，避免相对路径需 base 解析的复杂性）；
 * scheme = URL 起始 `^[a-zA-Z][a-zA-Z0-9+.-]*:` 段；大小写不敏感。
 */
function assertSafeUrl(url: string): void {
    const schemeMatch = /^\s*([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(url)
    if (!schemeMatch?.[1]) {
        throw new Error('MAIL_TEMPLATE_INVALID: url must include an explicit scheme (http or https)')
    }
    const scheme = schemeMatch[1].toLowerCase()
    if (scheme !== 'http' && scheme !== 'https') {
        throw new Error(`MAIL_TEMPLATE_INVALID: url scheme '${scheme}' is not allowed (only http/https)`)
    }
}
