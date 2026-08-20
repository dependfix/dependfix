import 'reflect-metadata'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setupMemoryDatabase, teardownMemoryDatabase } from '../../../tests/api-helper'
import { resolveNotificationRecipients } from './notification-recipients'
import { EmailNotificationChannel } from './email-channel'
import {
    ensureNotificationChannelsRegistered,
    listNotificationChannels,
    notifyEnvEvent,
    registerNotificationChannel,
    unregisterNotificationChannel,
} from './index'
import { ensureDatabaseInitialized } from '#server/database'
import { User } from '#server/entities/user'
import { AuditEvent } from '#server/entities/audit-event'

describe('notification module 注册表', () => {
    it('ensureNotificationChannelsRegistered 后 list 至少含 email 渠道', () => {
        ensureNotificationChannelsRegistered()
        const channels = listNotificationChannels()
        expect(channels.length).toBeGreaterThan(0)
        expect(channels.some((c) => c.name === 'email')).toBe(true)
    })

    it('重复注册同名渠道抛错', () => {
        ensureNotificationChannelsRegistered()
        expect(() => registerNotificationChannel(new EmailNotificationChannel())).toThrow(/already registered/)
    })

    it('unregisterNotificationChannel 移除渠道', () => {
        ensureNotificationChannelsRegistered()
        unregisterNotificationChannel('email')
        expect(listNotificationChannels().some((c) => c.name === 'email')).toBe(false)
        // 重新注册恢复
        registerNotificationChannel(new EmailNotificationChannel())
    })
})

describe('resolveNotificationRecipients', () => {
    beforeEach(() => {
        setupMemoryDatabase()
        delete process.env.DEPENDFIX_ENV_ALERT_RECIPIENTS
    })

    afterEach(() => {
        teardownMemoryDatabase()
        delete process.env.DEPENDFIX_ENV_ALERT_RECIPIENTS
    })

    it('env 覆盖优先（不查 DB）', async () => {
        process.env.DEPENDFIX_ENV_ALERT_RECIPIENTS = 'ops@example.com,admin@example.com'
        const recipients = await resolveNotificationRecipients()
        expect(recipients).toEqual(['ops@example.com', 'admin@example.com'])
    })

    it('env 空字符串 → 走 DB 默认（无 admin 返回空）', async () => {
        process.env.DEPENDFIX_ENV_ALERT_RECIPIENTS = ''
        const recipients = await resolveNotificationRecipients()
        expect(recipients).toEqual([])
    })

    it('env 多个邮箱被 trim + 过滤空', async () => {
        process.env.DEPENDFIX_ENV_ALERT_RECIPIENTS = ' a@x.com , , b@x.com ,'
        const recipients = await resolveNotificationRecipients()
        expect(recipients).toEqual(['a@x.com', 'b@x.com'])
    })

    it('DB 默认：admin + org_admin 角色 + banned=false', async () => {
        const ds = await ensureDatabaseInitialized()
        const repo = ds.getRepository(User)
        await repo.save(repo.create({ email: 'admin1@x.com', name: 'a1', role: 'admin', banned: false }))
        await repo.save(repo.create({ email: 'orgadmin@x.com', name: 'o1', role: 'org_admin', banned: false }))
        await repo.save(repo.create({ email: 'viewer@x.com', name: 'v1', role: 'viewer', banned: false }))
        await repo.save(repo.create({ email: 'banned@x.com', name: 'b1', role: 'admin', banned: true }))
        const recipients = await resolveNotificationRecipients()
        expect(recipients.sort()).toEqual(['admin1@x.com', 'orgadmin@x.com'])
    })
})

describe('notifyEnvEvent', () => {
    let consoleSpy: ReturnType<typeof vi.spyOn>
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>

    beforeEach(async () => {
        setupMemoryDatabase()
        delete process.env.DEPENDFIX_ENV_ALERT_RECIPIENTS
        consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
        consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
        // SMTP 未配置 → EmailNotificationChannel.isAvailable()=false → noop
        vi.stubGlobal('useRuntimeConfig', () => ({ smtpHost: '' }))
    })

    afterEach(() => {
        teardownMemoryDatabase()
        vi.unstubAllGlobals()
        consoleSpy.mockRestore()
        consoleErrorSpy.mockRestore()
    })

    it('无收件人时 warn + AuditEvent 标记 notified=false', async () => {
        const ds = await ensureDatabaseInitialized()
        const event = await ds.getRepository(AuditEvent).save(ds.getRepository(AuditEvent).create({
            type: 'sandbox_unavailable',
            severity: 'error',
            payloadJson: null,
            notified: false,
            notifiedVia: null,
        }))
        await notifyEnvEvent({
            id: event.id,
            type: 'sandbox_unavailable',
            severity: 'error',
            message: 'docker down',
            createdAt: event.createdAt,
        })
        expect(consoleSpy).toHaveBeenCalled()
        const updated = await ds.getRepository(AuditEvent).findOne({ where: { id: event.id } })
        expect(updated?.notified).toBe(false)
        expect(updated?.notifiedVia).toBe(null)
    })

    it('SMTP 未配置 → email 渠道 isAvailable()=false → skip + notified=false', async () => {
        const ds = await ensureDatabaseInitialized()
        const event = await ds.getRepository(AuditEvent).save(ds.getRepository(AuditEvent).create({
            type: 'sandbox_degraded',
            severity: 'warn',
            payloadJson: null,
            notified: false,
            notifiedVia: null,
        }))
        process.env.DEPENDFIX_ENV_ALERT_RECIPIENTS = 'admin@x.com'
        await notifyEnvEvent({
            id: event.id,
            type: 'sandbox_degraded',
            severity: 'warn',
            message: '降级',
            createdAt: event.createdAt,
        })
        const updated = await ds.getRepository(AuditEvent).findOne({ where: { id: event.id } })
        // channel 不可用 → notifyEnvEvent 跳过 send，notified 保持 false（markNotified 不会被调用，因为跳过 continue）
        expect(updated?.notified).toBe(false)
        expect(updated?.notifiedVia).toBe(null)
    })
})
