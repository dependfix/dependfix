import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import type { NormalizedSecurityAlert } from '@dependfix/core'

// Mock execSync to avoid needing pnpm in test environment.
// Must use vi.hoisted because vi.mock is hoisted above imports.
const { mockExecSync } = vi.hoisted(() => ({
    mockExecSync: vi.fn(),
}))

vi.mock('node:child_process', () => ({
    execSync: mockExecSync,
}))

import { classifyInstallFailure, formatInstallFailure } from './overrides-io'
import {
    applyVersionedOverrides,
    extractPrefix,
    parseMajorVersion,
    compareSemver,
    findDependencyVersion,
    readLockfileVersion,
    readLockfileVersions,
    ensurePnpmOverrides,
    isCrossMajorFixRequired,
    isNonSemverDeclaration,
} from './index'

// Tests: Pure functions
// ---------------------------------------------------------------------------

describe('extractPrefix', () => {
    it('returns empty string for exact semver', () => {
        expect(extractPrefix('4.17.20')).toBe('')
        expect(extractPrefix('1.2.3')).toBe('')
    })

    it('returns ^ for caret range', () => {
        expect(extractPrefix('^4.17.20')).toBe('^')
        expect(extractPrefix('^1.0.0')).toBe('^')
    })

    it('returns ~ for tilde range', () => {
        expect(extractPrefix('~4.17.0')).toBe('~')
        expect(extractPrefix('~2.3.4')).toBe('~')
    })

    it('defaults to ^ for complex ranges and wildcards', () => {
        expect(extractPrefix('*')).toBe('^')
        expect(extractPrefix('>=1.0.0 <2.0.0')).toBe('^')
        expect(extractPrefix('latest')).toBe('^')
    })

    it('returns empty for leading digit with spaces', () => {
        expect(extractPrefix('  4.17.20')).toBe('')
    })
})

describe('parseMajorVersion', () => {
    it('extracts major from caret version', () => {
        expect(parseMajorVersion('^4.17.20')).toBe(4)
    })

    it('extracts major from tilde version', () => {
        expect(parseMajorVersion('~2.0.0')).toBe(2)
    })

    it('extracts major from exact version', () => {
        expect(parseMajorVersion('3.0.0')).toBe(3)
    })

    it('extracts major from complex range', () => {
        expect(parseMajorVersion('>=1.0.0 <2.0.0')).toBe(1)
    })

    it('returns -1 for unparseable versions', () => {
        expect(parseMajorVersion('*')).toBe(-1)
        expect(parseMajorVersion('latest')).toBe(-1)
        expect(parseMajorVersion('file:../local-pkg')).toBe(-1)
    })

    it('handles version with leading spaces', () => {
        expect(parseMajorVersion('  ^5.1.0')).toBe(5)
    })

    describe('compareSemver', () => {
        it('returns positive when a > b', () => {
            expect(compareSemver('4.18.0', '4.17.21')).toBeGreaterThan(0)
            expect(compareSemver('5.0.0', '4.99.99')).toBeGreaterThan(0)
            expect(compareSemver('1.2.3', '1.2.2')).toBeGreaterThan(0)
        })

        it('returns negative when a < b', () => {
            expect(compareSemver('5.4.20', '6.4.3')).toBeLessThan(0)
            expect(compareSemver('1.2.2', '1.2.3')).toBeLessThan(0)
        })

        it('returns 0 when equal', () => {
            expect(compareSemver('1.2.3', '1.2.3')).toBe(0)
            expect(compareSemver('v1.2.3', '1.2.3')).toBe(0)
        })

        it('ignores pre-release suffix', () => {
            expect(compareSemver('1.0.0-beta', '1.0.0')).toBe(0)
        })

        it('treats unparseable versions as 0 segments (conservative)', () => {
            expect(compareSemver('latest', '0.0.0')).toBe(0)
            expect(compareSemver('latest', '1.0.0')).toBeLessThan(0)
        })
    })
})

describe('isNonSemverDeclaration', () => {
    it('returns false for semver ranges', () => {
        expect(isNonSemverDeclaration('^4.17.20')).toBe(false)
        expect(isNonSemverDeclaration('~1.2.0')).toBe(false)
        expect(isNonSemverDeclaration('1.2.3')).toBe(false)
        expect(isNonSemverDeclaration('*')).toBe(false)
        expect(isNonSemverDeclaration('>=1.0.0 <2.0.0')).toBe(false)
        expect(isNonSemverDeclaration('latest')).toBe(false)
    })

    it('returns true for package manager protocol declarations', () => {
        expect(isNonSemverDeclaration('workspace:*')).toBe(true)
        expect(isNonSemverDeclaration('workspace:^')).toBe(true)
        expect(isNonSemverDeclaration('catalog:')).toBe(true)
        expect(isNonSemverDeclaration('link:../pkg')).toBe(true)
        expect(isNonSemverDeclaration('file:../local-pkg')).toBe(true)
        expect(isNonSemverDeclaration('npm:lodash@1.0.0')).toBe(true)
        // git / URL 协议（来源从 fork/私有源静默切回 registry 的改写风险）
        expect(isNonSemverDeclaration('git+ssh://git@github.com/org/pkg.git#v1.0.0')).toBe(true)
        expect(isNonSemverDeclaration('git+https://github.com/org/pkg.git')).toBe(true)
        expect(isNonSemverDeclaration('git://github.com/org/pkg.git')).toBe(true)
        expect(isNonSemverDeclaration('https://example.com/pkg.tgz')).toBe(true)
        expect(isNonSemverDeclaration('http://example.com/pkg.tgz')).toBe(true)
        expect(isNonSemverDeclaration('ssh://git@example.com/pkg.git')).toBe(true)
        // 自托管平台与 git 变体
        expect(isNonSemverDeclaration('gitlab:user/repo#v1.0.0')).toBe(true)
        expect(isNonSemverDeclaration('bitbucket:user/repo#v1.0.0')).toBe(true)
        expect(isNonSemverDeclaration('gist:user/abc123#v1.0.0')).toBe(true)
        expect(isNonSemverDeclaration('git+http://example.com/pkg.git')).toBe(true)
        expect(isNonSemverDeclaration('git+file:///path/to/pkg.git')).toBe(true)
    })

    it('ignores surrounding whitespace', () => {
        expect(isNonSemverDeclaration('  catalog:')).toBe(true)
        expect(isNonSemverDeclaration('^4.17.20 ')).toBe(false)
    })
})

describe('findDependencyVersion', () => {
    it('finds package in dependencies', () => {
        const result = findDependencyVersion(
            { dependencies: { lodash: '^4.17.20' } },
            'lodash',
        )
        expect(result).toEqual({ group: 'dependencies', version: '^4.17.20' })
    })

    it('finds package in devDependencies', () => {
        const result = findDependencyVersion(
            { devDependencies: { typescript: '~5.0.0' } },
            'typescript',
        )
        expect(result).toEqual({ group: 'devDependencies', version: '~5.0.0' })
    })

    it('finds package in optionalDependencies', () => {
        const result = findDependencyVersion(
            { optionalDependencies: { fsevents: '2.3.0' } },
            'fsevents',
        )
        expect(result).toEqual({ group: 'optionalDependencies', version: '2.3.0' })
    })

    it('prioritizes dependencies over devDependencies', () => {
        const result = findDependencyVersion(
            {
                dependencies: { lodash: '^4.17.20' },
                devDependencies: { lodash: '^4.17.21' },
            },
            'lodash',
        )
        expect(result).toEqual({ group: 'dependencies', version: '^4.17.20' })
    })

    it('returns null when package not found', () => {
        expect(findDependencyVersion({}, 'lodash')).toBeNull()
        expect(findDependencyVersion({ dependencies: {} }, 'lodash')).toBeNull()
    })

    it('handles scoped package names', () => {
        const result = findDependencyVersion(
            { dependencies: { '@babel/traverse': '^7.23.0' } },
            '@babel/traverse',
        )
        expect(result).toEqual({ group: 'dependencies', version: '^7.23.0' })
    })
})

// ---------------------------------------------------------------------------
// Tests: upgradeDependency
// ---------------------------------------------------------------------------


describe('isCrossMajorFixRequired', () => {
    let workDir: string

    beforeEach(() => {
        workDir = mkdtempSync(join(tmpdir(), 'dependfix-crossmajor-'))
    })

    afterEach(() => {
        rmSync(workDir, { recursive: true, force: true })
    })

    function alertFor(overrides: Partial<NormalizedSecurityAlert> = {}): NormalizedSecurityAlert {
        return {
            id: 1,
            source: 'dependabot',
            repository: 'owner/repo',
            defaultBranch: 'main',
            severity: 'high',
            packageEcosystem: 'npm',
            packageName: 'vite',
            manifestPath: 'pnpm-lock.yaml',
            ruleId: 'GHSA-x',
            summary: 'x',
            htmlUrl: '',
            fixable: true,
            fixStrategy: 'upgrade',
            recommendedVersion: '6.4.3',
            ...overrides,
        }
    }

    it('returns true when recommended major has no instance in lockfile (5.x + 8.x instances, target 6.x)', () => {
        // PR #28 场景：lockfile 只有 vite@5.4.14 + vite@8.2.0，告警推荐 6.4.3 → 跨线
        const lockfilePath = join(workDir, 'pnpm-lock.yaml')
        writeFileSync(lockfilePath, [
            'lockfileVersion: \'9.0\'',
            '',
            '  vite@5.4.14:',
            '    resolution: {integrity: sha512-a}',
            '',
            '  vite@8.2.0:',
            '    resolution: {integrity: sha512-b}',
            '',
        ].join('\n'))

        expect(isCrossMajorFixRequired(lockfilePath, alertFor({ recommendedVersion: '6.4.3' }))).toBe(true)
    })

    it('returns false when recommended major exists in lockfile (5.x instance, target 5.4.21)', () => {
        const lockfilePath = join(workDir, 'pnpm-lock.yaml')
        writeFileSync(lockfilePath, [
            'lockfileVersion: \'9.0\'',
            '',
            '  vite@5.4.14:',
            '    resolution: {integrity: sha512-a}',
            '',
        ].join('\n'))

        expect(isCrossMajorFixRequired(lockfilePath, alertFor({ recommendedVersion: '5.4.21' }))).toBe(false)
    })

    it('returns false when lockfile has no instances (handled by partition sub logic)', () => {
        const lockfilePath = join(workDir, 'pnpm-lock.yaml')
        writeFileSync(lockfilePath, 'lockfileVersion: \'9.0\'\n')

        expect(isCrossMajorFixRequired(lockfilePath, alertFor({ recommendedVersion: '6.4.3' }))).toBe(false)
    })

    it('returns false when recommendedVersion is missing or unparseable', () => {
        const lockfilePath = join(workDir, 'pnpm-lock.yaml')
        writeFileSync(lockfilePath, [
            'lockfileVersion: \'9.0\'',
            '',
            '  vite@5.4.14:',
            '    resolution: {integrity: sha512-a}',
            '',
        ].join('\n'))

        expect(isCrossMajorFixRequired(lockfilePath, alertFor({ recommendedVersion: '' }))).toBe(false)
        expect(isCrossMajorFixRequired(lockfilePath, alertFor({ recommendedVersion: 'not-a-version' }))).toBe(false)
    })
})

// ===========================================================================
// readLockfileVersion
// ===========================================================================

describe('readLockfileVersion', () => {
    it('returns version from pnpm-lock.yaml v9 format', () => {
        const dir = mkdtempSync(join(tmpdir(), 'dependfix-test-'))
        const lockfilePath = join(dir, 'pnpm-lock.yaml')
        writeFileSync(lockfilePath, [
            'lockfileVersion: \'9.0\'',
            '',
            '/fast-uri/5.0.0:',
            '  resolution: {integrity: sha512-xxx}',
            '',
        ].join('\n'))

        const version = readLockfileVersion(lockfilePath, 'fast-uri')
        expect(version).toBe('5.0.0')

        rmSync(dir, { recursive: true })
    })

    it('returns null when package not found in lockfile', () => {
        const dir = mkdtempSync(join(tmpdir(), 'dependfix-test-'))
        const lockfilePath = join(dir, 'pnpm-lock.yaml')
        writeFileSync(lockfilePath, 'lockfileVersion: \'9.0\'\n')

        const version = readLockfileVersion(lockfilePath, 'nonexistent-pkg')
        expect(version).toBeNull()

        rmSync(dir, { recursive: true })
    })

    it('handles scoped packages (@scope/name)', () => {
        const dir = mkdtempSync(join(tmpdir(), 'dependfix-test-'))
        const lockfilePath = join(dir, 'pnpm-lock.yaml')
        writeFileSync(lockfilePath, [
            'lockfileVersion: \'9.0\'',
            '',
            '/@babel/traverse/7.26.0:',
            '  resolution: {integrity: sha512-xxx}',
            '',
        ].join('\n'))

        const version = readLockfileVersion(lockfilePath, '@babel/traverse')
        expect(version).toBe('7.26.0')

        rmSync(dir, { recursive: true })
    })

    it('reads pnpm v10+/v11 snapshot format (pkg@version:)', () => {
        const dir = mkdtempSync(join(tmpdir(), 'dependfix-test-'))
        const lockfilePath = join(dir, 'pnpm-lock.yaml')
        writeFileSync(lockfilePath, [
            'lockfileVersion: \'9.0\'',
            '',
            '  lodash@4.18.0:',
            '    resolution: {integrity: sha512-xxx}',
            '',
            '  fast-uri@3.1.5:',
            '    resolution: {integrity: sha512-yyy}',
            '',
        ].join('\n'))

        expect(readLockfileVersion(lockfilePath, 'lodash')).toBe('4.18.0')
        expect(readLockfileVersion(lockfilePath, 'fast-uri')).toBe('3.1.5')

        rmSync(dir, { recursive: true })
    })

    it('reads snapshot entries with peer dependency suffixes (pkg@version(peer...))', () => {
        const dir = mkdtempSync(join(tmpdir(), 'dependfix-test-'))
        const lockfilePath = join(dir, 'pnpm-lock.yaml')
        writeFileSync(lockfilePath, [
            'lockfileVersion: \'9.0\'',
            '',
            '  vite@8.2.0(@types/node@26.1.2)(esbuild@0.25.12):',
            '    resolution: {integrity: sha512-xxx}',
            '',
        ].join('\n'))

        const version = readLockfileVersion(lockfilePath, 'vite')
        expect(version).toBe('8.2.0')

        rmSync(dir, { recursive: true })
    })

    it('does not mis-match importers specifiers or overrides entries (regression)', () => {
        const dir = mkdtempSync(join(tmpdir(), 'dependfix-test-'))
        const lockfilePath = join(dir, 'pnpm-lock.yaml')
        writeFileSync(lockfilePath, [
            'lockfileVersion: \'9.0\'',
            '',
            'importers:',
            '  .:',
            '    devDependencies:',
            '      \'@octokit/request\':',
            '        specifier: ^9.2.1',
            '        version: 9.2.1',
            '',
            'overrides:',
            '  compare-func: ^2.0.0',
            '',
            'packages:',
            '',
            'snapshots:',
            '',
            '  \'@octokit/request@9.2.1\':',
            '    resolution: {integrity: sha512-xxx}',
            '',
        ].join('\n'))

        // importers specifier（'@octokit/request': ^9.2.1 行首无版本键）与
        // overrides 条目（compare-func: ^2.0.0）都不应被误判为 snapshot 版本
        expect(readLockfileVersion(lockfilePath, '@octokit/request')).toBe('9.2.1')
        expect(readLockfileVersion(lockfilePath, 'compare-func')).toBeNull()

        rmSync(dir, { recursive: true })
    })

    it('reads scoped packages in snapshot format (quoted key)', () => {
        const dir = mkdtempSync(join(tmpdir(), 'dependfix-test-'))
        const lockfilePath = join(dir, 'pnpm-lock.yaml')
        writeFileSync(lockfilePath, [
            'lockfileVersion: \'9.0\'',
            '',
            '  \'@types/node@26.1.2\':',
            '    resolution: {integrity: sha512-xxx}',
            '',
            '  \'@types/node@12.7.1\':',
            '    resolution: {integrity: sha512-old}',
            '',
        ].join('\n'))

        // scoped 包 snapshot 键带单引号；多版本并存取最高
        expect(readLockfileVersion(lockfilePath, '@types/node')).toBe('26.1.2')

        rmSync(dir, { recursive: true })
    })

    it('returns highest version when multiple snapshot entries exist (no-downgrade protection)', () => {
        const dir = mkdtempSync(join(tmpdir(), 'dependfix-test-'))
        const lockfilePath = join(dir, 'pnpm-lock.yaml')
        writeFileSync(lockfilePath, [
            'lockfileVersion: \'9.0\'',
            '',
            '  vite@5.4.14:',
            '    resolution: {integrity: sha512-old}',
            '',
            '  vite@5.4.14(@types/node@26.1.2)(lightningcss@1.33.0):',
            '    resolution: {integrity: sha512-old-peer}',
            '',
            '  vite@8.2.0:',
            '    resolution: {integrity: sha512-new}',
            '',
            '  vite@8.2.0(@types/node@26.1.2)(esbuild@0.25.12):',
            '    resolution: {integrity: sha512-new-peer}',
            '',
        ].join('\n'))

        // 多版本并存（docs 的 vite@5.4.14 与根 vite@8.2.0）：取最高，防降级
        const version = readLockfileVersion(lockfilePath, 'vite')
        expect(version).toBe('8.2.0')

        rmSync(dir, { recursive: true })
    })
})

// ===========================================================================
// readLockfileVersions（多版本共存，版本化 overrides 前置）
// ===========================================================================

describe('readLockfileVersions', () => {
    it('returns all versions for multi-version coexistence (vite@5.4.14 + vite@8.2.0)', () => {
        const dir = mkdtempSync(join(tmpdir(), 'dependfix-test-'))
        const lockfilePath = join(dir, 'pnpm-lock.yaml')
        writeFileSync(lockfilePath, [
            'lockfileVersion: \'9.0\'',
            '',
            '  vite@5.4.14:',
            '    resolution: {integrity: sha512-old}',
            '',
            '  vite@8.2.0:',
            '    resolution: {integrity: sha512-new}',
            '',
            '  vite@8.2.0(@types/node@26.1.2)(esbuild@0.25.12):',
            '    resolution: {integrity: sha512-new-peer}',
            '',
        ].join('\n'))

        const versions = readLockfileVersions(lockfilePath, 'vite')
        // 去重 + 排序（peer 后缀条目不重复计数）
        expect(versions).toEqual(['5.4.14', '8.2.0'])

        rmSync(dir, { recursive: true })
    })

    it('returns single version when no coexistence', () => {
        const dir = mkdtempSync(join(tmpdir(), 'dependfix-test-'))
        const lockfilePath = join(dir, 'pnpm-lock.yaml')
        writeFileSync(lockfilePath, [
            'lockfileVersion: \'9.0\'',
            '',
            '  fast-uri@3.1.5:',
            '    resolution: {integrity: sha512-yyy}',
            '',
        ].join('\n'))

        expect(readLockfileVersions(lockfilePath, 'fast-uri')).toEqual(['3.1.5'])

        rmSync(dir, { recursive: true })
    })

    it('returns empty array when package missing or lockfile absent', () => {
        const dir = mkdtempSync(join(tmpdir(), 'dependfix-test-'))
        const lockfilePath = join(dir, 'pnpm-lock.yaml')
        expect(readLockfileVersions(lockfilePath, 'missing-pkg')).toEqual([])
        expect(readLockfileVersions(join(dir, 'no-lockfile.yaml'), 'fast-uri')).toEqual([])

        rmSync(dir, { recursive: true })
    })

    it('deduplicates peer-suffixed and plain entries', () => {
        const dir = mkdtempSync(join(tmpdir(), 'dependfix-test-'))
        const lockfilePath = join(dir, 'pnpm-lock.yaml')
        writeFileSync(lockfilePath, [
            'lockfileVersion: \'9.0\'',
            '',
            '  lodash@4.18.0:',
            '    resolution: {integrity: sha512-xxx}',
            '',
            '  lodash@4.18.0(peer@1.0.0):',
            '    resolution: {integrity: sha512-peer}',
            '',
        ].join('\n'))

        expect(readLockfileVersions(lockfilePath, 'lodash')).toEqual(['4.18.0'])

        rmSync(dir, { recursive: true })
    })
})

// ===========================================================================
// applyVersionedOverrides（版本化 overrides 批量写入）
// ===========================================================================

describe('applyVersionedOverrides', () => {
    let dir: string
    let pkgPath: string
    let lockfilePath: string

    beforeEach(() => {
        dir = mkdtempSync(join(tmpdir(), 'dependfix-test-'))
        pkgPath = join(dir, 'package.json')
        lockfilePath = join(dir, 'pnpm-lock.yaml')
        writeFileSync(pkgPath, JSON.stringify({ name: 'test-project', version: '1.0.0' }, null, 2))
        writeFileSync(lockfilePath, 'lockfileVersion: \'9.0\'\n')
        mockExecSync.mockReset()
    })

    it('writes versioned overrides to pnpm.overrides and runs pnpm install', async () => {
        mockExecSync.mockReturnValue('Done')

        const result = await applyVersionedOverrides({
            packageName: 'vite',
            versionedOverrides: { 'vite@5.4.14': '^5.4.21' },
            workDir: dir,
        })

        expect(result.success).toBe(true)
        expect(result.packageName).toBe('vite')
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
        expect((pkg.pnpm as Record<string, unknown>).overrides).toEqual({ 'vite@5.4.14': '^5.4.21' })
        expect(mockExecSync).toHaveBeenCalledWith(
            expect.stringContaining('pnpm install --no-frozen-lockfile'),
            expect.objectContaining({ cwd: dir }),
        )
    })

    it('writes versioned overrides to pnpm-workspace.yaml when present', async () => {
        mockExecSync.mockReturnValue('Done')
        const workspaceYamlPath = join(dir, 'pnpm-workspace.yaml')
        writeFileSync(workspaceYamlPath, 'packages:\n  - "packages/*"\n')

        const result = await applyVersionedOverrides({
            packageName: 'vite',
            versionedOverrides: {
                'vite@5.4.14': '^5.4.21',
                'vite@8.2.0': '^8.2.0',
            },
            workDir: dir,
        })

        expect(result.success).toBe(true)
        const yamlContent = readFileSync(workspaceYamlPath, 'utf-8')
        expect(yamlContent).toContain('vite@5.4.14: ^5.4.21')
        expect(yamlContent).toContain('vite@8.2.0: ^8.2.0')
        // 原有 packages 保留
        expect(yamlContent).toContain('packages/*')
    })

    it('rolls back versioned overrides and lockfile when pnpm install fails', async () => {
        mockExecSync.mockImplementation(() => {
            throw new Error('ERESOLVE')
        })
        const lockContent = 'lockfileVersion: \'9.0\'\n'
        writeFileSync(lockfilePath, lockContent)

        const result = await applyVersionedOverrides({
            packageName: 'vite',
            versionedOverrides: { 'vite@5.4.14': '^5.4.21' },
            workDir: dir,
        })

        expect(result.success).toBe(false)
        expect(result.error).toContain('ERESOLVE')
        // package.json 回滚（overrides 未残留）
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
        expect((pkg.pnpm as Record<string, unknown> | undefined)?.overrides).toBeUndefined()
        // lockfile 回滚
        expect(readFileSync(lockfilePath, 'utf-8')).toBe(lockContent)
    })

    it('merges with existing overrides and restores them on failure', async () => {
        writeFileSync(pkgPath, JSON.stringify({
            name: 'test-project',
            version: '1.0.0',
            pnpm: { overrides: { 'existing-pkg': '^1.0.0' } },
        }, null, 2))
        mockExecSync.mockImplementation(() => {
            throw new Error('install boom')
        })

        const result = await applyVersionedOverrides({
            packageName: 'vite',
            versionedOverrides: { 'vite@5.4.14': '^5.4.21' },
            workDir: dir,
        })

        expect(result.success).toBe(false)
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
        const overrides = (pkg.pnpm as Record<string, unknown>).overrides as Record<string, string>
        expect(overrides['vite@5.4.14']).toBeUndefined()
        expect(overrides['existing-pkg']).toBe('^1.0.0')
    })

    it('returns failure when no overrides provided', async () => {
        const result = await applyVersionedOverrides({
            packageName: 'vite',
            versionedOverrides: {},
            workDir: dir,
        })

        expect(result.success).toBe(false)
        expect(result.error).toContain('no versioned overrides')
    })
})

// ===========================================================================
// ensurePnpmOverrides
// ===========================================================================

describe('ensurePnpmOverrides', () => {
    it('creates pnpm.overrides when pnpm field is missing', () => {
        const pkg: Record<string, unknown> = { name: 'test' }
        const overrides = ensurePnpmOverrides(pkg as Record<string, unknown> & { pnpm?: { overrides?: Record<string, string> } })
        expect(overrides).toEqual({})
        expect(pkg.pnpm).toEqual({ overrides: {} })
    })

    it('creates overrides when pnpm field exists without overrides', () => {
        const pkg: Record<string, unknown> = { name: 'test', pnpm: { hoist: true } }
        const overrides = ensurePnpmOverrides(pkg as Record<string, unknown> & { pnpm?: { overrides?: Record<string, string> } })
        expect(overrides).toEqual({})
        expect((pkg.pnpm as Record<string, unknown>).overrides).toEqual({})
        expect((pkg.pnpm as Record<string, unknown>).hoist).toBe(true)
    })

    it('returns existing overrides without modification', () => {
        const existing = { 'some-pkg': '^2.0.0' }
        const pkg: Record<string, unknown> = { name: 'test', pnpm: { overrides: existing } }
        const overrides = ensurePnpmOverrides(pkg as Record<string, unknown> & { pnpm?: { overrides?: Record<string, string> } })
        expect(overrides).toBe(existing)
    })
})

// ===========================================================================
// formatInstallFailure / classifyInstallFailure
// ===========================================================================

describe('formatInstallFailure', () => {
    it('adds readable hint for ERR_PNPM_NO_MATURE_MATCHING_VERSION (resolution)', () => {
        const stderr = '[ERR_PNPM_NO_MATURE_MATCHING_VERSION] is-odd@3.0.1 does not meet the minimumReleaseAge constraint'
        const result = formatInstallFailure(stderr)
        expect(result).toContain('pnpm install failed')
        expect(result).toContain('minimumReleaseAge policy')
        expect(result).toContain(stderr)
    })

    it('adds readable hint for ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION (frozen verification)', () => {
        const stderr = '[ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION] lockfile entries failed verification'
        const result = formatInstallFailure(stderr)
        expect(result).toContain('minimumReleaseAge policy')
    })

    it('adds readable hint when stderr mentions minimumReleaseAge without error code', () => {
        const stderr = 'minimumReleaseAge constraint not satisfied'
        expect(formatInstallFailure(stderr)).toContain('minimumReleaseAge policy')
    })

    it('keeps plain message for unrecognized failures', () => {
        const stderr = 'ERR_PNPM_OUTDATED_LOCKFILE: lockfile needs update'
        expect(formatInstallFailure(stderr)).toBe(`pnpm install failed: ${stderr}`)
        expect(classifyInstallFailure(stderr)).toBeNull()
    })
})
