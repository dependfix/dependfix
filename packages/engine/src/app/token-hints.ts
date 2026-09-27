import { AppError, toErrorMessage } from '@dependfix/core'

/**
 * PR 创建失败的用户指引。
 * 识别 GITHUB_TOKEN 创建 PR 被仓库设置禁用的 403（"GitHub Actions is not
 * permitted to create or approve pull requests"），返回解决指引；其他错误返回 null。
 */
export function pullRequestCreationHint(error: unknown): string | null {
    const message = toErrorMessage(error)
    if (message.includes('not permitted to create or approve pull requests')) {
        return 'GitHub Actions 创建 PR 被仓库设置禁用：仓库 Settings → Actions → General → Workflow permissions → 勾选 "Allow GitHub Actions to create and approve pull requests"；或改用具备 pull-requests: write 权限的 PAT 作为 github-token'
    }
    return null
}

/**
 * 判定 alerts fetch 错误是否为「alerts 功能未启用」。
 *
 * 与 PERMISSION_DENIED（token 权限不足）区分：未启用是仓库设置问题，
 * 属预期状态而非获取失败。仅 403 + 固定 message 可判定；其他情况退回
 * PERMISSION_DENIED 语义（不误判为「未启用」）。
 */
export function isAlertsDisabledError(error: unknown): boolean {
    return error instanceof AppError && error.code === 'ALERTS_DISABLED'
}

/**
 * Dependabot alerts 未启用提示文案（方案 A：未启用 ≠ 失败）。
 * 明确区分「仓库设置未开启」与「token 权限不足」，消除误导。
 */
export function dependabotAlertsDisabledHint(): string {
    return '仓库未启用 Dependabot alerts（非 token 权限问题）：仓库 Settings → Code security → Dependabot alerts 开启后重试；本地场景可切换 --alerts-source pnpm-audit 使用 pnpm audit 回退'
}

/**
 * Dependabot alerts fetch 错误用户指引（GITHUB_TOKEN 无法读取 Dependabot alerts）。
 * 仅用于 alerts fetch 错误路径；按精确 context 匹配（`fetch dependabot alerts for`），
 * 不依赖裸关键字（仓库名可能包含对方关键字，如 dependabot/dependabot-core）。
 *
 * 注：`ALERTS_DISABLED`（未启用）不走此函数——由 `isAlertsDisabledError` +
 * `dependabotAlertsDisabledHint` 独立处理。
 */
export function dependabotAlertsTokenHint(error: unknown): string | null {
    if (!(error instanceof AppError)) {
        return null
    }
    if (!error.message.includes('fetch dependabot alerts for')) {
        return null
    }
    if (error.code === 'PERMISSION_DENIED') {
        return '请检查 token 是否具备 Dependabot alerts 读取权限（classic PAT 需 security_events、fine-grained 需 Dependabot alerts: read、GitHub App 需对应仓库权限；Actions 默认 GITHUB_TOKEN 永远无法获得）。本地场景可切换 --alerts-source pnpm-audit 使用 pnpm audit 回退'
    }
    if (error.code === 'AUTHENTICATION_FAILED') {
        return 'token 无效或已过期，请检查 GITHUB_TOKEN / alertsToken 配置'
    }
    return null
}

/**
 * Code Scanning alerts fetch 错误用户指引（token 需 `security-events: read`）。
 * 仅用于 Code Scanning fetch 错误路径；按精确 context 匹配（`fetch code scanning alerts for`），
 * 不依赖裸关键字（仓库名可能包含对方关键字，如 dependabot/dependabot-core）。
 */
export function codeScanningAlertsTokenHint(error: unknown): string | null {
    if (!(error instanceof AppError)) {
        return null
    }
    if (!error.message.includes('fetch code scanning alerts for')) {
        return null
    }
    if (error.code === 'PERMISSION_DENIED') {
        return '请检查 token 是否具备 Code Scanning alerts 读取权限（security-events: read；Actions 默认 GITHUB_TOKEN 具备，本地 PAT 需勾选 Security events 或 fine-grained 的 Code scanning alerts: read）'
    }
    if (error.code === 'AUTHENTICATION_FAILED') {
        return 'token 无效或已过期，请检查 GITHUB_TOKEN / alertsToken 配置'
    }
    return null
}

/**
 * Code Quality findings fetch 错误用户指引（token 需 fine-grained `Code quality: read`
 * 或 classic PAT `repo`/`public_repo` scope）。
 * 仅用于 Code Quality fetch 错误路径；按精确 context 匹配（`fetch code quality findings for`），
 * 不依赖裸关键字。
 */
export function codeQualityAlertsTokenHint(error: unknown): string | null {
    if (!(error instanceof AppError)) {
        return null
    }
    if (!error.message.includes('fetch code quality findings for')) {
        return null
    }
    if (error.code === 'PERMISSION_DENIED') {
        return '请检查 token 是否具备 Code Quality findings 读取权限（fine-grained PAT 需 Code quality: read；classic PAT 需 repo / public_repo scope；GitHub App 需对应仓库权限）'
    }
    if (error.code === 'AUTHENTICATION_FAILED') {
        return 'token 无效或已过期，请检查 GITHUB_TOKEN / alertsToken 配置'
    }
    return null
}
