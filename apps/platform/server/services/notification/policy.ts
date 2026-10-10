/**
 * 环境事件通知策略（apps/platform/server/services/notification/policy.ts）。
 *
 * 背景（M39.6 D 阶段定稿）：审计事件分两类，通知价值不同——
 * - **执行器 / 环境异常类**（sandbox 降级 / sandbox 运行时故障 / 容器执行器不可用）：
 *   反映执行环境健康，需管理员异步知晓 → **发通知**（email）。
 * - **配置留痕类**（ai_config_update / verify_commands_update）：由变更者本人在请求内发起，
 *   属正常运维信号、无异步告警价值 → **仅落库留痕，不发通知**。
 *
 * 单一事实源：`notifyEnvEvent` 在入口处调用 `shouldNotifyEnvEvent(event.type)` 判定，
 * 未来新增事件类型默认「不通知」（fail-safe，防通知量放大——见 todo.md §M39.6 风险②）。
 */

import type { AuditEventType } from '#server/entities/audit-event'

/** 可发通知的环境事件类型白名单（执行器 / 环境异常类） */
export const NOTIFIABLE_ENV_EVENT_TYPES: readonly AuditEventType[] = [
    'sandbox_unavailable',
    'sandbox_degraded',
    'container_unavailable',
] as const

const NOTIFIABLE_ENV_EVENT_TYPE_SET: ReadonlySet<string> = new Set(NOTIFIABLE_ENV_EVENT_TYPES)

/** 该事件类型是否应触发通知（未列入白名单 → false，仅留痕） */
export const shouldNotifyEnvEvent = (type: string): boolean => NOTIFIABLE_ENV_EVENT_TYPE_SET.has(type)
