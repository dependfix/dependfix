import 'reflect-metadata'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { expectError, makeEvent, setupMemoryDatabase, teardownMemoryDatabase } from '../../../tests/api-helper'
import preferencesGet from '../notification-preferences/index.get'
import preferencesPatch from '../notification-preferences/index.patch'
import orgSettingsGet from '../organizations/current/notification-settings.get'
import orgSettingsPatch from '../organizations/current/notification-settings.patch'
import notificationsGet from './index.get'
import notificationTestPost from './test.post'
import { resetMailerTransportCache } from '#server/services/mailer'
import { ensureDatabaseInitialized } from '#server/database'
import { AuditEvent } from '#server/entities/audit-event'
import { NotificationLog } from '#server/entities/notification-log'
import { NotificationPreference } from '#server/entities/notification-preference'
import { Organization } from '#server/entities/organization'
import { DEFAULT_ORGANIZATION_ID } from '#server/utils/organization'

const guardState = vi.hoisted(() => ({ role: 'admin' }))

vi.mock('#server/utils/guard', () => ({
    requireAuth: vi.fn(async () => ({
        user: { id: 'u1', email: 'admin@test.dev' },
        session: { user: { id: 'u1', email: 'admin@test.dev', role: guardState.role } },
    })),
    requireRole: vi.fn(async () => {
        if (guardState.role === 'viewer') {
            const error = new Error('Forbidden') as Error & { statusCode: number }
            error.statusCode = 403
            throw error
        }
        return { user: { id: 'u1', email: 'admin@test.dev' } }
    }),
}))

const call = (handler: (event: never) => unknown, method: string, url: string, body?: unknown) =>
    handler(makeEvent(method, url, body) as never)

describe('notification APIs', () => {
    beforeAll(() => {
        setupMemoryDatabase()
    })

    afterAll(() => {
        teardownMemoryDatabase()
    })

    beforeEach(async () => {
        guardState.role = 'admin'
        const ds = await ensureDatabaseInitialized()
        await ds.getRepository(NotificationPreference).clear()
        await ds.getRepository(NotificationLog).clear()
        await ds.getRepository(Organization).update({ id: DEFAULT_ORGANIZATION_ID }, { notificationSettingsJson: null })
    })

    it('GET preferences 返回业务类别与角色默认', async () => {
        const res = await call(preferencesGet, 'GET', '/api/notification-preferences') as { categories: { category: string, enabled: boolean, editable: boolean, reason?: string }[] }
        expect(res.categories.map((row) => row.category)).toEqual([
            'security_critical',
            'security_high',
            'run_failure',
            'run_completed',
            'weekly_digest',
        ])
        // 必选 critical 行只读且置首（设计稿 §15 D4）
        const critical = res.categories[0]
        expect(critical?.editable).toBe(false)
        expect(critical?.reason).toBe('mandatory')
        expect(critical?.enabled).toBe(true)
        expect(res.categories.find((row) => row.category === 'security_high')?.enabled).toBe(true)
        expect(res.categories.find((row) => row.category === 'run_completed')?.enabled).toBe(false)
    })

    it('PATCH preferences 持久化个人开关', async () => {
        const res = await call(preferencesPatch, 'PATCH', '/api/notification-preferences', {
            preferences: { security_high: false },
        }) as { categories: { category: string, enabled: boolean }[] }
        expect(res.categories.find((row) => row.category === 'security_high')?.enabled).toBe(false)
        // 必选 critical 行不随业务开关变化
        expect(res.categories.find((row) => row.category === 'security_critical')?.enabled).toBe(true)

        const ds = await ensureDatabaseInitialized()
        const row = await ds.getRepository(NotificationPreference).findOne({ where: { userId: 'u1', category: 'security_high' } })
        expect(row?.enabled).toBe(false)
    })

    it('PATCH 必选类别 → 400（不可配置）', async () => {
        guardState.role = 'admin'
        await expectError(Promise.resolve(call(preferencesPatch, 'PATCH', '/api/notification-preferences', {
            preferences: { security_critical: false },
        })), 400)
    })

    it('viewer PATCH → 403；组织关闭类别 → 400', async () => {
        guardState.role = 'viewer'
        await expectError(Promise.resolve(call(preferencesPatch, 'PATCH', '/api/notification-preferences', {
            preferences: { security_high: false },
        })), 403)

        guardState.role = 'admin'
        const ds = await ensureDatabaseInitialized()
        await ds.getRepository(Organization).update({ id: DEFAULT_ORGANIZATION_ID }, {
            notificationSettingsJson: JSON.stringify({
                categories: { securityHigh: false, runFailure: true, runCompleted: false, weeklyDigest: false },
                severityThreshold: 'high',
                cooldownHours: 24,
                maxPerHour: 6,
                extraAdminRecipients: [],
            }),
        })
        await expectError(Promise.resolve(call(preferencesPatch, 'PATCH', '/api/notification-preferences', {
            preferences: { security_high: true },
        })), 400)
    })

    it('组织设置 GET 默认 / PATCH 部分更新 / 非法键 400', async () => {
        const initial = await call(orgSettingsGet, 'GET', '/api/organizations/current/notification-settings') as { settings: { cooldownHours: number } }
        expect(initial.settings.cooldownHours).toBe(24)

        const updated = await call(orgSettingsPatch, 'PATCH', '/api/organizations/current/notification-settings', {
            cooldownHours: 0,
            extraAdminRecipients: [' Ops@Example.com ', 'ops@example.com'],
        }) as { settings: { cooldownHours: number, extraAdminRecipients: string[] } }
        expect(updated.settings.cooldownHours).toBe(0)
        expect(updated.settings.extraAdminRecipients).toEqual(['ops@example.com'])

        const ds = await ensureDatabaseInitialized()
        const audit = await ds.getRepository(AuditEvent).findOne({ where: { type: 'notification_settings_update' } })
        expect(audit).not.toBeNull()
        expect(audit?.payloadJson).toContain('"cooldownHours"')

        await expectError(Promise.resolve(call(orgSettingsPatch, 'PATCH', '/api/organizations/current/notification-settings', {
            unknown: true,
        })), 400)
    })

    it('viewer 访问组织设置 / 日志 / 测试发送 → 403', async () => {
        guardState.role = 'viewer'
        await expectError(Promise.resolve(call(orgSettingsGet, 'GET', '/api/organizations/current/notification-settings')), 403)
        await expectError(Promise.resolve(call(notificationsGet, 'GET', '/api/notifications')), 403)
        await expectError(Promise.resolve(call(notificationTestPost, 'POST', '/api/notifications/test')), 403)
    })

    it('POST /api/notifications/test SMTP 未配置 → delivered=false / noop', async () => {
        resetMailerTransportCache()
        vi.stubGlobal('useRuntimeConfig', () => ({ encryptionKey: 'test-encryption-key-32-bytes!!', e2eFixturesAllowed: false, smtpHost: '' }))
        try {
            const result = await call(notificationTestPost, 'POST', '/api/notifications/test') as { delivered: boolean, mode: string }
            expect(result).toEqual({ delivered: false, mode: 'noop' })
        } finally {
            vi.unstubAllGlobals()
            resetMailerTransportCache()
        }
    })

    it('GET /api/notifications 分页与类别筛选', async () => {
        const ds = await ensureDatabaseInitialized()
        const repo = ds.getRepository(NotificationLog)
        await repo.save(repo.create({
            category: 'security_high', scopeType: 'run', scopeId: 'r1', channel: 'email', fingerprint: 'f1',
            recipientsJson: JSON.stringify(['a@x.com']), status: 'sent', sentAt: new Date(),
        }))
        await repo.save(repo.create({
            category: 'run_failure', scopeType: 'run', scopeId: 'r2', channel: 'email', fingerprint: null,
            recipientsJson: JSON.stringify(['b@x.com']), status: 'failed',
        }))
        const res = await call(notificationsGet, 'GET', '/api/notifications?category=security_high&page=1&pageSize=10') as {
            items: { category: string, recipients: string[] }[]
            total: number
        }
        expect(res.total).toBe(1)
        expect(res.items[0]?.category).toBe('security_high')
        expect(res.items[0]?.recipients).toEqual(['a@x.com'])
    })

    it('同毫秒并列按 id DESC 稳定，跨页不重不漏', async () => {
        const ds = await ensureDatabaseInitialized()
        const repo = ds.getRepository(NotificationLog)
        const tieTime = new Date('2026-05-01T00:00:00.000Z')
        // 显式指定主键，使「插入顺序」与「id DESC」不一致——否则 SQLite 的并列返回顺序
        // 可能恰好等于 id 倒序，用例会失去区分度
        const plan = [
            { id: '000000000000000000000000000000002', scopeId: 'p2' },
            { id: '000000000000000000000000000000001', scopeId: 'p1' },
            { id: '000000000000000000000000000000003', scopeId: 'p3' },
        ]
        for (const item of plan) {
            await repo.save(repo.create({
                id: item.id,
                deliveryKey: null,
                category: 'run_failure',
                scopeType: 'run',
                scopeId: item.scopeId,
                channel: 'email',
                fingerprint: null,
                recipientUserId: null,
                recipientsJson: JSON.stringify(['a@x.com']),
                status: 'sent',
                errorMessage: null,
                sentAt: tieTime,
                createdAt: tieTime,
            }))
        }
        const expected = [
            '000000000000000000000000000000003',
            '000000000000000000000000000000002',
            '000000000000000000000000000000001',
        ]
        const pages: string[] = []
        for (const page of [1, 2, 3]) {
            const res = await call(notificationsGet, 'GET', `/api/notifications?page=${page}&pageSize=1`) as {
                items: { id: string }[]
                total: number
            }
            expect(res.total).toBe(3)
            pages.push(...res.items.map((item) => item.id))
        }
        expect(pages).toEqual(expected)
        expect(new Set(pages).size).toBe(3)
    })
})
