export interface ToolchainInfo {
    nodeVersion: string
    pnpmVersion: string | null
    source: 'packageManager' | 'env' | 'config' | 'runtime'
}

export interface ToolchainRecord {
    before: ToolchainInfo
    after: ToolchainInfo
}

export function createDefaultToolchain(): ToolchainInfo {
    return {
        nodeVersion: process.version.replace(/^v/, ''),
        pnpmVersion: null,
        source: 'runtime',
    }
}

export function resolveToolchainVersions(packageJson?: {
    packageManager?: string
}): ToolchainInfo {
    const packageManager = packageJson?.packageManager

    if (packageManager) {
        const match = /pnpm@(\d+\.\d+\.\d+)/.exec(packageManager)
        if (match) {
            return {
                nodeVersion: process.version.replace(/^v/, ''),
                pnpmVersion: match[1],
                source: 'packageManager',
            }
        }
    }

    const pnpmVersion = process.env.PNPM_VERSION

    if (pnpmVersion) {
        return {
            nodeVersion: process.env.NODE_VERSION || process.version.replace(/^v/, ''),
            pnpmVersion,
            source: 'env',
        }
    }

    return createDefaultToolchain()
}
