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
