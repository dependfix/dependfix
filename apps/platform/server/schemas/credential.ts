import { z } from 'zod'

/**
 * 凭据类型判别联合（discriminated union）。
 *
 * - PAT 路径（classic-pat / fine-grained-pat）：必填 `token` 明文
 * - GitHub App 路径（github-app）：必填 `appId` / `encryptedPrivateKey` / `installationId`；
 *   `botLogin` 可选（用于 commit author 动态生成），`token` 字段被禁用
 *
 * @see [C22 PAT 无感升级评估 §4.5 调用点改造](../../../../docs/design/governance/c22-pat-backward-compat.md)
 */
const patCredentialFields = {
    /** 明文 token（仅创建时提交；更新时省略表示不修改） */
    token: z.string().trim().min(1, 'token 不能为空').max(10000),
}

const githubAppCredentialFields = {
    /** GitHub App ID（公开信息） */
    appId: z.string().trim().min(1, 'App ID 不能为空').max(32),
    /** PEM 私钥（明文提交，服务端 AES-256-GCM 加密存储；type='github-app' 时必填） */
    encryptedPrivateKey: z.string().trim().min(1, 'PEM 私钥不能为空').max(10000),
    /** Installation ID（公开信息） */
    installationId: z.string().trim().min(1, 'Installation ID 不能为空').max(32),
    /** Bot 用户名（用于 commit author 动态生成；可选） */
    botLogin: z.string().trim().max(128).optional(),
}

/**
 * 凭据创建校验（Zod discriminated union + strict mode）。
 *
 * - type='classic-pat' | 'fine-grained-pat' → 必填 token，禁用 appId/encryptedPrivateKey/installationId
 * - type='github-app' → 必填 appId/encryptedPrivateKey/installationId，禁用 token
 * - `.strict()` 拒绝未声明字段（防止 PAT 路径误传 App 字段或反之）
 */
export const credentialSchema = z.discriminatedUnion('type', [
    z.object({
        name: z.string().trim().min(1, '名称不能为空').max(100),
        type: z.enum(['classic-pat', 'fine-grained-pat']),
        ...patCredentialFields,
        note: z.string().max(500).nullable().optional(),
    }).strict(),
    z.object({
        name: z.string().trim().min(1, '名称不能为空').max(100),
        type: z.literal('github-app'),
        ...githubAppCredentialFields,
        note: z.string().max(500).nullable().optional(),
    }).strict(),
])

/**
 * 凭据更新：所有字段可选（省略或空串表示不修改）。
 * 注意：更新走 credentialUpdateSchema，不应用创建时的 min(1) 必填约束。
 * `.strict()` 拒绝未声明字段。
 */
export const credentialUpdateSchema = z.object({
    name: z.string().trim().min(1, '名称不能为空').max(100).optional(),
    type: z.enum(['classic-pat', 'fine-grained-pat', 'github-app']).optional(),
    /** PAT token 省略/空串 = 不修改；提供非空值才重新加密 */
    token: z.string().trim().max(10000).optional(),
    // GitHub App 路径字段（全部可选；省略 = 不修改）
    appId: z.string().trim().min(1, 'App ID 不能为空').max(32).optional(),
    encryptedPrivateKey: z.string().trim().min(1, 'PEM 私钥不能为空').max(10000).optional(),
    installationId: z.string().trim().min(1, 'Installation ID 不能为空').max(32).optional(),
    botLogin: z.string().trim().max(128).nullable().optional(),
    note: z.string().max(500).nullable().optional(),
}).strict()

export type CredentialInput = z.infer<typeof credentialSchema>
export type CredentialUpdateInput = z.infer<typeof credentialUpdateSchema>
