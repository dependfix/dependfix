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
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { PUBLISHABLE_PACKAGES } from './packages.config.mjs'
import { hasLocalTag, isPublishedOnRegistry, readPackageVersion } from './tag-released-versions.mjs'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
/** 发布结果临时产物（release:github 消费；gitignore） */
const RESULT_FILE = join(repoRoot, 'release-publish-result.json')

function git(args) {
    return execSync(`git ${args}`, { cwd: repoRoot, encoding: 'utf8' }).trim()
}

/**
 * 构建发布计划（纯函数，依赖注入便于测试）。
 * 返回每包计划：{ pkg, path, version, tagName, action }
 * action：publish / skip-tag-exists / skip-published / skip-registry-error / tag-only
 *
 * tag-only 分支：npmPublishable === false 包（如 apps/platform）跳过 npm publish
 * 但仍打 annotated tag，保证 changelog 历史可比 + docker 触发 platform-x.y.z tag。
 * 短路顺序：local tag 存在 → skip-tag-exists（任何 publishable 字段无关）；
 * 否则 npmPublishable=false → tag-only；否则走 isPublished 判定。
 */
export function buildPublishPlan(packages, deps) {
    const { versionOf, hasTag, isPublished } = deps
    return packages.map((p) => {
        const version = versionOf(p.path)
        const tagName = `${p.tags.prefix}${version}`
        if (hasTag(tagName)) {
            return { pkg: p.pkg, path: p.path, version, tagName, action: 'skip-tag-exists' }
        }
        if (p.npmPublishable === false) {
            return { pkg: p.pkg, path: p.path, version, tagName, action: 'tag-only' }
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
    // 锚点防御：tag 必须指向"同时 touch 该包路径"的提交（changelog 分段锚点约束，
    // 经验归档 §二十五/§二十六）。正常流程 HEAD = release:version + changelog 提交，
    // 天然满足；若在非发布提交上误执行，禁止打错 tag 污染推导基线。
    if (!headTouchesPath(planItem.path)) {
        throw new Error(
            `HEAD 不是 touch ${planItem.path} 的提交（${headHash()}），请确认已执行 release:version 并提交发布变更（package.json 版本 + CHANGELOG）后再发布`,
        )
    }
    console.log(`publishing ${planItem.pkg}@${planItem.version}`)
    execSync(`pnpm --filter ${planItem.pkg} publish --no-git-checks`, {
        cwd: repoRoot,
        stdio: 'inherit',
        encoding: 'utf8',
    })
    git(`tag -a "${planItem.tagName}" -m "release ${planItem.tagName}"`)
    console.log(`published ${planItem.pkg}@${planItem.version}，tag ${planItem.tagName} 已创建`)
}

/**
 * 仅打 tag 不发 npm（npmPublishable === false 包专用，见 §T1310）。
 * 锚点约束与 publishOne 一致：HEAD 必须 touch 该包路径，否则拒绝打 tag。
 * deps 注入便于单测（headTouches / tag）。
 */
export function tagOnly(planItem, deps = {}) {
    const headTouches = deps.headTouches ?? headTouchesPath
    const tag = deps.tag ?? ((name) => git(`tag -a "${name}" -m "release ${name}"`))
    const headHashFn = deps.headHash ?? headHash
    if (!headTouches(planItem.path)) {
        throw new Error(
            `HEAD 不是 touch ${planItem.path} 的提交（${headHashFn()}），请确认已执行 release:version 并提交发布变更（package.json 版本 + CHANGELOG）后再打 tag`,
        )
    }
    tag(planItem.tagName)
}

/**
 * 半发布状态恢复（幂等自愈）：npm 已发布但本地无 tag（上次发布中途失败，如 tag 创建
 * 前 CI 中断——经验归档 §三十七）或手动发布未补 tag 时，补打 annotated tag。
 * 锚点约束与 publishOne 一致（HEAD 必须 touch 该包路径）；校验失败返回 false，
 * 保持 skip-published 的安全跳过语义（不阻断其他包发布、不在错误 commit 上打 tag）。
 */
export function tagRecovered(planItem, deps) {
    const { headTouches, tag } = deps
    if (!headTouches(planItem.path)) {
        return false
    }
    tag(planItem.tagName)
    return true
}

/** HEAD commit 是否 touch 该包路径（`git log -1 -- <path>` 锚点 == HEAD） */
function headTouchesPath(pkgPath) {
    try {
        return git(`log -1 --format=%H -- "${pkgPath}"`) === headHash()
    } catch {
        return false
    }
}

function headHash() {
    return git('rev-parse HEAD')
}

/**
 * 解析聚合 Release 锚版本（纯函数）：主交付物优先（rootChangelog 包 → 其余按
 * publishOrder），在本轮实际发布列表中取第一个命中者。无发布 → null。
 */
export function resolveAnchorVersion(published, packages) {
    const order = [...packages].sort((a, b) => {
        if (a.rootChangelog !== b.rootChangelog) {
            return a.rootChangelog ? -1 : 1
        }
        return a.publishOrder - b.publishOrder
    })
    for (const p of order) {
        const item = published.find((x) => x.pkg === p.pkg)
        if (item) {
            return { pkg: item.pkg, version: item.version }
        }
    }
    return null
}

/**
 * 构建发布收尾计划（纯函数，依赖注入便于测试）：v tag 动作 + result.json 内容。
 * 返回 { result, vTag, vTagAction }：
 * - vTagAction: create / skip-exists（v tag 已存在不覆盖）/ skip-no-anchor（无锚包）
 * - result 恒为非空结构（published 可空）：release:github 据此走 skip-no-published
 *   安全退出（CI 无发布变更轮次 / 发布后重跑不红）
 */
export function buildFinalizePlan(published, packages, hasTag) {
    const anchor = resolveAnchorVersion(published, packages)
    const vTag = anchor ? `v${anchor.version}` : null
    let vTagAction
    if (!vTag) {
        vTagAction = 'skip-no-anchor'
    } else if (hasTag(vTag)) {
        vTagAction = 'skip-exists'
    } else {
        vTagAction = 'create'
    }
    return {
        result: {
            published: published.map((p) => ({ pkg: p.pkg, version: p.version })),
            anchorVersion: anchor?.version ?? null,
            anchorPkg: anchor?.pkg ?? null,
        },
        vTag,
        vTagAction,
    }
}

/**
 * 发布收尾（全部包发布/补 tag 完成后调用）：打 v<锚版本> 聚合 tag（幂等）+ 写 result.json。
 * tagged 为本轮实际打 tag 的包（发布 + 半发布状态补 tag），result.json 的 published
 * 语义 = "本轮打 tag 的包"（release:github 展示本轮版本矩阵，补 tag 恢复轮同样成立）。
 * 时机约束：必须在 Push release tags 之前完成（v tag 随全量推送带出并核验）。
 */
function finalizeRelease(tagged) {
    const plan = buildFinalizePlan(tagged, PUBLISHABLE_PACKAGES, (tag) => hasLocalTag(tag))
    if (plan.vTagAction === 'create') {
        git(`tag -a "${plan.vTag}" -m "release ${plan.vTag}"`)
        console.log(`created ${plan.vTag}（聚合 Release tag）`)
    } else if (plan.vTagAction === 'skip-exists') {
        console.log(`skip ${plan.vTag}（v tag 已存在，不覆盖）`)
    } else {
        console.log('skip v tag（本轮无锚包发布）')
    }
    writeFileSync(RESULT_FILE, `${JSON.stringify(plan.result, null, 4)}\n`, 'utf8')
    console.log(`written ${RESULT_FILE}（release:github 消费）`)
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
    // 本轮实际打 tag 的包（发布 + tag-only + 半发布状态补 tag），
    // v tag 锚点解析与 result.json 均以此为准
    const tagged = []
    for (const p of plan) {
        switch (p.action) {
            case 'publish':
                if (dryRun) {
                    console.log(`[dry-run] would publish ${p.pkg}@${p.version} + tag ${p.tagName}`)
                } else {
                    publishOne(p)
                    tagged.push(p)
                }
                break
            case 'tag-only':
                if (dryRun) {
                    console.log(`[dry-run] would tag-only ${p.pkg}@${p.version}（skip npm publish）+ tag ${p.tagName}`)
                } else {
                    tagOnly(p)
                    tagged.push(p)
                    console.log(`tagged ${p.pkg}@${p.version}（npmPublishable=false，skip npm publish）+ ${p.tagName}`)
                }
                break
            case 'skip-tag-exists':
                console.log(`skip ${p.pkg}@${p.version}（本地 tag ${p.tagName} 已存在）`)
                break
            case 'skip-published':
                if (dryRun) {
                    console.log(`skip ${p.pkg}@${p.version}（npm 已发布）`)
                } else if (
                    tagRecovered(p, {
                        headTouches: headTouchesPath,
                        tag: (tagName) => git(`tag -a "${tagName}" -m "release ${tagName}"`),
                    })
                ) {
                    console.log(`tagged ${p.tagName}（npm 已发布，补 annotated tag）`)
                    tagged.push(p)
                } else {
                    console.log(`skip ${p.pkg}@${p.version}（npm 已发布；HEAD 不 touch ${p.path}，不补 tag）`)
                }
                break
            case 'skip-registry-error':
                console.log(`skip ${p.pkg}@${p.version}（npm 查询失败，保守跳过）`)
                break
        }
    }
    if (dryRun) {
        if (publishes.length > 0) {
            console.log('dry-run 完成，未执行任何发布；确认无误后去掉 --dry-run 执行')
        }
        return
    }
    // 无条件写 result.json（无发布时写空结构）：release:github 据此走
    // skip-no-published 安全退出——CI 无发布变更轮次 / 发布后重跑不红；
    // create-github-release 的 ENOENT 报错保留给"未执行过 release:publish"的手动误用
    finalizeRelease(tagged)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main()
}
