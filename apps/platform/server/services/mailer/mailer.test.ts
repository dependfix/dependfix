import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// mock nodemailer + 整个 transport 模块（避免真实创建 SMTP socket）
const sendMailMock = vi.hoisted(() => vi.fn())
vi.mock('nodemailer', () => ({
    default: {
        createTransport: vi.fn(() => ({ sendMail: sendMailMock })),
    },
}))

// mock templates.renderTemplate：测试需让 renderTemplate 抛非 Error 触发 String(error) fallback
// （审计回执标记 [B2]，详见本测试套件同名 it 用例的注释）
// sync vi.hoisted 提供共享 mock 引用（vi.mock factory 不允许 capture top-level variables，
// 但 vi.hoisted 返回值在 factory 执行前已就绪，factory 通过闭包延迟引用）
const templatesMockRef = vi.hoisted(() => ({
    mock: null as ReturnType<typeof vi.fn> | null,
    realImpl: null as typeof import('./templates').renderTemplate | null,
}))

vi.mock('./templates', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./templates')>()
    const mock = vi.fn(actual.renderTemplate)
    templatesMockRef.mock = mock
    templatesMockRef.realImpl = actual.renderTemplate
    return { ...actual, renderTemplate: mock }
})

import { sendMail, sendTemplateMail, MailerError, resetMailerTransportCache } from './index'

/** 重置 renderTemplate mock 为真实实现（每次 it 前调用） */
const restoreRenderTemplate = (): void => {
    if (templatesMockRef.mock && templatesMockRef.realImpl) {
        templatesMockRef.mock.mockReset()
        templatesMockRef.mock.mockImplementation(templatesMockRef.realImpl)
    }
}

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
        restoreRenderTemplate()
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

    describe('sendTemplateMail 边界分支（覆盖率补测：含非 Error 抛值 fallback）', () => {
        beforeEach(() => {
            sendMailMock.mockReset()
            restoreRenderTemplate()
            mockRuntimeConfig({
                smtpHost: 'smtp.example.com',
                smtpPort: 587,
                smtpUser: 'u',
                smtpPass: 'p',
            })
            resetMailerTransportCache()
        })

        it('locale=null/undefined → 回退 DEFAULT_LOCALE（en-US）', async () => {
            // 强制使用 ts-ignore 验证 null 分支（TS 类型面 MailLocale 不含 null，但运行时可能传错）
            sendMailMock.mockResolvedValue({ messageId: 'msg-fallback' })

            const result = await sendTemplateMail(
                null as unknown as 'en-US',
                'verification',
                { email: 'user@example.com', url: 'https://example.com/verify' },
            )
            expect(result.delivered).toBe(true)
            // DEFAULT_LOCALE = en-US；验证主题回退到英文
            expect(sendMailMock).toHaveBeenCalledWith(expect.objectContaining({
                subject: expect.stringMatching(/Verify/i),
            }))
        })

        it('模板渲染失败 + 非 Error 抛值 → MailerError 透传原始值（String(error) fallback 分支）', async () => {
            // 真实覆盖 sendTemplateMail 内 catch 的 `error instanceof Error ? error.message : String(error)` 三元；
            // 通过 mock renderTemplate 让其抛非 Error 值（防御性兜底分支——模板契约保证抛 Error，但实现需为未来扩展留兜底）
            templatesMockRef.mock?.mockImplementationOnce(() => {
                throw 'plain-string-error' // 非 Error 实例
            })

            await expect(sendTemplateMail('en-US', 'verification', {
                email: 'user@example.com',
                url: 'https://example.com',
            })).rejects.toMatchObject({
                code: 'MAIL_TEMPLATE_INVALID',
                message: 'plain-string-error', // String(error) 透传
                cause: 'plain-string-error',
            })

            // 重置 mock 避免影响后续测试（每个 it 之间 beforeEach 也清）
            templatesMockRef.mock?.mockReset()
            restoreRenderTemplate()
        })

        it('smtpFrom fallback 链：smtpFrom 空 → smtpUser 空 → noreply@dependfix.local', async () => {
            mockRuntimeConfig({
                smtpHost: 'smtp.example.com',
                smtpPort: 587,
                smtpUser: '', // 空
                smtpPass: '',
                smtpFrom: '', // 空
            })
            resetMailerTransportCache()
            sendMailMock.mockResolvedValue({ messageId: 'msg-default' })

            await sendTemplateMail('en-US', 'verification', {
                email: 'user@example.com',
                url: 'https://example.com',
            })

            expect(sendMailMock).toHaveBeenCalledWith(expect.objectContaining({
                from: 'noreply@dependfix.local',
            }))
        })

        it('smtpUser 存在但 smtpFrom 空 → fallback 到 smtpUser', async () => {
            mockRuntimeConfig({
                smtpHost: 'smtp.example.com',
                smtpPort: 587,
                smtpUser: 'noreply@example.com',
                smtpPass: 'secret',
                smtpFrom: '', // 空 → 回退 smtpUser
            })
            resetMailerTransportCache()
            sendMailMock.mockResolvedValue({ messageId: 'msg-user' })

            await sendTemplateMail('en-US', 'verification', {
                email: 'user@example.com',
                url: 'https://example.com',
            })

            expect(sendMailMock).toHaveBeenCalledWith(expect.objectContaining({
                from: 'noreply@example.com',
            }))
        })

        it('nodemailer 返回 messageId 非字符串 → messageId 字段为 undefined', async () => {
            // 某些 SMTP server 返回 messageId 是 Buffer 或对象（罕见但合法）
            sendMailMock.mockResolvedValue({ messageId: 12345 as unknown as string })

            const result = await sendTemplateMail('en-US', 'verification', {
                email: 'user@example.com',
                url: 'https://example.com',
            })

            expect(result.delivered).toBe(true)
            expect(result.messageId).toBeUndefined() // typeof !== 'string' 分支
        })
    })
})
