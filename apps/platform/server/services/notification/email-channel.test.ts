import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { sendMail } from '../mailer'
import { EmailNotificationChannel } from './email-channel'
import { NotificationError, type NotificationEvent } from './channel'

vi.mock('../mailer', () => ({
    sendMail: vi.fn(),
    MailerError: class MailerError extends Error {
        constructor(
            public readonly code: 'MAIL_SEND_FAILED' | 'MAIL_TEMPLATE_INVALID' | 'MAIL_NOT_CONFIGURED',
            message: string,
            public override readonly cause?: unknown,
        ) {
            super(message)
            this.name = 'MailerError'
        }
    },
}))

const sampleEvent: NotificationEvent = {
    id: 'evt-1',
    type: 'sandbox_unavailable',
    severity: 'error',
    message: 'docker daemon stopped during scan',
    repository: 'demo/app',
    scanRunId: 'run-1',
    createdAt: new Date('2026-08-20T10:00:00Z'),
}

describe('EmailNotificationChannel', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        // 默认 stub useRuntimeConfig → smtpHost 空
        vi.stubGlobal('useRuntimeConfig', () => ({ smtpHost: '' }))
    })

    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it('name === "email"', () => {
        const ch = new EmailNotificationChannel()
        expect(ch.name).toBe('email')
    })

    it('isAvailable() = false when smtpHost empty', () => {
        const ch = new EmailNotificationChannel()
        expect(ch.isAvailable()).toBe(false)
    })

    it('isAvailable() = true when smtpHost configured', () => {
        vi.stubGlobal('useRuntimeConfig', () => ({ smtpHost: 'smtp.example.com' }))
        const ch = new EmailNotificationChannel()
        expect(ch.isAvailable()).toBe(true)
    })

    it('send() with empty recipients returns delivered=false without calling sendMail', async () => {
        const ch = new EmailNotificationChannel()
        vi.stubGlobal('useRuntimeConfig', () => ({ smtpHost: 'smtp.example.com' }))
        const result = await ch.send(sampleEvent, [])
        expect(result).toEqual({ delivered: false, channel: 'email' })
        expect(sendMail).not.toHaveBeenCalled()
    })

    it('send() with smtp unconfigured returns delivered=false (noop)', async () => {
        const ch = new EmailNotificationChannel()
        const result = await ch.send(sampleEvent, ['admin@example.com'])
        expect(result).toEqual({ delivered: false, channel: 'email' })
        expect(sendMail).not.toHaveBeenCalled()
    })

    it('send() success returns delivered=true with messageId', async () => {
        vi.mocked(sendMail).mockResolvedValue({
            delivered: true,
            mode: 'smtp',
            messageId: '<msg-1@example.com>',
        })
        vi.stubGlobal('useRuntimeConfig', () => ({ smtpHost: 'smtp.example.com' }))
        const ch = new EmailNotificationChannel()
        const result = await ch.send(sampleEvent, ['admin@example.com'])
        expect(result.delivered).toBe(true)
        expect(result.channel).toBe('email')
        expect(result.messageId).toBe('<msg-1@example.com>')
        expect(sendMail).toHaveBeenCalledOnce()
    })

    it('send() recipients joined with ", "', async () => {
        vi.mocked(sendMail).mockResolvedValue({
            delivered: true,
            mode: 'smtp',
        })
        vi.stubGlobal('useRuntimeConfig', () => ({ smtpHost: 'smtp.example.com' }))
        const ch = new EmailNotificationChannel()
        await ch.send(sampleEvent, ['a@example.com', 'b@example.com'])
        const callArgs = vi.mocked(sendMail).mock.calls[0]?.[0]
        expect(callArgs?.to).toBe('a@example.com, b@example.com')
    })

    it('send() converts Date createdAt to ISO string in template', async () => {
        vi.mocked(sendMail).mockResolvedValue({
            delivered: true,
            mode: 'smtp',
        })
        vi.stubGlobal('useRuntimeConfig', () => ({ smtpHost: 'smtp.example.com' }))
        const ch = new EmailNotificationChannel()
        await ch.send(sampleEvent, ['admin@example.com'])
        const callArgs = vi.mocked(sendMail).mock.calls[0]?.[0]
        // subject 应该含事件类型 + 仓库
        expect(callArgs?.subject).toContain('sandbox_unavailable')
        expect(callArgs?.subject).toContain('demo/app')
        // html 应该含 ISO 时间字符串
        expect(callArgs?.html).toContain('2026-08-20T10:00:00.000Z')
    })

    // RG-B07：locale 注入（默认 zh-CN + event.locale + DEPENDFIX_LOCALE env）
    it('send() 默认 locale 是 zh-CN（subject 含 [错误]）', async () => {
        vi.mocked(sendMail).mockResolvedValue({ delivered: true, mode: 'smtp' })
        vi.stubGlobal('useRuntimeConfig', () => ({ smtpHost: 'smtp.example.com' }))
        const ch = new EmailNotificationChannel()
        await ch.send(sampleEvent, ['admin@example.com'])
        const callArgs = vi.mocked(sendMail).mock.calls[0]?.[0]
        expect(callArgs?.subject).toContain('[错误]')
        expect(callArgs?.subject).not.toContain('[Error]')
    })

    it('send() event.locale = en-US → subject 含 [Error]', async () => {
        vi.mocked(sendMail).mockResolvedValue({ delivered: true, mode: 'smtp' })
        vi.stubGlobal('useRuntimeConfig', () => ({ smtpHost: 'smtp.example.com' }))
        const ch = new EmailNotificationChannel()
        await ch.send({ ...sampleEvent, locale: 'en-US' }, ['admin@example.com'])
        const callArgs = vi.mocked(sendMail).mock.calls[0]?.[0]
        expect(callArgs?.subject).toContain('[Error]')
        expect(callArgs?.subject).not.toContain('[错误]')
    })

    it('send() DEPENDFIX_LOCALE = en-US → 默认英文模板', async () => {
        process.env.DEPENDFIX_LOCALE = 'en-US'
        vi.mocked(sendMail).mockResolvedValue({ delivered: true, mode: 'smtp' })
        vi.stubGlobal('useRuntimeConfig', () => ({ smtpHost: 'smtp.example.com' }))
        const ch = new EmailNotificationChannel()
        await ch.send(sampleEvent, ['admin@example.com'])
        const callArgs = vi.mocked(sendMail).mock.calls[0]?.[0]
        expect(callArgs?.subject).toContain('[Error]')
        delete process.env.DEPENDFIX_LOCALE
    })

    it('send() DEPENDFIX_LOCALE 非法值回退 zh-CN', async () => {
        process.env.DEPENDFIX_LOCALE = 'fr-FR' // 不在白名单
        vi.mocked(sendMail).mockResolvedValue({ delivered: true, mode: 'smtp' })
        vi.stubGlobal('useRuntimeConfig', () => ({ smtpHost: 'smtp.example.com' }))
        const ch = new EmailNotificationChannel()
        await ch.send(sampleEvent, ['admin@example.com'])
        const callArgs = vi.mocked(sendMail).mock.calls[0]?.[0]
        expect(callArgs?.subject).toContain('[错误]') // 回退 zh-CN
        delete process.env.DEPENDFIX_LOCALE
    })

    it('send() event.locale 优先于 DEPENDFIX_LOCALE env', async () => {
        process.env.DEPENDFIX_LOCALE = 'en-US'
        vi.mocked(sendMail).mockResolvedValue({ delivered: true, mode: 'smtp' })
        vi.stubGlobal('useRuntimeConfig', () => ({ smtpHost: 'smtp.example.com' }))
        const ch = new EmailNotificationChannel()
        // event.locale 显式中文，覆盖 env
        await ch.send({ ...sampleEvent, locale: 'zh-CN' }, ['admin@example.com'])
        const callArgs = vi.mocked(sendMail).mock.calls[0]?.[0]
        expect(callArgs?.subject).toContain('[错误]')
        delete process.env.DEPENDFIX_LOCALE
    })
})

// 单独测试 NotificationError 转抛路径（MailerError → NotificationError）
describe('EmailNotificationChannel 错误映射', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it('MailerError MAIL_SEND_FAILED → NotificationError NOTIFICATION_SEND_FAILED', async () => {
        const { MailerError } = await import('../mailer')
        vi.mocked(sendMail).mockRejectedValue(new MailerError('MAIL_SEND_FAILED', 'smtp down'))
        vi.stubGlobal('useRuntimeConfig', () => ({ smtpHost: 'smtp.example.com' }))
        const ch = new EmailNotificationChannel()
        await expect(ch.send(sampleEvent, ['admin@example.com'])).rejects.toThrow(NotificationError)
        await expect(ch.send(sampleEvent, ['admin@example.com'])).rejects.toMatchObject({
            code: 'NOTIFICATION_SEND_FAILED',
        })
    })

    it('MailerError MAIL_TEMPLATE_INVALID → NotificationError NOTIFICATION_TEMPLATE_INVALID', async () => {
        const { MailerError } = await import('../mailer')
        vi.mocked(sendMail).mockRejectedValue(new MailerError('MAIL_TEMPLATE_INVALID', 'bad template'))
        vi.stubGlobal('useRuntimeConfig', () => ({ smtpHost: 'smtp.example.com' }))
        const ch = new EmailNotificationChannel()
        await expect(ch.send(sampleEvent, ['admin@example.com'])).rejects.toMatchObject({
            code: 'NOTIFICATION_TEMPLATE_INVALID',
        })
    })

    it('非 MailerError 异常 → NotificationError NOTIFICATION_SEND_FAILED', async () => {
        vi.mocked(sendMail).mockRejectedValue(new Error('generic error'))
        vi.stubGlobal('useRuntimeConfig', () => ({ smtpHost: 'smtp.example.com' }))
        const ch = new EmailNotificationChannel()
        await expect(ch.send(sampleEvent, ['admin@example.com'])).rejects.toThrow(NotificationError)
    })
})
