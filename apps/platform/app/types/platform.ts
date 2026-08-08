/**
 * 平台前后端共享类型（app 侧视图类型，与 server/api 返回结构对齐）。
 */

/** 仓库视图（server/api/repos 返回结构；日期经 Nuxt 序列化为 ISO 字符串） */
export interface RepoView {
    id: string
    owner: string
    name: string
    platform: string
    defaultBranch: string
    packageManager: string
    credentialId: string | null
    credentialName: string | null
    actionWorkflowFile: string | null
    executorKind: string
    note: string | null
    lastScanAt: string | null
    createdAt: string
    updatedAt: string
}

/** 凭据视图（server/api/credentials 返回结构，token 永不返回） */
export interface CredentialView {
    id: string
    name: string
    type: 'classic-pat' | 'fine-grained-pat' | 'github-app'
    note: string | null
    lastUsedAt: string | null
    createdAt: string
    updatedAt: string
    hasToken: boolean
}
