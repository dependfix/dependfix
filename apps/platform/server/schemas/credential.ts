import { z } from 'zod'

/** 凭据创建校验（Zod）。token 为必填（创建时），type 枚举校验。 */
export const credentialSchema = z.object({
    name: z.string().trim().min(1, '名称不能为空').max(100),
    type: z.enum(['classic-pat', 'fine-grained-pat', 'github-app']),
    /** 明文 token（仅创建时提交；更新时省略表示不修改） */
    token: z.string().trim().min(1, 'token 不能为空').max(10000),
    note: z.string().max(500).nullable().optional(),
})

/**
 * 凭据更新：token 可选（省略或空串表示不修改 token）。
 * 注意：更新走 credentialUpdateSchema，不应用创建时的 min(1) 必填约束。
 */
export const credentialUpdateSchema = z.object({
    name: z.string().trim().min(1, '名称不能为空').max(100).optional(),
    type: z.enum(['classic-pat', 'fine-grained-pat', 'github-app']).optional(),
    /** token 省略/空串 = 不修改；提供非空值才重新加密 */
    token: z.string().trim().max(10000).optional(),
    note: z.string().max(500).nullable().optional(),
})

export type CredentialInput = z.infer<typeof credentialSchema>
