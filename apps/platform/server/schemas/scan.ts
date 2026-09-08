import { z } from 'zod'

/**
 * 扫描请求校验（Zod）。
 *
 * reuseScanRunId（todo.md §M16.2 C66-D）：
 * - 可选；传值时复用已有 ScanRun.id 作为本次执行载体（避免新建 pending run）
 * - 用于 alerts 视图 "立即修复此仓库" 入口：复用 report-only run 的 scan_result 数据，
 *   直接进入 fix 流程，不重拉告警（重拉会重复触发 Dependabot / pnpm audit 等外部调用）
 * - 服务端再校验：必须属于同一 repositoryId + 必须处于可复用状态（终态 / pending / running 任一允许）
 *
 * AI 研判覆盖（todo.md §M25.2a + [platform-ai-integration.md §6.1](../design/governance/platform-ai-integration.md)）：
 * - aiEnabled / aiTrigger 为可选字段，作为本次扫描的运行时 override
 * - 合并优先级：API override > Repository.aiEnabled / Repository.aiTrigger > Organization 共享 Key
 * - aiEnabled=true 但 Organization 未配置 Key → 服务端校验 400
 * - aiEnabled=true 但 Repository.aiEnabled=false 且 API 未传 aiEnabled → 服务端拒绝（防误启用）
 */
export const scanRequestSchema = z.object({
    mode: z.enum(['report-only', 'fix', 'fix-and-pr']).default('report-only'),
    severityThreshold: z.enum(['critical', 'high', 'medium', 'all']).default('high'),
    executorKind: z.enum(['container', 'github-action', 'sandbox']).optional(),
    reuseScanRunId: z.string().min(1).optional(),
    /** AI 研判开关（运行时 override 仓库默认） */
    aiEnabled: z.boolean().optional(),
    /** AI 研判触发范围（运行时 override 仓库默认） */
    aiTrigger: z.enum(['failure', 'major', 'both']).optional(),
})

export type ScanRequestInput = z.infer<typeof scanRequestSchema>
