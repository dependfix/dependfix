import { readFileSync, existsSync } from 'node:fs'
import { AppError, isValidRepoIdentifier } from '@dependfix/core'

/**
 * 从文件读取仓库列表（每行一个 `owner/repo`）。
 * 空行和 `#` 开头的注释行会被跳过。
 */
export function readReposFile(filePath: string): string[] {
    if (!existsSync(filePath)) {
        throw new AppError(
            'REPO_FILE_NOT_FOUND',
            `Repositories file not found: ${filePath}`,
        )
    }

    const content = readFileSync(filePath, 'utf-8')
    const lines = content.split('\n')
    const repos: string[] = []

    for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i].trim()

        // 跳过空行和注释
        if (!line || line.startsWith('#')) {
            continue
        }

        if (!isValidRepoIdentifier(line)) {
            throw new AppError(
                'CONFIG_VALIDATION_ERROR',
                `Invalid repository identifier at ${filePath}:${i + 1}: "${line}". Expected format: owner/repo`,
            )
        }

        repos.push(line)
    }

    if (repos.length === 0) {
        throw new AppError(
            'CONFIG_VALIDATION_ERROR',
            `No valid repository identifiers found in ${filePath}`,
        )
    }

    return repos
}

/**
 * 合并 CLI 传入仓库列表与文件中的仓库列表，去重并校验。
 */
export function resolveRepoList(
    cliRepos: string[],
    reposFilePath?: string,
): string[] {
    const repos = [...cliRepos]

    if (reposFilePath) {
        const fileRepos = readReposFile(reposFilePath)
        repos.push(...fileRepos)
    }

    const deduped = [...new Set(repos)]

    for (const repo of deduped) {
        if (!isValidRepoIdentifier(repo)) {
            throw new AppError(
                'CONFIG_VALIDATION_ERROR',
                `Invalid repository identifier: "${repo}". Expected format: owner/repo`,
            )
        }
    }

    return deduped
}
