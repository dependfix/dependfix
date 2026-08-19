import { z } from 'zod'
import { repositorySchema } from './repository'

/**
 * 批量导入仓库请求校验：项复用 repositorySchema（owner/name 正则、默认值、
 * github-action→actionWorkflowFile 交叉校验与单个添加入口保持单一校验源）。
 * 顶层 defaultCredentialId：批量导入默认关联凭据（docs/plan/todo.md §PR3-3 C50）；
 * 与 repositorySchema.credentialId 字段风格保持一致（trim + max 36 + nullable）。
 * 业务层校验（凭据存在性 + 同组织）由 batch.post.ts 路由 handler 前置负责，
 * schema 层仅做格式校验，避免 schema 耦合 credential 实体。
 */
export const batchImportSchema = z.object({
    repos: z.array(repositorySchema).min(1, '至少选择一个仓库').max(100, '单次最多导入 100 个'),
    defaultCredentialId: z.string().trim().max(36).nullable().optional(),
})

export type BatchImportInput = z.infer<typeof batchImportSchema>
