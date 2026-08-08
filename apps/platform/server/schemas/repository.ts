import { z } from 'zod'

/** 仓库创建校验（Zod）。owner/name 为必填，其余有默认或可选。 */
const repositoryBase = z.object({
    owner: z.string().trim().min(1, 'owner 不能为空').max(100).regex(/^[A-Za-z0-9_.-]+$/, 'owner 含非法字符'),
    name: z.string().trim().min(1, '仓库名不能为空').max(100).regex(/^[A-Za-z0-9_.-]+$/, '仓库名含非法字符'),
    platform: z.enum(['github']).default('github'),
    defaultBranch: z.string().trim().min(1).max(100).default('main'),
    packageManager: z.enum(['pnpm', 'npm', 'yarn']).default('pnpm'),
    credentialId: z.string().trim().max(36).nullable().optional(),
    actionWorkflowFile: z.string().trim().max(255).nullable().optional(),
    executorKind: z.enum(['container', 'github-action']).default('container'),
    note: z.string().max(500).nullable().optional(),
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

/** 仓库更新：允许部分字段（含同一交叉校验，仅当字段存在时生效）。 */
export const repositoryUpdateSchema = repositorySchema.partial()

export type RepositoryInput = z.infer<typeof repositorySchema>
