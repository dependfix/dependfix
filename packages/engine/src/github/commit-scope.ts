// commit-scope.ts — 交付提交的路径白名单与未声明改动检测。
//
// 背景：`stageAndCommit` 原用 `git add .` 收集变更——目标仓库的生成物（`.nuxtrc` /
// `auto-imports.d.ts`）、运行前的用户未提交改动都会被一并提交进 PR。
//
// 口径（设计 §7.1 / §7.2）：
// - 提交集合 = 白名单命中的**已跟踪**改动 ∪ fixer / AI patch 显式声明的路径
// - 白名单只放行内容改动：白名单文件被删除（工作树 / 索引区）一律按未声明改动拒绝
// - 生成物黑名单一律不提交，且不触发未声明告警（构建会重写它们，不是交付内容）
// - 未声明的已跟踪改动 → `UNEXPECTED_CHANGES`（打印路径，不静默提交）
// - 未跟踪文件默认忽略（只有被显式声明的新文件才会加入）
// - 提交集合为空 → `NO_CHANGES`
//
// 声明来源：`FixAction.changedPaths`（AI patch 多文件）与 `FixAction.filePath`
// （code-scanning 单文件），且仅取**成功且非 noOp** 的动作——回滚掉的写盘不应留下声明。
import { isAbsolute } from 'node:path'
import type { FixAction } from '@dependfix/core'
import { GIT_COMMIT_HOOKS_ISOLATION_ARGS, GIT_COMMIT_SIGNING_ISOLATION_ARGS } from './git-signing'
import { runGitOrThrow } from './git-run'

/** 提交集合判定失败的两类信号（写入 `FixError.category`）。 */
export type CommitScopeErrorCode = 'UNEXPECTED_CHANGES' | 'NO_CHANGES'

export class CommitScopeError extends Error {
    readonly category: CommitScopeErrorCode
    readonly paths: readonly string[]

    constructor(category: CommitScopeErrorCode, message: string, paths: readonly string[] = []) {
        super(message)
        this.name = 'CommitScopeError'
        this.category = category
        this.paths = paths
    }
}

/** 一条工作区改动（workDir 相对、POSIX 分隔符）。 */
export interface ChangedPath {
    path: string
    untracked: boolean
    deleted: boolean
    /** 索引区已有改动（已暂存）：`git commit` 会连带提交，必须纳入提交集合判定 */
    staged: boolean
    /** 未合并冲突（`UU` / `AA` / `DD` 等）：`git add` 会按工作树一侧静默「解决」，必须拒绝 */
    conflicted: boolean
    /** 位于 workDir 之外（workDir 为仓库子目录时）：索引区改动仍会被 commit 带入 */
    outside: boolean
}

/** 被拒绝的声明路径。 */
export interface PathRejection {
    path: string
    reason: string
}

/** 提交集合判定结果。 */
export interface CommitScope {
    /** 需要暂存的路径（已排序，便于确定性提交） */
    paths: string[]
    /** 未声明的已跟踪改动（非空即拒绝提交） */
    unexpected: string[]
    /** 生成物 / 未声明的新文件（不提交；仅留痕） */
    ignored: string[]
    /** 声明路径不合法（拒绝提交） */
    rejected: PathRejection[]
    /** 声明了但工作区没有对应改动（仅留痕，不阻断） */
    missing: string[]
    /** 索引区已有的改动（已暂存） */
    staged: string[]
    /** 未合并冲突路径 */
    conflicts: string[]
}

/** 固定白名单：只有这些根级文件与任意层级 manifest 允许未经声明进入提交。 */
const ROOT_WHITELIST: ReadonlySet<string> = new Set([
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
    '.npmrc',
    '.gitignore',
])

/** 生成物黑名单（文件 basename，任意层级）。 */
const GENERATED_FILES: ReadonlySet<string> = new Set([
    '.nuxtrc',
    'auto-imports.d.ts',
    'components.d.ts',
])

/** 生成物黑名单（目录名，任意层级）。 */
const GENERATED_DIRS: ReadonlySet<string> = new Set([
    '.nuxt',
    'dist',
    'node_modules',
    '.pnpm-store',
    'dependfix-reports',
])

/** 单次 `git add` 的批量上限（避免超长 argv）。 */
const ADD_CHUNK_SIZE = 100

/**
 * 路径是否在白名单内。
 *
 * `package.json` 允许任意层级（monorepo 成员 manifest 由成员级修复写盘）；lockfile /
 * workspace 配置 / `.npmrc` / `.gitignore` 只允许仓库根（引擎不会写嵌套位置的这些文件）。
 */
export function isCommitWhitelisted(path: string): boolean {
    const segments = path.split('/')
    const base = segments[segments.length - 1]
    if (base === 'package.json') {
        return true
    }
    return ROOT_WHITELIST.has(path)
}

/** 是否为构建 / 安装生成物（一律不提交，也不触发未声明告警）。 */
export function isGeneratedPath(path: string): boolean {
    const segments = path.split('/')
    const base = segments[segments.length - 1]
    if (GENERATED_FILES.has(base)) {
        return true
    }
    return segments.slice(0, -1).some((segment) => GENERATED_DIRS.has(segment))
}

/**
 * 校验并归一化 fixer / AI patch 声明路径。
 *
 * 拒绝：绝对路径（含 Windows 盘符）、`..` 段、pathspec magic（`:(` 开头）、控制字符、空路径。
 * 归一化：`\` → `/`、去掉 `./` 与重复分隔符（Windows 上 `path.relative` 产出 `\`）。
 */
export function normalizeCommitPath(raw: string): { ok: true, path: string } | { ok: false, reason: string } {
    if (typeof raw !== 'string' || raw.length === 0) {
        return { ok: false, reason: '空路径' }
    }
    if (hasControlChar(raw)) {
        return { ok: false, reason: '含控制字符' }
    }
    const unified = raw.replace(/\\/g, '/')
    if (unified.startsWith(':(')) {
        return { ok: false, reason: 'pathspec magic（`:(` 开头）' }
    }
    if (unified.startsWith('/') || /^[A-Za-z]:\//.test(unified) || isAbsolute(raw)) {
        return { ok: false, reason: '绝对路径' }
    }
    const segments = unified.split('/').filter((segment) => segment !== '' && segment !== '.')
    if (segments.length === 0) {
        return { ok: false, reason: '空路径' }
    }
    if (segments.includes('..')) {
        return { ok: false, reason: '含 `..` 路径段' }
    }
    return { ok: true, path: segments.join('/') }
}

/**
 * 列出工作区改动（`git status` 单一事实源）。
 *
 * - `--untracked-files=all`：展开未跟踪目录，避免把整目录当一项
 * - `--no-renames`：重命名拆成「删除 + 新增」，删除因此不会绕过未声明检测
 * - 输出路径相对**仓库根**：按 `--show-prefix` 折算为 workDir 相对路径（workDir 可为子目录）
 */
export async function listChangedPaths(workDir: string): Promise<ChangedPath[]> {
    // 不限制 pathspec：`git commit`（cwd=workDir）提交的是整个索引，workDir 之外的已暂存改动
    // 同样会被带入，必须可见（workDir 与仓库根一致时 prefix 为空，行为等价）
    const raw = await runGitOrThrow([
        'status',
        '--porcelain=v1',
        '-z',
        '--untracked-files=all',
        '--no-renames',
    ], { cwd: workDir, what: 'list changed paths' })
    const prefix = (await runGitOrThrow(['rev-parse', '--show-prefix'], {
        cwd: workDir,
        what: 'resolve repository prefix',
    })).trim()

    const changes: ChangedPath[] = []
    for (const entry of raw.split('\0')) {
        if (!entry) {
            continue
        }
        const code = entry.slice(0, 2)
        const repoPath = entry.slice(3)
        if (!repoPath) {
            continue
        }
        const outside = prefix !== '' && !repoPath.startsWith(prefix)
        const relative = outside ? repoPath : repoPath.slice(prefix.length)
        if (!relative) {
            continue
        }
        const x = code[0] ?? ' '
        const y = code[1] ?? ' '
        changes.push({
            path: relative,
            untracked: code === '??',
            deleted: code.includes('D'),
            staged: x !== ' ' && x !== '?',
            conflicted: x === 'U' || y === 'U' || code === 'AA' || code === 'DD',
            outside,
        })
    }
    return changes
}

/** 从修复动作收集声明路径（仅成功且非 noOp 的动作）。 */
export function collectDeclaredPaths(actions: readonly FixAction[]): string[] {
    const declared: string[] = []
    for (const action of actions) {
        if (!action.success || action.noOp) {
            continue
        }
        if (action.changedPaths?.length) {
            declared.push(...action.changedPaths)
        }
        if (action.type === 'code-scanning-fix' && action.filePath) {
            declared.push(action.filePath)
        }
    }
    return [...new Set(declared)]
}

/** `stageAndCommit` 的可选声明路径。 */
export interface StageAndCommitOptions {
    /** fixer / AI patch 声明的相对路径（与固定白名单取并集） */
    declaredPaths?: readonly string[]
}

/** 暂存结果（留痕 / 断言用）。 */
export interface StageAndCommitResult {
    /** 实际暂存的路径 */
    staged: string[]
    /** 因生成物 / 未跟踪而跳过的路径 */
    ignored: string[]
    /** 声明了但工作区没有对应改动 */
    missing: string[]
}

/**
 * 判定并暂存提交集合。
 *
 * 拒绝：非法声明路径 / 未声明的已跟踪改动（`UNEXPECTED_CHANGES`）、空集合（`NO_CHANGES`）、
 * 索引区越界暂存内容（`UNEXPECTED_CHANGES`）。暂存用 `git add -- <paths>`（分批；`--` 阻断选项解析，
 * 每条路径加 `:(literal)` 终止通配，文件名含 `*` / `?` / `[` 时也只暂存字面路径）。
 */
export async function stageScopedChanges(
    workDir: string,
    declaredPaths: readonly string[] = [],
): Promise<StageAndCommitResult> {
    const scope = await computeCommitScope(workDir, declaredPaths)
    if (scope.conflicts.length > 0) {
        throw new CommitScopeError(
            'UNEXPECTED_CHANGES',
            `refusing to commit: unresolved merge conflict(s) — ${scope.conflicts.join(', ')}. Resolve them before running dependfix.`,
            scope.conflicts,
        )
    }
    if (scope.rejected.length > 0) {
        throw new CommitScopeError(
            'UNEXPECTED_CHANGES',
            `refusing to commit: invalid declared path(s) — ${scope.rejected.map((item) => `${item.path} (${item.reason})`).join('; ')}`,
            scope.rejected.map((item) => item.path),
        )
    }
    if (scope.unexpected.length > 0) {
        throw new CommitScopeError(
            'UNEXPECTED_CHANGES',
            `refusing to commit: ${scope.unexpected.length} undeclared tracked change(s) — ${scope.unexpected.join(', ')}. `
            + 'Only whitelisted manifests/lockfile/workspace files and fixer-declared paths are committed; '
            + 'deleting those files is never part of a fix. Commit or clean these changes first.',
            scope.unexpected,
        )
    }
    // 索引区已有改动会被 `git commit` 连带提交：必须全部落在本次提交集合内，否则拒绝
    // （典型：目标仓库运行前已暂存生成物 / 无关改动；不静默带进 PR，也不擅自 reset 用户暂存区）
    const outOfScopeStaged = scope.staged.filter((path) => !scope.paths.includes(path))
    if (outOfScopeStaged.length > 0) {
        throw new CommitScopeError(
            'UNEXPECTED_CHANGES',
            `refusing to commit: index already contains ${outOfScopeStaged.length} staged change(s) outside the commit scope — ${outOfScopeStaged.join(', ')}. `
            + 'Unstage them (git restore --staged) before running dependfix.',
            outOfScopeStaged,
        )
    }
    if (scope.paths.length === 0) {
        throw new CommitScopeError(
            'NO_CHANGES',
            'nothing to commit: the working tree contains only generated or undeclared untracked files',
        )
    }
    for (const chunk of chunkPaths(scope.paths)) {
        // `:(literal)`：文件名里的 `*` / `?` / `[` 不得被当作 pathspec 通配（否则会连带暂存同目录的匹配文件）
        await runGitOrThrow(
            ['add', '--', ...chunk.map((path) => `:(literal)${path}`)],
            { cwd: workDir, what: 'stage commit scope' },
        )
    }
    return { staged: scope.paths, ignored: scope.ignored, missing: scope.missing }
}

/**
 * 提交已暂存内容（不动提交集合）。
 *
 * author / 签名 / hooks 三条隔离：显式 `-c user.name` / `-c user.email` 覆盖 host 全局，
 * `-c commit.gpgsign=false` 阻断宿主签名，`--no-verify` 跳过目标仓库钩子（详见 ./git-signing.ts）。
 */
export async function commitStaged(
    message: string,
    workDir: string,
    author: { name: string, email: string },
): Promise<void> {
    await runGitOrThrow([
        '-c', `user.name=${author.name}`,
        '-c', `user.email=${author.email}`,
        ...GIT_COMMIT_SIGNING_ISOLATION_ARGS,
        'commit',
        ...GIT_COMMIT_HOOKS_ISOLATION_ARGS,
        '-m', message,
    ], { cwd: workDir, what: 'commit fix changes' })
}

/** 判定本次提交集合（不写盘、不暂存）。 */
export async function computeCommitScope(workDir: string, declaredPaths: readonly string[] = []): Promise<CommitScope> {
    const rejected: PathRejection[] = []
    const declared = new Set<string>()
    const conflicts: string[] = []
    for (const raw of declaredPaths) {
        const result = normalizeCommitPath(raw)
        if (result.ok) {
            declared.add(result.path)
        } else {
            rejected.push({ path: raw, reason: result.reason })
        }
    }

    const changes = await listChangedPaths(workDir)
    const paths = new Set<string>()
    const unexpected: string[] = []
    const ignored: string[] = []
    const seen = new Set<string>()

    for (const change of changes) {
        if (change.conflicted) {
            conflicts.push(change.path)
            continue
        }
        if (change.outside) {
            // workDir 之外：已暂存内容会被 `git commit` 带入 → 拒绝；其余与本工作区无关
            if (change.staged) {
                unexpected.push(`${change.path} (outside workDir)`)
            } else {
                ignored.push(`${change.path} (outside workDir)`)
            }
            continue
        }
        seen.add(change.path)
        if (isGeneratedPath(change.path)) {
            ignored.push(change.path)
            continue
        }
        if (declared.has(change.path)) {
            paths.add(change.path)
            continue
        }
        if (change.untracked) {
            // 未跟踪文件默认忽略：只有 fixer / AI patch 显式声明的新文件才进入提交
            ignored.push(change.path)
            continue
        }
        if (isCommitWhitelisted(change.path)) {
            // 白名单只覆盖「内容改动」：删除锁文件 / 清单 / workspace 配置永远不是修复产物。
            // 典型事故：pnpm 在 node_modules 已是最新时返回 0 但不重建被移出的锁文件，
            // 工作树只剩一条删除——白名单放行会把它发布成 PR，因此删除一律按未声明改动拒绝。
            if (change.deleted) {
                unexpected.push(change.path)
                continue
            }
            paths.add(change.path)
            continue
        }
        unexpected.push(change.path)
    }

    return {
        paths: [...paths].sort(),
        unexpected: unexpected.sort(),
        ignored: ignored.sort(),
        rejected,
        missing: [...declared].filter((path) => !seen.has(path)).sort(),
        staged: changes.filter((change) => change.staged).map((change) => change.path).sort(),
        conflicts: conflicts.sort(),
    }
}

/** 按固定大小切分路径（`git add` 的 argv 上限防护）。 */
export function chunkPaths(paths: readonly string[], size: number = ADD_CHUNK_SIZE): string[][] {
    const chunks: string[][] = []
    for (let index = 0; index < paths.length; index += size) {
        chunks.push(paths.slice(index, index + size))
    }
    return chunks
}

/** 是否含控制字符（0x00-0x1f 与 0x7f）：路径里出现即视为注入面。 */
function hasControlChar(value: string): boolean {
    for (const char of value) {
        const code = char.codePointAt(0) ?? 0
        if (code < 0x20 || code === 0x7f) {
            return true
        }
    }
    return false
}
