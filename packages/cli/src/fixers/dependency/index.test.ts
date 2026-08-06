import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
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

import {
    upgradeDependency,
    overrideTransitiveDependency,
    applyVersionedOverrides,
    extractPrefix,
    parseMajorVersion,
    compareSemver,
    findDependencyVersion,
    readLockfileVersion,
    readLockfileVersions,
    ensurePnpmOverrides,
    isCrossMajorFixRequired,
    type DependencyFixResult,
} from './index'

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

interface TempProject {
    dir: string
    pkgPath: string
    lockfilePath: string
}

function createTempProject(
    deps: Record<string, string>,
    options?: {
        devDeps?: Record<string, string>
        optionalDeps?: Record<string, string>
        withLockfile?: boolean
    },
): TempProject {
    const dir = mkdtempSync(join(tmpdir(), 'dependfix-test-'))
    const pkg: Record<string, unknown> = { name: 'test-project', version: '1.0.0' }
    if (Object.keys(deps).length > 0) {
        pkg.dependencies = deps
    }
    if (options?.devDeps && Object.keys(options.devDeps).length > 0) {
        pkg.devDependencies = options.devDeps
    }
    if (options?.optionalDeps && Object.keys(options.optionalDeps).length > 0) {
        pkg.optionalDependencies = options.optionalDeps
    }
    const pkgPath = join(dir, 'package.json')
    const lockfilePath = join(dir, 'pnpm-lock.yaml')
    writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`)
    if (options?.withLockfile !== false) {
        writeFileSync(lockfilePath, '# mock lockfile\n')
    }
    return { dir, pkgPath, lockfilePath }
}

function readPackageVersion(project: TempProject, pkgName: string): string | undefined {
    const pkg = JSON.parse(readFileSync(project.pkgPath, 'utf-8')) as Record<string, unknown>
    const deps = pkg.dependencies as Record<string, string> | undefined
    return deps?.[pkgName]
}

function cleanup(project: TempProject): void {
    try {
        rmSync(project.dir, { recursive: true, force: true })
    } catch {
        /* ignore */
    }
}

// ---------------------------------------------------------------------------
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

describe('upgradeDependency', () => {
    beforeEach(() => {
        mockExecSync.mockReset()
        mockExecSync.mockReturnValue(Buffer.from(''))
    })

    it('upgrades a package and preserves caret prefix', async () => {
        const project = createTempProject({ lodash: '^4.17.20' })

        const result = await upgradeDependency({
            packageName: 'lodash',
            targetVersion: '4.17.21',
            workDir: project.dir,
        })

        expect(result).toEqual<DependencyFixResult>({
            packageName: 'lodash',
            fromVersion: '^4.17.20',
            toVersion: '^4.17.21',
            isMajor: false,
            success: true,
        })
        expect(mockExecSync).toHaveBeenCalledWith(
            'pnpm install --no-frozen-lockfile',
            expect.objectContaining({ cwd: project.dir }),
        )
        expect(readPackageVersion(project, 'lodash')).toBe('^4.17.21')

        cleanup(project)
    })

    it('upgrades a package with tilde prefix', async () => {
        const project = createTempProject({ express: '~4.18.0' })

        const result = await upgradeDependency({
            packageName: 'express',
            targetVersion: '4.19.1',
            workDir: project.dir,
        })

        expect(result.success).toBe(true)
        expect(result.fromVersion).toBe('~4.18.0')
        expect(result.toVersion).toBe('~4.19.1')
        expect(readPackageVersion(project, 'express')).toBe('~4.19.1')

        cleanup(project)
    })

    it('preserves exact version format', async () => {
        const project = createTempProject({ typescript: '5.0.0' })

        const result = await upgradeDependency({
            packageName: 'typescript',
            targetVersion: '5.4.5',
            workDir: project.dir,
        })

        expect(result.success).toBe(true)
        expect(result.fromVersion).toBe('5.0.0')
        expect(result.toVersion).toBe('5.4.5')
        expect(readPackageVersion(project, 'typescript')).toBe('5.4.5')

        cleanup(project)
    })

    it('detects major upgrade from ^4.x to ^5.0.0', async () => {
        const project = createTempProject({ lodash: '^4.17.20' })

        const result = await upgradeDependency({
            packageName: 'lodash',
            targetVersion: '5.0.0',
            workDir: project.dir,
        })

        expect(result.success).toBe(true)
        expect(result.isMajor).toBe(true)
        expect(result.toVersion).toBe('^5.0.0')

        cleanup(project)
    })

    it('detects minor/patch upgrade (not major)', async () => {
        const project = createTempProject({ axios: '~1.5.0' })

        const result = await upgradeDependency({
            packageName: 'axios',
            targetVersion: '1.6.0',
            workDir: project.dir,
        })

        expect(result.success).toBe(true)
        expect(result.isMajor).toBe(false)

        cleanup(project)
    })

    it('finds package in devDependencies', async () => {
        const project = createTempProject({}, { devDeps: { typescript: '~5.0.0' } })

        const result = await upgradeDependency({
            packageName: 'typescript',
            targetVersion: '5.4.5',
            workDir: project.dir,
        })

        expect(result.success).toBe(true)
        expect(result.fromVersion).toBe('~5.0.0')
        expect(result.toVersion).toBe('~5.4.5')

        cleanup(project)
    })

    it('finds package in optionalDependencies', async () => {
        const project = createTempProject({}, { optionalDeps: { fsevents: '2.3.0' } })

        const result = await upgradeDependency({
            packageName: 'fsevents',
            targetVersion: '2.3.3',
            workDir: project.dir,
        })

        expect(result.success).toBe(true)
        expect(result.toVersion).toBe('2.3.3')

        cleanup(project)
    })

    it('returns failure when package not in any dep group', async () => {
        const project = createTempProject({ lodash: '^4.17.20' })

        const result = await upgradeDependency({
            packageName: 'nonexistent-pkg',
            targetVersion: '1.0.0',
            workDir: project.dir,
        })

        expect(result.success).toBe(false)
        expect(result.error).toContain('not found')
        expect(mockExecSync).not.toHaveBeenCalled()

        cleanup(project)
    })

    it('returns failure when package.json does not exist', async () => {
        const result = await upgradeDependency({
            packageName: 'lodash',
            targetVersion: '4.17.21',
            workDir: '/tmp/nonexistent-dir-12345',
        })

        expect(result.success).toBe(false)
        expect(result.error).toContain('file not found')
    })

    it('rolls back package.json on pnpm install failure', async () => {
        const project = createTempProject({ lodash: '^4.17.20' })
        const originalContent = readFileSync(project.pkgPath, 'utf-8')

        mockExecSync.mockImplementation(() => {
            throw Object.assign(new Error('Install failed'), {
                stderr: 'ERR_PNPM_LOCKFILE_BREAKING_CHANGE',
            })
        })

        const result = await upgradeDependency({
            packageName: 'lodash',
            targetVersion: '4.17.21',
            workDir: project.dir,
        })

        expect(result.success).toBe(false)
        expect(result.error).toContain('pnpm install failed')
        expect(result.error).toContain('ERR_PNPM_LOCKFILE_BREAKING_CHANGE')

        // Verify rollback: package.json restored
        const restored = readFileSync(project.pkgPath, 'utf-8')
        expect(restored).toBe(originalContent)

        cleanup(project)
    })

    it('rolls back lockfile on pnpm install failure', async () => {
        const project = createTempProject({ lodash: '^4.17.20' })
        const originalLockfile = readFileSync(project.lockfilePath, 'utf-8')

        mockExecSync.mockImplementation(() => {
            throw new Error('Lockfile error')
        })

        await upgradeDependency({
            packageName: 'lodash',
            targetVersion: '4.18.0',
            workDir: project.dir,
        })

        const restored = readFileSync(project.lockfilePath, 'utf-8')
        expect(restored).toBe(originalLockfile)

        cleanup(project)
    })

    it('handles scoped package names correctly', async () => {
        const project = createTempProject({ '@babel/traverse': '^7.23.0' })

        const result = await upgradeDependency({
            packageName: '@babel/traverse',
            targetVersion: '7.23.2',
            workDir: project.dir,
        })

        expect(result.success).toBe(true)
        expect(result.packageName).toBe('@babel/traverse')
        expect(result.fromVersion).toBe('^7.23.0')
        expect(result.toVersion).toBe('^7.23.2')

        cleanup(project)
    })

    it('works without lockfile present', async () => {
        const project = createTempProject({ lodash: '^4.17.20' }, { withLockfile: false })

        const result = await upgradeDependency({
            packageName: 'lodash',
            targetVersion: '4.17.21',
            workDir: project.dir,
        })

        expect(result.success).toBe(true)
        expect(readPackageVersion(project, 'lodash')).toBe('^4.17.21')

        cleanup(project)
    })

    it('returns failure for invalid JSON in package.json', async () => {
        const project = createTempProject({ lodash: '^4.17.20' })
        writeFileSync(project.pkgPath, 'not valid json')

        const result = await upgradeDependency({
            packageName: 'lodash',
            targetVersion: '4.17.21',
            workDir: project.dir,
        })

        expect(result.success).toBe(false)
        expect(result.error).toContain('invalid JSON')

        cleanup(project)
    })
})

// ===========================================================================
// overrideTransitiveDependency
// ===========================================================================

describe('overrideTransitiveDependency', () => {
    beforeEach(() => {
        mockExecSync.mockReset()
        // 默认 mock：pnpm install 成功
        mockExecSync.mockReturnValue(undefined)
    })

    it('adds package to pnpm.overrides and runs pnpm install', async () => {
        const project = createTempProject({ lodash: '^4.17.20' })
        // Write a minimal lockfile so readLockfileVersion can find the current version
        writeFileSync(project.lockfilePath, [
            'lockfileVersion: \'9.0\'',
            '',
            '/fast-uri/5.0.0:',
            '  resolution: {integrity: sha512-xxx}',
            '',
        ].join('\n'))

        const result = await overrideTransitiveDependency({
            packageName: 'fast-uri',
            targetVersion: '5.0.1',
            workDir: project.dir,
        })

        expect(result.success).toBe(true)
        expect(result.packageName).toBe('fast-uri')
        expect(result.fromVersion).toBe('5.0.0')
        expect(result.toVersion).toBe('5.0.1')

        // Verify overrides were written
        const pkg = JSON.parse(readFileSync(project.pkgPath, 'utf-8')) as Record<string, unknown>
        expect(pkg.pnpm).toBeDefined()
        expect((pkg.pnpm as Record<string, unknown>).overrides).toEqual({ 'fast-uri': '5.0.1' })

        cleanup(project)
    })

    it('pins exact version with pnpm v11 snapshot lockfile (P1: fromVersion no longer unknown → ^x fallback)', async () => {
        const project = createTempProject({ lodash: '^4.17.20' })
        writeFileSync(project.lockfilePath, [
            'lockfileVersion: \'9.0\'',
            '',
            '  fast-uri@3.1.5:',
            '    resolution: {integrity: sha512-xxx}',
            '',
        ].join('\n'))

        const result = await overrideTransitiveDependency({
            packageName: 'fast-uri',
            targetVersion: '3.1.6',
            workDir: project.dir,
        })

        expect(result.success).toBe(true)
        expect(result.fromVersion).toBe('3.1.5')
        // 精确 pin（修复前 fromVersion='unknown' → extractPrefix 回退 '^' → '^3.1.6'）
        expect(result.toVersion).toBe('3.1.6')

        const pkg = JSON.parse(readFileSync(project.pkgPath, 'utf-8')) as Record<string, unknown>
        expect((pkg.pnpm as Record<string, unknown>).overrides).toEqual({ 'fast-uri': '3.1.6' })

        cleanup(project)
    })

    it('returns failure for direct dependencies (should use upgradeDependency)', async () => {
        const project = createTempProject({ lodash: '^4.17.20' })

        const result = await overrideTransitiveDependency({
            packageName: 'lodash',
            targetVersion: '4.17.21',
            workDir: project.dir,
        })

        expect(result.success).toBe(false)
        expect(result.error).toContain('direct dependency')

        cleanup(project)
    })

    it('rolls back package.json on pnpm install failure', async () => {
        mockExecSync.mockImplementation(() => {
            throw Object.assign(new Error('install failed'), { stderr: 'ERR_PNPM_LOCKFILE_MISMATCH' })
        })

        const project = createTempProject({ lodash: '^4.17.20' })
        const originalContent = readFileSync(project.pkgPath, 'utf-8')

        writeFileSync(project.lockfilePath, [
            'lockfileVersion: \'9.0\'',
            '',
            '/fast-uri/5.0.0:',
            '  resolution: {integrity: sha512-xxx}',
            '',
        ].join('\n'))

        const result = await overrideTransitiveDependency({
            packageName: 'fast-uri',
            targetVersion: '5.0.1',
            workDir: project.dir,
        })

        expect(result.success).toBe(false)
        expect(result.error).toContain('pnpm install failed')

        // package.json should be restored
        const restoredContent = readFileSync(project.pkgPath, 'utf-8')
        expect(restoredContent).toBe(originalContent)

        cleanup(project)
    })

    it('rolls back only the newly added override when existing overrides remain', async () => {
        mockExecSync.mockImplementation(() => {
            throw Object.assign(new Error('install failed'), { stderr: 'ERR_PNPM_LOCKFILE_MISMATCH' })
        })

        const project = createTempProject({ lodash: '^4.17.20' }) // Pre-populate with an existing override that must survive the rollback
        const pkgWithOverrides = JSON.parse(readFileSync(project.pkgPath, 'utf-8')) as Record<string, unknown>
        pkgWithOverrides.pnpm = { overrides: { 'existing-pkg': '^1.0.0' } }
        writeFileSync(project.pkgPath, `${JSON.stringify(pkgWithOverrides, null, 2)}\n`)

        writeFileSync(project.lockfilePath, [
            'lockfileVersion: \'9.0\'',
            '',
            '/fast-uri/5.0.0:',
            '  resolution: {integrity: sha512-xxx}',
            '',
        ].join('\n'))

        const result = await overrideTransitiveDependency({
            packageName: 'fast-uri',
            targetVersion: '5.0.1',
            workDir: project.dir,
        })

        expect(result.success).toBe(false)

        // The newly added override must be removed, existing ones kept, pnpm field retained
        const pkg = JSON.parse(readFileSync(project.pkgPath, 'utf-8')) as Record<string, unknown>
        const overrides = (pkg.pnpm as Record<string, unknown>).overrides as Record<string, string>
        expect(overrides['fast-uri']).toBeUndefined()
        expect(overrides['existing-pkg']).toBe('^1.0.0')

        cleanup(project)
    })

    it('rolls back only the newly added workspace override when existing overrides remain', async () => {
        mockExecSync.mockImplementation(() => {
            throw Object.assign(new Error('install failed'), { stderr: 'ERR' })
        })

        const project = createTempProject({ lodash: '^4.17.20' })
        const workspaceYamlPath = join(project.dir, 'pnpm-workspace.yaml')
        const originalYaml = [
            'packages:',
            '  - \'.\'',
            'overrides:',
            '  existing-pkg: ^1.0.0',
            '',
        ].join('\n')
        writeFileSync(workspaceYamlPath, originalYaml)

        writeFileSync(project.lockfilePath, [
            'lockfileVersion: \'9.0\'',
            '',
            '/fast-uri/5.0.0:',
            '  resolution: {integrity: sha512-xxx}',
            '',
        ].join('\n'))

        await overrideTransitiveDependency({
            packageName: 'fast-uri',
            targetVersion: '5.0.1',
            workDir: project.dir,
        })

        // The newly added override must be removed, existing ones kept, overrides block retained
        const yamlContent = readFileSync(workspaceYamlPath, 'utf-8')
        expect(yamlContent).toContain('existing-pkg')
        expect(yamlContent).toContain('^1.0.0')
        expect(yamlContent).not.toContain('fast-uri')

        cleanup(project)
    })

    it('preserves existing overrides alongside new ones', async () => {
        const project = createTempProject({ lodash: '^4.17.20' })
        // Pre-populate with existing overrides
        const pkgWithOverrides = JSON.parse(readFileSync(project.pkgPath, 'utf-8')) as Record<string, unknown>
        pkgWithOverrides.pnpm = { overrides: { 'existing-pkg': '^1.0.0' } }
        writeFileSync(project.pkgPath, `${JSON.stringify(pkgWithOverrides, null, 2)}\n`)

        writeFileSync(project.lockfilePath, [
            'lockfileVersion: \'9.0\'',
            '',
            '/fast-uri/5.0.0:',
            '  resolution: {integrity: sha512-xxx}',
            '',
        ].join('\n'))

        await overrideTransitiveDependency({
            packageName: 'fast-uri',
            targetVersion: '5.0.1',
            workDir: project.dir,
        })

        const pkg = JSON.parse(readFileSync(project.pkgPath, 'utf-8')) as Record<string, unknown>
        const overrides = (pkg.pnpm as Record<string, unknown>).overrides as Record<string, string>
        expect(overrides['existing-pkg']).toBe('^1.0.0')
        expect(overrides['fast-uri']).toBe('5.0.1')

        cleanup(project)
    })

    it('writes to pnpm-workspace.yaml when it exists', async () => {
        const project = createTempProject({ lodash: '^4.17.20' })
        writeFileSync(join(project.dir, 'pnpm-workspace.yaml'), 'packages:\n  - \'.\'\n')

        writeFileSync(project.lockfilePath, [
            'lockfileVersion: \'9.0\'',
            '',
            '/fast-uri/5.0.0:',
            '  resolution: {integrity: sha512-xxx}',
            '',
        ].join('\n'))

        const result = await overrideTransitiveDependency({
            packageName: 'fast-uri',
            targetVersion: '5.0.1',
            workDir: project.dir,
        })

        expect(result.success).toBe(true)
        expect(result.fromVersion).toBe('5.0.0')

        const yamlContent = readFileSync(join(project.dir, 'pnpm-workspace.yaml'), 'utf-8')
        expect(yamlContent).toContain('fast-uri')
        expect(yamlContent).toContain('5.0.1')

        // package.json should NOT have pnpm.overrides
        const pkg = JSON.parse(readFileSync(project.pkgPath, 'utf-8')) as Record<string, unknown>
        expect(pkg.pnpm).toBeUndefined()

        cleanup(project)
    })

    it('rolls back pnpm-workspace.yaml on install failure', async () => {
        mockExecSync.mockImplementation(() => {
            throw Object.assign(new Error('install failed'), { stderr: 'ERR' })
        })

        const project = createTempProject({ lodash: '^4.17.20' })
        const workspaceYamlPath = join(project.dir, 'pnpm-workspace.yaml')
        const originalYaml = 'packages:\n  - \'.\'\n'
        writeFileSync(workspaceYamlPath, originalYaml)

        writeFileSync(project.lockfilePath, [
            'lockfileVersion: \'9.0\'',
            '',
            '/fast-uri/5.0.0:',
            '  resolution: {integrity: sha512-xxx}',
            '',
        ].join('\n'))

        await overrideTransitiveDependency({
            packageName: 'fast-uri',
            targetVersion: '5.0.1',
            workDir: project.dir,
        })

        const restored = readFileSync(workspaceYamlPath, 'utf-8')
        expect(restored).toBe(originalYaml)

        cleanup(project)
    })

    it('preserves existing workspace overrides alongside new ones', async () => {
        const project = createTempProject({ lodash: '^4.17.20' })
        writeFileSync(join(project.dir, 'pnpm-workspace.yaml'), [
            'packages:',
            '  - \'.\'',
            'overrides:',
            '  existing-pkg: ^1.0.0',
            '',
        ].join('\n'))

        writeFileSync(project.lockfilePath, [
            'lockfileVersion: \'9.0\'',
            '',
            '/fast-uri/5.0.0:',
            '  resolution: {integrity: sha512-xxx}',
            '',
        ].join('\n'))

        await overrideTransitiveDependency({
            packageName: 'fast-uri',
            targetVersion: '5.0.1',
            workDir: project.dir,
        })

        const yamlContent = readFileSync(join(project.dir, 'pnpm-workspace.yaml'), 'utf-8')
        expect(yamlContent).toContain('existing-pkg')
        expect(yamlContent).toContain('^1.0.0')
        expect(yamlContent).toContain('fast-uri')
        expect(yamlContent).toContain('5.0.1')

        cleanup(project)
    })

    // -----------------------------------------------------------------------
    // C1：pnpm v10+ 无 pnpm-workspace.yaml → package.json overrides 假成功防护
    // -----------------------------------------------------------------------

    it('C1: detects pnpm v10+ writing to package.json overrides and verifies lockfile effect', async () => {
        mockExecSync.mockImplementation((cmd: string) => {
            if (String(cmd).includes('--version')) {
                return '11.5.0' // pnpm v11（不读 package.json overrides）
            }
            return undefined // install 成功（mock 不更新 lockfile）
        })

        const project = createTempProject({ lodash: '^4.17.20' })
        writeFileSync(project.lockfilePath, [
            'lockfileVersion: \'9.0\'',
            '',
            '/fast-uri/5.0.0:',
            '  resolution: {integrity: sha512-xxx}',
            '',
        ].join('\n'))

        const result = await overrideTransitiveDependency({
            packageName: 'fast-uri',
            targetVersion: '5.0.1',
            workDir: project.dir,
        })

        // install "成功" 但 lockfile 未更新（5.0.0 < 5.0.1）→ 判定假成功：回滚 + 报错
        expect(result.success).toBe(false)
        expect(result.error).toContain('override did not take effect')

        // package.json 被回滚（无残留 override）
        const pkg = JSON.parse(readFileSync(project.pkgPath, 'utf-8')) as Record<string, unknown>
        expect(pkg.pnpm).toBeUndefined()

        cleanup(project)
    })

    it('C1: succeeds with warning when lockfile actually updated', async () => {
        mockExecSync.mockImplementation((cmd: string) => {
            if (String(cmd).includes('--version')) {
                return '11.5.0'
            }
            return undefined
        })

        const project = createTempProject({ lodash: '^4.17.20' })
        // lockfile 已处于目标版本（模拟 install 生效）
        writeFileSync(project.lockfilePath, [
            'lockfileVersion: \'9.0\'',
            '',
            '/fast-uri/5.0.1:',
            '  resolution: {integrity: sha512-xxx}',
            '',
        ].join('\n'))

        const result = await overrideTransitiveDependency({
            packageName: 'fast-uri',
            targetVersion: '5.0.1',
            workDir: project.dir,
        })

        expect(result.success).toBe(true)
        expect(result.warning).toContain('pnpm v11 may ignore package.json#pnpm.overrides')

        cleanup(project)
    })

    it('C1: no verification when pnpm major is unknown (mock install does not update lockfile)', async () => {
        // mockExecSync 默认返回 undefined → detectPnpmMajor 无法解析 → 不触发校验
        const project = createTempProject({ lodash: '^4.17.20' })
        writeFileSync(project.lockfilePath, [
            'lockfileVersion: \'9.0\'',
            '',
            '/fast-uri/5.0.0:',
            '  resolution: {integrity: sha512-xxx}',
            '',
        ].join('\n'))

        const result = await overrideTransitiveDependency({
            packageName: 'fast-uri',
            targetVersion: '5.0.1',
            workDir: project.dir,
        })

        // 未知 pnpm 版本 → 不校验（保持旧行为），成功且无 warning
        expect(result.success).toBe(true)
        expect(result.warning).toBeUndefined()

        cleanup(project)
    })
})

// ===========================================================================
// isCrossMajorFixRequired（PR #28 复盘：跨线修复判定）
// ===========================================================================

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
            throw new Error('pnpm install failed: ERESOLVE')
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
