// peer-only-promotion.ts — peer-only 实例不跟随 overrides 重解析时的回退路径。
//
// 背景：某些依赖实例只以 peer 身份存在（`pkg@ver(peer@x)`），pnpm 不会用 overrides 改写它们，
// 于是同一 major 内的可修告警表现为「override 未生效 → 回滚 → 需人工」。实证形态见
// docs/design/modules/dependency-fixer-records.md §12：`rss-to-memos-sync` 的 vite 8.3.1 → ^8.3.3、
// `sharp-cloud-uploader` 同形态。若某个 manifest 以**直接依赖**声明了该包，提升这条声明即可让
// peer 解析跟随到目标版本，无需（也无法）改 peerDependencies。
//
// 边界（与 overrides 路径同族的纪律）：
// - 只写一个 manifest 的单个字段组；多个 manifest 都声明时不自动多写（会形成半族状态），改判需人工；
// - 只在**同一条版本线**内提升：目标 major 与候选声明的 major 不一致即判需人工（不跨 major）；
// - 只有一个 install 单元；提升后回读 lockfile（按目标 major 过滤），仍有低于目标的实例即逐字节回滚；
// - 回滚单元是「提升前该 manifest + pnpm-lock.yaml 的快照」，与 override 路径的备份链互不干扰；
// - 快照 / 还原自身失败时降级为需人工，不向上抛异常（调用方的「跳过而非失败」口径不能被打断）；
// - 不修改 peerDependencies，不做跨 major 判定（由上游统一判定后才会走到这里）。

import { copyFileSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { readLockfileImporterDeclarations, readLockfileVersions } from './lockfile-versions'
import { findDependencyVersion, type PackageJson } from './manifest'
import { applyManifestUpgrades } from './manifest-upgrades'
import { compareSemver, parseMajorVersion } from './semver'

/** 提升结果。`needs-manual` 的 `reason` 已包含文件与版本建议，可直接作为跳过原因说明。 */
export interface PeerOnlyPromotionOutcome {
    status: 'promoted' | 'needs-manual'
    packageName: string
    /** 候选 / 提升点（相对工作目录的 manifest 目录，`'.'` 表示根） */
    manifestDir?: string
    /** 候选 / 提升点的展示路径（如 `packages/web/package.json`） */
    manifestFile?: string
    /** 提升后的版本声明（仅 `promoted`） */
    fromVersion?: string
    toVersion?: string
    /** 提升是否跨 major（恒为 false；由同线护栏保证，供调用方覆盖结果的 `isMajor`） */
    isMajor?: boolean
    /** 提升安装是否为环境性失败（调用方据此停止后续安装尝试，而不是记「需人工」） */
    environmental?: boolean
    /** 判定说明（needs-manual 必填） */
    reason: string
    /** 已检查的直接依赖声明位置（相对工作目录） */
    checkedFiles: string[]
}

interface DeclarationCandidate {
    dir: string
    manifestFile: string
    version: string
}

/** 版本化 overrides 中「仍未达标」的一条版本线。 */
export interface FailingOverrideLine {
    /** 命中该线的 override key（可能多个 key 落到同一 major） */
    selectors: string[]
    major: number
    targetVersion: string
    /** 该线仍低于目标的锁定实例 */
    below: string[]
    /**
     * 无 selector 的通用 key（`pkg: ^x`）：覆盖全部实例，提升校验不按 major 过滤
     * （与 `override-verification.ts` 对无版本号 key 的「覆盖全部实例」语义一致）。
     */
    unversioned?: boolean
}

/**
 * 解析 overrides key 的 selector major：`pkg@8` / `pkg@^8` / `pkg@~8` / `pkg@8.3.3` 都接受。
 *
 * 与 `override-verification.ts` 的 selector 解析同口径（`^8` 与 `8` 语义等价，见 override-key 归一化），
 * 否则「校验判 peer-only、提升却找不到线」。
 */
export function parseSelectorMajor(selector: string): number {
    const match = /^[^\d]*(\d+)/.exec(selector.trim())
    return match ? Number.parseInt(match[1], 10) : -1
}

/** 归一化 importer 目录：`''` → `'.'`；去掉首尾斜杠。 */
function normalizeImporterDir(dir: string): string {
    const trimmed = dir.replace(/^\.?\/+|\/+$/g, '')
    return trimmed === '' ? '.' : trimmed
}

/**
 * 定位以直接依赖声明目标包的 manifest。
 *
 * 优先取 lockfile `importers`（pnpm 记录的安装组 → 声明映射）；importers 缺失或未命中时
 * 回退检查根 manifest（lockfile 过期但声明已存在的形态）。命中多个时由调用方判为需人工。
 */
export function findPromotionCandidates(
    workDir: string,
    packageName: string,
): { candidates: DeclarationCandidate[], checkedFiles: string[] } {
    const lockfilePath = join(workDir, 'pnpm-lock.yaml')
    const byDir = new Map<string, DeclarationCandidate>()

    for (const declaration of readLockfileImporterDeclarations(lockfilePath, packageName)) {
        const dir = normalizeImporterDir(declaration.dir)
        if (byDir.has(dir)) {
            continue
        }
        byDir.set(dir, {
            dir,
            manifestFile: dir === '.' ? 'package.json' : `${dir}/package.json`,
            version: declaration.specifier,
        })
    }

    // 根 manifest 兜底：lockfile 里没有 importers 声明（旧格式 / 锁文件落后）时仍可提升根声明
    if (!byDir.has('.')) {
        const rootPkgPath = join(workDir, 'package.json')
        if (existsSync(rootPkgPath)) {
            try {
                const pkg = JSON.parse(readFileSync(rootPkgPath, 'utf-8')) as PackageJson
                const direct = findDependencyVersion(pkg, packageName)
                if (direct) {
                    byDir.set('.', { dir: '.', manifestFile: 'package.json', version: direct.version })
                }
            } catch {
                // 根 manifest 不可解析：交给上方 importers 结论，不阻断
            }
        }
    }

    const candidates = [...byDir.values()].sort((a, b) => a.dir.localeCompare(b.dir))
    // 版本以**当前 manifest 声明**为准（importers 的 specifier 可能落后于手改后的 manifest）；
    // 读不到时保留 importers 的 specifier（仅用于判定说明）。
    for (const candidate of candidates) {
        const manifestPath = join(workDir, candidate.manifestFile)
        if (!existsSync(manifestPath)) {
            continue
        }
        try {
            const pkg = JSON.parse(readFileSync(manifestPath, 'utf-8')) as PackageJson
            const direct = findDependencyVersion(pkg, packageName)
            if (direct) {
                candidate.version = direct.version
            }
        } catch {
            // manifest 不可解析：保留原版本串，后续按需人工处置
        }
    }
    return { candidates, checkedFiles: candidates.map((candidate) => candidate.manifestFile) }
}

/**
 * 从版本化 overrides 中挑出「仍未达标」的版本线。
 *
 * key 形态 `pkg@major`（scoped 包取最后一个 `@` 之后）；每条线只比较同 major 的锁定实例，
 * 与 `verifyVersionedOverridesAppliedAll` 的按线归因同口径——否则多 key 单 plan（同包多 major
 * 共存）会把另一条线的目标版本当成提升目标，导致跨线写入。
 */
export function collectFailingOverrideLines(
    lockfilePath: string,
    packageName: string,
    overrides: Readonly<Record<string, string>>,
): FailingOverrideLine[] {
    const versions = readLockfileVersions(lockfilePath, packageName)
    const lines = new Map<string, FailingOverrideLine>()
    for (const [key, value] of Object.entries(overrides)) {
        // 路径级 key（`parent>pkg`）无法按包名映射，与 verifyVersionedOverridesAppliedAll 同口径跳过
        if (key.includes('>')) {
            continue
        }
        // selector 只可能是「包名之后紧跟 @major」的部分；`pkg` 与 `@scope/pkg` 本身都属无 selector
        const selectorPart = key.startsWith(packageName) ? key.slice(packageName.length) : key
        const selector = selectorPart.startsWith('@') ? selectorPart.slice(1) : ''
        const targetVersion = value.trim().replace(/^[\^~]/, '')
        const targetMajor = parseMajorVersion(targetVersion)
        if (targetMajor === -1) {
            continue
        }
        const major = selector === '' ? targetMajor : parseSelectorMajor(selector)
        if (major === -1 || major !== targetMajor) {
            continue
        }
        const below = selector === ''
            ? versions.filter((version) => compareSemver(version, targetVersion) < 0)
            : versions.filter((version) => parseMajorVersion(version) === major
                && compareSemver(version, targetVersion) < 0)
        if (below.length === 0) {
            continue
        }
        const lineKey = selector === '' ? 'all' : String(major)
        const line = lines.get(lineKey)
        if (line) {
            line.selectors.push(key)
            if (compareSemver(targetVersion, line.targetVersion) > 0) {
                line.targetVersion = targetVersion
            }
            continue
        }
        lines.set(lineKey, {
            selectors: [key],
            major,
            targetVersion,
            below: [...below].sort(compareSemver),
            ...(selector === '' ? { unversioned: true } : {}),
        })
    }
    return [...lines.values()].sort((a, b) => a.major - b.major)
}

type SnapshotResult = { ok: true, snapshot: string | null } | { ok: false }

/** 创建逐字节快照；失败不抛异常（只读 / 空间不足时由调用方降级为需人工）。 */
function safeSnapshot(path: string): SnapshotResult {
    if (!existsSync(path)) {
        return { ok: true, snapshot: null }
    }
    const snapshot = `${path}.promote.bak`
    try {
        copyFileSync(path, snapshot)
        return { ok: true, snapshot }
    } catch {
        return { ok: false }
    }
}

/** 还原快照（best-effort）：`snapshot=null` 表示提升前不存在，还原为「不存在」。 */
function safeRestore(path: string, snapshot: string | null): boolean {
    try {
        if (snapshot !== null) {
            copyFileSync(snapshot, path)
            rmSync(snapshot, { force: true })
            return true
        }
        rmSync(path, { force: true })
        return true
    } catch {
        return false
    }
}

function cleanupSnapshot(snapshot: string | null): void {
    if (snapshot !== null) {
        try {
            rmSync(snapshot, { force: true })
        } catch {
            // 临时副本清理失败不改变结论（文件已在工作树，属未跟踪的残留）
        }
    }
}

/**
 * 尝试把 peer-only 修复回退到「提升声明该包的 manifest 直接依赖」。
 *
 * @param params.workDir - 工作目录（workspace 根）
 * @param params.packageName - 告警包名
 * @param params.targetVersion - 目标精确版本（不含前缀）
 * @param params.major - 目标实例所在 major（版本化 override 的单条版本线）；缺省不按 major 过滤
 */
export async function promotePeerOnlyDirectDependency(params: {
    workDir: string
    packageName: string
    targetVersion: string
    major?: number
}): Promise<PeerOnlyPromotionOutcome> {
    const { workDir, packageName, targetVersion, major } = params
    const { candidates, checkedFiles } = findPromotionCandidates(workDir, packageName)
    const targetMajor = parseMajorVersion(targetVersion)

    if (targetMajor === -1) {
        return {
            status: 'needs-manual',
            packageName,
            checkedFiles,
            reason: `target version "${targetVersion}" is not a parsable semver; promote the declaring manifest manually`,
        }
    }
    if (candidates.length === 0) {
        return {
            status: 'needs-manual',
            packageName,
            checkedFiles,
            reason: `no manifest declares "${packageName}" as a direct dependency (checked root package.json and pnpm-lock.yaml importers); add it to the manifest that pulls the peer in, at ${targetVersion} or later`,
        }
    }
    if (candidates.length > 1) {
        const listed = candidates.map((candidate) => `${candidate.manifestFile} (${candidate.version})`).join(', ')
        return {
            status: 'needs-manual',
            packageName,
            checkedFiles,
            reason: `multiple manifests declare "${packageName}" (${listed}); promote one of them to ${targetVersion} manually so the peer set stays on a single line`,
        }
    }

    const [candidate] = candidates
    const declaredMajor = parseMajorVersion(candidate.version)
    if (declaredMajor !== -1 && declaredMajor !== targetMajor) {
        return {
            status: 'needs-manual',
            packageName,
            checkedFiles,
            manifestDir: candidate.dir,
            manifestFile: candidate.manifestFile,
            reason: `${candidate.manifestFile} declares "${packageName}@${candidate.version}" (major ${declaredMajor}) but the fix line is major ${targetMajor}; cross-major promotion is out of scope, promote it manually`,
        }
    }

    const manifestPath = join(workDir, candidate.manifestFile)
    const lockfilePath = join(workDir, 'pnpm-lock.yaml')
    // manifest 必须先存在：缺失时直接判需人工，避免先创建 lockfile 快照再早退留下副本
    if (!existsSync(manifestPath)) {
        return {
            status: 'needs-manual',
            packageName,
            checkedFiles,
            manifestDir: candidate.dir,
            manifestFile: candidate.manifestFile,
            reason: `cannot read ${candidate.manifestFile} for promotion; add "${packageName}": "${targetVersion}" to it manually`,
        }
    }

    const manifestSnapshotResult = safeSnapshot(manifestPath)
    if (!manifestSnapshotResult.ok) {
        return {
            status: 'needs-manual',
            packageName,
            checkedFiles,
            manifestDir: candidate.dir,
            manifestFile: candidate.manifestFile,
            reason: `cannot back up ${candidate.manifestFile} for promotion (read-only workspace?); add "${packageName}": "${targetVersion}" to it manually`,
        }
    }
    const lockSnapshotResult = safeSnapshot(lockfilePath)
    if (!lockSnapshotResult.ok) {
        cleanupSnapshot(manifestSnapshotResult.snapshot)
        return {
            status: 'needs-manual',
            packageName,
            checkedFiles,
            manifestDir: candidate.dir,
            manifestFile: candidate.manifestFile,
            reason: 'cannot back up pnpm-lock.yaml for promotion (read-only workspace?); promote the declaring manifest manually',
        }
    }
    const manifestSnapshot = manifestSnapshotResult.snapshot
    const lockSnapshot = lockSnapshotResult.snapshot
    // 还原失败（磁盘满 / 权限）必须披露，不能对外声称「已还原」而留下脏写
    const restore = (): string => {
        const failed: string[] = []
        if (!safeRestore(manifestPath, manifestSnapshot)) {
            failed.push(candidate.manifestFile)
        }
        if (!safeRestore(lockfilePath, lockSnapshot)) {
            failed.push('pnpm-lock.yaml')
        }
        return failed.length > 0
            ? ` (restore failed for ${failed.join(', ')}; backups kept at *.promote.bak)`
            : ''
    }

    const outcome = await applyManifestUpgrades({
        workDir,
        manifestDir: candidate.dir === '.' ? undefined : candidate.dir,
        requests: [{ packageName, targetVersion }],
    })

    if (!outcome.success) {
        const restoreNote = restore()
        return {
            status: 'needs-manual',
            packageName,
            checkedFiles,
            manifestDir: candidate.dir,
            manifestFile: candidate.manifestFile,
            ...(outcome.environmental !== undefined ? { environmental: outcome.environmental } : {}),
            reason: `promoting ${candidate.manifestFile} to ${targetVersion} failed (${outcome.error ?? 'unknown error'}); changes rolled back${restoreNote}`,
        }
    }

    const remaining = readLockfileVersions(lockfilePath, packageName)
        .filter((version) => (major === undefined || parseMajorVersion(version) === major)
            && compareSemver(version, targetVersion) < 0)
    if (remaining.length > 0) {
        const restoreNote = restore()
        return {
            status: 'needs-manual',
            packageName,
            checkedFiles,
            manifestDir: candidate.dir,
            manifestFile: candidate.manifestFile,
            reason: `promoting ${candidate.manifestFile} did not cover instance(s) ${remaining.join(', ')} below ${targetVersion}; changes rolled back${restoreNote}`,
        }
    }

    // 成功：删除快照（保留已写入的提升结果）
    cleanupSnapshot(manifestSnapshot)
    cleanupSnapshot(lockSnapshot)
    const applied = outcome.updates[0]
    return {
        status: 'promoted',
        packageName,
        checkedFiles,
        manifestDir: candidate.dir,
        manifestFile: candidate.manifestFile,
        fromVersion: applied?.fromVersion ?? candidate.version,
        toVersion: applied?.toVersion ?? targetVersion,
        isMajor: applied?.isMajor ?? false,
        reason: `promoted direct dependency in ${candidate.manifestFile}`,
    }
}
