import { toHealthView } from '#server/services/view/health'

/**
 * GET /api/v1/health：只读观测面的免认证探活端点（设计稿 §6.1）。
 *
 * 与 `/api/health` 同源（`toHealthView`）：版本 / commit / 启动时间 / schema 漂移状态；
 * 不含凭据、环境变量与表列明细。该端点保持免认证，供编排器与 AI 客户端在配置 key 前确认平台可达。
 */
export default defineEventHandler(() => toHealthView())
