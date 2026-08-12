/**
 * push-release-tags.mjs —— 发布 tag 推送与核验脚本（release:push-tags，CI 用）
 *
 * 教训（2026-08-08 实证，经验归档 §二十六）：`git config --global
 * url."https://x-access-token:${TOKEN}@github.com/".insteadOf "https://github.com/"`
 * + `git push origin --tags` 在 CI 下实测输出 "Everything up-to-date" 但 tag 未推送
 * （run 31208208621）——insteadOf 的 URL 替换在 Actions checkout
 * （fetch-tags: false + persist-credentials: false）环境下不可靠。
 * 改用显式带 token 的 push URL（官方推荐模式），并推送后核验本地/远程 tag
 * 集合一致（缺失即报错，静默失败从此显式化）。
 *
 * 用法（仅 CI；需要 GITHUB_TOKEN 与 GITHUB_REPOSITORY 环境变量）：
 *   GITHUB_TOKEN=xxx GITHUB_REPOSITORY=dependfix/dependfix pnpm release:push-tags
 */
import { execSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))

/**
 * 推送并核验 tag（纯函数，注入 git 调用便于测试）：
 * 1. push --tags（显式 token URL，不依赖 insteadOf 全局替换）
 * 2. fetch --tags 后对比本地/远程 tag 集合
 * 3. 本地有而远程缺失的 tag → 抛错（CI 失败），返回已同步的本地 tag 列表
 */
export function pushAndVerifyTags({ git, token, repository }) {
    const url = `https://x-access-token:${token}@github.com/${repository}.git`
    git(`push "${url}" --tags`)
    git(`fetch "${url}" --tags`)
    const localTags = git('tag').split('\n').filter(Boolean)
    // 注意：`--tags` 必须放在 URL 之前（`git ls-remote <url> --tags` 会把 --tags 当
    // ref pattern 匹配，恒输出空 → 核验误报全部缺失；run 31574450935 首次真实执行暴露）
    const remoteTags = new Set(
        git(`ls-remote --tags "${url}"`)
            .split('\n')
            .filter(Boolean)
            .map((line) => line.split('\t')[1]?.replace('refs/tags/', ''))
            .filter(Boolean),
    )
    const missing = localTags.filter((t) => !remoteTags.has(t))
    if (missing.length > 0) {
        throw new Error(`以下 tag 未同步到远程（推送失败或未生成）：${missing.join(' ')}`)
    }
    return localTags
}

/**
 * 失败信息脱敏（纯函数，便于测试）：优先 stderr（git 自身输出已脱敏 URL 凭据
 * 为 x-access-token:***），message 兜底并 replaceAll 二次保险——execSync 失败时
 * 错误 message 含完整命令字符串（含明文 token），直接抛出会把 GITHUB_TOKEN
 * 写进 CI 日志。
 */
export function sanitizeError(err, token) {
    const msg = String(err?.stderr ?? err?.message ?? err)
    return token ? msg.replaceAll(token, '***') : msg
}

export function main() {
    const token = process.env.GITHUB_TOKEN
    const repository = process.env.GITHUB_REPOSITORY
    if (!token || !repository) {
        console.error('缺少 GITHUB_TOKEN 或 GITHUB_REPOSITORY 环境变量（仅 CI 环境可用）')
        process.exit(1)
    }
    const git = (args) => execSync(`git ${args}`, { cwd: repoRoot, encoding: 'utf8' }).trim()
    try {
        const tags = pushAndVerifyTags({ git, token, repository })
        console.log(`all release tags pushed to remote（${tags.length} 个）`)
    } catch (err) {
        console.error(sanitizeError(err, token))
        process.exit(1)
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main()
}
