/**
 * auto-version.mjs —— 定时自动发布版本提升脚本（release:auto-version，schedule 专属）
 *
 * 替代 release.yml 的 Auto version & changelog 步骤（仅 schedule 触发时运行）：
 * 1. 防御性清理残留 release-plan.md → release:plan（无推导不生成）→ 条件 release:version
 * 2. pnpm changelog（生成日志）
 * 3. git diff 检测：无变更 → notice 退出（no-op）
 * 4. 有变更 → 版本选择（主交付物优先，复用 resolveAnchorVersion 同一逻辑）
 *    → 提取锚版本 changelog 段（根级优先，core-only 取锚包包级段——与
 *      release:github 同款兜底；改进自原 awk 的"最新 minor 段到文件尾"语义）
 *    → git commit（semantic-release 风格：chore(release): v [skip ci] + 版本段 body）
 *    → git push（显式 token URL，不依赖 insteadOf——§二十六 教训，schedule 首次启用即采用）
 *
 * 用法（仅 CI schedule；需要 GITHUB_TOKEN 与 GITHUB_REPOSITORY 环境变量）：
 *   GITHUB_TOKEN=xxx GITHUB_REPOSITORY=dependfix/dependfix pnpm release:auto-version
 */
import { execSync } from 'node:child_process'
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { PUBLISHABLE_PACKAGES } from './packages.config.mjs'
import { resolveAnchorVersion } from './release-publish.mjs'
import { extractSection } from './create-github-release.mjs'
import { sanitizeError } from './push-release-tags.mjs'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const PLAN_FILE = join(repoRoot, 'release-plan.md')
const ROOT_CHANGELOG = 'CHANGELOG.md'

/** 版本变化的发布包列表（纯函数）：工作区版本 ≠ HEAD 版本（HEAD 缺失视为 0.0.0） */
export function getChangedPackages(versionOf, headVersionOf, packages) {
    return packages
        .map((p) => ({ pkg: p.pkg, version: versionOf(p.path), headVersion: headVersionOf(p.path) }))
        .filter((x) => x.version !== x.headVersion)
        .map(({ pkg, version }) => ({ pkg, version }))
}

/** 从 HEAD 读取文件内容（不存在或失败返回 null） */
export function readHeadFile(git, path) {
    try {
        return git(`show HEAD:${path}`)
    } catch {
        return null
    }
}

/** 是否存在已暂存变更（git diff --cached --quiet：exit 0 = 无差异，exit 1 = 有差异） */
export function hasStagedChanges(git) {
    try {
        git('diff --cached --quiet')
        return false
    } catch {
        return true
    }
}

/**
 * 提取 release commit body 的 changelog 段（纯函数）：根 CHANGELOG 优先，
 * core-only 等根段缺失时取锚包包级段；两处均无返回 null（中断发布）。
 */
export function resolveNotes(rootContent, files, anchor, readFile) {
    let notes = extractSection(rootContent, anchor.version)
    if (!notes && files.byPkg[anchor.pkg]) {
        notes = extractSection(readFile(files.byPkg[anchor.pkg]), anchor.version)
    }
    return notes
}

/** 锚包（rootChangelog）→ 包级 changelog 路径映射（单点配置派生） */
export function buildChangelogByPkg() {
    return Object.fromEntries(
        PUBLISHABLE_PACKAGES.filter((p) => p.changelog).map((p) => [p.pkg, p.changelog]),
    )
}

export function main() {
    const token = process.env.GITHUB_TOKEN
    const repository = process.env.GITHUB_REPOSITORY
    if (!token || !repository) {
        console.error('缺少 GITHUB_TOKEN 或 GITHUB_REPOSITORY 环境变量（仅 CI schedule 环境可用）')
        process.exit(1)
    }
    const git = (args) => execSync(`git ${args}`, { cwd: repoRoot, encoding: 'utf8' }).trim()
    try {
        run({ git, token, repository })
    } catch (err) {
        // 失败路径脱敏（push-release-tags 同款：execSync 错误 message 含命令字符串）
        console.error(sanitizeError(err, token))
        process.exit(1)
    }
}

export function run({ git, token, repository }, deps = {}) {
    // 依赖注入（测试用）：exec = pnpm 命令执行；文件操作默认走真实 fs / repoRoot
    const {
        exec = (cmd) => execSync(cmd, { cwd: repoRoot, stdio: 'inherit', encoding: 'utf8' }),
        planFile = PLAN_FILE,
        readFile = (path) => readFileSync(join(repoRoot, path), 'utf8'),
        exists = existsSync,
        unlink = unlinkSync,
        writeFile = writeFileSync,
        tmpFile = join(tmpdir(), `release-commit-${process.pid}.txt`),
    } = deps

    // 1. 防御性清理残留计划文件（上次失败残留）→ 生成 → 条件消费
    try {
        unlink(planFile)
    } catch {
        // 不存在则跳过
    }
    exec('pnpm release:plan')
    if (exists(planFile)) {
        exec('pnpm release:version')
    } else {
        console.log('::notice::没有待提升的版本，跳过 release:version')
    }
    exec('pnpm changelog')

    // 2. 无变更检测（版本未提升时 changelog 幂等无变化 → no-op）
    git('add -A')
    if (!hasStagedChanges(git)) {
        console.log('::notice::没有待发布的版本变更，定时发布无操作')
        return
    }

    // 3. 版本选择（主交付物优先）与 changelog 段提取
    const versionOf = (path) => JSON.parse(readFile(`${path}/package.json`)).version
    const headVersionOf = (path) => {
        const head = readHeadFile(git, `${path}/package.json`)
        return head ? JSON.parse(head).version : '0.0.0'
    }
    const anchor = resolveAnchorVersion(getChangedPackages(versionOf, headVersionOf, PUBLISHABLE_PACKAGES), PUBLISHABLE_PACKAGES)
    if (!anchor) {
        throw new Error('检测到已暂存变更但无版本变化的发布包，无法确定发布版本（请检查 release:plan/release:version 是否正常）')
    }
    const notes = resolveNotes(readFile(ROOT_CHANGELOG), {
        byPkg: buildChangelogByPkg(),
    }, anchor, readFile)
    if (!notes) {
        throw new Error(`CHANGELOG.md 缺少版本段 ${anchor.version}，无法生成 release commit body`)
    }

    // 4. commit（-F 文件方式避免多行 body 引号转义）+ push（显式 token URL）
    git('config user.name "github-actions[bot]"')
    git('config user.email "41898282+github-actions[bot]@users.noreply.github.com"')
    try {
        writeFile(tmpFile, `chore(release): ${anchor.version} [skip ci]\n\n${notes}\n`, 'utf8')
        git(`commit -F "${tmpFile}"`)
        git(`push "https://x-access-token:${token}@github.com/${repository}.git" master`)
        console.log(`release commit pushed: chore(release): ${anchor.version} [skip ci]`)
    } finally {
        try {
            unlink(tmpFile)
        } catch {
            // 临时文件不存在则跳过
        }
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main()
}
