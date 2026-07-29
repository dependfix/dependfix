export * from './client'
export * from './errors'
export * from './repo-selector'

// ---------------------------------------------------------------------------
// Deprecated: Module Descriptor pattern (legacy from M0, to be refactored in T109)
// ---------------------------------------------------------------------------

/**
 * @deprecated 使用 `OctokitClientOptions` (from ./client) 替代。
 * M0 遗留的 descriptor 模式选项，T109 重构后移除。
 */
export interface GitHubClientOptions {
    token?: string
    apiBaseUrl?: string
}

export interface GitHubClientDescriptor {
    module: 'github'
    options: GitHubClientOptions
}

export function createGitHubClientDescriptor(options: GitHubClientOptions = {}): GitHubClientDescriptor {
    return {
        module: 'github',
        options,
    }
}
