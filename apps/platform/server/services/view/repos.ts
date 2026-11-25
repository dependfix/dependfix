import { parseSandboxLimits, parseTags, parseVerifyCommands, type Repository } from '#server/entities/repository'
import { parsePRCheckFocus } from '#server/utils/pr-check-focus'
import { redactAbsolutePaths, sanitizeString } from '#server/utils/sanitize'

/**
 * 仓库视图映射：内部端点与 `/api/v1` 共用。
 *
 * v1 白名单（设计稿 §6.2）：剔除 `verifyCommands`（等价远程命令执行面）、`credentialId` /
 * `credentialName`，分别改为 `hasCustomVerifyCommands` / `hasCredential` 布尔。
 */

/** 内部仓库列表视图（GET /api/repos 既有形状） */
export const toRepositoryListView = (repo: Repository) => ({
    id: repo.id,
    owner: repo.owner,
    name: repo.name,
    platform: repo.platform,
    defaultBranch: repo.defaultBranch,
    packageManager: repo.packageManager,
    credentialId: repo.credentialId,
    credentialName: repo.credential?.name ?? null,
    actionWorkflowFile: repo.actionWorkflowFile,
    executorKind: repo.executorKind,
    note: repo.note,
    tags: parseTags(repo.tags),
    sandboxLimits: parseSandboxLimits(repo.sandboxLimits),
    sandboxImage: repo.sandboxImage,
    verifyCommands: parseVerifyCommands(repo.verifyCommands),
    prCheckFocus: parsePRCheckFocus(repo.prCheckFocus),
    vercelProjectId: repo.vercelProjectId,
    cloudflareAccountId: repo.cloudflareAccountId,
    cloudflareWorkerTag: repo.cloudflareWorkerTag,
    executionTimeoutMs: repo.executionTimeoutMs,
    verifyCommandTimeoutMs: repo.verifyCommandTimeoutMs,
    installTimeoutMs: repo.installTimeoutMs,
    cloneTimeoutMs: repo.cloneTimeoutMs,
    allowMajorUpgrade: repo.allowMajorUpgrade,
    baselineRedCarrier: repo.baselineRedCarrier,
    aiEnabled: repo.aiEnabled,
    aiTrigger: repo.aiTrigger,
    lastScanAt: repo.lastScanAt,
    createdAt: repo.createdAt,
    updatedAt: repo.updatedAt,
})

/** 内部仓库详情视图（GET /api/repos/{id} 既有形状；不含 AI 字段） */
export const toRepositoryDetailView = (repo: Repository) => ({
    id: repo.id,
    owner: repo.owner,
    name: repo.name,
    platform: repo.platform,
    defaultBranch: repo.defaultBranch,
    packageManager: repo.packageManager,
    credentialId: repo.credentialId,
    credentialName: repo.credential?.name ?? null,
    actionWorkflowFile: repo.actionWorkflowFile,
    executorKind: repo.executorKind,
    note: repo.note,
    tags: parseTags(repo.tags),
    sandboxLimits: parseSandboxLimits(repo.sandboxLimits),
    sandboxImage: repo.sandboxImage,
    verifyCommands: parseVerifyCommands(repo.verifyCommands),
    prCheckFocus: parsePRCheckFocus(repo.prCheckFocus),
    vercelProjectId: repo.vercelProjectId,
    cloudflareAccountId: repo.cloudflareAccountId,
    cloudflareWorkerTag: repo.cloudflareWorkerTag,
    executionTimeoutMs: repo.executionTimeoutMs,
    verifyCommandTimeoutMs: repo.verifyCommandTimeoutMs,
    installTimeoutMs: repo.installTimeoutMs,
    cloneTimeoutMs: repo.cloneTimeoutMs,
    allowMajorUpgrade: repo.allowMajorUpgrade,
    baselineRedCarrier: repo.baselineRedCarrier,
    lastScanAt: repo.lastScanAt,
    createdAt: repo.createdAt,
    updatedAt: repo.updatedAt,
})

/**
 * v1 仓库视图（列表与详情共用）：不含 `credentialId` / `credentialName` / `verifyCommands`，
 * 备注等自由文本过 `sanitizeString`。
 */
export const toRepositoryV1View = (repo: Repository) => ({
    id: repo.id,
    owner: repo.owner,
    name: repo.name,
    platform: repo.platform,
    defaultBranch: repo.defaultBranch,
    packageManager: repo.packageManager,
    hasCredential: Boolean(repo.credentialId),
    actionWorkflowFile: repo.actionWorkflowFile,
    executorKind: repo.executorKind,
    note: repo.note ? redactAbsolutePaths(sanitizeString(repo.note)) : null,
    tags: parseTags(repo.tags),
    sandboxLimits: parseSandboxLimits(repo.sandboxLimits),
    sandboxImage: repo.sandboxImage,
    hasCustomVerifyCommands: parseVerifyCommands(repo.verifyCommands).length > 0,
    prCheckFocus: parsePRCheckFocus(repo.prCheckFocus),
    executionTimeoutMs: repo.executionTimeoutMs,
    verifyCommandTimeoutMs: repo.verifyCommandTimeoutMs,
    installTimeoutMs: repo.installTimeoutMs,
    cloneTimeoutMs: repo.cloneTimeoutMs,
    allowMajorUpgrade: repo.allowMajorUpgrade,
    aiEnabled: repo.aiEnabled,
    aiTrigger: repo.aiTrigger,
    lastScanAt: repo.lastScanAt,
    createdAt: repo.createdAt,
    updatedAt: repo.updatedAt,
})
