/**
 * 已发布版本补 tag 脚本（手动发布辅助）
 *
 * 背景：`changeset publish`（CI）会自动创建 `<pkg>@<version>` git tag，
 * 但**手动发布**（首次 0.1.0 / 补发，走 `pnpm publish`）不会创建 tag——
 * changelog 分段锚点（scripts/changelog.mjs 的 tags.prefix）与 changeset
 * 推导基线（scripts/create-changeset.mjs 的"最新 tag"）都依赖该格式 tag，
 * 缺失会导致后续 changelog 把全部历史并入当前版本段。
 *
 * 用法：
 *   pnpm tag:released            # 为"npm 已发布但本地无 tag"的版本补打 tag
 *   pnpm tag:released --dry-run  # 仅预览将创建的 tag，不实际创建
 *   pnpm tag:released --at <commit>  # 覆盖锚点（发布提交同时 touch 所有目标包路径时）
 *
 * 锚点约束（见 docs/guide/release.md「CHANGELOG 策略」）：tag 必须指向
 * "同时 touch 该包路径"的 commit，否则包级日志因 path 过滤看不到锚点。
 * 默认锚点 = `git log -1 -- <path>`（最新 touch 该路径的 commit）。
 *
 * 判定逻辑（与 scripts/changelog.mjs isVersionTagged 同款口径）：
 * - 本地 tag 已存在 → 跳过（幂等）
 * - npm registry 未发布该版本 → 跳过（未发布不打 tag）
 * - npm 查询失败（离线/限流）→ 保守跳过（宁可漏打也不误打）
 */
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { PUBLISHABLE_PACKAGES } from './packages.config.mjs'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))

function git(args) {
    return execSync(`git ${args}`, { cwd: repoRoot, encoding: 'utf8' }).trim()
}

/** 读取包当前版本（package.json version） */
export function readPackageVersion(pkgPath) {
    return JSON.parse(readFileSync(join(repoRoot, pkgPath, 'package.json'), 'utf8')).version
}

/** 本地是否已存在该 tag（与 changelog.mjs isVersionTagged 同款判定） */
export function hasLocalTag(tagName) {
    try {
        execSync(`git rev-parse --verify --quiet "${tagName}"`, { cwd: repoRoot, stdio: 'pipe' })
        return true
    } catch {
        return false
    }
}

/**
 * npm registry 是否已发布该版本。
 * - 输出非空且非错误 = 已发布（true）
 * - npm view 对不存在的包输出 E404 到 stderr 并退出非零 → false（未发布）
 * - 其他查询失败（离线/限流）→ null（调用方保守跳过）
 */
export function isPublishedOnRegistry(pkgName, version) {
    try {
        const out = execSync(`npm view ${pkgName}@${version} version --json`, {
            cwd: repoRoot,
            stdio: 'pipe',
            timeout: 10_000,
        }).toString().trim()
        return out.length > 0 && !out.startsWith('npm error')
    } catch (err) {
        const stderr = (err && typeof err.stderr === 'object' && err.stderr !== null
            ? err.stderr.toString()
            : '') || (err instanceof Error ? err.message : '')
        return stderr.includes('E404') || stderr.includes('Not found') ? false : null
    }
}

/** 锚点：touch 该包路径的最新 commit（无命中返回 null） */
export function findPathAnchor(pkgPath) {
    try {
        const hash = git(`log -1 --format=%H -- "${pkgPath}"`)
        return hash || null
    } catch {
        return null
    }
}

/**
 * 生成补 tag 计划（纯函数，依赖注入便于测试）。
 * 返回每包计划：{ pkg, version, tagName, action, anchor? }
 * action：create / skip-exists / skip-unpublished / skip-registry-error / skip-no-anchor
 */
export function buildTagPlan(packages, deps) {
    const { versionOf, hasTag, isPublished, anchorOf, at } = deps
    return packages.map((p) => {
        const version = versionOf(p.path)
        const tagName = `${p.tags.prefix}${version}`
        if (hasTag(tagName)) {
            return { pkg: p.pkg, version, tagName, action: 'skip-exists' }
        }
        const published = isPublished(p.pkg, version)
        if (published !== true) {
            return {
                pkg: p.pkg,
                version,
                tagName,
                action: published === null ? 'skip-registry-error' : 'skip-unpublished',
            }
        }
        const anchor = at ?? anchorOf(p.path)
        if (!anchor) {
            return { pkg: p.pkg, version, tagName, action: 'skip-no-anchor' }
        }
        return { pkg: p.pkg, version, tagName, anchor, action: 'create' }
    })
}

export function main() {
    const dryRun = process.argv.includes('--dry-run')
    const atIndex = process.argv.indexOf('--at')
    const at = atIndex >= 0 ? process.argv[atIndex + 1] : undefined
    if (atIndex >= 0 && !at) {
        console.error('--at 需要 commit hash 参数（如 --at abc1234）')
        process.exit(1)
    }

    const plan = buildTagPlan(PUBLISHABLE_PACKAGES, {
        versionOf: (path) => readPackageVersion(path),
        hasTag: (tagName) => hasLocalTag(tagName),
        isPublished: (pkg, version) => isPublishedOnRegistry(pkg, version),
        anchorOf: (path) => findPathAnchor(path),
        at,
    })

    const creates = plan.filter((p) => p.action === 'create')
    if (creates.length === 0) {
        console.log('没有需要补打的 tag（全部已存在 / 未发布 / 查询失败）')
    }
    for (const p of plan) {
        switch (p.action) {
            case 'create':
                if (dryRun) {
                    console.log(`[dry-run] would create ${p.tagName} @ ${p.anchor}`)
                } else {
                    git(`tag "${p.tagName}" "${p.anchor}"`)
                    console.log(`created ${p.tagName} @ ${p.anchor}`)
                }
                break
            case 'skip-exists':
                console.log(`skip ${p.tagName}（本地 tag 已存在）`)
                break
            case 'skip-unpublished':
                console.log(`skip ${p.tagName}（npm 未发布 ${p.pkg}@${p.version}）`)
                break
            case 'skip-registry-error':
                console.log(`skip ${p.tagName}（npm 查询失败，保守跳过）`)
                break
            case 'skip-no-anchor':
                console.log(`skip ${p.tagName}（未找到 touch ${p.pkg} 路径的锚点 commit）`)
                break
        }
    }
    if (dryRun && creates.length > 0) {
        console.log('dry-run 完成，未创建任何 tag；确认无误后去掉 --dry-run 执行')
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main()
}
