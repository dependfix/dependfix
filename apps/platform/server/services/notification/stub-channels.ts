/**
 * Stub channel（apps/platform/server/services/notification/stub-channels.ts）。
 *
 * 设计动机（接口预留）：用户决策仅邮件实现，其他渠道（Slack/Webhook）留接口后续接入。
 * Stub 实现 `isAvailable()` 始终返回 false，确保注册表中可见但不实际发送——后续接入时
 * 新建实现类并替换 stub 即可，无需修改注册逻辑或调用方。
 *
 * Stub 与真实实现的区别：
 * - 真实实现：isAvailable() 根据外部配置（如 Slack OAuth token / Webhook URL）动态判断
 * - Stub：isAvailable() 恒 false；send() 抛 NotificationError（理论上不会被调用，因为
 *   notifyEnvEvent 跳过 isAvailable=false 的 channel；保留 send 抛错仅为完整性）
 */

import type { NotificationChannel, NotificationEvent, NotificationResult } from './channel'

abstract class StubChannel implements NotificationChannel {
    abstract readonly name: string

    isAvailable(): boolean {
        return false
    }

    async send(_event: NotificationEvent, _recipients: string[]): Promise<NotificationResult> {
        // stub 占位不发送；保留 async 签名与接口兼容
        return Promise.resolve({ delivered: false, channel: this.name })
    }
}

/** Slack 占位渠道（isAvailable()=false，未实现） */
export class SlackStubChannel extends StubChannel {
    readonly name = 'slack'
}

/** Webhook 占位渠道（isAvailable()=false，未实现；未来可加通用 POST 端点供 Slack/Discord/飞书 转换器接入） */
export class WebhookStubChannel extends StubChannel {
    readonly name = 'webhook'
}
