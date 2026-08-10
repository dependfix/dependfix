/**
 * CHANGELOG.md 生成脚本（方案 B）
 *
 * 使用 conventional-changelog + conventional-changelog-cmyr-config 生成日志：
 * - 根级 CHANGELOG.md：全仓库 feat/fix/refactor 类 commit（chore/ci/docs 等类型由
 *   preset 过滤，不进入日志），版本段以主交付物 tag 序列划分
 * - 包级 CHANGELOG.md（packages/*）：按各包路径过滤 commit（包清单见 packages.config.mjs）
 *
 * 注意：
 * - 必须在仓库根目录运行（pnpm changelog），cmyr-config 从 cwd 的 package.json 读取
 *   `changelog.language` 决定分组语言（zh → 中文 emoji 分组）
 * - 增量追加模式（默认）：已存在的 CHANGELOG.md 只更新**未发布版本段**（版本号
 *   等于 pkg 当前版本且尚无对应 tag 的段），已发布历史段完整保留文件现状——
 *   包括历史 commit 重写、手动编辑等，一律不覆盖。未发布段在文件不存在时以
 *   releaseCount: 0 全量生成，之后每次运行仅重算顶部未发布段（releaseCount: 1），
 *   无未发布内容（版本 == 最新 tag）时文件保持不变；
 * - 生成时机：release:version 之后、publish 之前（此时新版本尚无 tag，
 *   未发布段输出全部新增 commit）。边界行为：若在版本 == 最新 tag 时运行
 *   （如 core-only 发布后重跑、或发布后立即重跑），未发布段无新增内容，跳过写入；
 *   writer 在该边界下可能产生无任何分组内容的空版本段，生成时自动过滤；
 * - 版本标题日期固定为 HEAD commit 日期（而非生成当天）：保证 CI 重跑幂等，
 *   避免跨天产生无关 diff（release.yml 的 changelog 校验依赖此行为）
 * - 依赖 conventional-changelog@^7（8.x 模板引擎与 cmyr-config 3.x 不兼容）
 */
import { execSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ConventionalChangelog, defaultCommitTransform } from 'conventional-changelog'
import { PACKAGES, ROOT_PACKAGE } from './packages.config.mjs'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))

// 版本标题日期：HEAD commit 的 UTC 日期（yyyy-mm-dd），保证任意时刻重跑输出一致。
// 注意转 UTC：writer 对已发布版本段使用 commit 日期的 UTC 形式（formatDate → toISOString），
// 这里统一为 UTC，避免发布后重跑时已发布段日期被改写产生无关 diff
const headDate = new Date(
    execSync('git log -1 --format=%cI', { cwd: repoRoot }).toString().trim(),
).toISOString().slice(0, 10)

// 包级 CHANGELOG targets：从单点配置派生（包级日志 = 各发布包；根级 = 主交付物）
const targets = [
    {
        file: 'CHANGELOG.md',
        title: ROOT_PACKAGE.pkg,
        commits: {},
        tags: ROOT_PACKAGE.tags,
        // 根级版本锚 = 主交付物包版本（与其 tag 序列同步，由 release:version 维护）
        pkg: `${ROOT_PACKAGE.path}/package.json`,
    },
    ...PACKAGES.filter((p) => p.changelog).map((p) => ({
        file: p.changelog,
        title: p.pkg,
        commits: { path: p.path },
        tags: p.tags,
        pkg: `${p.path}/package.json`,
    })),
]

async function generate({ commits, tags, pkg, releaseCount = 0 }) {
    let out = ''
    const cc = new ConventionalChangelog(repoRoot)
        .loadPreset('conventional-changelog-cmyr-config')
        .options({
            releaseCount,
            // 过滤非数字 issue 引用（如历史 commit 正文中的 "package.json#scripts"），
            // 避免渲染出指向 https://github.com/package.json/issues/scripts 的无效链接
            // 注意：必须先调用 defaultCommitTransform 保留版本分段信息（commit.version），
            // 直接返回自定义对象会破坏 writer 的 generateOn 分段机制（单段错误 relabel）；
            // commit 对象只读，需返回新对象
            transformCommit: (commit, params) => {
                const patch = defaultCommitTransform(commit, params)
                if (!commit.references?.length) {
                    return patch
                }
                const refs = commit.references.filter((ref) => /^\d+$/.test(ref.issue))
                patch.references = refs
                return patch
            },
        })
        .commits(commits)
        .tags(tags)
        .context({ date: headDate })
        .readPackage(join(repoRoot, pkg))
    for await (const detail of cc.write(true)) {
        // 跳过空版本段：段内无任何 commit 条目行（`* ` 列表）的段，仅剩版本标题行。
        // 典型场景：pkg 版本 == 最新 tag 且该 tag 后无对应路径 commit（如发布后立即
        // 重跑、core-only 发布后重跑），writer 会先 flush 一个无内容的顶层段。
        // 判定以条目行而非分组标题（### ）为准，避免无 type 分组的段被误过滤
        if (!/^\* /m.test(detail.log)) {
            continue
        }
        out += detail.log
    }
    return out
}

// 版本段标题行：`# [0.2.0](...) (date)` / `# 0.1.0 (date)` / patch 段 `## [0.2.1](...) (date)`
// （cmyr-config header.hbs 对 patch 版本（0.x.y, y>0）输出 `## ` 前缀）
const sectionRegex = /^#{1,2} \[?(\d+\.\d+\.\d+)\]?(?:\([^)]*\))?\s/m

/**
 * 增量合并：将新生成的未发布段写入既有 CHANGELOG.md。
 * - 顶部已存在同版本段（上次生成的未发布段）→ 整段替换，其余内容原样保留；
 * - 顶部版本段不同（首次生成未发布段）→ 在标题之后、首个历史段之前插入；
 * - 文件中无任何版本段 → 直接追加到标题之后。
 * 已发布历史段及标题部分无论是否被手动修改，一律不做任何改写。
 */
function mergeUnreleased(existing, version, unreleased) {
    const first = existing.match(sectionRegex)
    if (!first) {
        return existing.replace(/\s+$/, '\n\n') + unreleased
    }
    const idx = first.index
    if (first[1] === version) {
        // 替换顶部同版本段（未发布段由生成器管理，旧内容作废）。
        // 段 log 以单个换行结尾，段间需补一个换行以对齐全量生成的空行分隔
        const nextRegex = new RegExp(sectionRegex.source, 'gm')
        nextRegex.lastIndex = idx + 1
        const next = nextRegex.exec(existing)
        const end = next ? next.index : existing.length
        return `${existing.slice(0, idx)}${unreleased}\n${existing.slice(end)}`
    }
    // 插入到首个版本段之前（标题之后）
    return `${existing.slice(0, idx)}${unreleased}\n${existing.slice(idx)}`
}

/**
 * 判断某版本是否已发布（已发布段不可改写）。
 * 判定顺序（任一命中即视为已发布）：
 * 1. 本地 git tag 存在 `<prefix><version>`（release:publish 发布产物）；
 * 2. npm registry 已存在该版本（`npm view <pkg>@<version>` 命中）——
 *    兼容"手动发布但 tag 缺失/未推送"场景（如 0.2.0 曾由 npm 手动发布而 git tag 仅 0.1.0 系列，
 *    导致该版本被误判为未发布段、重算时污染既有 CHANGELOG 段）。
 * 注意：npm 查询有网络开销，命中 tag 时短路跳过；查询失败（离线/限流）保守视为未发布
 * （宁可多生成一次未发布段也不改写已发布段——由 mergeUnreleased 的版本匹配兜底，同版本段会被整段替换）。
 */
function isVersionTagged(prefix, version, pkgName) {
    try {
        execSync(`git rev-parse --verify --quiet "${prefix}${version}"`, {
            cwd: repoRoot,
            stdio: 'pipe',
        })
        return true
    } catch {
        // 本地无 tag：查 npm registry 确认是否已发布
        // 注意：不能拼 `2>/dev/null`（Windows shell 不支持该重定向，npm 直接报路径错误）；
        // 统一用 stdio 捕获 stderr，失败时 execSync 抛错走 catch。
        // 失败（离线/限流）返回 false → 走增量重算：mergeUnreleased 对同版本段是"整段替换"，
        // 极端场景（手动发布无 tag + npm 不可达 + 有新 commit）仍可能改写顶部段；
        // 正常 release 流程有 tag 短路，且无新内容时 generate 返回空保持 unchanged。
        try {
            const out = execSync(`npm view ${pkgName}@${version} version --json`, {
                cwd: repoRoot,
                stdio: 'pipe',
                timeout: 10_000,
            }).toString().trim()
            return out.length > 0 && !out.startsWith('npm error')
        } catch {
            return false
        }
    }
}

for (const target of targets) {
    const dest = join(repoRoot, target.file)
    const { version } = JSON.parse(await readFile(join(repoRoot, target.pkg), 'utf8'))
    let existing = null
    try {
        existing = await readFile(dest, 'utf8')
    } catch (err) {
        if (err?.code !== 'ENOENT') {
            throw err
        }
        // 文件不存在：首次生成，输出完整历史
    }
    if (existing === null) {
        const content = await generate({ ...target, releaseCount: 0 })
        const full = `# ${target.title}\n\n${content}`
        await writeFile(dest, full, 'utf8')
        console.log(`generated ${target.file} (${full.length} bytes)`)
        continue
    }
    // 版本已发布（存在 <prefix><version> tag 或 npm registry 已发布）：无未发布内容，
    // 且 releaseCount: 1 会输出自引用 compare 的同版本段，直接跳过写入，保证已发布段不被改写
    if (isVersionTagged(target.tags.prefix, version, target.title)) {
        console.log(`unchanged ${target.file}`)
        continue
    }
    // 增量追加：仅重算未发布版本段（releaseCount: 1 = 最新 tag 之后）
    const unreleased = await generate({ ...target, releaseCount: 1 })
    if (!unreleased) {
        console.log(`unchanged ${target.file}`)
        continue
    }
    const merged = mergeUnreleased(existing, version, unreleased)
    if (merged === existing) {
        console.log(`unchanged ${target.file}`)
        continue
    }
    await writeFile(dest, merged, 'utf8')
    console.log(`updated ${target.file} (${merged.length} bytes)`)
}
