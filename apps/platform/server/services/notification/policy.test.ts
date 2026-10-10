import 'reflect-metadata'
import { describe, expect, it } from 'vitest'
import { NOTIFIABLE_ENV_EVENT_TYPES, shouldNotifyEnvEvent } from './policy'
import { AUDIT_EVENT_TYPES } from '#server/entities/audit-event'

describe('shouldNotifyEnvEvent（环境事件通知策略）', () => {
    it('执行器 / 环境异常类发通知', () => {
        for (const type of ['sandbox_unavailable', 'sandbox_degraded', 'container_unavailable']) {
            expect(shouldNotifyEnvEvent(type)).toBe(true)
        }
    })

    it('配置留痕类不发通知', () => {
        expect(shouldNotifyEnvEvent('ai_config_update')).toBe(false)
        expect(shouldNotifyEnvEvent('verify_commands_update')).toBe(false)
    })

    it('未知 / 空类型默认不发通知（fail-safe，防通知量放大）', () => {
        expect(shouldNotifyEnvEvent('cgroup_limit_hit')).toBe(false)
        expect(shouldNotifyEnvEvent('')).toBe(false)
    })

    it('白名单是 AUDIT_EVENT_TYPES 子集且显式排除配置留痕类', () => {
        const all = new Set<string>(AUDIT_EVENT_TYPES)
        for (const type of NOTIFIABLE_ENV_EVENT_TYPES) {
            expect(all.has(type)).toBe(true)
        }
        expect(NOTIFIABLE_ENV_EVENT_TYPES).not.toContain('ai_config_update')
        expect(NOTIFIABLE_ENV_EVENT_TYPES).not.toContain('verify_commands_update')
    })
})
