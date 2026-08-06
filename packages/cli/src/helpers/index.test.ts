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

vi.mock('../runners/verification-runner', () => ({
    runVerification: mockRunVerification,
}))

// ---------------------------------------------------------------------------
// dedupeFixableAlerts（G3 同包收敛）
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
})

// ---------------------------------------------------------------------------
// partitionSubmanifestAlerts（P0：子目录/根直接依赖告警剔除修复链路）
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
    // C10：根直接依赖 + 单版本 → 推荐版本 >= 锁定版本时不再跳过（override 不降级）
    // -----------------------------------------------------------------------

    it('C10: keeps single-version root direct dependency when recommended >= locked (no downgrade)', () => {
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

    it('C10: keeps single-version root direct dependency in sub when recommended < locked (downgrade risk)', () => {
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

    it('C10: keeps root direct dependency in sub when lockfile has no version info (conservative)', () => {
        // 无 lockfile（versions 为空）→ 无法判断降级风险 → sub
        const { root, sub } = partitionSubmanifestAlerts([
            alert({ packageName: 'vite', manifestPath: 'pnpm-lock.yaml', recommendedVersion: '6.4.3' }),
        ], workDir)
        expect(sub).toHaveLength(1)
        expect(root).toHaveLength(0)
    })

    // -----------------------------------------------------------------------
    // C11：workspace 成员包直接依赖识别（monorepo 盲区）
    // -----------------------------------------------------------------------

    it('C11: recognizes workspace member direct dependencies (single version + downgrade risk → sub)', () => {
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

    it('C11: workspace member direct dependency with recommended >= locked is fixable (root)', () => {
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

    it('C11: recursive workspace glob (**) and literal paths are supported', () => {
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
})

