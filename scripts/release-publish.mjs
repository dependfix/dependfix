/**
 * release-publish.mjs —— 发布执行器（替代 changeset publish）
 *
 * 按发布顺序（packages.config.mjs publishOrder，被依赖方先行）遍历发布包，
 * 只发布"本地版本未出现在 npm registry"的包，并为每个发布的包创建
 * `<pkg>@<version>` 格式的 annotated tag（指向 HEAD——发布提交即版本提升 +
 * changelog 提交，天然 touch 所有发布包路径，满足 changelog 分段锚点约束）。
 *
 * 已发布判定（多源兜底，与 tag-released-versions.mjs / changelog.mjs 同口径）：
 * - 本地 git tag 已存在（<prefix><version>）→ 跳过（已发布过）
 * - npm registry 已发布该版本（npm view 命中）→ 跳过
 * - npm 查询失败（离线/限流）→ 保守跳过（宁可漏发也不误判）
 *
 * 用法：
 *   pnpm release:publish            # 发布所有未发布版本并按序打 tag
 *   pnpm release:publish --dry-run  # 仅预览将发布的包与将创建的 tag，不实际执行
 *
 * 认证：
 * - CI（GitHub Actions）：OIDC trusted publishing（id-token: write），无需 token
 * - 本地手动：复用 npm 登录凭据（npm login）
 * 发布底层为 `pnpm publish --no-git-checks`（--no-git-checks 与 changeset 内部
 * 行为一致：脚本自行管理 tag 与流程，不依赖 pnpm 的 gitChecks 前置校验）。
 * pnpm publish 会自动将 workspace:* 依赖替换为实际版本号。
 */
import { execSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { PUBLISHABLE_PACKAGES } from './packages.config.mjs'
import { hasLocalTag, isPublishedOnRegistry, readPackageVersion } from './tag-released-versions.mjs'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))

function git(args) {
    return execSync(`git ${args}`, { cwd: repoRoot, encoding: 'utf8' }).trim()
}

/**
 * 构建发布计划（纯函数，依赖注入便于测试）。
 * 返回每包计划：{ pkg, path, version, tagName, action }
 * action：publish / skip-tag-exists / skip-published / skip-registry-error
 */
export function buildPublishPlan(packages, deps) {
    const { versionOf, hasTag, isPublished } = deps
    return packages.map((p) => {
        const version = versionOf(p.path)
        const tagName = `${p.tags.prefix}${version}`
        if (hasTag(tagName)) {
            return { pkg: p.pkg, path: p.path, version, tagName, action: 'skip-tag-exists' }
        }
        const published = isPublished(p.pkg, version)
        if (published !== false) {
            return {
                pkg: p.pkg,
                path: p.path,
                version,
                tagName,
                action: published === null ? 'skip-registry-error' : 'skip-published',
            }
        }
        return { pkg: p.pkg, path: p.path, version, tagName, action: 'publish' }
    })
}

/** 执行发布 + 打 tag（副作用；失败时 execSync 抛错 → 进程非零退出） */
export function publishOne(planItem) {
    console.log(`publishing ${planItem.pkg}@${planItem.version}`)
    execSync(`pnpm --filter ${planItem.pkg} publish --no-git-checks`, {
        cwd: repoRoot,
        stdio: 'inherit',
        encoding: 'utf8',
    })
    git(`tag -a "${planItem.tagName}" -m "release ${planItem.tagName}"`)
    console.log(`published ${planItem.pkg}@${planItem.version}，tag ${planItem.tagName} 已创建`)
}

export async function main() {
    const dryRun = process.argv.includes('--dry-run')
    // registry 查询并行化（每包一次 fetch，isPublishedOnRegistry 为异步实现）
    const publishedByPkg = new Map()
    await Promise.all(
        PUBLISHABLE_PACKAGES.map(async (p) => {
            const version = readPackageVersion(p.path)
            publishedByPkg.set(p.pkg, await isPublishedOnRegistry(p.pkg, version))
        }),
    )
    const plan = buildPublishPlan(PUBLISHABLE_PACKAGES, {
        versionOf: (path) => readPackageVersion(path),
        hasTag: (tagName) => hasLocalTag(tagName),
        isPublished: (pkg) => publishedByPkg.get(pkg),
    })

    const publishes = plan.filter((p) => p.action === 'publish')
    if (publishes.length === 0) {
        console.log('没有需要发布的版本（全部已发布 / 查询失败保守跳过）')
    }
    for (const p of plan) {
        switch (p.action) {
            case 'publish':
                if (dryRun) {
                    console.log(`[dry-run] would publish ${p.pkg}@${p.version} + tag ${p.tagName}`)
                } else {
                    publishOne(p)
                }
                break
            case 'skip-tag-exists':
                console.log(`skip ${p.pkg}@${p.version}（本地 tag ${p.tagName} 已存在）`)
                break
            case 'skip-published':
                console.log(`skip ${p.pkg}@${p.version}（npm 已发布）`)
                break
            case 'skip-registry-error':
                console.log(`skip ${p.pkg}@${p.version}（npm 查询失败，保守跳过）`)
                break
        }
    }
    if (dryRun && publishes.length > 0) {
        console.log('dry-run 完成，未执行任何发布；确认无误后去掉 --dry-run 执行')
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main()
}
