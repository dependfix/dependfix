/**
 * 发布 changeset 生成脚本
 *
 * 参照 semantic-release / conventionalcommits 规则，从 git log 自动推导各包的版本提升级别，
 * 生成 .changeset/release.md（每轮发布固定一个 changeset 文件）：
 * - feat → minor
 * - fix / perf / revert → patch
 * - BREAKING（subject `!` 后缀或 `BREAKING CHANGE:` footer）→ 0.x 阶段 minor（preMajor），1.0.0+ 阶段 major
 * - refactor / docs / chore / build / ci / test / style → 不 bump（随同轮其他发布附带进入 CHANGELOG）
 *
 * 包影响面按 commit 改动路径映射：packages/core → @dependfix/core、packages/cli → dependfix、
 * packages/skills → @dependfix/skills；根目录 / docs / scripts 等不生成条目
 * （依赖传导由 changesets 的 updateInternalDependencies 处理，无需为依赖方手动声明）。
 *
 * 已知局限（人工兜底）：breaking 判定仅识别 commit 中显式标注的 `!` / BREAKING CHANGE footer；
 * 未标注的破坏性变更（如纯 ESM 改造以 build 类型提交）需在 review 时手动修正 release.md 的 bump 级别。
 */
import { execSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { PKG_PATH_MAP } from './packages.config.mjs'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const CHANGESET_FILE = join(repoRoot, '.changeset/release.md')
// 包清单单点来源：scripts/packages.config.mjs（新增发布包只改一处）
const PKG_PATHS = PKG_PATH_MAP
const TYPE_BUMP = {
    feat: 'minor',
    fix: 'patch',
    perf: 'patch',
    revert: 'patch',
}
const BUMP_RANK = { patch: 1, minor: 2, major: 3 }
const SUMMARY_MAX_LEN = 500

/** 解析 conventional commit subject / body，返回 null 表示非 conventional 格式 */
export function parseCommit(subject, body = '') {
    const match = /^(\w+)(?:\(([^)]+)\))?(!)?:\s*(.+)$/.exec(subject.trim())
    if (!match) {
        return null
    }
    const [, type, scope, bang, description] = match
    const breaking = Boolean(bang) || /^BREAKING[ -]CHANGE:/m.test(body)
    return { type, scope: scope ?? null, breaking, description }
}

/** 按 semantic-release 规则推导 bump 级别；preMajor（0.x）时 breaking 只提升 minor */
export function toBump(commit, preMajor) {
    if (commit.breaking) {
        return preMajor ? 'minor' : 'major'
    }
    return TYPE_BUMP[commit.type] ?? null
}

/** commit 改动路径 → 发布包名；无映射返回 null */
export function pathToPkg(file) {
    for (const [prefix, pkg] of Object.entries(PKG_PATHS)) {
        if (file === prefix || file.startsWith(`${prefix}/`)) {
            return pkg
        }
    }
    return null
}

/**
 * 汇总 commits 生成每包 bump 计划（取各包遇到的最高级别）。
 * commits 元素：{ subject, packages: string[], breaking: boolean }
 */
export function buildReleasePlan(commits, preMajor) {
    const plan = new Map()
    for (const commit of commits) {
        const bump = toBump(commit, preMajor)
        if (!bump) {
            continue
        }
        for (const pkg of commit.packages) {
            const current = plan.get(pkg)
            if (!current || BUMP_RANK[bump] > BUMP_RANK[current]) {
                plan.set(pkg, bump)
            }
        }
    }
    return plan
}

/** 渲染 changeset 文件内容（frontmatter 单引号风格与现有 changeset 保持一致） */
export function renderChangeset(plan, summary) {
    const lines = ['---']
    for (const [pkg, bump] of plan) {
        lines.push(`'${pkg}': ${bump}`)
    }
    lines.push('---', '', summary.trim(), '')
    return lines.join('\n')
}

/** 清洗 summary 中的开发流程编号标记（与开发规范编号标记扫描口径一致），并清理残留的空括号 / 多余空白 */
export function stripDevTags(text) {
    return text
        .replace(/(?:T\d{3}|P[0-3](?:-[0-9])?|C\d+|G\d|R\d|M\d+|B\d)[：:]?/g, '')
        .replace(/[（(]\s*[）)]/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim()
}

function git(args) {
    return execSync(`git ${args}`, { cwd: repoRoot, encoding: 'utf8' }).trim()
}

/** 最新 tag（按创建时间，且已合并进 HEAD）；无 tag 返回 null（回退全量历史） */
function getLatestTag() {
    const tags = git('tag --merged HEAD --sort=-creatordate').split('\n').filter(Boolean)
    return tags[0] ?? null
}

/** 收集自基线以来的 commits：hash + subject + 改动文件 + breaking 标志 */
function collectCommits(base) {
    const range = base ? `${base}..HEAD` : 'HEAD'
    const raw = git(`log --no-merges ${range} --pretty=format:%H%x1f%s --name-only`)
    const breakingHashes = new Set(
        git(`log --no-merges ${range} --grep="BREAKING[ -]CHANGE:" --pretty=format:%H`).split('\n').filter(Boolean),
    )
    const commits = []
    let current = null
    for (const line of raw.split('\n')) {
        if (!line) {
            continue
        }
        if (line.includes('\x1f')) {
            const [hash, subject] = line.split('\x1f')
            const parsed = parseCommit(subject)
            current = parsed
                ? { hash, subject, type: parsed.type, breaking: parsed.breaking || breakingHashes.has(hash), packages: [] }
                : null
            if (current) {
                commits.push(current)
            }
            continue
        }
        if (current) {
            const pkg = pathToPkg(line)
            if (pkg && !current.packages.includes(pkg)) {
                current.packages.push(pkg)
            }
        }
    }
    return commits
}

/** 读取包版本判断 preMajor（0.x 阶段）。假设三发布包版本同步（当前均为 0.1.0），以 core 为基准 */
function isPreMajor() {
    const pkg = JSON.parse(readFileSync(join(repoRoot, 'packages/core/package.json'), 'utf8'))
    return typeof pkg.version === 'string' && pkg.version.startsWith('0.')
}

export function main() {
    const base = getLatestTag()
    console.log(`基线 tag：${base ?? '无（使用全量历史）'}`)
    const commits = collectCommits(base)
    const preMajor = isPreMajor()
    const plan = buildReleasePlan(commits, preMajor)
    if (plan.size === 0) {
        console.log('未发现需要提升版本的变更，不生成 changeset')
        return
    }
    if (existsSync(CHANGESET_FILE)) {
        console.error(`已存在 ${CHANGESET_FILE}，请先删除或人工合并后重新生成`)
        process.exit(1)
    }
    const summary = commits
        .filter((c) => c.packages.length > 0 && toBump(c, preMajor))
        .map((c) => stripDevTags(c.subject))
        .join('；')
    const content = renderChangeset(plan, summary.length > SUMMARY_MAX_LEN ? `${summary.slice(0, SUMMARY_MAX_LEN)}……` : summary)
    writeFileSync(CHANGESET_FILE, content, 'utf8')
    console.log(`generated ${CHANGESET_FILE}`)
    for (const [pkg, bump] of plan) {
        console.log(`- ${pkg}: ${bump}`)
    }
    console.log('请人工 review：检查是否存在未标注 `!` / BREAKING CHANGE 的破坏性变更，如有请手动修正 bump 级别')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main()
}
