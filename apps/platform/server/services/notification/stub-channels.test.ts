import { describe, expect, it } from 'vitest'
import { SlackStubChannel, WebhookStubChannel } from './stub-channels'
import type { NotificationEvent } from './channel'

const sampleEvent: NotificationEvent = {
    id: 'evt-1',
    type: 'sandbox_unavailable',
    severity: 'error',
    message: 'docker daemon down',
    createdAt: new Date('2026-08-20T10:00:00Z'),
}

describe('SlackStubChannel', () => {
    it('name === "slack"', () => {
        expect(new SlackStubChannel().name).toBe('slack')
    })

    it('isAvailable() 始终返回 false（占位，未实现）', () => {
        expect(new SlackStubChannel().isAvailable()).toBe(false)
    })

    it('send() 返回 delivered=false（不被调用，但完整性保证）', async () => {
        const ch = new SlackStubChannel()
        const result = await ch.send(sampleEvent, ['#dev-alerts'])
        expect(result).toEqual({ delivered: false, channel: 'slack' })
    })
})

describe('WebhookStubChannel', () => {
    it('name === "webhook"', () => {
        expect(new WebhookStubChannel().name).toBe('webhook')
    })

    it('isAvailable() 始终返回 false（占位，未实现）', () => {
        expect(new WebhookStubChannel().isAvailable()).toBe(false)
    })

    it('send() 返回 delivered=false', async () => {
        const ch = new WebhookStubChannel()
        const result = await ch.send(sampleEvent, ['https://hooks.example.com/alerts'])
        expect(result).toEqual({ delivered: false, channel: 'webhook' })
    })
})
