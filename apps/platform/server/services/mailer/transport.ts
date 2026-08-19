import nodemailer, { type Transporter } from 'nodemailer'
import type SMTPTransport from 'nodemailer/lib/smtp-transport'

/**
 * nodemailer transport 封装（基于 runtimeConfig SMTP_* 配置）。
 *
 * 设计要点：
 * - 惰性单例：首次调用 `createMailerTransport` 后缓存，避免每次 sendMail 都重建 socket
 * - 未配置返回 `null`（不创建 transport），让上层走 noop 降级（[mailer:noop] 日志）
 * - secure 自动推导：port=465 → TLS；其他 → STARTTLS（587 主流默认）
 * - 凭据可选：未配 user/pass 时走匿名 SMTP relay（部分测试/内网 relay 支持）
 */

export interface MailerTransportConfig {
    host: string
    port: number
    user: string
    pass: string
    /** 留扩展位（tls/timeout/pool 等），本阶段最小化 */
}

export type MailerTransport = Transporter

let cachedTransport: MailerTransport | null | undefined

/**
 * 创建或返回缓存的 nodemailer transport。
 *
 * @param config SMTP 配置（从 `useRuntimeConfig()` 读取）
 * @returns 已配置的 transport；未配置返回 null（调用方走 noop 降级）
 */
export function createMailerTransport(config: MailerTransportConfig): MailerTransport | null {
    // 命中缓存（包括 null 缓存）
    if (cachedTransport !== undefined) {
        return cachedTransport
    }

    if (!config.host) {
        cachedTransport = null
        return null
    }

    const secure = config.port === 465
    const auth = config.user && config.pass
        ? { user: config.user, pass: config.pass }
        : undefined

    const transportOptions: SMTPTransport.Options = {
        host: config.host,
        port: config.port,
        secure,
        auth,
        // 不传 tls 选项：secure=true 隐式启用 TLS；secure=false 走 STARTTLS
        // pool 默认关闭：单次发送不需要池化；如未来需要批量发送再启用 pool: true
    }

    cachedTransport = nodemailer.createTransport(transportOptions) as Transporter

    return cachedTransport
}

/**
 * 重置缓存（测试 / 动态配置变更时使用）。
 *
 * @internal 暴露给单测；生产代码不应调用
 */
export function resetMailerTransportCache(): void {
    cachedTransport = undefined
}
