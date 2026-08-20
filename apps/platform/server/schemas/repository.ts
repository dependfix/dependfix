import { z } from 'zod'

/** 仓库创建基础校验（Zod）。owner/name 为必填，其余有默认或可选。 */
export const repositoryBase = z.object({
    owner: z.string().trim().min(1, 'owner 不能为空').max(100).regex(/^[A-Za-z0-9_.-]+$/, 'owner 含非法字符'),
    name: z.string().trim().min(1, '仓库名不能为空').max(100).regex(/^[A-Za-z0-9_.-]+$/, '仓库名含非法字符'),
    platform: z.enum(['github']).default('github'),
    defaultBranch: z.string().trim().min(1).max(100).default('main'),
    packageManager: z.enum(['pnpm', 'npm', 'yarn']).default('pnpm'),
    credentialId: z.string().trim().max(36).nullable().optional(),
    actionWorkflowFile: z.string().trim().max(255).nullable().optional(),
    executorKind: z.enum(['container', 'github-action', 'sandbox']).default('container'),
    note: z.string().max(500).nullable().optional(),
    /** 仓库标签（数组形式输入；空数组在 API 层转 null 存储；更新语义：undefined=不修改 / null 或 [] = 清空） */
    tags: z.array(z.string().trim().min(1, '标签不能为空').max(50)).max(20, '最多 20 个标签').nullable().optional(),
    /**
     * 沙箱资源限额覆盖（可选；缺省走平台 SANDBOX_DEFAULTS：2048MB / 1.0 CPU）。
     * 字段范围：memoryMb [64, 32768] 整数 MB / cpu [0.1, 16]。
     * 限额优先级（sandbox-executor.ts:107 注释）：仓库级 sandboxLimits > 沙箱级 > SANDBOX_DEFAULTS。
     * UI 不暴露该字段（M11 T1005-B 决策），仅 API 层透传；演进路径：未来可加折叠面板批量配置。
     */
    sandboxLimits: z.object({
        memoryMb: z.number().int().min(64, 'memoryMb 至少 64MB').max(32768, 'memoryMb 至多 32768MB (32GB)').optional(),
        cpu: z.number().min(0.1, 'cpu 至少 0.1').max(16, 'cpu 至多 16').optional(),
    }).nullable().optional(),
})

/**
 * 仓库创建校验（含交叉校验：github-action 必须声明 actionWorkflowFile）。
 * owner/name 为必填，其余有默认或可选。
 */
export const repositorySchema = repositoryBase.superRefine((data, ctx) => {
    if (data.executorKind === 'github-action' && !data.actionWorkflowFile?.trim()) {
        ctx.addIssue({
            code: 'custom',
            path: ['actionWorkflowFile'],
            message: '选择 GitHub Action 执行时必须填写目标 workflow 文件路径',
        })
    }
})

/**
 * 仓库更新：允许部分字段（含同一交叉校验，仅当字段存在时生效）。
 * 注意：Zod v4 不允许对含 refinement 的 schema 调用 .partial()，故先 partial 再挂 superRefine。
 */
export const repositoryUpdateSchema = repositoryBase.partial().superRefine((data, ctx) => {
    if (data.executorKind === 'github-action' && !data.actionWorkflowFile?.trim()) {
        ctx.addIssue({
            code: 'custom',
            path: ['actionWorkflowFile'],
            message: '选择 GitHub Action 执行时必须填写目标 workflow 文件路径',
        })
    }
})

export type RepositoryInput = z.infer<typeof repositorySchema>
