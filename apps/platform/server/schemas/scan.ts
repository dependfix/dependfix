import { z } from 'zod'

/** 扫描请求校验（Zod） */
export const scanRequestSchema = z.object({
    mode: z.enum(['report-only', 'fix', 'fix-and-pr']).default('report-only'),
    severityThreshold: z.enum(['critical', 'high', 'medium', 'all']).default('high'),
    executorKind: z.enum(['container', 'github-action', 'sandbox']).optional(),
})

export type ScanRequestInput = z.infer<typeof scanRequestSchema>
