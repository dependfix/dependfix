import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// mock nodemailer + 整个 transport 模块（避免真实创建 SMTP socket）
const sendMailMock = vi.hoisted(() => vi.fn())
vi.mock('nodemailer', () => ({
    default: {
        createTransport: vi.fn(() => ({ sendMail: sendMailMock })),
    },
}))

import { sendMail, sendTemplateMail, MailerError, resetMailerTransportCache } from './index'

/** 模拟 useRuntimeConfig（vitest 环境无 Nuxt 实例） */
const mockRuntimeConfig = (overrides: Record<string, unknown> = {}) => {
    const defaults = {
        smtpHost: '',
        smtpPort: 587,
        smtpUser: '',
        smtpPass: '',
        smtpFrom: '',
    }
    // 替换全局 useRuntimeConfig（Nuxt auto-import；测试环境 mock）
    ;(globalThis as { useRuntimeConfig?: () => unknown }).useRuntimeConfig = () => ({
        ...defaults,
        ...overrides,
    })
}

describe('sendMail', () => {
    beforeEach(() => {
        sendMailMock.mockReset()
        // 默认 noop 场景：清空 runtimeConfig
        mockRuntimeConfig({ smtpHost: '' })
        resetMailerTransportCache()
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('SMTP 未配置 → noop 降级（delivered:false, mode:noop）', async () => {
        const result = await sendMail({
            to: 'user@example.com',
            subject: 'Test',
            html: '<p>Hello</p>',
            text: 'Hello',
        })
        expect(result).toEqual({ delivered: false, mode: 'noop' })
    })

    it('SMTP 已配置 + 发送成功 → delivered:true + messageId', async () => {
        mockRuntimeConfig({
            smtpHost: 'smtp.example.com',
            smtpPort: 587,
            smtpUser: 'noreply@example.com',
            smtpPass: 'secret',
            smtpFrom: 'noreply@example.com',
        })
        resetMailerTransportCache()
        sendMailMock.mockResolvedValue({ messageId: 'msg-123@nodemailer' })

        const result = await sendMail({
            to: 'user@example.com',
            subject: 'Test',
            html: '<p>Hello</p>',
            text: 'Hello',
        })
        expect(result.delivered).toBe(true)
        expect(result.mode).toBe('smtp')
        expect(result.messageId).toBe('msg-123@nodemailer')
        expect(sendMailMock).toHaveBeenCalledTimes(1)
        expect(sendMailMock).toHaveBeenCalledWith(expect.objectContaining({
            to: 'user@example.com',
            subject: 'Test',
            from: 'noreply@example.com',
        }))
    })

    it('SMTP 失败 → throw MailerError MAIL_SEND_FAILED（fail-closed）', async () => {
        mockRuntimeConfig({
            smtpHost: 'smtp.example.com',
            smtpPort: 587,
            smtpUser: 'u',
            smtpPass: 'p',
        })
        resetMailerTransportCache()
        sendMailMock.mockRejectedValue(new Error('SMTP connection refused'))

        await expect(sendMail({
            to: 'user@example.com',
            subject: 'Test',
            html: '<p>Hello</p>',
            text: 'Hello',
        })).rejects.toThrow(MailerError)

        await expect(sendMail({
            to: 'user@example.com',
            subject: 'Test',
            html: '<p>Hello</p>',
            text: 'Hello',
        })).rejects.toMatchObject({ code: 'MAIL_SEND_FAILED' })
    })

    it('SMTP 凭据泄漏防护：sendMail 失败错误信息不含 pass', async () => {
        mockRuntimeConfig({
            smtpHost: 'smtp.example.com',
            smtpPort: 587,
            smtpUser: 'user',
            smtpPass: 'supersecret-pass',
        })
        resetMailerTransportCache()
        sendMailMock.mockRejectedValue(new Error('auth failed: user:supersecret-pass invalid'))

        try {
            await sendMail({
                to: 'user@example.com',
                subject: 'Test',
                html: '<p>Hello</p>',
                text: 'Hello',
            })
        } catch (error) {
            // 错误信息透传 SMTP error message，但这是 SMTP server 返回的（不含本进程 SMTP_PASS env）
            // 我们的 MailerError 透传 cause.message（来自 nodemailer 错误），不包含 runtimeConfig.smtpPass
            expect(error).toBeInstanceOf(MailerError)
            // 校验错误 message 中不含 'supersecret-pass'（来自 runtimeConfig 而非 SMTP server 错误）
            const err = error as MailerError
            expect(err.message).not.toContain('supersecret-pass')
        }
    })
})

describe('sendTemplateMail', () => {
    beforeEach(() => {
        sendMailMock.mockReset()
        mockRuntimeConfig({ smtpHost: '' })
        resetMailerTransportCache()
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('SMTP 未配置 → 模板渲染但 noop 降级', async () => {
        const result = await sendTemplateMail('en-US', 'verification', {
            email: 'user@example.com',
            url: 'https://example.com/verify',
        })
        expect(result.delivered).toBe(false)
        expect(result.mode).toBe('noop')
        // SMTP 未配置时 sendMail 不被调用（transport 未创建）
        expect(sendMailMock).not.toHaveBeenCalled()
    })

    it('模板数据缺失 email → throw MailerError MAIL_TEMPLATE_INVALID（fail-closed）', async () => {
        await expect(sendTemplateMail('en-US', 'verification', {
            email: '',
            url: 'https://example.com',
        })).rejects.toMatchObject({ code: 'MAIL_TEMPLATE_INVALID' })
    })

    it('zh-CN locale 渲染中文模板', async () => {
        mockRuntimeConfig({
            smtpHost: 'smtp.example.com',
            smtpPort: 587,
            smtpUser: 'u',
            smtpPass: 'p',
        })
        resetMailerTransportCache()
        sendMailMock.mockResolvedValue({ messageId: 'msg-zh' })

        const result = await sendTemplateMail('zh-CN', 'verification', {
            email: 'user@example.com',
            url: 'https://example.com/verify',
        })
        expect(result.delivered).toBe(true)
        // 验证发送的中文主题
        expect(sendMailMock).toHaveBeenCalledWith(expect.objectContaining({
            subject: expect.stringMatching(/验证/),
        }))
    })
})
