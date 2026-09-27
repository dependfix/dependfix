import { AppError, isValidRepoIdentifier } from '@dependfix/core'
import { isValidPnpmVersion } from '../fixers/pnpm'
import { isValidConcurrency } from '../multirepo/scheduler'
import type { GitHubAppConfig, RuntimeConfig } from './index'

/**
 * 运行时配置校验（从 `config/index.ts` 拆分以控制单文件行数）。
 *
 * 校验失败统一抛 `AppError('CONFIG_VALIDATION_ERROR')`，供 CLI / 平台在解析阶段 fail-fast。
 */
export function validateRuntimeConfig(config: RuntimeConfig): RuntimeConfig {
    const isAuditSource = config.alertSource === 'pnpm-audit'

    // pnpm-audit 模式不要求 GitHub token（本地回退的核心场景）
    if (!isAuditSource && !config.githubToken) {
        throw new AppError(
            'CONFIG_VALIDATION_ERROR',
            'Missing GitHub token. Provide GITHUB_TOKEN or DEPENDFIX_GITHUB_TOKEN.',
        )
    }

    // owner 发现需要 GitHub API，pnpm-audit 本地场景无法发现
    if (isAuditSource && config.owner && config.owner.length > 0) {
        throw new AppError(
            'CONFIG_VALIDATION_ERROR',
            '--owner / DEPENDFIX_OWNER requires the github-dependabot alert source (owner discovery uses the GitHub API).',
        )
    }

    // cleanup-branches 模式不做 owner 发现（分支清理需明确目标仓库）
    if (config.mode === 'cleanup-branches' && config.owner && config.owner.length > 0) {
        throw new AppError(
            'CONFIG_VALIDATION_ERROR',
            '--owner / DEPENDFIX_OWNER is not supported in cleanup-branches mode (branch cleanup requires explicit target repositories).',
        )
    }

    // cleanup-branches 模式串行执行（不走并发管线）；maxConcurrency>1 属无效配置，fail-fast
    if (config.mode === 'cleanup-branches' && config.maxConcurrency > 1) {
        throw new AppError(
            'CONFIG_VALIDATION_ERROR',
            'maxConcurrency > 1 is not supported in cleanup-branches mode (branch cleanup runs sequentially).',
        )
    }

    if (config.repositories.length === 0 && !(config.owner && config.owner.length > 0)) {
        if (isAuditSource) {
            // pnpm-audit 模式允许无 --repo：repository 由 app 层解析（git remote → local 兜底）
        } else {
            throw new AppError(
                'CONFIG_VALIDATION_ERROR',
                'Missing target repositories. Provide --repo, --repository, --repos-file, --owner or DEPENDFIX_REPOSITORIES / DEPENDFIX_OWNER.',
            )
        }
    }

    for (const repo of config.repositories) {
        if (!isValidRepoIdentifier(repo)) {
            throw new AppError('CONFIG_VALIDATION_ERROR', `Invalid repository identifier: "${repo}". Expected format: owner/repo`)
        }
    }

    // pnpm-audit 只扫当前目录一个 lockfile，无法对应多个仓库
    if (isAuditSource && config.repositories.length > 1) {
        throw new AppError(
            'CONFIG_VALIDATION_ERROR',
            'pnpm-audit alert source supports at most one repository (it scans the current workspace lockfile).',
        )
    }

    // Code Scanning 是 GitHub API 并行源，pnpm-audit 本地场景无法拉取
    if (isAuditSource && config.codeScanningEnabled) {
        throw new AppError(
            'CONFIG_VALIDATION_ERROR',
            'code-scanning requires the github-dependabot alert source (Code Scanning alerts are fetched from the GitHub API).',
        )
    }

    // Code Quality 与 Code Scanning 同源：pnpm-audit 本地场景无对应 GitHub 仓库
    if (isAuditSource && config.codeQualityEnabled) {
        throw new AppError(
            'CONFIG_VALIDATION_ERROR',
            'code-quality requires the github-dependabot alert source (Code Quality findings are fetched from the GitHub API).',
        )
    }

    // PR 必须 GitHub，audit 数据无对应仓库
    if (isAuditSource && config.mode === 'fix-and-pr') {
        throw new AppError(
            'CONFIG_VALIDATION_ERROR',
            'fix-and-pr mode requires the github-dependabot alert source. Use pnpm-audit with report-only/fix mode instead.',
        )
    }

    // 分支清理完全依赖 GitHub API，与 audit 数据源语义无关；
    // 不校验则无 remote 目录 + audit 模式会 exit 0 静默空跑（同构缺陷）
    if (isAuditSource && config.mode === 'cleanup-branches') {
        throw new AppError(
            'CONFIG_VALIDATION_ERROR',
            'cleanup-branches mode requires the github-dependabot alert source (branch cleanup needs GitHub API).',
        )
    }

    if (config.mode === 'report-only' && config.createPullRequest) {
        throw new AppError('CONFIG_VALIDATION_ERROR', 'createPullRequest cannot be enabled when mode is report-only.')
    }

    if (config.dryRun && config.createPullRequest) {
        throw new AppError('CONFIG_VALIDATION_ERROR', 'createPullRequest cannot be enabled while dryRun is true.')
    }

    if (config.commit && config.mode !== 'fix') {
        throw new AppError('CONFIG_VALIDATION_ERROR', 'commit is only supported in fix mode.')
    }

    if (config.commit && config.dryRun) {
        throw new AppError('CONFIG_VALIDATION_ERROR', 'commit cannot be enabled while dryRun is true.')
    }

    if (config.commit && config.createPullRequest) {
        throw new AppError('CONFIG_VALIDATION_ERROR', 'commit cannot be enabled together with createPullRequest. Use fix-and-pr mode instead.')
    }

    // 工具链 pnpm 版本格式校验（用户显式输入 fail-fast；格式非法拒绝，防命令注入）
    if (config.toolchainPnpmVersion !== undefined && !isValidPnpmVersion(config.toolchainPnpmVersion)) {
        throw new AppError(
            'CONFIG_VALIDATION_ERROR',
            `Invalid toolchainPnpmVersion: "${config.toolchainPnpmVersion}". Expected semver like 10.5.2 (optionally +sha512.<hash>).`,
        )
    }

    // 多仓库并发窗口：1-16；超过上限 fail-fast，避免无意打爆 GitHub API
    if (!isValidConcurrency(config.maxConcurrency)) {
        throw new AppError(
            'CONFIG_VALIDATION_ERROR',
            `maxConcurrency must be between 1 and 16 (got ${config.maxConcurrency}).`,
        )
    }

    // fix / fix-and-pr 共享单一 workDir（package.json + pnpm-lock.yaml + node_modules），
    // 并发写存在快照覆盖 / 互踩回滚 / install 竞争，仅 report-only 允许并发
    if (config.maxConcurrency > 1 && (config.mode === 'fix' || config.mode === 'fix-and-pr')) {
        throw new AppError(
            'CONFIG_VALIDATION_ERROR',
            'maxConcurrency > 1 is only supported in report-only mode (fix / fix-and-pr share a single workDir — parallel writes are unsafe).',
        )
    }

    // 限流重试次数：0-10；超过 10 次重试属异常配置
    if (!Number.isInteger(config.maxRetries) || config.maxRetries < 0 || config.maxRetries > 10) {
        throw new AppError(
            'CONFIG_VALIDATION_ERROR',
            `maxRetries must be between 0 and 10 (got ${config.maxRetries}).`,
        )
    }

    // 退避等待上限：100ms-120s；过低会频繁重试打爆 API，过高会长时间空转
    if (!Number.isInteger(config.maxBackoffMs) || config.maxBackoffMs < 100 || config.maxBackoffMs > 120_000) {
        throw new AppError(
            'CONFIG_VALIDATION_ERROR',
            `maxBackoffMs must be between 100 and 120000 (got ${config.maxBackoffMs}).`,
        )
    }

    // AI 研判：开启时必须提供 apiKey（防静默不生效 / 意外产生费用）；dry-run 不触发
    if (config.ai?.enabled && !config.ai.apiKey) {
        throw new AppError(
            'CONFIG_VALIDATION_ERROR',
            'AI 研判已开启但缺少 API Key。请设置 DEPENDFIX_AI_API_KEY 或 --ai-api-key（OpenAI 兼容端点 / Anthropic）。',
        )
    }

    if (config.githubApp) {
        validateGitHubAppConfig(config.githubApp)
    }

    return config
}

function validateGitHubAppConfig(config: GitHubAppConfig): void {
    if (!config.appId || !config.privateKey || !config.installationId) {
        throw new AppError(
            'CONFIG_VALIDATION_ERROR',
            'GitHub App config requires appId, privateKey, and installationId',
        )
    }
}
