/**
 * 发布计划生成脚本（release:plan）
 *
 * 参照 semantic-release / conventionalcommits 规则，从 git log 自动推导各包的版本提升级别，
 * 生成 release-plan.md（每轮发布固定一个计划文件，人工 review 后可编辑修正 bump 级别）：
 * - feat → minor
 * - fix / perf / revert → patch
 * - BREAKING（subject `!` 后缀或 `BREAKING CHANGE:` footer）→ 0.x 阶段 minor（preMajor），1.0.0+ 阶段 major
 * - 例外：breaking 只改 `package.json` 的 `engines.node`（抬补丁 / 支持下限）→ minor
 *   （不改变 1.x 对外契约，只收窄受支持运行时；发布说明必须披露支持面变更）
 * - refactor / docs / chore / build / ci / test / style → 不 bump（随同轮其他发布附带进入 CHANGELOG）
 *
 * 包影响面按 commit 改动路径映射：packages/core → @dependfix/core、packages/cli → dependfix、
 * packages/skills → @dependfix/skills；根目录 / docs / scripts 等不生成条目
 * （依赖传导由 release:version 的传导闭包处理，无需为依赖方手动声明）。
 *
 * 已知局限（人工兜底）：breaking 判定仅识别 commit 中显式标注的 `!` / BREAKING CHANGE footer；
 * 未标注的破坏性变更（如纯 ESM 改造以 build 类型提交）需在 review 时手动修正计划文件的 bump 级别。
 */
import { execSync } from 'node:child_process'
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { PKG_PATH_MAP } from './packages.config.mjs'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const PLAN_FILE = join(repoRoot, 'release-plan.md')
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
        // engines-only breaking（只抬 package.json engines.node 下限）按 minor：
        // 不触碰 1.x 对外契约，仅收窄受支持运行时；需要 major 语义时人工修正计划文件
        return commit.enginesOnly || preMajor ? 'minor' : 'major'
    }
    return TYPE_BUMP[commit.type] ?? null
}

/** engines.node 变更行：只允许 diff 中出现该形态，避免把整份 package.json 改动误判为仅 engines */
const ENGINES_DIFF_LINE_RE = /^[+-]\s*"node"\s*:\s*"[^"]*"\s*,?$/

/** 从 engines 取值中解析受支持的 Node 大版本集合（`^22.23.4 || >=24` → {22, 24}） */
function parseNodeMajors(range) {
    const majors = new Set()
    for (const match of range.matchAll(/\d+(?:\.\d+){0,2}/g)) {
        majors.add(Number(match[0].split('.')[0]))
    }
    return majors
}

/**
 * 判断 breaking 提交是否只改 `engines.node`：文件名全为 package.json，且 diff 的增删行只有 node 字段。
 * 前置条件：`files` 与 `diffText` 必须来自同一提交（调用方分别用 `git show --name-only` / `--unified=0` 获取）。
 * 依据 `git show --format= --unified=0` 的正文（无提交信息），`---` / `+++` 文件头已排除。
 *
 * 例外边界（任一不满足即回退 major）：
 * - 必须存在被替换的旧 node 行（仅新增 `engines` 约束属于收窄支持面，不是补丁下限抬升）；
 * - 按文件分别比对：每个文件删除的大版本线必须仍出现在该文件的新取值中（删任一大版本线 → major）；
 * - 任何非 `"node":` 的增删行（含其它字段、源码）→ 不视为 engines-only。
 */
export function isEnginesOnlyBreaking(files, diffText) {
    if (files.length === 0) {
        return false
    }
    if (!files.every((file) => file === 'package.json' || file.endsWith('/package.json'))) {
        return false
    }
    let sawEnginesChange = false
    for (const chunk of diffText.split(/^diff --git /m).filter(Boolean)) {
        const changedLines = chunk
            .split('\n')
            .filter((line) => /^[+-]/.test(line) && !/^(?:\+\+\+|---)/.test(line))
            .map((line) => line.trim())
        if (changedLines.length === 0) {
            // 只有重命名 / 权限位的块不构成 engines 变更；与 engines 抬升同提交时保守回退 major
            return false
        }
        if (!changedLines.every((line) => ENGINES_DIFF_LINE_RE.test(line))) {
            return false
        }
        const removedMajors = new Set()
        const addedMajors = new Set()
        for (const line of changedLines) {
            const range = /"node"\s*:\s*"([^"]*)"/.exec(line)?.[1]
            if (range === undefined) {
                continue
            }
            const target = line.startsWith('-') ? removedMajors : addedMajors
            for (const major of parseNodeMajors(range)) {
                target.add(major)
            }
        }
        if (removedMajors.size === 0) {
            return false
        }
        if (![...removedMajors].every((major) => addedMajors.has(major))) {
            return false
        }
        sawEnginesChange = true
    }
    return sawEnginesChange
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
 * commits 元素：{ subject, packages: string[], breaking: boolean, enginesOnly?: boolean }
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

/** 渲染发布计划文件内容（frontmatter 单引号风格沿用既有 changeset 格式） */
export function renderPlan(plan, summary) {
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

/** 滚动别名 tag（`v1` / `v2`）：可变引用，随大版本移动，不能作为版本推导基线 */
const ROLLING_TAG_RE = /^v\d+$/

/**
 * 最新 tag（按创建时间，且已合并进 HEAD，排除滚动别名 tag）；无 tag 返回 null（回退全量历史）。
 *
 * 排除理由：别名是可变引用，`creatordate` 反映创建 / 移动时间而非发布顺序，被
 * `--sort=-creatordate` 选中后落点不可预期（可能漏算，也可能重复计入），故一律排除。
 */
function getLatestTag() {
    const all = git('tag --merged HEAD --sort=-creatordate').split('\n').filter(Boolean)
    if (all.length === 0) {
        return null
    }
    const tags = all.filter((tag) => !ROLLING_TAG_RE.test(tag))
    if (tags.length === 0) {
        console.log('::warning::仅存在滚动别名 tag（vN），已回退全量历史，可能重复计入已发布提交，请人工核对')
        return null
    }
    return tags[0]
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
                ? {
                    hash,
                    subject,
                    type: parsed.type,
                    breaking: parsed.breaking || breakingHashes.has(hash),
                    enginesOnly: false,
                    packages: [],
                }
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
    // engines-only 判定需要 diff 正文：只在 breaking 提交上执行，避免每轮为全量历史多跑 git
    for (const commit of commits) {
        if (!commit.breaking) {
            continue
        }
        const files = git(`show --pretty=format: --name-only ${commit.hash}`).split('\n').filter(Boolean)
        const diff = git(`show --pretty=format: --unified=0 ${commit.hash}`)
        commit.enginesOnly = isEnginesOnlyBreaking(files, diff)
    }
    return commits
}

/**
 * 判断 preMajor（0.x 阶段）：入参缺省时读 core 的 package.json（发布包版本同步，以 core 为基准）。
 * 显式传入版本便于单测覆盖 0.x / 1.x 两个分支，避免用例绑定仓库当前所处阶段。
 */
export function isPreMajor(version) {
    const resolved = version ?? JSON.parse(readFileSync(join(repoRoot, 'packages/core/package.json'), 'utf8')).version
    return typeof resolved === 'string' && resolved.startsWith('0.')
}

/** 写 GitHub Actions step output（本地运行时回落到 stdout，便于手工核验）。 */
function writeOutput(name, value) {
    const outputFile = process.env.GITHUB_OUTPUT
    if (outputFile) {
        appendFileSync(outputFile, `${name}=${value}\n`, 'utf8')
        return
    }
    console.log(`${name}=${value}`)
}

/**
 * 当前 core 版本若尚未打 tag，返回该版本号；已打 tag 返回 null。
 *
 * 覆盖「版本已提升并推送、且自基线以来没有新的 bump 提交」的自愈窗口：此时单看发布计划会误判无变更。
 * 若自基线以来仍有 feat / fix，正常推导会给出新的 bump（既有行为，不补跳过版本）；tag 丢失的兜底见
 * `pnpm tag:released`。版本同步以 core 为基准（`release:version` 保证六包同版）。
 */
function getUntaggedReleaseVersion() {
    const version = JSON.parse(readFileSync(join(repoRoot, 'packages/core/package.json'), 'utf8')).version
    if (typeof version !== 'string' || version === '') {
        return null
    }
    const tags = git(`tag --list "v${version}" "*@${version}"`).split('\n').filter(Boolean)
    return tags.length === 0 ? version : null
}

/**
 * 只读探测（`--check`）：判断当前是否存在需要发布的版本变更。
 *
 * - 不写 `release-plan.md`，也不读它的存在性（重复执行幂等）；
 * - 发现无变更时输出 `::notice::` 供 schedule 轮次在 install 之前短路；
 * - 无新提交但当前版本未打 tag 时仍走全量（补发 / 补 tag 自愈）；
 * - 探测异常（git 不可用等）fail-open：输出 `has_changes=true` 并走全量。
 *
 * @returns {number} 退出码（正常 / fail-open 均为 0，避免把探测失败升级为发布阻断）
 */
export function probe() {
    try {
        const base = getLatestTag()
        const commits = collectCommits(base)
        const preMajor = isPreMajor()
        const plan = buildReleasePlan(commits, preMajor)
        if (plan.size === 0) {
            const untagged = getUntaggedReleaseVersion()
            if (!untagged) {
                console.log(`::notice::No version changes since ${base ?? 'repository start'}; scheduled release skipped before install`)
                writeOutput('has_changes', 'false')
                return 0
            }
            console.log(`::notice::Current version ${untagged} is not tagged yet; scheduled release proceeds to self-heal`)
            writeOutput('has_changes', 'true')
            return 0
        }
        console.log(`::notice::Version changes detected for ${plan.size} package(s) since ${base ?? 'repository start'}; scheduled release proceeds`)
        for (const [pkg, bump] of plan) {
            console.log(`- ${pkg}: ${bump}`)
        }
        writeOutput('has_changes', 'true')
        return 0
    } catch (error) {
        const message = (error instanceof Error ? error.message : String(error)).split('\n')[0]
        console.log(`::warning::Release probe failed; falling back to full release run: ${message}`)
        writeOutput('has_changes', 'true')
        return 0
    }
}

export function main(argv = []) {
    if (argv.includes('--check')) {
        return probe()
    }
    const base = getLatestTag()
    console.log(`基线 tag：${base ?? '无（使用全量历史）'}`)
    const commits = collectCommits(base)
    const preMajor = isPreMajor()
    const plan = buildReleasePlan(commits, preMajor)
    if (plan.size === 0) {
        console.log('未发现需要提升版本的变更，不生成发布计划')
        return 0
    }
    if (existsSync(PLAN_FILE)) {
        console.error(`已存在 ${PLAN_FILE}，请先删除或人工合并后重新生成`)
        process.exit(1)
    }
    const summary = commits
        .filter((c) => c.packages.length > 0 && toBump(c, preMajor))
        .map((c) => stripDevTags(c.subject))
        .join('；')
    const clipped = summary.length > SUMMARY_MAX_LEN ? `${summary.slice(0, SUMMARY_MAX_LEN)}……` : summary
    const enginesOnly = commits.filter((c) => c.breaking && c.enginesOnly && c.packages.length > 0)
    const enginesNote = enginesOnly.length > 0
        ? `\n\nengines-only breaking 按 minor 处理（发布说明须披露支持面变更）：${enginesOnly
            .map((c) => c.hash.slice(0, 7))
            .join('、')}`
        : ''
    const content = renderPlan(plan, `${clipped}${enginesNote}`)
    writeFileSync(PLAN_FILE, content, 'utf8')
    console.log(`generated ${PLAN_FILE}`)
    for (const [pkg, bump] of plan) {
        console.log(`- ${pkg}: ${bump}`)
    }
    for (const commit of enginesOnly) {
        console.log(`engines-only breaking 按 minor 处理：${commit.hash.slice(0, 7)} ${stripDevTags(commit.subject)}`)
    }
    console.log('请人工 review：检查是否存在未标注 `!` / BREAKING CHANGE 的破坏性变更，如有请手动修正 bump 级别')
    return 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    process.exit(main(process.argv.slice(2)))
}
