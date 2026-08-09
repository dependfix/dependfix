import { z } from 'zod'
import { repositorySchema } from './repository'

/**
 * 批量导入仓库请求校验：项复用 repositorySchema（owner/name 正则、默认值、
 * github-action→actionWorkflowFile 交叉校验与单个添加入口保持单一校验源）。
 */
export const batchImportSchema = z.object({
    repos: z.array(repositorySchema).min(1, '至少选择一个仓库').max(100, '单次最多导入 100 个'),
})

export type BatchImportInput = z.infer<typeof batchImportSchema>
