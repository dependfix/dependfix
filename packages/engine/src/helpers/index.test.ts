import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NormalizedSecurityAlert } from '@dependfix/core'
import { dedupeFixableAlerts, partitionSubmanifestAlerts, quickVerifyProject, restoreTrackedFiles, snapshotTrackedFiles } from './index'

// ---------------------------------------------------------------------------
// Mock runVerification（quickVerifyProject 依赖）
// ---------------------------------------------------------------------------

const { mockRunVerification } = vi.hoisted(() => ({
    mockRunVerification: vi.fn(),
}))

vi.mock('../runners/verification-runner', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../runners/verification-runner')>()
    return {
        ...actual,
        runVerification: mockRunVerification,
    }
})

// ---------------------------------------------------------------------------
// dedupeFixableAlerts（同包收敛）
// ---------------------------------------------------------------------------

describe('dedupeFixableAlerts', () => {
    const alert = (packageName: string, recommendedVersion: string): NormalizedSecurityAlert => ({
        id: 1,
        source: 'dependabot',
        repository: 'foo/bar',
        defaultBranch: '',
        severity: 'high',
        packageEcosystem: 'npm',
        packageName,
        manifestPath: '',
        ruleId: 'GHSA-xxx',
        summary: 'test',
        htmlUrl: 'https://github.com/foo/bar',
        fixable: true,
        fixStrategy: 'upgrade',
        recommendedVersion,
        dependencyType: 'direct',
        upstreamId: 'dependabot:1',
    })

    it('keeps a single alert per package with the highest recommendedVersion', () => {
        const result = dedupeFixableAlerts([
            alert('vite', '6.4.3'),
            alert('vite', '5.4.20'),
            alert('vite', '8.2.1'),
            alert('fast-uri', '3.1.5'),
        ])

        expect(result).toHaveLength(2)
        const vite = result.find((a) => a.packageName === 'vite')
        expect(vite?.recommendedVersion).toBe('8.2.1')
        const fastUri = result.find((a) => a.packageName === 'fast-uri')
        expect(fastUri?.recommendedVersion).toBe('3.1.5')
    })

    it('returns empty array for empty input', () => {
        expect(dedupeFixableAlerts([])).toEqual([])
    })

    it('keeps single-package alerts unchanged', () => {
        const input = [alert('lodash', '4.18.0')]
        expect(dedupeFixableAlerts(input)).toEqual(input)
    })
})

// ---------------------------------------------------------------------------
// snapshotTrackedFiles / restoreTrackedFiles（逐包回滚）
// ---------------------------------------------------------------------------

describe('snapshotTrackedFiles / restoreTrackedFiles', () => {
    let workDir: string

    const makeWorkDir = (): string => {
        workDir = mkdtempSync(join(tmpdir(), 'dependfix-fix-helpers-'))
        writeFileSync(join(workDir, 'package.json'), '{"version":"1.0.0"}')
        writeFileSync(join(workDir, 'pnpm-lock.yaml'), 'lockfile: v1')
        return workDir
    }

    afterEach(() => {
        rmSync(workDir, { recursive: true, force: true })
    })

    it('snapshots existing files and restores them after modification', () => {
        makeWorkDir()
        const snapshot = snapshotTrackedFiles(workDir)

        // 模拟升级改动
        writeFileSync(join(workDir, 'package.json'), '{"version":"2.0.0"}')
        writeFileSync(join(workDir, 'pnpm-lock.yaml'), 'lockfile: v2')

        restoreTrackedFiles(workDir, snapshot)

        expect(readFileSync(join(workDir, 'package.json'), 'utf-8')).toBe('{"version":"1.0.0"}')
        expect(readFileSync(join(workDir, 'pnpm-lock.yaml'), 'utf-8')).toBe('lockfile: v1')
    })

    it('removes files that did not exist at snapshot time', () => {
        makeWorkDir()
        const snapshot = snapshotTrackedFiles(workDir)
        expect(snapshot['pnpm-workspace.yaml']).toBeNull()

        // 模拟升级创建了 workspace yaml
        writeFileSync(join(workDir, 'pnpm-workspace.yaml'), 'overrides:\n  fast-uri: ^3.1.5\n')

        restoreTrackedFiles(workDir, snapshot)

        expect(existsSync(join(workDir, 'pnpm-workspace.yaml'))).toBe(false)
    })

    it('preserves later successful packages when rolling back one package', () => {
        makeWorkDir()
        // 包 A 成功后的状态（新基线）
        writeFileSync(join(workDir, 'package.json'), '{"dependencies":{"a":"^2.0.0"}}')
        const snapshot = snapshotTrackedFiles(workDir)

        // 包 B 升级（将被回滚）
        writeFileSync(join(workDir, 'package.json'), '{"dependencies":{"a":"^2.0.0","b":"^1.5.0"}}')
        restoreTrackedFiles(workDir, snapshot)

        expect(readFileSync(join(workDir, 'package.json'), 'utf-8'))
            .toBe('{"dependencies":{"a":"^2.0.0"}}')
    })

    it('includes extra relative paths (member manifest) in snapshot and restores them', () => {
        makeWorkDir()
        mkdirSync(join(workDir, 'packages', 'web'), { recursive: true })
        writeFileSync(
            join(workDir, 'packages', 'web', 'package.json'),
            '{"name":"web","dependencies":{"vite":"^5.4.0"}}',
        )

        const snapshot = snapshotTrackedFiles(workDir, ['packages/web/package.json'])

        // 模拟成员级升级改动
        writeFileSync(
            join(workDir, 'packages', 'web', 'package.json'),
            '{"name":"web","dependencies":{"vite":"^5.4.14"}}',
        )

        restoreTrackedFiles(workDir, snapshot)

        expect(readFileSync(join(workDir, 'packages', 'web', 'package.json'), 'utf-8'))
            .toBe('{"name":"web","dependencies":{"vite":"^5.4.0"}}')
        // 根三件套不受影响
        expect(readFileSync(join(workDir, 'package.json'), 'utf-8')).toBe('{"version":"1.0.0"}')
    })

    it('removes extra files that did not exist at snapshot time', () => {
        makeWorkDir()
        const snapshot = snapshotTrackedFiles(workDir, ['packages/web/package.json'])
        expect(snapshot['packages/web/package.json']).toBeNull()

        mkdirSync(join(workDir, 'packages', 'web'), { recursive: true })
        writeFileSync(join(workDir, 'packages', 'web', 'package.json'), '{"name":"web"}')

        restoreTrackedFiles(workDir, snapshot)

        expect(existsSync(join(workDir, 'packages', 'web', 'package.json'))).toBe(false)
    })
})

// ---------------------------------------------------------------------------
// quickVerifyProject（逐包快速验证）
// ---------------------------------------------------------------------------

describe('quickVerifyProject', () => {
    let workDir: string

    afterEach(() => {
        vi.clearAllMocks()
        if (workDir) {
            rmSync(workDir, { recursive: true, force: true })
        }
    })

    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never

    it('passes when lint script succeeds', async () => {
        workDir = mkdtempSync(join(tmpdir(), 'dependfix-quick-'))
        writeFileSync(join(workDir, 'package.json'), JSON.stringify({ scripts: { lint: 'eslint .' } }))
        mockRunVerification.mockResolvedValue({ success: true, commandResults: [{ command: 'pnpm lint', exitCode: 0 }] })

        await expect(quickVerifyProject({ logger, workDir } as never, 'foo/bar')).resolves.toBe(true)
        expect(mockRunVerification).toHaveBeenCalledWith({ workDir, commands: ['pnpm lint'] })
    })

    it('fails when lint script fails', async () => {
        workDir = mkdtempSync(join(tmpdir(), 'dependfix-quick-'))
        writeFileSync(join(workDir, 'package.json'), JSON.stringify({ scripts: { lint: 'eslint .' } }))
        mockRunVerification.mockResolvedValue({ success: false, commandResults: [{ command: 'pnpm lint', exitCode: 2 }] })

        await expect(quickVerifyProject({ logger, workDir } as never, 'foo/bar')).resolves.toBe(false)
    })

    it('passes when no lint script exists (skip semantics)', async () => {
        workDir = mkdtempSync(join(tmpdir(), 'dependfix-quick-'))
        writeFileSync(join(workDir, 'package.json'), JSON.stringify({ scripts: { build: 'tsc' } }))

        await expect(quickVerifyProject({ logger, workDir } as never, 'foo/bar')).resolves.toBe(true)
        expect(mockRunVerification).not.toHaveBeenCalled()
    })

    it('uses customCommands when provided (full verification sequence)', async () => {
        workDir = mkdtempSync(join(tmpdir(), 'dependfix-quick-'))
        writeFileSync(join(workDir, 'package.json'), JSON.stringify({
            scripts: { lint: 'eslint .', build: 'tsc' },
        }))
        const customCommands = ['pnpm install --frozen-lockfile', 'pnpm lint', 'pnpm build']
        mockRunVerification.mockResolvedValue({ success: true, commandResults: [] })

        await expect(quickVerifyProject({ logger, workDir, customCommands } as never, 'foo/bar')).resolves.toBe(true)
        expect(mockRunVerification).toHaveBeenCalledWith({ workDir, commands: customCommands })
    })
})

// ---------------------------------------------------------------------------
// partitionSubmanifestAlerts（子目录/根直接依赖告警剔除修复链路）
// ---------------------------------------------------------------------------

describe('partitionSubmanifestAlerts', () => {
    let workDir: string

    const alert = (overrides: Partial<NormalizedSecurityAlert> = {}): NormalizedSecurityAlert => ({
        id: 1,
        source: 'dependabot',
        repository: 'owner/repo',
        defaultBranch: 'main',
        severity: 'high',
        packageEcosystem: 'npm',
        packageName: 'vite',
        manifestPath: '',
        ruleId: 'GHSA-xxx',
        summary: 'test',
        htmlUrl: '',
        fixable: true,
        fixStrategy: 'upgrade',
        recommendedVersion: '6.4.3',
        upstreamId: 'dependabot:1',
        ...overrides,
    })

    beforeEach(() => {
        workDir = mkdtempSync(join(tmpdir(), 'dependfix-partition-'))
        // 根 package.json：vite 是直接依赖，fast-uri 不是
        writeFileSync(join(workDir, 'package.json'), JSON.stringify({
            name: 'fixture',
            dependencies: { vite: '^8.2.0' },
        }))
    })

    afterEach(() => {
        rmSync(workDir, { recursive: true, force: true })
    })

    it('keeps alerts with empty manifestPath as root (pnpm-audit source)', () => {
        const { root, sub } = partitionSubmanifestAlerts([alert({ packageName: 'fast-uri' })], workDir)
        expect(root).toHaveLength(1)
        expect(sub).toHaveLength(0)
    })

    it('keeps alerts pointing at root package.json as root', () => {
        const { root, sub } = partitionSubmanifestAlerts([alert({ manifestPath: 'package.json' })], workDir)
        expect(root).toHaveLength(1)
        expect(sub).toHaveLength(0)
    })

    it('keeps lockfile-manifest alerts for non-direct packages as root (overrides path, run 30933266831 regression)', () => {
        // 间接依赖告警 manifest 即 pnpm-lock.yaml；fast-uri 非根直接依赖 → 走标准 overrides 修复
        const { root, sub } = partitionSubmanifestAlerts([
            alert({ packageName: 'fast-uri', manifestPath: 'pnpm-lock.yaml' }),
        ], workDir)
        expect(root.map((a) => a.packageName)).toEqual(['fast-uri'])
        expect(sub).toHaveLength(0)
    })

    it('moves lockfile-manifest alerts for root direct dependencies to sub (vite scenario)', () => {
        // vite 是根直接依赖：告警针对传递依赖实例，但 overrides 全局会降级根 → 跳过人工处理
        // （无 lockfile 或单版本时维持 sub；多版本共存场景见下一用例）
        const { root, sub } = partitionSubmanifestAlerts([
            alert({ packageName: 'vite', manifestPath: 'pnpm-lock.yaml' }),
        ], workDir)
        expect(sub.map((a) => a.packageName)).toEqual(['vite'])
        expect(root).toHaveLength(0)
    })

    it('keeps lockfile-manifest alerts for root direct dependencies with multi-version coexistence in root (versioned overrides)', () => {
        // vite@5.4.14 + vite@8.2.0 共存：版本化 overrides 只影响对应实例，不波及其他大版本
        // → 进入修复链路（root），2026-08-06 复盘
        writeFileSync(join(workDir, 'pnpm-lock.yaml'), [
            'lockfileVersion: \'9.0\'',
            '',
            '  vite@5.4.14:',
            '    resolution: {integrity: sha512-old}',
            '',
            '  vite@8.2.0:',
            '    resolution: {integrity: sha512-new}',
            '',
        ].join('\n'))

        const { root, sub } = partitionSubmanifestAlerts([
            alert({ packageName: 'vite', manifestPath: 'pnpm-lock.yaml' }),
        ], workDir)
        expect(root.map((a) => a.packageName)).toEqual(['vite'])
        expect(sub).toHaveLength(0)
    })

    it('keeps lockfile-manifest alerts for non-direct packages in root even when single version (fast-uri)', () => {
        // 非根直接依赖 + 单版本：仍走标准 overrides 修复路径（行为不变）
        writeFileSync(join(workDir, 'pnpm-lock.yaml'), [
            'lockfileVersion: \'9.0\'',
            '',
            '  fast-uri@3.1.5:',
            '    resolution: {integrity: sha512-yyy}',
            '',
        ].join('\n'))

        const { root, sub } = partitionSubmanifestAlerts([
            alert({ packageName: 'fast-uri', manifestPath: 'pnpm-lock.yaml' }),
        ], workDir)
        expect(root.map((a) => a.packageName)).toEqual(['fast-uri'])
        expect(sub).toHaveLength(0)
    })

    it('moves alerts from sub-directory manifests (docs/package.json) to sub', () => {
        const { root, sub } = partitionSubmanifestAlerts([
            alert({ packageName: 'vite', manifestPath: 'docs/package.json' }),
            alert({ packageName: 'fast-uri', manifestPath: 'package.json' }),
        ], workDir)
        expect(root.map((a) => a.packageName)).toEqual(['fast-uri'])
        expect(sub.map((a) => a.packageName)).toEqual(['vite'])
    })

    it('normalizes windows-style separators', () => {
        const { sub } = partitionSubmanifestAlerts([alert({ manifestPath: 'docs\\package.json' })], workDir)
        expect(sub).toHaveLength(1)
    })

    // -----------------------------------------------------------------------
    // 根直接依赖 + 单版本 → 推荐版本 >= 锁定版本时不再跳过（override 不降级）
    // -----------------------------------------------------------------------

    it('keeps single-version root direct dependency when recommended >= locked (no downgrade)', () => {
        // 根声明 vite ^6.4.0，lockfile 锁 6.4.0，告警推荐 6.4.3 → override ^6.4.3 不降级 → root
        writeFileSync(join(workDir, 'pnpm-lock.yaml'), [
            'lockfileVersion: \'9.0\'',
            '',
            '  vite@6.4.0:',
            '    resolution: {integrity: sha512-v640}',
            '',
        ].join('\n'))

        const { root, sub } = partitionSubmanifestAlerts([
            alert({ packageName: 'vite', manifestPath: 'pnpm-lock.yaml', recommendedVersion: '6.4.3' }),
        ], workDir)
        expect(root.map((a) => a.packageName)).toEqual(['vite'])
        expect(sub).toHaveLength(0)
    })

    it('keeps single-version root direct dependency in sub when recommended < locked (downgrade risk)', () => {
        // 根 vite 8.2.0 锁定，告警推荐 5.4.21 → override 会降级 → sub（vite 场景不变）
        writeFileSync(join(workDir, 'pnpm-lock.yaml'), [
            'lockfileVersion: \'9.0\'',
            '',
            '  vite@8.2.0:',
            '    resolution: {integrity: sha512-v820}',
            '',
        ].join('\n'))

        const { root, sub } = partitionSubmanifestAlerts([
            alert({ packageName: 'vite', manifestPath: 'pnpm-lock.yaml', recommendedVersion: '5.4.21' }),
        ], workDir)
        expect(sub.map((a) => a.packageName)).toEqual(['vite'])
        expect(root).toHaveLength(0)
    })

    it('keeps root direct dependency in sub when lockfile has no version info (conservative)', () => {
        // 无 lockfile（versions 为空）→ 无法判断降级风险 → sub
        const { root, sub } = partitionSubmanifestAlerts([
            alert({ packageName: 'vite', manifestPath: 'pnpm-lock.yaml', recommendedVersion: '6.4.3' }),
        ], workDir)
        expect(sub).toHaveLength(1)
        expect(root).toHaveLength(0)
    })

    // -----------------------------------------------------------------------
    // workspace 成员包直接依赖识别（monorepo 盲区）
    // -----------------------------------------------------------------------

    it('recognizes workspace member direct dependencies (single version + downgrade risk → sub)', () => {
        // 根不依赖 vite；packages/app 依赖 vite ^8.0.0；lockfile 单版本 8.2.0；推荐 5.4.21
        mkdirSync(join(workDir, 'packages', 'app'), { recursive: true })
        writeFileSync(join(workDir, 'packages', 'app', 'package.json'), JSON.stringify({
            name: 'app',
            dependencies: { vite: '^8.0.0' },
        }))
        writeFileSync(join(workDir, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n')
        writeFileSync(join(workDir, 'pnpm-lock.yaml'), [
            'lockfileVersion: \'9.0\'',
            '',
            '  vite@8.2.0:',
            '    resolution: {integrity: sha512-v820}',
            '',
        ].join('\n'))

        // 成员包直接依赖 → 视为直接依赖：推荐 < 锁定 → sub（修复前会错误进 root）
        const { root, sub } = partitionSubmanifestAlerts([
            alert({ packageName: 'vite', manifestPath: 'pnpm-lock.yaml', recommendedVersion: '5.4.21' }),
        ], workDir)
        expect(sub.map((a) => a.packageName)).toEqual(['vite'])
        expect(root).toHaveLength(0)
    })

    it('workspace member direct dependency with recommended >= locked is fixable (root)', () => {
        mkdirSync(join(workDir, 'packages', 'app'), { recursive: true })
        writeFileSync(join(workDir, 'packages', 'app', 'package.json'), JSON.stringify({
            name: 'app',
            dependencies: { vite: '^6.4.0' },
        }))
        writeFileSync(join(workDir, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n')
        writeFileSync(join(workDir, 'pnpm-lock.yaml'), [
            'lockfileVersion: \'9.0\'',
            '',
            '  vite@6.4.0:',
            '    resolution: {integrity: sha512-v640}',
            '',
        ].join('\n'))

        const { root, sub } = partitionSubmanifestAlerts([
            alert({ packageName: 'vite', manifestPath: 'pnpm-lock.yaml', recommendedVersion: '6.4.3' }),
        ], workDir)
        expect(root.map((a) => a.packageName)).toEqual(['vite'])
        expect(sub).toHaveLength(0)
    })

    it('recursive workspace glob (**) and literal paths are supported', () => {
        mkdirSync(join(workDir, 'packages', 'a', 'nested'), { recursive: true })
        writeFileSync(join(workDir, 'packages', 'a', 'nested', 'package.json'), JSON.stringify({
            name: 'nested',
            dependencies: { 'fast-uri': '^3.1.0' },
        }))
        writeFileSync(join(workDir, 'pnpm-workspace.yaml'), 'packages:\n  - packages/**\n')
        writeFileSync(join(workDir, 'pnpm-lock.yaml'), [
            'lockfileVersion: \'9.0\'',
            '',
            '  fast-uri@3.1.0:',
            '    resolution: {integrity: sha512-fu}',
            '',
        ].join('\n'))

        // 递归成员包直接依赖 fast-uri：推荐 3.1.5 >= 锁定 3.1.0 → root 可修
        const { root, sub } = partitionSubmanifestAlerts([
            alert({ packageName: 'fast-uri', manifestPath: 'pnpm-lock.yaml', recommendedVersion: '3.1.5' }),
        ], workDir)
        expect(root.map((a) => a.packageName)).toEqual(['fast-uri'])
        expect(sub).toHaveLength(0)
    })

    // -----------------------------------------------------------------------
    // member 桶（workspace 成员 manifest 直接依赖升级）
    // -----------------------------------------------------------------------

    function setupMemberWorkspace(memberDeps: Record<string, string>): void {
        writeFileSync(join(workDir, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n')
        mkdirSync(join(workDir, 'packages', 'web'), { recursive: true })
        writeFileSync(join(workDir, 'packages', 'web', 'package.json'), JSON.stringify({
            name: 'web',
            dependencies: memberDeps,
        }))
    }

    function writeLockfileVersions(...versions: string[]): void {
        writeFileSync(join(workDir, 'pnpm-lock.yaml'), [
            'lockfileVersion: \'9.0\'',
            '',
            ...versions.map((v) => `  ${v}:`),
            '    resolution: {integrity: sha512-x}',
            '',
        ].join('\n'))
    }

    it('routes member manifest direct dependency (single version, recommended >= locked) to member bucket', () => {
        setupMemberWorkspace({ vite: '^5.4.0' })
        writeLockfileVersions('vite@5.4.0')

        const { member, sub } = partitionSubmanifestAlerts([
            alert({ packageName: 'vite', manifestPath: 'packages/web/package.json', recommendedVersion: '5.4.14' }),
        ], workDir)

        expect(member).toHaveLength(1)
        expect(member[0].manifestDir).toBe('packages/web')
        expect(sub).toHaveLength(0)
    })

    it('keeps member manifest alert in sub when recommended < locked (downgrade risk)', () => {
        setupMemberWorkspace({ vite: '^5.4.14' })
        writeLockfileVersions('vite@5.4.14')

        const { member, sub } = partitionSubmanifestAlerts([
            alert({ packageName: 'vite', manifestPath: 'packages/web/package.json', recommendedVersion: '5.4.12' }),
        ], workDir)

        expect(member).toHaveLength(0)
        expect(sub.map((a) => a.packageName)).toEqual(['vite'])
    })

    it('keeps member manifest alert in sub when lockfile has no version info (conservative)', () => {
        setupMemberWorkspace({ vite: '^5.4.0' })
        // 无 lockfile

        const { member, sub } = partitionSubmanifestAlerts([
            alert({ packageName: 'vite', manifestPath: 'packages/web/package.json', recommendedVersion: '5.4.14' }),
        ], workDir)

        expect(member).toHaveLength(0)
        expect(sub).toHaveLength(1)
    })

    it('keeps member manifest alert in sub when multiple versions coexist (member declaration cannot converge)', () => {
        setupMemberWorkspace({ vite: '^5.4.0' })
        writeLockfileVersions('vite@5.4.0', 'vite@8.2.0')

        const { member, sub } = partitionSubmanifestAlerts([
            alert({ packageName: 'vite', manifestPath: 'packages/web/package.json', recommendedVersion: '8.2.1' }),
        ], workDir)

        expect(member).toHaveLength(0)
        expect(sub).toHaveLength(1)
    })

    it('keeps member manifest alert in sub when cross-major (root only)', () => {
        setupMemberWorkspace({ vite: '^5.4.0' })
        writeLockfileVersions('vite@5.4.14')

        // 推荐 6.4.3：major 6 不在 lockfile 实例 majors（仅 5.x）→ 跨线 → sub
        const { member, sub } = partitionSubmanifestAlerts([
            alert({ packageName: 'vite', manifestPath: 'packages/web/package.json', recommendedVersion: '6.4.3' }),
        ], workDir)

        expect(member).toHaveLength(0)
        expect(sub.map((a) => a.packageName)).toEqual(['vite'])
    })

    it('keeps alert in sub when package is not declared in the member manifest (root-only declaration)', () => {
        setupMemberWorkspace({ lodash: '^4.17.20' })
        writeLockfileVersions('vite@5.4.0')

        const { member, sub } = partitionSubmanifestAlerts([
            alert({ packageName: 'vite', manifestPath: 'packages/web/package.json', recommendedVersion: '5.4.14' }),
        ], workDir)

        expect(member).toHaveLength(0)
        expect(sub).toHaveLength(1)
    })

    it('keeps alert in sub when manifest directory is not a workspace member', () => {
        // packages/other 不在 pnpm-workspace.yaml 白名单（仅 packages/* 覆盖子目录，
        // 但此处构造 packages/web 之外的其他目录 + 白名单不含它）
        writeFileSync(join(workDir, 'pnpm-workspace.yaml'), 'packages:\n  - packages/web\n')
        mkdirSync(join(workDir, 'packages', 'other'), { recursive: true })
        writeFileSync(join(workDir, 'packages', 'other', 'package.json'), JSON.stringify({
            name: 'other',
            dependencies: { vite: '^5.4.0' },
        }))
        writeLockfileVersions('vite@5.4.0')

        const { member, sub } = partitionSubmanifestAlerts([
            alert({ packageName: 'vite', manifestPath: 'packages/other/package.json', recommendedVersion: '5.4.14' }),
        ], workDir)

        expect(member).toHaveLength(0)
        expect(sub.map((a) => a.packageName)).toEqual(['vite'])
    })

    it('normalizes windows separators for member manifest paths', () => {
        setupMemberWorkspace({ vite: '^5.4.0' })
        writeLockfileVersions('vite@5.4.0')

        const { member, sub } = partitionSubmanifestAlerts([
            alert({ packageName: 'vite', manifestPath: 'packages\\web\\package.json', recommendedVersion: '5.4.14' }),
        ], workDir)

        expect(member).toHaveLength(1)
        expect(member[0].manifestDir).toBe('packages/web')
        expect(sub).toHaveLength(0)
    })

    it('keeps member alert in sub when not fixable (no patched version)', () => {
        setupMemberWorkspace({ vite: '^5.4.0' })
        writeLockfileVersions('vite@5.4.0')

        const { member, sub } = partitionSubmanifestAlerts([
            alert({
                packageName: 'vite',
                manifestPath: 'packages/web/package.json',
                recommendedVersion: '5.4.14',
                fixable: false,
            }),
        ], workDir)

        expect(member).toHaveLength(0)
        expect(sub.map((a) => a.packageName)).toEqual(['vite'])
    })

    it('keeps member alert in sub when manifest basename is not package.json', () => {
        setupMemberWorkspace({ vite: '^5.4.0' })
        writeLockfileVersions('vite@5.4.0')

        const { member, sub } = partitionSubmanifestAlerts([
            alert({ packageName: 'vite', manifestPath: 'packages/web/whatever.json', recommendedVersion: '5.4.14' }),
        ], workDir)

        expect(member).toHaveLength(0)
        expect(sub).toHaveLength(1)
    })
})

