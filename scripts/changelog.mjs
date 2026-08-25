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
import { PACKAGES, PUBLISHABLE_PACKAGES, ROOT_PACKAGE } from './packages.config.mjs'
import { isPublishedOnRegistry } from './tag-released-versions.mjs'

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

/** semver 小于比较（0.9.0 < 0.10.0），用于识别"低于当前版本"的残留段 */
export function versionLt(a, b) {
    const pa = a.split('.').map(Number)
    const pb = b.split('.').map(Number)
    for (let i = 0; i < 3; i++) {
        const x = pa[i] ?? 0
        const y = pb[i] ?? 0
        if (x !== y) {
            return x < y
        }
    }
    return false
}

/** semver 降序比较（a > b → 返回正数；用于 findPrevTag 排序） */
export function compareSemverDesc(a, b) {
    if (versionLt(a, b)) {
        return 1
    }
    if (versionLt(b, a)) {
        return -1
    }
    return 0
}

/**
 * 纯函数：对比两套依赖列表中的 workspace 发布包依赖版本，返回变化项列表。
 *
 * 背景：workspace:* range 不含实际版本号（实际版本号在被依赖方的 package.json），
 * 单纯对比 range 字符串无法判断"被依赖方是否升级"。本函数把"当前 vs prev 时点"
 * 的 workspace 发布包实际版本号预解析后注入，靠版本号对比识别被动升级。
 *
 * 边界：
 * - 仅参与"两端都声明了 workspace:* 范围"的依赖；新增 / 删除的依赖忽略（不在本机制语义内）
 * - 任一端缺版本号（非发布包或 prev tag 缺失对应文件）→ 跳过，不强写
 * - 仅在两端都解析到版本号且不同时输出
 *
 * @returns Array<{ name: string, from: string, to: string }>
 */
export function computeDependencyChanges(currentDeps, prevDeps, currentDepVersions, prevDepVersions) {
    const names = new Set([...Object.keys(currentDeps ?? {}), ...Object.keys(prevDeps ?? {})])
    const changes = []
    for (const name of names) {
        const curRange = currentDeps?.[name]
        const prevRange = prevDeps?.[name]
        const isWorkspaceNow = curRange?.startsWith?.('workspace:')
        const isWorkspaceBefore = prevRange?.startsWith?.('workspace:')
        if (!isWorkspaceNow && !isWorkspaceBefore) {
            continue
        }
        const curVer = currentDepVersions?.[name]
        const prevVer = prevDepVersions?.[name]
        if (!curVer || !prevVer) {
            continue
        }
        if (curVer === prevVer) {
            continue
        }
        changes.push({ name, from: prevVer, to: curVer })
    }
    return changes
}

/**
 * 纯函数：渲染完整 Dependencies 段（标题 + 内容），格式与 cmyr-config patch 段对齐。
 *
 * 触发场景：path-filter 后某发布包路径下无 commit，但版本被提升（典型场景：依赖传导
 * 触发的 patch 升级，如 c811659 提升 cli 0.3.2 → 0.3.3 但 cli 路径下 0 commit）。
 * 该段既能让 verify-changelog 通过（有版本标题行），又保留"为何升级"的可审计语义。
 *
 * - 标题：`## [version](compare_url) (date)`，与既有 CHANGELOG patch 段同款格式
 * - 内容：`### ⚙️ 依赖更新\n\n* bump <name> to <to> (was <from>)\n`
 * - changes 为空 → 返回空串（保持既有"重跑幂等"语义：版本 == 最新 tag 时不写空段）
 */
export function renderDependencySection({ version, prevVersion, prefix, repo, headDate, changes }) {
    if (!changes || changes.length === 0) {
        return ''
    }
    const compareUrl = `https://github.com/${repo}/compare/${prefix}${prevVersion}...${prefix}${version}`
    const lines = [
        `## [${version}](${compareUrl}) (${headDate})`,
        '',
        '### ⚙️ 依赖更新',
        '',
        ...changes.map((c) => `* bump \`${c.name}\` to ${c.to} (was ${c.from})`),
        '',
    ]
    return lines.join('\n')
}

/**
 * 清理残留未发布段（发布中断恢复的防重复增强，经验归档 §三十七）：
 * 上次发布中断会遗留"版本低于当前版本、无对应 tag、npm 未发布"的旧版本段
 * （如 0.3.0 段未发布残留，本轮提升到 0.3.1 后旧段不再被 mergeUnreleased 管理），
 * 不清理则新旧两段覆盖相同 commit 范围，CHANGELOG 出现重复日志。
 * 判定（任一命中即保留）：版本不小于当前版本（当前段由 mergeUnreleased 管理）/
 * 本地 tag 存在（已发布锚点）/ npm 已发布（手动发布无 tag 场景，如 engine 0.1.0）/
 * npm 查询失败（保守保留，宁残留不误删）。确认未发布（fetch 三态返回 false）才删除。
 * 返回清理后的全文（无残留时原样返回同一引用）。
 * 注意：isPublished 为异步实现（registry fetch），必须 await 判定结果——
 * 直接与 Promise 比较（`!== false`）恒为 true，清理将永不生效。
 */
export async function cleanupUnreleasedSections(existing, { version, prefix, pkgName, hasTag, isPublished }) {
    const regex = new RegExp(sectionRegex.source, 'gm')
    const matches = [...existing.matchAll(regex)]
    const removals = []
    for (let i = 0; i < matches.length; i++) {
        const sectionVersion = matches[i][1]
        if (!versionLt(sectionVersion, version)) {
            continue
        }
        if (hasTag(`${prefix}${sectionVersion}`)) {
            continue
        }
        if ((await isPublished(pkgName, sectionVersion)) !== false) {
            continue
        }
        removals.push({ start: matches[i].index, end: matches[i + 1]?.index ?? existing.length })
    }
    if (removals.length === 0) {
        return existing
    }
    let out = existing
    for (let i = removals.length - 1; i >= 0; i--) {
        const { start, end } = removals[i]
        out = `${out.slice(0, start)}${out.slice(end)}`
    }
    // 段删除后空行规范化（\n{3,} → \n\n）与文件尾空白收敛（保留单个 \n）
    return out.replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '\n')
}

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

export { mergeUnreleased }

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

/**
 * 从 git remote origin URL 解析 owner/repo（compare URL 拼接用）。
 * 解析失败 → null（fallback 段 URL 渲染降级，但脚本仍可继续；段依然能写，只是 URL 是占位）。
 */
function resolveRepoFromOrigin() {
    try {
        const url = execSync('git remote get-url origin', { cwd: repoRoot, stdio: 'pipe' })
            .toString()
            .trim()
        const m = /github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/.exec(url)
        return m ? m[1] : null
    } catch {
        return null
    }
}

const repo = resolveRepoFromOrigin()

/**
 * 找某包当前版本之前的最新发布 tag（`<prefix><prevVersion>` 完整形式）。
 * - 输入 prefix = `@dependfix/mcp@`，currentVersion = `0.1.3` → 返回如 `@dependfix/mcp@0.1.2`
 * - 仅在 prefix 列表中、不是当前 version 对应的 tag、版本号最大的那一个
 * - 历史 tag 为空 → 返回 null（首次发布走不到 fallback，由 release 流程兜底）
 */
export function findPrevTag(prefix, currentVersion, execList) {
    const tags = execList()
    const candidates = []
    for (const tag of tags) {
        if (!tag.startsWith(prefix)) {
            continue
        }
        const ver = tag.slice(prefix.length)
        if (!/^\d+\.\d+\.\d+$/.test(ver)) {
            continue
        }
        if (ver === currentVersion) {
            continue
        }
        candidates.push({ tag, ver })
    }
    // 降序取最大：compareSemverDesc 给 sort comparator 用，>0 表示 a 排在 b 后
    candidates.sort((a, b) => compareSemverDesc(a.ver, b.ver))
    return candidates[0]?.tag ?? null
}

/**
 * 副作用封装：fallback 主流程。读 prev tag 时该包 + 所有相关 workspace 发布包的版本，
 * 喂给纯函数 computeDependencyChanges / renderDependencySection。无变化或缺 tag → 返回空串。
 * 注意：依赖失败（git show 失败 / package.json 解析失败）一律保守返回空串而非抛错——
 * fallback 是"补充输出"机制，不该阻断主 changelog 流程。
 */
async function buildDependencyFallback({ pkgPath, currentPkgJson, prefix, version, repo, headDate }) {
    const listTags = () => {
        try {
            return execSync(`git tag --list "${prefix}*"`, { cwd: repoRoot })
                .toString()
                .split('\n')
                .filter(Boolean)
        } catch {
            return []
        }
    }
    const prevTag = findPrevTag(prefix, version, listTags)
    if (!prevTag) {
        return ''
    }
    const prevVersion = prevTag.slice(prefix.length)

    const readPkgJsonAtRef = (ref, path) => {
        try {
            const out = execSync(`git show "${ref}:${path}/package.json"`, { cwd: repoRoot, stdio: ['pipe', 'pipe', 'pipe'] })
                .toString()
                .trim()
            return out ? JSON.parse(out) : null
        } catch {
            return null
        }
    }

    // 当前 package.json 的依赖列表（已由 caller 读出）
    const currentDeps = currentPkgJson.dependencies ?? {}
    // prev tag 时该包的依赖列表
    const prevPkgJson = readPkgJsonAtRef(prevTag, pkgPath)
    const prevDeps = prevPkgJson?.dependencies ?? {}

    // 解析两个时点所有相关 workspace 发布包的版本（仅看 PUBLISHABLE，避免私有包噪声）
    const currentDepVersions = {}
    const prevDepVersions = {}
    for (const p of PUBLISHABLE_PACKAGES) {
        try {
            const curPkg = JSON.parse(await readFile(join(repoRoot, p.path, 'package.json'), 'utf8'))
            currentDepVersions[p.pkg] = curPkg.version
        } catch {
            // 跳过：当前版本无法解析时让纯函数自然忽略
        }
        const prevPkg = readPkgJsonAtRef(prevTag, p.path)
        if (prevPkg?.version) {
            prevDepVersions[p.pkg] = prevPkg.version
        }
    }

    const changes = computeDependencyChanges(currentDeps, prevDeps, currentDepVersions, prevDepVersions)
    return renderDependencySection({ version, prevVersion, prefix, repo, headDate, changes })
}

for (const target of targets) {
    const dest = join(repoRoot, target.file)
    const pkgJsonPath = join(repoRoot, target.pkg)
    const currentPkgJson = JSON.parse(await readFile(pkgJsonPath, 'utf8'))
    const version = currentPkgJson.version
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
    // 清理残留未发布段（发布中断恢复防重复，经验归档 §三十七）：上次发布中断遗留的
    // "版本低于当前版本、无 tag、npm 未发布"旧段（如 0.3.0 段残留后提升到 0.3.1），
    // 不清理会产生覆盖相同 commit 范围的重复日志。清理独立于发布判定执行——
    // 即使当前版本已发布（下方 unchanged 短路），残留段同样需要删除。
    const cleaned = await cleanupUnreleasedSections(existing, {
        version,
        prefix: target.tags.prefix,
        pkgName: target.title,
        hasTag: (tagName) => {
            try {
                execSync(`git rev-parse --verify --quiet "${tagName}"`, { cwd: repoRoot, stdio: 'pipe' })
                return true
            } catch {
                return false
            }
        },
        isPublished: (pkgName, ver) => isPublishedOnRegistry(pkgName, ver),
    })
    if (cleaned !== existing) {
        await writeFile(dest, cleaned, 'utf8')
        console.log(`updated ${target.file}（清理残留未发布段）`)
        existing = cleaned
    }
    // 版本已发布（存在 <prefix><version> tag 或 npm registry 已发布）：无未发布内容，
    // 且 releaseCount: 1 会输出自引用 compare 的同版本段，直接跳过写入，保证已发布段不被改写
    if (isVersionTagged(target.tags.prefix, version, target.title)) {
        console.log(`unchanged ${target.file}`)
        continue
    }
    // 增量追加：仅重算未发布版本段（releaseCount: 1 = 最新 tag 之后）
    let unreleased = await generate({ ...target, releaseCount: 1 })
    if (!unreleased) {
        // fallback：path-filter 空 + 版本未发布 → 可能是"被动依赖升级"（依赖传导触发的 patch 跟随，
        // 该包路径下从上次 tag 后无自身 commit）。构造 Dependencies 段填充空段，让 verify-changelog 通过。
        // 边界：仅在历史 tag 存在且 workspace 依赖确实有版本变化时输出空串以外的内容（重跑幂等语义保留）。
        unreleased = await buildDependencyFallback({
            pkgPath: target.path,
            currentPkgJson,
            prefix: target.tags.prefix,
            version,
            repo,
            headDate,
        })
        if (!unreleased) {
            console.log(`unchanged ${target.file}`)
            continue
        }
    }
    const merged = mergeUnreleased(existing, version, unreleased)
    if (merged === existing) {
        console.log(`unchanged ${target.file}`)
        continue
    }
    await writeFile(dest, merged, 'utf8')
    console.log(`updated ${target.file} (${merged.length} bytes)`)
}
