import { afterEach, describe, expect, it, vi } from 'vitest'

// mock nodemailer（在 import transport 之前必须 mock）
const createTransportMock = vi.hoisted(() => vi.fn())
vi.mock('nodemailer', () => ({
    default: {
        createTransport: createTransportMock,
    },
}))

import { createMailerTransport, resetMailerTransportCache } from './transport'

describe('createMailerTransport', () => {
    afterEach(() => {
        resetMailerTransportCache()
        createTransportMock.mockReset()
    })

    it('SMTP 未配置（空 host）→ 返回 null + 不调用 createTransport', () => {
        const result = createMailerTransport({ host: '', port: 587, user: '', pass: '' })
        expect(result).toBeNull()
        expect(createTransportMock).not.toHaveBeenCalled()
    })

    it('SMTP 已配置 → 创建 transport + 传 host/port/auth', () => {
        const fakeTransport = { sendMail: vi.fn() }
        createTransportMock.mockReturnValue(fakeTransport)
        const result = createMailerTransport({
            host: 'smtp.example.com',
            port: 587,
            user: 'noreply@example.com',
            pass: 'secret',
        })
        expect(result).toBe(fakeTransport)
        expect(createTransportMock).toHaveBeenCalledTimes(1)
        expect(createTransportMock).toHaveBeenCalledWith({
            host: 'smtp.example.com',
            port: 587,
            secure: false, // 587 → STARTTLS（明文升级）
            auth: { user: 'noreply@example.com', pass: 'secret' },
            // pool 不显式传（默认 false）；如未来需要批量发送再启用 pool: true
        })
    })

    it('port=465 → secure=true（TLS）', () => {
        createTransportMock.mockReturnValue({})
        createMailerTransport({
            host: 'smtp.example.com',
            port: 465,
            user: '',
            pass: '',
        })
        expect(createTransportMock).toHaveBeenCalledWith(
            expect.objectContaining({ secure: true, auth: undefined }),
        )
    })

    it('port=25 → secure=false（明文 relay 兼容）', () => {
        createTransportMock.mockReturnValue({})
        createMailerTransport({
            host: 'internal-relay.local',
            port: 25,
            user: '',
            pass: '',
        })
        expect(createTransportMock).toHaveBeenCalledWith(
            expect.objectContaining({ secure: false }),
        )
    })

    it('user/pass 缺失 → auth=undefined（匿名 SMTP relay 场景）', () => {
        createTransportMock.mockReturnValue({})
        createMailerTransport({
            host: 'anonymous-relay.local',
            port: 587,
            user: '',
            pass: '',
        })
        expect(createTransportMock).toHaveBeenCalledWith(
            expect.objectContaining({ auth: undefined }),
        )
    })

    it('缓存：第二次调用复用首次创建的 transport（避免每次重建 socket）', () => {
        const fakeTransport = { sendMail: vi.fn() }
        createTransportMock.mockReturnValue(fakeTransport)

        const first = createMailerTransport({ host: 'smtp.example.com', port: 587, user: 'u', pass: 'p' })
        const second = createMailerTransport({ host: 'smtp.example.com', port: 587, user: 'u', pass: 'p' })

        expect(first).toBe(second)
        expect(createTransportMock).toHaveBeenCalledTimes(1)
    })

    it('缓存 null：未配置时第二次调用仍返回 null（不调用 createTransport）', () => {
        const first = createMailerTransport({ host: '', port: 587, user: '', pass: '' })
        const second = createMailerTransport({ host: '', port: 587, user: '', pass: '' })
        expect(first).toBeNull()
        expect(second).toBeNull()
        expect(createTransportMock).not.toHaveBeenCalled()
    })
})
