// git-exclude.ts — 交付提交卫生：把安装 / 执行产物排除在交付变更集之外。
//
// 背景：引擎在目标仓库内执行安装与验证链。目标仓库若未在 `.gitignore` 声明 `node_modules/`
// （或使用仓库内 pnpm store），安装产物会污染工作区：既让「无变更」判定失效，也会在提交边界
// 被收集。提交侧另有白名单 / 生成物黑名单收口（见 github/commit-scope.ts），本模块负责让这些产物
// 从 `git status` 视角也不出现（`git status` 默认跳过 ignored 文件）——两侧互补而非重复。
//
// 落点口径（设计见 docs/design/governance/gitignore-management.md §7）：
// - 只写 `.git/info/exclude`（本地元数据、不可提交），**不修改**目标仓库 `.gitignore`——后者是 tracked
//   文件，改动会进入交付提交并污染 PR；
// - 幂等：按 `.gitignore` 的语义等价归一化判定，且遵循「同一文件内最后一条匹配规则胜出」（取反行可撤销排除）；
//   跨文件优先级不同（`.gitignore` 优先于 `info/exclude`），本模块只保证后者自身语义；
// - 非 git 仓库静默跳过；写入失败通过返回值上报（调用方 warn），运行不中断。
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import type { Logger } from '@dependfix/core'
import { sanitizeCommandEnv } from '../runners/env-hardening'
import type { RuntimeMode } from '../config'
import { normalizeGitignoreEntry } from './helpers'

/** 交付提交必须排除的安装产物（目录形态，任意层级）。 */
export const GIT_EXCLUDE_ENTRIES: readonly string[] = ['.pnpm-store/', 'node_modules/']

/** 追加条目时写入的分组注释（便于用户识别来源）。 */
export const GIT_EXCLUDE_MARKER = '# dependfix：安装产物（不得进入交付提交）'

export interface GitExcludeResult {
    /** 本次实际追加的条目（已全部存在时为空）。 */
    added: string[]
    /** 写入失败原因；非 git 目录与「已全部存在」均为 `undefined`（两者都不是异常）。 */
    error?: string
}

/**
 * 解析工作目录对应的 git 目录（worktree / 子模块返回 common dir）。
 *
 * 委托 `git rev-parse` 而非自行解析 `.git` 文件：子目录向上查找、worktree / 子模块的 `commondir`、
 * `GIT_DIR` 覆盖都由 git 自身裁决，避免把 `.git` 文件内容（外部可控）当成路径写盘。
 * 非 git 目录 / git 不可用时返回 `undefined`。
 */
export function resolveGitDir(workDir: string): string | undefined {
    try {
        // 不用 `--path-format=absolute`（git 2.31+ 才支持）：返回值可能是相对 cwd 的路径，按 workDir 归一
        const out = execFileSync('git', ['rev-parse', '--git-common-dir'], {
            cwd: workDir,
            stdio: 'pipe',
            env: sanitizeCommandEnv(process.env).env,
        }).toString().trim()
        if (!out) {
            return undefined
        }
        return isAbsolute(out) ? out : resolve(workDir, out)
    } catch {
        return undefined
    }
}

/**
 * 判定条目是否*实际*被排除：git 按「同一文件内最后一条匹配规则胜出」，故取反行（`!node_modules`）能
 * 撤销前面的排除。只判断「存在匹配行」会把这种撤销误读成已排除。
 */
export function isEntryEffectivelyExcluded(content: string, entry: string): boolean {
    const target = normalizeGitignoreEntry(entry)
    if (!target) {
        return false
    }
    let excluded = false
    for (const rawLine of content.split('\n')) {
        const line = rawLine.replace(/[ \r]+$/, '')
        if (!line) {
            continue
        }
        const negated = line.startsWith('!')
        if (normalizeGitignoreEntry(negated ? line.slice(1) : line) === target) {
            excluded = !negated
        }
    }
    return excluded
}

/**
 * 确保 `.git/info/exclude` 包含指定的安装产物条目。
 *
 * - 已存在等价条目时不重复追加（字节级不变）；
 * - 追加带分组注释，且以换行安全拼接（原文件无尾换行时补一个）；
 * - 非 git 目录返回空结果；写入失败返回 `error`（不抛异常）。
 */
export function ensureGitExclude(workDir: string, entries: readonly string[] = GIT_EXCLUDE_ENTRIES): GitExcludeResult {
    try {
        const gitDir = resolveGitDir(workDir)
        if (!gitDir) {
            return { added: [] }
        }
        const excludePath = join(gitDir, 'info', 'exclude')
        let content = ''
        if (existsSync(excludePath)) {
            content = readFileSync(excludePath, 'utf-8')
        } else {
            mkdirSync(dirname(excludePath), { recursive: true })
        }
        const missing = entries.filter((entry) => !isEntryEffectivelyExcluded(content, entry))
        if (missing.length === 0) {
            return { added: [] }
        }
        const suffix = content.length === 0 || content.endsWith('\n') ? '' : '\n'
        writeFileSync(excludePath, `${content}${suffix}${GIT_EXCLUDE_MARKER}\n${missing.join('\n')}\n`, 'utf-8')
        return { added: missing }
    } catch (error: unknown) {
        return { added: [], error: error instanceof Error ? error.message : String(error) }
    }
}

/** 会执行安装并产生提交的模式（其余模式不预置排除条目）。 */
const HYGIENE_MODES: ReadonlySet<RuntimeMode> = new Set<RuntimeMode>(['fix', 'fix-and-pr'])

/**
 * 按运行模式预置交付提交卫生：仅 `fix` / `fix-and-pr` 且非 `dry-run` 时写入排除条目。
 *
 * `report-only`（只读扫描）、`cleanup-branches`（不动工作树）与 `dry-run`（不写盘）保持零副作用；
 * 写入失败只 warn，不阻断运行。
 */
export function prepareDeliveryHygiene(
    workDir: string,
    options: { mode: RuntimeMode, dryRun: boolean },
    logger: Pick<Logger, 'info' | 'warn'>,
): void {
    if (options.dryRun || !HYGIENE_MODES.has(options.mode)) {
        return
    }
    const result = ensureGitExclude(workDir)
    if (result.error) {
        // 写入失败不阻断运行，但必须留痕：否则安装产物会在无声中进入交付提交
        logger.warn(`[git] 安装产物排除写入失败（.git/info/exclude）：${result.error}`)
    } else if (result.added.length > 0) {
        logger.info(`[git] 已排除安装产物：${result.added.join(', ')}（.git/info/exclude）`)
    }
}
