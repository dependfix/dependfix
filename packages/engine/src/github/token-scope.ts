import type { Octokit } from '@octokit/rest'

/**
 * 凭据权限面启动检查（安全治理：超权限 token 启动即警告）。
 *
 * 判定依据 GitHub API 的 `GET /user` 响应头：
 * - `x-oauth-scopes`：classic PAT 的 scope 列表（`repo` 即全量仓库权限）
 * - `x-accepted-github-permissions`：fine-grained PAT / 内置 GITHUB_TOKEN 的
 *   已接受权限列表（`resource: access` 格式）
 *
 * 语义：最小权限 = fine-grained token（仅目标仓库的
 * `contents`/`pull-requests` 写 + `security-events` 读 + `metadata` 读）。
 * classic PAT 的 `repo` scope 是全量仓库权限，属于超权限——一旦被恶意
 * 依赖脚本窃取即可接管所有可见仓库（威胁链 B 路径的最终防线是凭据权限面）。
 * 检查为 best-effort：网络失败 / 无 token / 无法判定时静默跳过，不阻断运行。
 */

export interface TokenScopeWarning {
    code: 'CLASSIC_REPO_SCOPE' | 'MISSING_SECURITY_EVENTS'
    message: string
}

export interface TokenScopeAnalysis {
    /** classic PAT 的 scopes（x-oauth-scopes 解析结果） */
    scopes?: string[]
    /** fine-grained PAT 的 accepted permissions（x-accepted-github-permissions 解析结果） */
    acceptedPermissions?: string[]
    /** 需要提示用户的权限问题（空 = 无问题） */
    warnings: TokenScopeWarning[]
}

export interface TokenScopeCheckResult extends TokenScopeAnalysis {
    /** 探测是否成功（鉴权/网络失败为 false，调用方静默跳过） */
    ok: boolean
    /** 认证用户登录名（探测成功时填充） */
    login?: string
}

const CLASSIC_REPO_SCOPE_WARNING: TokenScopeWarning = {
    code: 'CLASSIC_REPO_SCOPE',
    message:
        '检测到 classic PAT 且包含 repo（全量仓库）权限——该 token 一旦被恶意依赖脚本窃取，即可接管所有可见仓库。'
        + '建议改用 fine-grained PAT（最小权限：contents/pull-requests 写 + security-events 读，仅目标仓库），'
        + '详见 quick-start 安全注意事项。',
}

const MISSING_SECURITY_EVENTS_WARNING: TokenScopeWarning = {
    code: 'MISSING_SECURITY_EVENTS',
    message:
        '已开启 Code Scanning 告警源，但 token 缺少 security-events 读取权限——Code Scanning 告警将拉取失败。'
        + '请为 token 授予 security-events 读取权限（classic PAT 对应 security_events scope，'
        + '内置 GITHUB_TOKEN 默认具备）。',
}

/**
 * 解析 GitHub token 权限面并输出警告（纯函数，可单测）。
 *
 * @param scopeHeader `GET /user` 响应的 `x-oauth-scopes` 头（classic PAT 才有值）
 * @param acceptedHeader `GET /user` 响应的 `x-accepted-github-permissions` 头（fine-grained / 内置 token 才有值）
 * @param options.codeScanningEnabled 是否开启 Code Scanning 源（开启时校验 security-events 权限）
 */
export function analyzeTokenScope(
    scopeHeader: string | undefined,
    acceptedHeader: string | undefined,
    options: { codeScanningEnabled?: boolean } = {},
): TokenScopeAnalysis {
    const scopes = parseHeaderList(scopeHeader)
    const acceptedPermissions = parseHeaderList(acceptedHeader)

    // classic PAT：x-oauth-scopes 有值（与 fine-grained 头同时出现时 classic 优先——保守取超权限警告方向）
    if (scopes) {
        const warnings: TokenScopeWarning[] = []
        if (scopes.includes('repo')) {
            warnings.push(CLASSIC_REPO_SCOPE_WARNING)
        }
        // classic 的 security-events 对应 security_events scope（repo 隐式包含）；两者皆缺且开启 Code Scanning 才提示
        if (options.codeScanningEnabled
            && !scopes.includes('security_events')
            && !scopes.includes('repo')) {
            warnings.push(MISSING_SECURITY_EVENTS_WARNING)
        }
        return { scopes, warnings }
    }

    // fine-grained / 内置 token：x-accepted-github-permissions 有值
    if (acceptedPermissions) {
        const warnings: TokenScopeWarning[] = []
        if (options.codeScanningEnabled && !hasPermission(acceptedPermissions, 'security-events', 'read')) {
            warnings.push(MISSING_SECURITY_EVENTS_WARNING)
        }
        return { acceptedPermissions, warnings }
    }

    // 无权限信息（如 OAuth app token / 代理剥离响应头）：无法判定，不警告
    return { warnings: [] }
}

/** 校验 accepted permissions 是否包含指定 resource 的指定 access 级别。 */
function hasPermission(permissions: string[], resource: string, access: string): boolean {
    return permissions.some((p) => {
        const [res, acc] = p.split(':').map((s) => s.trim().toLowerCase())
        return res === resource && acc === access
    })
}

/** 解析逗号分隔的响应头（去空白去空项）；头缺失或为空返回 undefined。 */
function parseHeaderList(header: string | undefined): string[] | undefined {
    if (!header) {
        return undefined
    }
    const items = header
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    return items.length > 0 ? items : undefined
}

/**
 * 探测 token 权限面（网络调用，best-effort）。
 * 任何失败（鉴权 401 / 网络错误 / 超时）均静默返回 `ok: false`，不抛错。
 */
export async function checkTokenPermissions(
    client: Octokit,
    options: { codeScanningEnabled?: boolean } = {},
): Promise<TokenScopeCheckResult> {
    try {
        const response = await client.request('GET /user', {
            request: { signal: AbortSignal.timeout(5_000) },
        })
        const analysis = analyzeTokenScope(
            response.headers['x-oauth-scopes'],
            response.headers['x-accepted-github-permissions'],
            options,
        )
        return {
            ok: true,
            login: response.data.login,
            ...analysis,
        }
    } catch {
        return { ok: false, warnings: [] }
    }
}
