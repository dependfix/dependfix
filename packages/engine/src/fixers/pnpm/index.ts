import { copyFileSync, existsSync, readFileSync, renameSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { resolveInstallTimeoutMs } from '../install-timeouts'
import {
    describeProcessSignals,
    extractProcessSignals,
    getInstallDiagnostics,
    isEnvironmentalInstallError,
    toExecLikeError,
    type ExecError,
} from '../process-signals'
import { getAbortReason, isAbortRequested, runTrackedCommand } from '../../runners/process-control'

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
    // 环境性安装失败：进程被信号杀死 / 超时 / 静默非零退出且**无 stderr 诊断**。
    // 无锁文件证据可归类，按「不归因目标仓库」处理（与既有失败基线同族口径）。
    | 'ENVIRONMENT_ERROR'
    // 本次运行已被取消（平台执行超时 / 运维中止）：命令未启动即返回，不伪装成环境性失败
    | 'ABORTED'
    /**
     * 前置结论冲突：修复前基线已判定安装失败（如 `ERR_PNPM_BROKEN_LOCKFILE`），
     * 但本次诊断复检却通过。此时**不得**走「已合规」捷径（会把基线失败说成合规），
     * 改为走结构兜底链，全部失败时用本类别上报。
     */
    | 'PRECONDITION_FAILED'
    | 'UNKNOWN'

export type RepairStrategy =
    | 'REGENERATE'
    | 'FIX_ENTRIES'
    | 'PIN_TOOLCHAIN'
    /** 结构兜底：移出损坏锁文件后由 manifest 重建（不解析原文件） */
    | 'REGENERATE_FROM_MANIFEST'
    | 'REINSTALL'
    | 'SKIP'

export interface RepairLockfileParams {
    /** 工作目录（必须包含 package.json 和 pnpm-lock.yaml） */
    workDir: string
    /** 可选：期望的 pnpm 版本（优先于 packageManager 字段） */
    toolchain?: {
        pnpmVersion?: string
    }
    /**
     * 修复前基线已判定安装失败的证据（命令 + 诊断）。
     *
     * 提供时禁止「已合规」捷径：即使本次诊断复检通过，也按结构兜底链重建成可冻结安装的锁文件；
     * 全部策略失败时以 `PRECONDITION_FAILED` 上报（附基线证据），不输出「已合规」。
     */
    knownBrokenLockfile?: {
        /** 基线中失败的安装命令（如 `pnpm install --frozen-lockfile`） */
        command?: string
        /** 基线失败诊断（截断后的特征文本） */
        detail?: string
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
    /** 进程退出码（非零退出时；被信号杀死 / spawn 失败时为 null） */
    exitCode?: number | null
    /** 终止进程的信号（如 `SIGKILL` / `SIGTERM`）；非信号终止时为 null */
    signal?: string | null
}

export interface LockfileRepairResult {
    success: boolean
    failureCategory?: LockfileFailureCategory
    failureDetail?: string
    strategy?: RepairStrategy
    diff?: LockfileDiff | null
    /** 修复后 lockfile **内容**是否实际改变（不同于行数 / 包数摘要；已合规时为 false）。 */
    changed?: boolean
    attemptHistory: RepairAttempt[]
    /** 修复后 lockfile 的 lockfileVersion（提取自 pnpm-lock.yaml） */
    lockfileVersion?: string
    /** 修复前后 lockfileVersion 是否变化（格式漂移检测，wisdom: pnpm v11 overrides 迁移教训） */
    lockfileVersionChanged?: boolean
    /**
     * 环境性安装失败（诊断步 `pnpm install --frozen-lockfile` 无 stderr 诊断 / 被信号杀死 / 超时）。
     * 调用方据此**不归因目标仓库**（不计入「本次改动引入的失败」，与既有失败基线同族口径）。
     */
    environmental?: boolean
}

interface ClassificationResult {
    ok: boolean
    category?: LockfileFailureCategory
    /** 原始 stderr（保留供测试 / 来源区分；生产证据统一走 `diagnostics`） */
    stderr?: string
    /** 原始 stdout（pnpm 11 的安装脚本错误常写在这里；生产证据统一走 `diagnostics`） */
    stdout?: string
    /** stderr + stdout 的合并诊断文本（分类与失败详情使用） */
    diagnostics?: string
    /** 进程退出码（非零退出时；被信号杀死 / spawn 失败时为 null） */
    exitCode: number | null
    /** 终止进程的信号；非信号终止时为 null */
    signal: string | null
    /** 是否因超时被终止（execFileSync timeout） */
    timedOut: boolean
    /** spawn 级 errno（如 `ENOENT`——工具链缺失）；无时为 null */
    errno: string | null
    /** 合并诊断是否为空（无任何可用诊断信息） */
    noDiagnostics: boolean
    /** 是否环境性失败（信号 / 超时 / 无 stderr 诊断） */
    environmental: boolean
}

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

/**
 * 执行 `pnpm i --frozen-lockfile` 并解析失败分类。
 * 成功时返回 `{ ok: true }`。
 *
 * 失败时保留进程级信号（退出码 / 信号 / 超时 / spawn errno）：无 stderr 诊断（被信号杀死 /
 * 超时 / 静默非零退出）时归 `ENVIRONMENT_ERROR` + `environmental: true`——外部不再只看到
 * `Command failed: pnpm install --no-frozen-lockfile` 这类无定位信息的结果。
 */
export async function classifyLockfileFailure(workDir: string): Promise<ClassificationResult> {
    const outcome = await runTrackedCommand({
        binary: 'pnpm',
        args: ['install', '--frozen-lockfile'],
        cwd: workDir,
        timeoutMs: resolveInstallTimeoutMs(),
    })

    // 取消前置守卫命中（未启动子进程）：作为独立类别返回，不伪装成环境性失败
    // （环境性 = 「不归因目标仓库」，与「本次运行被中止」语义不同，混用会掩盖中止事实）。
    // 判定前置：未启动时退出码为占位值，不应参与 ok 判定
    if (!outcome.started) {
        const detail = `run aborted before diagnosis (${getAbortReason() ?? 'abort requested'})`
        return {
            ok: false,
            category: 'ABORTED',
            stderr: detail,
            stdout: '',
            diagnostics: detail,
            exitCode: null,
            signal: null,
            timedOut: false,
            errno: null,
            noDiagnostics: false,
            environmental: false,
        }
    }

    // 运行级取消：命令可能已启动后被杀（`started=true` + `aborted=true`），仍以独立类别上报，
    // 不得落入 `ENVIRONMENT_ERROR`（后者的语义是「不归因目标仓库」，混用会掩盖中止事实）。
    if (outcome.aborted) {
        const detail = `run aborted during diagnosis (${getAbortReason() ?? 'abort requested'})`
        return {
            ok: false,
            category: 'ABORTED',
            stderr: detail,
            stdout: '',
            diagnostics: detail,
            exitCode: outcome.exitCode,
            signal: outcome.signal,
            timedOut: outcome.timedOut,
            errno: outcome.errno,
            noDiagnostics: false,
            environmental: false,
        }
    }

    if (outcome.exitCode === 0 && !outcome.timedOut) {
        return {
            ok: true,
            stdout: outcome.stdout,
            diagnostics: '',
            exitCode: 0,
            signal: null,
            timedOut: false,
            errno: null,
            noDiagnostics: true,
            environmental: false,
        }
    }

    // 直接映射受管执行结果（不经 execSync 形态错误往返，避免口径间接化）：
    // `signal` / `timedOut` / `errno` 与旧 `extractProcessSignals(err)` 的语义一一对应
    const rawStderr = outcome.stderr
    const rawStdout = outcome.stdout
    // 合并诊断：pnpm 11 的安装脚本错误写到 stdout，只读 stderr 会丢失根因；
    // 环境性判定与依赖升级链共用单一判据（fixers/process-signals），不在此处另持一份规则
    const execLikeError = toExecLikeError('pnpm install --frozen-lockfile', outcome)
    const diagnostics = getInstallDiagnostics(execLikeError)
    const environmental = isEnvironmentalInstallError(execLikeError)
    return {
        ok: false,
        category: environmental ? 'ENVIRONMENT_ERROR' : parseFailureCategory(diagnostics),
        // 原始流保留供需要区分来源的调用方使用；证据文本统一走 diagnostics
        stderr: rawStderr,
        stdout: rawStdout,
        diagnostics,
        exitCode: outcome.exitCode,
        signal: outcome.signal,
        timedOut: outcome.timedOut,
        errno: outcome.errno,
        noDiagnostics: rawStderr.trim().length === 0 && rawStdout.trim().length === 0,
        environmental,
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

/**
 * 执行一条修复策略命令（受管异步执行；非零退出 / 超时以 `execFileSync` 同形错误抛出）。
 *
 * 超时缺省与其余安装类调用同源（`resolveInstallTimeoutMs`，默认 300s、env 可覆盖）——
 * 旧实现为独立硬编码 180s，属"同类调用多处各持一份超时值"的口径分裂（2026-10-16 复盘）。
 */
async function execRepair(binary: string, args: string[], workDir: string, timeoutMs = resolveInstallTimeoutMs()): Promise<void> {
    const outcome = await runTrackedCommand({ binary, args, cwd: workDir, timeoutMs })
    if (!outcome.started) {
        throw new Error(`run aborted — repair command not started: ${[binary, ...args].join(' ')}`)
    }
    if (outcome.exitCode !== 0 || outcome.timedOut) {
        throw toExecLikeError([binary, ...args].join(' '), outcome)
    }
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
            // 结构损坏（如 duplicated mapping key）：原地策略可能无法解析原文件，
            // 末尾追加「移出后由 manifest 重建」的兜底（见 REGENERATE_FROM_MANIFEST）。
            return ['FIX_ENTRIES', 'REGENERATE', 'REGENERATE_FROM_MANIFEST', 'REINSTALL']
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
        // 前置结论冲突（基线已判安装失败但复检通过）：不信任复检结论，
        // 直接由 manifest 重建（原文件先移出），失败则以 PRECONDITION_FAILED 上报
        case 'PRECONDITION_FAILED':
            return ['REGENERATE_FROM_MANIFEST', 'REGENERATE', 'REINSTALL']
        // 环境性安装失败：策略链与 UNKNOWN 同源（保留尝试以免遗漏「环境已恢复」的机会性修复）；
        // 失败时由 `environmental` 标记驱动「不归因目标仓库」口径（见 LockfileRepairResult.environmental）
        case 'ENVIRONMENT_ERROR':
            return ['REGENERATE', 'REINSTALL']
        case 'CREDENTIAL_ERROR':
            return []
        // 运行被取消：不尝试任何策略（命令不会启动，逐级重试纯属空转）
        case 'ABORTED':
            return []
    }
}

/**
 * 生成策略命令（PIN_TOOLCHAIN 用声明版本 pnpm 重生成 lockfile）。
 * - `pnpmVersion` 提供时：`corepack pnpm@<version> install --lockfile-only`
 *   （corepack 不可用/下载失败时命令本身失败 → 策略链 REGENERATE/REINSTALL 兜底，
 *   行为不劣于现状）
 * - `pnpmVersion` 缺省：回退裸 `pnpm install --lockfile-only`（保持旧 stub 语义）
 *
 * 返回 `{ binary, args }` 而非完整 shell 命令字符串，便于 `execFileSync` 参数化调用
 * 避免 shell 解释（`execSync` 模板拼接是 Code Scanning 命令注入告警源头）。所有
 * 参数均受 `isValidPnpmVersion` 白名单约束，无 shell metacharacter。
 */
function getStrategyCommand(strategy: RepairStrategy, pnpmVersion?: string | null): { binary: string, args: string[] } | null {
    switch (strategy) {
        case 'REGENERATE':
            return { binary: 'pnpm', args: ['install', '--lockfile-only'] }
        case 'FIX_ENTRIES':
            return { binary: 'pnpm', args: ['install', '--fix-lockfile', '--lockfile-only'] }
        case 'REINSTALL':
            return { binary: 'pnpm', args: ['install', '--no-frozen-lockfile'] }
        case 'REGENERATE_FROM_MANIFEST':
            // 原锁文件已由调用方移出（见 repairLockfile），此处只按 manifest 重建
            return { binary: 'pnpm', args: ['install', '--lockfile-only'] }
        case 'PIN_TOOLCHAIN':
            if (!pnpmVersion) {
                return { binary: 'pnpm', args: ['install', '--lockfile-only'] }
            }
            // corepack pnpm@<version> install --lockfile-only（<version> 受 PNPM_VERSION_RE 白名单约束）
            return { binary: 'corepack', args: [`pnpm@${pnpmVersion}`, 'install', '--lockfile-only'] }
        default:
            return null
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
 * 防命令注入——corepack 命令参数 `pnpm@<version>` 受 PNPM_VERSION_RE 白名单约束）。
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
 *
 * 2026-10-17 可中断化：同步 `execFileSync` → 受管异步 `runTrackedCommand`
 * （不阻塞事件循环；子进程登记在案，运行级取消 / 超时按进程树终止）。
 */
async function verifyFrozenLockfile(workDir: string): Promise<{ ret: number, stderr: string }> {
    const outcome = await runTrackedCommand({
        binary: 'pnpm',
        args: ['install', '--frozen-lockfile'],
        cwd: workDir,
        timeoutMs: resolveInstallTimeoutMs(),
    })
    if (!outcome.started) {
        return { ret: 1, stderr: `run aborted — frozen-lockfile verification skipped (${getAbortReason() ?? 'abort requested'})` }
    }
    if (outcome.exitCode === 0 && !outcome.timedOut) {
        return { ret: 0, stderr: '' }
    }
    return {
        ret: 1,
        // 字段名保持 stderr 以兼容调用方；内容为 stderr + stdout 的合并诊断
        stderr: getInstallDiagnostics(toExecLikeError('pnpm install --frozen-lockfile', outcome)),
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
 * 结构兜底的前置动作：把当前锁文件移到 `<name>.broken` 并返回该路径。
 *
 * 移出而不是删除——覆盖 rename 失败等异常的兜底由调用方处理；文件不存在时返回 undefined。
 */
function moveLockfileAside(workDir: string): string | undefined {
    const src = join(workDir, LOCKFILE_NAME)
    if (!existsSync(src)) {
        return undefined
    }
    const aside = `${src}.broken`
    try {
        removeQuietly(aside)
        renameSync(src, aside)
        return aside
    } catch {
        // 移出失败：保留原文件，退化为原地策略（策略命令自身会失败并被记为一次尝试）
        return undefined
    }
}

/**
 * 从 .bak 复制回锁文件但**保留** .bak（供后续策略与最终回滚继续使用）。
 *
 * 返回是否已恢复到本次修复前的状态：`false` 时调用方**不得**删除移出件
 * （宁可留下 `.broken` 证据，也不能让锁文件凭空消失）。
 */
function restoreLockfileFromBackup(bakPath: string, workDir: string): boolean {
    if (!existsSync(bakPath)) {
        // 原本就没有锁文件：清掉策略可能生成的部分产物，回到「无锁文件」起点
        removeQuietly(join(workDir, LOCKFILE_NAME))
        return true
    }
    try {
        copyFileSync(bakPath, join(workDir, LOCKFILE_NAME))
        return true
    } catch {
        return false
    }
}

function removeQuietly(path: string): void {
    try {
        rmSync(path, { force: true })
    } catch {
        /* ignore */
    }
}

/**
 * 前置结论冲突的诊断文本：把基线失败证据写进失败详情，
 * 避免「基线已判安装失败 / 本次复检通过」这种自相矛盾只留在日志里。
 */
function describePreconditionConflict(knownBroken?: RepairLockfileParams['knownBrokenLockfile']): string {
    const command = knownBroken?.command?.trim() || 'pnpm install --frozen-lockfile'
    const detail = knownBroken?.detail?.trim()
    return `baseline install already failed (${command})`
        + `${detail ? `: ${truncateTail(detail, 300)}` : ''}`
        + ' — refusing the "already compliant" shortcut (structural rebuild required)'
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
 *
 * 2026-10-17：本函数为**异步**（诊断 / frozen 校验 / 策略执行改为受管异步 `spawn`，
 * 见 `runners/process-control.ts`）——同步实现会阻塞事件循环（引擎与平台同进程），
 * 使平台的执行超时定时器一起停摆，且无法在取消时终止子进程树。
 */
export async function repairLockfile(params: RepairLockfileParams): Promise<LockfileRepairResult> {
    const { workDir } = params
    const workDir_ = workDir // alias for consistency
    // 取消前置守卫：已被取消时不做备份 / 诊断 / 策略（避免"空转 + 伪造失败原因"）
    if (isAbortRequested()) {
        return {
            success: false,
            failureCategory: 'ABORTED',
            failureDetail: `run aborted — lockfile repair skipped (${getAbortReason() ?? 'abort requested'})`,
            strategy: 'SKIP',
            attemptHistory: [],
        }
    }
    // 解析 pnpm 版本（toolchain 显式 > packageManager 字段 > null）
    const pnpmVersion = resolvePnpmVersion(workDir_, params.toolchain)

    const attempts: RepairAttempt[] = []

    // ---- 1. 备份 ----
    const bakPath = backupLockfilePath(workDir_)
    const beforeLockfileVersion = readLockfileVersionOf(workDir_)

    // ---- 2. 诊断 ----
    const classification = await classifyLockfileFailure(workDir_)

    // 前置结论冲突：基线已判安装失败（已知损坏），本次复检却通过 → 不信任「已合规」，
    // 继续走结构兜底链（失败时以 PRECONDITION_FAILED 上报基线证据）。
    const knownBroken = params.knownBrokenLockfile
    const preconditionConflict = Boolean(knownBroken) && classification.ok

    if (classification.ok && !knownBroken) {
        // 已合规，无需修复
        try {
            rmSync(bakPath)
        } catch {
            /* ignore */
        }
        return {
            success: true,
            diff: null,
            changed: false,
            attemptHistory: attempts,
        }
    }

    const category: LockfileFailureCategory = preconditionConflict
        ? 'PRECONDITION_FAILED'
        : (classification.category ?? 'UNKNOWN')
    const diagnostics = preconditionConflict
        ? describePreconditionConflict(knownBroken)
        : (classification.diagnostics ?? '')

    // ---- 3. 不可修复的分类：凭据错误（需人工）/ 运行被取消（不空转） ----
    if (category === 'CREDENTIAL_ERROR' || category === 'ABORTED') {
        try {
            rmSync(bakPath)
        } catch {
            /* ignore */
        }
        return {
            success: false,
            failureCategory: category,
            failureDetail: category === 'ABORTED'
                ? `run aborted — lockfile repair skipped (${getAbortReason() ?? 'abort requested'})`
                : `registry authentication error: ${truncate(diagnostics, 500)}`,
            strategy: 'SKIP',
            attemptHistory: attempts,
        }
    }

    // ---- 4. 逐级尝试 ----
    const strategyChain = getStrategyChain(category)

    let lastError = diagnostics
    const startTimestamp = Date.now()

    for (const strategy of strategyChain) {
        const cmd = getStrategyCommand(strategy, pnpmVersion)
        if (!cmd) {
            continue
        }
        const command = [cmd.binary, ...cmd.args].join(' ')
        const t0 = Date.now()

        // 结构兜底：先移出（解析不了的）原锁文件，让 pnpm 只按 manifest 重建。
        // 原文件仍由 `.bak` 保留，失败时回到本次修复前的状态，成功时删除移出件。
        let movedAsidePath: string | undefined
        if (strategy === 'REGENERATE_FROM_MANIFEST') {
            movedAsidePath = moveLockfileAside(workDir_)
        }

        let strategySuccess = false
        let strategyError: string | undefined
        let strategyExitCode: number | null = null
        let strategySignal: string | null = null

        try {
            await execRepair(cmd.binary, cmd.args, workDir_)
            strategySuccess = true
        } catch (err) {
            const execError = err as ExecError
            strategyError = getInstallDiagnostics(execError) || (err as Error).message
            const signals = extractProcessSignals(execError)
            strategyExitCode = signals.exitCode
            strategySignal = signals.signal
        }

        const durationMs = Date.now() - t0
        attempts.push({
            strategy,
            command,
            success: strategySuccess,
            error: strategyError,
            durationMs,
            exitCode: strategyExitCode,
            signal: strategySignal,
        })

        if (!strategySuccess) {
            lastError = strategyError ?? lastError
            // 策略未生效：恢复本次修复前的锁文件（保留 .bak 供后续策略 / 最终回滚），
            // 避免「原文件被移出」影响后续策略的输入假设。
            if (movedAsidePath) {
                if (restoreLockfileFromBackup(bakPath, workDir_)) {
                    removeQuietly(movedAsidePath)
                } else {
                    // 恢复失败：后续策略会在「锁文件缺失」的错误前提下运行，直接走最终回滚
                    break
                }
            }
            continue
        }

        // 策略命令成功 → 验证 frozen-lockfile
        const verify = await verifyFrozenLockfile(workDir_)

        if (verify.ret === 0) {
            // 验证通过 → 计算 diff + 格式漂移检测（lockfileVersion 前后对比）
            const lockfilePath = join(workDir_, LOCKFILE_NAME)
            const diff = computeLockfileDiff(bakPath, lockfilePath)
            const changed = !filesEqual(bakPath, lockfilePath)
            const afterLockfileVersion = readLockfileVersionOf(workDir_)
            removeQuietly(bakPath)
            if (movedAsidePath) {
                removeQuietly(movedAsidePath)
            }
            return {
                success: true,
                strategy,
                diff,
                changed,
                attemptHistory: attempts,
                lockfileVersion: afterLockfileVersion ?? undefined,
                lockfileVersionChanged: beforeLockfileVersion !== null
                    && afterLockfileVersion !== null
                    && beforeLockfileVersion !== afterLockfileVersion,
            }
        }

        // 命令成功但冻结安装仍失败：回到本次修复前状态，继续下一个策略
        if (movedAsidePath) {
            if (!restoreLockfileFromBackup(bakPath, workDir_)) {
                break
            }
            removeQuietly(movedAsidePath)
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

    // 环境性失败：诊断步无 stderr 诊断（被信号杀死 / 超时 / 静默非零退出）。
    // 失败详情显式带上进程级信号 + 可用诊断证据（保留的 stderr，缺失时回退 err.message），
    // 外部不再只看到 `Command failed: pnpm install …` 这类无定位信息的结果。
    if (classification.environmental) {
        const signals = describeProcessSignals({
            exitCode: classification.exitCode,
            signal: classification.signal,
            timedOut: classification.timedOut,
            errno: classification.errno,
        })
        const rawDiagnostics = (classification.diagnostics ?? '').trim()
        const evidence = classification.noDiagnostics
            ? 'no stderr/stdout diagnostics'
            : `diagnostics: ${truncateTail(rawDiagnostics, 500)}`
        return {
            success: false,
            failureCategory: category,
            failureDetail: `environmental install failure (${signals || 'no process signal'}): ${evidence}`,
            attemptHistory: attempts,
            environmental: true,
        }
    }

    return {
        success: false,
        failureCategory: category,
        failureDetail: `${category === 'PRECONDITION_FAILED' ? `${describePreconditionConflict(knownBroken)}; ` : ''}${categoryNote}${truncateTail(lastError, 500)}`,
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

/** 尾部截断：安装错误根因通常写在输出末尾（gyp / ELIFECYCLE），不能从头部切。 */
function truncateTail(text: string, maxLen: number): string {
    if (text.length <= maxLen) {
        return text
    }
    return `…${text.slice(-maxLen)}`
}

/** 比较两个文件内容是否完全一致（读取失败按「已改变」保守处理）。 */
function filesEqual(leftPath: string, rightPath: string): boolean {
    try {
        return readFileSync(leftPath).equals(readFileSync(rightPath))
    } catch {
        return false
    }
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
