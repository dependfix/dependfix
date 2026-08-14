import { execSync } from 'node:child_process'
import { copyFileSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LockfileFailureCategory =
    | 'LOCKFILE_NOT_FOUND'
    | 'MANIFEST_MISMATCH'
    | 'LOCKFILE_VERSION_MISMATCH'
    | 'CORRUPTED_LOCKFILE'
    | 'CREDENTIAL_ERROR'
    | 'RESOLVE_ERROR'
    | 'MINIMUM_RELEASE_AGE'
    | 'UNKNOWN'

export type RepairStrategy =
    | 'REGENERATE'
    | 'FIX_ENTRIES'
    | 'PIN_TOOLCHAIN'
    | 'REINSTALL'
    | 'SKIP'

export interface RepairLockfileParams {
    /** 工作目录（必须包含 package.json 和 pnpm-lock.yaml） */
    workDir: string
    /** 可选：期望的 pnpm 版本（优先于 packageManager 字段） */
    toolchain?: {
        pnpmVersion?: string
    }
}

export interface LockfileDiff {
    /** lockfile 行数变化（正=增加） */
    linesChanged: number
    /** packages 条数变化（正=增加） */
    packagesChanged: number
    /** 简要文字摘要 */
    summary: string
}

export interface RepairAttempt {
    strategy: RepairStrategy
    command: string
    success: boolean
    error?: string
    durationMs: number
}

export interface LockfileRepairResult {
    success: boolean
    failureCategory?: LockfileFailureCategory
    failureDetail?: string
    strategy?: RepairStrategy
    diff?: LockfileDiff | null
    attemptHistory: RepairAttempt[]
    /** 修复后 lockfile 的 lockfileVersion（提取自 pnpm-lock.yaml） */
    lockfileVersion?: string
    /** 修复前后 lockfileVersion 是否变化（格式漂移检测，wisdom: pnpm v11 overrides 迁移教训） */
    lockfileVersionChanged?: boolean
}

interface ClassificationResult {
    ok: boolean
    category?: LockfileFailureCategory
    stderr?: string
}

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

/**
 * 执行 `pnpm i --frozen-lockfile` 并解析失败分类。
 * 成功时返回 { ok: true }。
 */
export function classifyLockfileFailure(workDir: string): ClassificationResult {
    try {
        execSync('pnpm install --frozen-lockfile', {
            cwd: workDir,
            stdio: 'pipe',
            timeout: 120_000,
        })
        return { ok: true }
    } catch (err) {
        const execError = err as ExecError
        const stderr = getStderrText(execError)
        if (!stderr) {
            return { ok: false, category: 'UNKNOWN', stderr: '' }
        }
        const category = parseFailureCategory(stderr)
        return { ok: false, category, stderr }
    }
}

const FAILURE_PATTERNS: [LockfileFailureCategory, RegExp][] = [
    ['LOCKFILE_NOT_FOUND', /no lockfile|Cannot find.*pnpm-lock\.yaml|ENOENT.*lockfile/i],
    ['MANIFEST_MISMATCH', /ERR_PNPM_OUTDATED_LOCKFILE|out of sync|needs update/i],
    ['CREDENTIAL_ERROR', /E401|ERR_PNPM_FETCH_401|ERR_PNPM_FETCH_403|authentication failed|Authorization/i],
    ['CORRUPTED_LOCKFILE', /\b(broken|corrupted|Cannot read).*lockfile|ERR_PNPM_BROKEN_LOCKFILE/i],
    ['LOCKFILE_VERSION_MISMATCH', /lockfileVersion.*incompatible|unsupported lockfile version|lockfile had been generated with/i],
    // 目标仓库显式配置 minimumReleaseAge（strict 模式）时，解析与 lockfile 校验均可能被
    // 冷却期约束阻止：ERR_PNPM_NO_MATURE_MATCHING_VERSION（解析）/ ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION（frozen 校验）
    ['MINIMUM_RELEASE_AGE', /ERR_PNPM_NO_MATURE_MATCHING_VERSION|ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION|minimumReleaseAge/i],
    ['RESOLVE_ERROR', /ERR_PNPM_NO_MATCHING_VERSION|resolution|resolve.*failed|ERR_PNPM_PEER_DEP_ISSUES/i],
]

/**
 * 按优先级匹配 stderr，返回首个命中的 FailureCategory。
 * 不匹配任何特征时返回 'UNKNOWN'。
 */
function parseFailureCategory(stderr: string): LockfileFailureCategory {
    for (const [category, pattern] of FAILURE_PATTERNS) {
        if (pattern.test(stderr)) {
            return category
        }
    }
    return 'UNKNOWN'
}

// ---------------------------------------------------------------------------
// Repair Strategies
// ---------------------------------------------------------------------------

interface ExecError extends Error {
    stderr?: Buffer | string
    stdout?: Buffer | string
    status?: number
}

function getStderrText(err: ExecError): string {
    if (!err.stderr) {
        return (err as Error).message ?? ''
    }
    if (typeof err.stderr === 'string') {
        return err.stderr
    }
    return err.stderr.toString('utf-8')
}

function execRepair(command: string, workDir: string, timeoutMs = 180_000): void {
    execSync(command, { cwd: workDir, stdio: 'pipe', timeout: timeoutMs })
}

/**
 * 确定某个分类下适用的修复策略链（从首到末）。
 * CREDENTIAL_ERROR 返回空链（不可修复）。
 */
function getStrategyChain(category: LockfileFailureCategory): RepairStrategy[] {
    switch (category) {
        case 'LOCKFILE_NOT_FOUND':
        case 'MANIFEST_MISMATCH':
            return ['REGENERATE', 'REINSTALL']
        case 'CORRUPTED_LOCKFILE':
            return ['FIX_ENTRIES', 'REGENERATE', 'REINSTALL']
        case 'LOCKFILE_VERSION_MISMATCH':
            return ['PIN_TOOLCHAIN', 'REGENERATE', 'REINSTALL']
        case 'RESOLVE_ERROR':
            return ['REGENERATE', 'FIX_ENTRIES', 'REINSTALL']
        // 冷却期约束：重新解析可能选中满足 minimumReleaseAge 的旧版本（range 允许时），
        // 写死精确版本时解析依旧失败 → 回滚并由 failureDetail 说明策略约束
        case 'MINIMUM_RELEASE_AGE':
            return ['REGENERATE', 'REINSTALL']
        case 'UNKNOWN':
            return ['REGENERATE', 'REINSTALL']
        case 'CREDENTIAL_ERROR':
            return []
    }
}

/**
 * 生成策略命令（PIN_TOOLCHAIN 用声明版本 pnpm 重生成 lockfile）。
 * - `pnpmVersion` 提供时：`corepack pnpm@<version> install --lockfile-only`
 *   （corepack 不可用/下载失败时命令本身失败 → 策略链 REGENERATE/REINSTALL 兜底，
 *   行为不劣于现状）
 * - `pnpmVersion` 缺省：回退裸 `pnpm install --lockfile-only`（保持旧 stub 语义）
 */
function getStrategyCommand(strategy: RepairStrategy, pnpmVersion?: string | null): string {
    switch (strategy) {
        case 'REGENERATE':
            return 'pnpm install --lockfile-only'
        case 'FIX_ENTRIES':
            return 'pnpm install --fix-lockfile --lockfile-only'
        case 'REINSTALL':
            return 'pnpm install --no-frozen-lockfile'
        case 'PIN_TOOLCHAIN':
            return pnpmVersion
                ? `corepack pnpm@${pnpmVersion} install --lockfile-only`
                : 'pnpm install --lockfile-only'
        default:
            return ''
    }
}

/** 从 lockfile 内容提取 `lockfileVersion` 字段值（如 `9.0`）；缺失返回 null。 */
export function extractLockfileVersion(content: string): string | null {
    const match = /lockfileVersion:\s*['"]?([^'"\s]+)/.exec(content)
    return match?.[1] ?? null
}

// ---------------------------------------------------------------------------
// Diff
// ---------------------------------------------------------------------------

/**
 * 比较修复前后 lockfile，返回行数与包数量变化摘要。
 */
export function computeLockfileDiff(beforePath: string, afterPath: string): LockfileDiff {
    const beforeLines = countLockfileLines(beforePath)
    const afterLines = countLockfileLines(afterPath)
    const beforePackages = countLockfilePackages(beforePath)
    const afterPackages = countLockfilePackages(afterPath)

    const linesChanged = afterLines - beforeLines
    const packagesChanged = afterPackages - beforePackages

    const parts: string[] = []
    if (linesChanged !== 0) {
        parts.push(`${linesChanged > 0 ? '+' : ''}${linesChanged} lines`)
    }
    if (packagesChanged !== 0) {
        parts.push(`${packagesChanged > 0 ? '+' : ''}${packagesChanged} packages`)
    }
    const summary = parts.length > 0 ? `lockfile updated: ${parts.join(', ')}` : 'lockfile unchanged'

    return { linesChanged, packagesChanged, summary }
}

function countLockfileLines(path: string): number {
    if (!existsSync(path)) {
        return 0
    }
    return readFileSync(path, 'utf-8').split('\n').length
}

/**
 * 统计 pnpm-lock.yaml 中 `packages:` 块下的条目数。
 * packages 条目以缩进 + `/` 开头（如 `  /lodash@4.17.21:`）。
 */
function countLockfilePackages(path: string): number {
    if (!existsSync(path)) {
        return 0
    }
    const content = readFileSync(path, 'utf-8')
    const lines = content.split('\n')
    let inPackages = false
    let count = 0
    for (const line of lines) {
        if (!inPackages) {
            if (/^packages:\s*$/.test(line)) {
                inPackages = true
            }
            continue
        }
        // packages 块结束：下一个顶级 key（无缩进）
        if (/^[a-zA-Z]/.test(line)) {
            break
        }
        // 包条目: 以缩进 + '/' 开头
        if (/^\s+\//.test(line)) {
            count++
        }
    }
    return count
}

// ---------------------------------------------------------------------------
// Version Resolution
// ---------------------------------------------------------------------------

/**
 * pnpm 版本白名单格式（安全加固：拒绝不可信 packageManager/config 的任意字符串，
 * 防命令注入——corepack 命令是唯一动态拼接的 execSync 命令）。
 * 兼容标准 semver 与 corepack 哈希后缀（pnpm@10.5.2+sha512.xxx）。
 */
const PNPM_VERSION_RE = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/

/** 校验 pnpm 版本格式是否合法（非法返回 false，调用方回退裸命令/报错）。 */
export function isValidPnpmVersion(version: string | undefined | null): version is string {
    return typeof version === 'string' && PNPM_VERSION_RE.test(version.trim())
}

/**
 * 从 package.json 的 `packageManager` 字段解析 pnpm 版本。
 * 优先级: toolchain.pnpmVersion > packageManager > null
 * 非法 toolchain 版本 → 回退 packageManager；两者都非法/缺失 → null（裸命令兜底）。
 */
export function resolvePnpmVersion(
    workDir: string,
    toolchain?: { pnpmVersion?: string },
): string | null {
    if (toolchain?.pnpmVersion && isValidPnpmVersion(toolchain.pnpmVersion)) {
        return toolchain.pnpmVersion.trim()
    }

    const pkgPath = join(workDir, 'package.json')
    if (!existsSync(pkgPath)) {
        return null
    }

    try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as Record<string, unknown>
        const pm = pkg.packageManager
        if (typeof pm === 'string') {
            const match = /pnpm@(.+)$/.exec(pm)
            if (match?.[1] && isValidPnpmVersion(match[1])) {
                return match[1].trim()
            }
        }
    } catch {
        // ignore parse errors
    }
    return null
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const LOCKFILE_NAME = 'pnpm-lock.yaml'

/**
 * 在 workDir 中使用 `pnpm install --frozen-lockfile` 验证 lockfile 合规性。
 * 验证通过 → 返回 ret:0；失败 → 返回 ret:1 + stderr。
 * 不抛异常——调用方通过 ret 判断结果。
 */
function verifyFrozenLockfile(workDir: string): { ret: number, stderr: string } {
    try {
        execSync('pnpm install --frozen-lockfile', {
            cwd: workDir,
            stdio: 'pipe',
            timeout: 120_000,
        })
        return { ret: 0, stderr: '' }
    } catch (err) {
        return { ret: 1, stderr: getStderrText(err as ExecError) }
    }
}

/**
 * 备份 pnpm-lock.yaml → `<name>.bak`，返回备份路径。
 * lockfile 不存在时会创建空 .bak（回滚时删除即可）。
 */
function backupLockfilePath(workDir: string): string {
    const src = join(workDir, LOCKFILE_NAME)
    const bak = `${src}.bak`
    if (existsSync(src)) {
        copyFileSync(src, bak)
    }
    return bak
}

/** 从 .bak 还原 lockfile，并删除 .bak。 */
function rollback(bakPath: string, workDir: string): void {
    const target = join(workDir, LOCKFILE_NAME)
    try {
        if (existsSync(bakPath)) {
            copyFileSync(bakPath, target)
        }
    } finally {
        try {
            rmSync(bakPath)
        } catch {
            /* ignore */
        }
    }
}

/**
 * 检测并修复 pnpm frozen-lockfile 漂移。
 *
 * 流程：
 * 1. 先跑 `pnpm i --frozen-lockfile` 诊断
 * 2. 若已合规 → 直接返回 success
 * 3. 若为 CREDENTIAL_ERROR → SKIP
 * 4. 按分类选取策略链，逐级尝试修复：
 *    - 每个策略执行后立即用 `pnpm i --frozen-lockfile` 验证
 *    - 验证通过 → 记录 diff、返回 success
 *    - 验证失败 → 继续下一个策略
 * 5. 所有策略失败 → 回滚 lockfile、返回失败结果
 */
export function repairLockfile(params: RepairLockfileParams): LockfileRepairResult {
    const { workDir } = params
    const workDir_ = workDir // alias for consistency
    // 解析 pnpm 版本（toolchain 显式 > packageManager 字段 > null）
    const pnpmVersion = resolvePnpmVersion(workDir_, params.toolchain)

    const attempts: RepairAttempt[] = []

    // ---- 1. 备份 ----
    const bakPath = backupLockfilePath(workDir_)
    const beforeLockfileVersion = readLockfileVersionOf(workDir_)

    // ---- 2. 诊断 ----
    const classification = classifyLockfileFailure(workDir_)

    if (classification.ok) {
        // 已合规，无需修复
        try {
            rmSync(bakPath)
        } catch {
            /* ignore */
        }
        return {
            success: true,
            diff: null,
            attemptHistory: attempts,
        }
    }

    const category = classification.category ?? 'UNKNOWN'
    const stderr = classification.stderr ?? ''

    // ---- 3. CREDENTIAL_ERROR 不可修复 ----
    if (category === 'CREDENTIAL_ERROR') {
        try {
            rmSync(bakPath)
        } catch {
            /* ignore */
        }
        return {
            success: false,
            failureCategory: 'CREDENTIAL_ERROR',
            failureDetail: `registry authentication error: ${truncate(stderr, 500)}`,
            strategy: 'SKIP',
            attemptHistory: attempts,
        }
    }

    // ---- 4. 逐级尝试 ----
    const strategyChain = getStrategyChain(category)

    let lastError = stderr
    const startTimestamp = Date.now()

    for (const strategy of strategyChain) {
        const command = getStrategyCommand(strategy, pnpmVersion)
        const t0 = Date.now()

        let strategySuccess = false
        let strategyError: string | undefined

        try {
            execRepair(command, workDir_)
            strategySuccess = true
        } catch (err) {
            strategyError = getStderrText(err as ExecError) || (err as Error).message
        }

        const durationMs = Date.now() - t0
        attempts.push({ strategy, command, success: strategySuccess, error: strategyError, durationMs })

        if (!strategySuccess) {
            lastError = strategyError ?? lastError
            continue
        }

        // 策略命令成功 → 验证 frozen-lockfile
        const verify = verifyFrozenLockfile(workDir_)

        if (verify.ret === 0) {
            // 验证通过 → 计算 diff + 格式漂移检测（lockfileVersion 前后对比）
            const diff = computeLockfileDiff(bakPath, join(workDir_, LOCKFILE_NAME))
            const afterLockfileVersion = readLockfileVersionOf(workDir_)
            try {
                rmSync(bakPath)
            } catch {
                /* ignore */
            }
            return {
                success: true,
                strategy,
                diff,
                attemptHistory: attempts,
                lockfileVersion: afterLockfileVersion ?? undefined,
                lockfileVersionChanged: beforeLockfileVersion !== null
                    && afterLockfileVersion !== null
                    && beforeLockfileVersion !== afterLockfileVersion,
            }
        }

        lastError = verify.stderr
    }

    // ---- 5. 全部失败 → 回滚 ----
    rollback(bakPath, workDir_)

    const durationMs = Date.now() - startTimestamp
    attempts.push({
        strategy: 'SKIP',
        command: 'rollback',
        success: true,
        durationMs,
    })

    const categoryNote = category === 'MINIMUM_RELEASE_AGE'
        ? 'target repo has a minimumReleaseAge policy; locked versions are too fresh. Retry after the cooldown period, or relax the policy: '
        : ''

    return {
        success: false,
        failureCategory: category,
        failureDetail: `${categoryNote}${truncate(lastError, 500)}`,
        attemptHistory: attempts,
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function truncate(text: string, maxLen: number): string {
    if (text.length <= maxLen) {
        return text
    }
    return `${text.slice(0, maxLen)}…`
}

/** 读取当前 lockfile 的 lockfileVersion（文件缺失/读取失败返回 null）。 */
function readLockfileVersionOf(workDir: string): string | null {
    const path = join(workDir, LOCKFILE_NAME)
    if (!existsSync(path)) {
        return null
    }
    try {
        return extractLockfileVersion(readFileSync(path, 'utf-8'))
    } catch {
        return null
    }
}
