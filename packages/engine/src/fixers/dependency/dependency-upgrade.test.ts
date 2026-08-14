import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it, beforeEach, vi } from 'vitest'

// Mock execSync to avoid needing pnpm in test environment.
// Must use vi.hoisted because vi.mock is hoisted above imports.
const { mockExecSync } = vi.hoisted(() => ({
    mockExecSync: vi.fn(),
}))

vi.mock('node:child_process', () => ({
    execSync: mockExecSync,
}))

import { cleanup, createTempProject, readPackageVersion } from './dependency.test-helpers'
import {
    overrideTransitiveDependency,
    upgradeDependency,
    type DependencyFixResult,
} from './index'


// ---------------------------------------------------------------------------
// upgradeDependency / overrideTransitiveDependency（自 index.test.ts 拆出：
// 文件行数治理 max-lines 1000）
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

    it('identifies minimumReleaseAge policy failure with readable hint', async () => {
        const project = createTempProject({ lodash: '^4.17.20' })

        mockExecSync.mockImplementation(() => {
            throw Object.assign(new Error('Install failed'), {
                stderr: '[ERR_PNPM_NO_MATURE_MATCHING_VERSION] 2 versions do not meet the minimumReleaseAge constraint',
            })
        })

        const result = await upgradeDependency({
            packageName: 'lodash',
            targetVersion: '4.17.21',
            workDir: project.dir,
        })

        expect(result.success).toBe(false)
        expect(result.error).toContain('minimumReleaseAge policy')
        expect(result.error).toContain('ERR_PNPM_NO_MATURE_MATCHING_VERSION')

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

// ---------------------------------------------------------------------------
// upgradeDependency — member manifest (manifestDir)
// ---------------------------------------------------------------------------

describe('upgradeDependency (member manifest / manifestDir)', () => {
    beforeEach(() => {
        mockExecSync.mockReset()
        mockExecSync.mockReturnValue(Buffer.from(''))
    })

    function createMemberProject(
        memberDeps: Record<string, string> = { vite: '^5.4.0' },
    ): { dir: string, memberPkgPath: string } {
        const dir = mkdtempSync(join(tmpdir(), 'dependfix-member-test-'))
        writeFileSync(join(dir, 'package.json'), `${JSON.stringify({ name: 'root', version: '1.0.0' }, null, 2)}\n`)
        writeFileSync(join(dir, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n')
        writeFileSync(join(dir, 'pnpm-lock.yaml'), '# mock lockfile\n')
        mkdirSync(join(dir, 'packages', 'web'), { recursive: true })
        const memberPkgPath = join(dir, 'packages', 'web', 'package.json')
        writeFileSync(
            memberPkgPath,
            `${JSON.stringify({ name: 'web', version: '1.0.0', dependencies: memberDeps }, null, 2)}\n`,
        )
        return { dir, memberPkgPath }
    }

    it('upgrades a member manifest dependency and runs install at workspace root', async () => {
        const { dir, memberPkgPath } = createMemberProject()

        const result = await upgradeDependency({
            packageName: 'vite',
            targetVersion: '5.4.14',
            workDir: dir,
            manifestDir: 'packages/web',
        })

        expect(result).toEqual<DependencyFixResult>({
            packageName: 'vite',
            fromVersion: '^5.4.0',
            toVersion: '^5.4.14',
            isMajor: false,
            success: true,
        })
        // install 仍在 workspace 根执行（workspace 解析语义）
        expect(mockExecSync).toHaveBeenCalledWith(
            'pnpm install --no-frozen-lockfile',
            expect.objectContaining({ cwd: dir }),
        )
        const memberPkg = JSON.parse(readFileSync(memberPkgPath, 'utf-8')) as Record<string, Record<string, string>>
        expect(memberPkg.dependencies?.['vite']).toBe('^5.4.14')

        rmSync(dir, { recursive: true, force: true })
    })

    it('finds the package in member devDependencies', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'dependfix-member-test-'))
        writeFileSync(join(dir, 'package.json'), `${JSON.stringify({ name: 'root', version: '1.0.0' }, null, 2)}\n`)
        writeFileSync(join(dir, 'pnpm-lock.yaml'), '# mock lockfile\n')
        mkdirSync(join(dir, 'packages', 'web'), { recursive: true })
        const memberPkgPath = join(dir, 'packages', 'web', 'package.json')
        writeFileSync(
            memberPkgPath,
            `${JSON.stringify({ name: 'web', version: '1.0.0', devDependencies: { typescript: '~5.0.0' } }, null, 2)}\n`,
        )

        const result = await upgradeDependency({
            packageName: 'typescript',
            targetVersion: '5.4.5',
            workDir: dir,
            manifestDir: 'packages/web',
        })

        expect(result.success).toBe(true)
        expect(result.fromVersion).toBe('~5.0.0')
        expect(result.toVersion).toBe('~5.4.5')

        rmSync(dir, { recursive: true, force: true })
    })

    it('rolls back member manifest and lockfile on install failure', async () => {
        const { dir, memberPkgPath } = createMemberProject()
        const originalMember = readFileSync(memberPkgPath, 'utf-8')
        const lockfilePath = join(dir, 'pnpm-lock.yaml')
        const originalLockfile = readFileSync(lockfilePath, 'utf-8')

        mockExecSync.mockImplementation(() => {
            throw new Error('Install failed')
        })

        const result = await upgradeDependency({
            packageName: 'vite',
            targetVersion: '5.4.14',
            workDir: dir,
            manifestDir: 'packages/web',
        })

        expect(result.success).toBe(false)
        expect(result.error).toContain('pnpm install failed')
        expect(readFileSync(memberPkgPath, 'utf-8')).toBe(originalMember)
        expect(readFileSync(lockfilePath, 'utf-8')).toBe(originalLockfile)

        rmSync(dir, { recursive: true, force: true })
    })

    it('rejects non-semver member declarations (workspace:/catalog:) without writing', async () => {
        for (const declaration of ['workspace:*', 'catalog:', 'link:../pkg']) {
            const { dir, memberPkgPath } = createMemberProject({ vite: declaration })
            const originalMember = readFileSync(memberPkgPath, 'utf-8')
            mockExecSync.mockClear()

            const result = await upgradeDependency({
                packageName: 'vite',
                targetVersion: '5.4.14',
                workDir: dir,
                manifestDir: 'packages/web',
            })

            expect(result.success).toBe(false)
            expect(result.error).toContain('non-semver declaration')
            expect(mockExecSync).not.toHaveBeenCalled()
            expect(readFileSync(memberPkgPath, 'utf-8')).toBe(originalMember)

            rmSync(dir, { recursive: true, force: true })
        }
    })

    it('returns failure when member manifest is missing', async () => {
        const { dir } = createMemberProject()

        const result = await upgradeDependency({
            packageName: 'vite',
            targetVersion: '5.4.14',
            workDir: dir,
            manifestDir: 'packages/not-exist',
        })

        expect(result.success).toBe(false)
        expect(result.error).toContain('file not found')
        expect(mockExecSync).not.toHaveBeenCalled()

        rmSync(dir, { recursive: true, force: true })
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

    it('pins exact version with pnpm v11 snapshot lockfile (fromVersion no longer unknown → ^x fallback)', async () => {
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
    // pnpm v10+ 无 pnpm-workspace.yaml → package.json overrides 假成功防护
    // -----------------------------------------------------------------------

    it('detects pnpm v10+ writing to package.json overrides and verifies lockfile effect', async () => {
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

    it('succeeds with warning when lockfile actually updated', async () => {
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

    it('no verification when pnpm major is unknown (mock install does not update lockfile)', async () => {
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

