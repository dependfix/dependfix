import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
    collectSupplyChainWarnings,
    parseWorkspaceAllowBuilds,
    readInstalledPackageScriptTypes,
} from './index'

// ---------------------------------------------------------------------------
// parseWorkspaceAllowBuilds
// ---------------------------------------------------------------------------

describe('parseWorkspaceAllowBuilds', () => {
    it('parses allowBuilds object form (pnpm 11)', () => {
        const content = [
            'packages:',
            '  - packages/*',
            'allowBuilds:',
            '  \'@parcel/watcher\': true',
            '  esbuild: true',
            '  better-sqlite3: true',
            'overrides:',
            '  esbuild: ^0.25.0',
        ].join('\n')

        const approved = parseWorkspaceAllowBuilds(content)

        expect(approved).toEqual(new Set(['@parcel/watcher', 'esbuild', 'better-sqlite3']))
    })

    it('parses onlyBuiltDependencies array form (pnpm 10)', () => {
        const content = [
            'onlyBuiltDependencies:',
            '  - esbuild',
            '  - \'better-sqlite3\'',
        ].join('\n')

        const approved = parseWorkspaceAllowBuilds(content)

        expect(approved).toEqual(new Set(['esbuild', 'better-sqlite3']))
    })

    it('ignores inline comments and false values', () => {
        const content = [
            'allowBuilds:',
            '  esbuild: true # build tool needs postinstall',
            '  skipped-pkg: false',
            '  # comment-only line',
        ].join('\n')

        const approved = parseWorkspaceAllowBuilds(content)

        expect(approved.has('esbuild')).toBe(true)
        expect(approved.has('skipped-pkg')).toBe(false)
    })

    it('handles allowBuilds with script list value', () => {
        const content = [
            'allowBuilds:',
            '  \'some-pkg\': [install]',
        ].join('\n')

        const approved = parseWorkspaceAllowBuilds(content)

        expect(approved.has('some-pkg')).toBe(true)
    })

    it('does not collect packages from unrelated sections', () => {
        const content = [
            'packages:',
            '  - packages/*',
            'overrides:',
            '  esbuild: ^0.25.0',
        ].join('\n')

        expect(parseWorkspaceAllowBuilds(content)).toEqual(new Set())
    })

    it('returns empty set for missing content', () => {
        expect(parseWorkspaceAllowBuilds(undefined)).toEqual(new Set())
        expect(parseWorkspaceAllowBuilds('')).toEqual(new Set())
    })

    it('handles CRLF line endings', () => {
        const content = 'allowBuilds:\r\n  esbuild: true\r\n'

        expect(parseWorkspaceAllowBuilds(content)).toEqual(new Set(['esbuild']))
    })
})

// ---------------------------------------------------------------------------
// readInstalledPackageScriptTypes
// ---------------------------------------------------------------------------

describe('readInstalledPackageScriptTypes', () => {
    let workDir: string

    afterEach(() => {
        rmSync(workDir, { recursive: true, force: true })
    })

    it('reads lifecycle script types from pnpm store layout', () => {
        workDir = mkdtempSync(join(tmpdir(), 'supply-chain-'))
        const pkgDir = join(workDir, 'node_modules', '.pnpm', 'better-sqlite3@12.11.1', 'node_modules', 'better-sqlite3')
        mkdirSync(pkgDir, { recursive: true })
        writeFileSync(join(pkgDir, 'package.json'), JSON.stringify({
            name: 'better-sqlite3',
            version: '12.11.1',
            scripts: {
                install: 'prebuild-install || node-gyp rebuild --release',
                test: 'mocha',
            },
        }))

        expect(readInstalledPackageScriptTypes(workDir, 'better-sqlite3', '12.11.1'))
            .toEqual(['install'])
    })

    it('resolves scoped package store directory (plus form)', () => {
        workDir = mkdtempSync(join(tmpdir(), 'supply-chain-'))
        const pkgDir = join(workDir, 'node_modules', '.pnpm', '@parcel+watcher@2.6.0', 'node_modules', '@parcel', 'watcher')
        mkdirSync(pkgDir, { recursive: true })
        writeFileSync(join(pkgDir, 'package.json'), JSON.stringify({
            name: '@parcel/watcher',
            version: '2.6.0',
            scripts: { postinstall: 'node install.js' },
        }))

        expect(readInstalledPackageScriptTypes(workDir, '@parcel/watcher', '2.6.0'))
            .toEqual(['postinstall'])
    })

    it('returns empty array when package has no lifecycle scripts', () => {
        workDir = mkdtempSync(join(tmpdir(), 'supply-chain-'))
        const pkgDir = join(workDir, 'node_modules', '.pnpm', 'plain-pkg@1.0.0', 'node_modules', 'plain-pkg')
        mkdirSync(pkgDir, { recursive: true })
        writeFileSync(join(pkgDir, 'package.json'), JSON.stringify({
            name: 'plain-pkg',
            version: '1.0.0',
            scripts: { build: 'tsc' },
        }))

        expect(readInstalledPackageScriptTypes(workDir, 'plain-pkg', '1.0.0')).toEqual([])
    })

    it('falls back to peer-suffixed store directory (name@version_peer@v...)', () => {
        workDir = mkdtempSync(join(tmpdir(), 'supply-chain-'))
        const pkgDir = join(workDir, 'node_modules', '.pnpm', 'react-dom@18.2.0_react@18.2.0', 'node_modules', 'react-dom')
        mkdirSync(pkgDir, { recursive: true })
        writeFileSync(join(pkgDir, 'package.json'), JSON.stringify({
            name: 'react-dom',
            version: '18.2.0',
            scripts: { install: 'node install.js' },
        }))

        expect(readInstalledPackageScriptTypes(workDir, 'react-dom', '18.2.0'))
            .toEqual(['install'])
    })

    it('returns undefined when package not installed', () => {
        workDir = mkdtempSync(join(tmpdir(), 'supply-chain-'))

        expect(readInstalledPackageScriptTypes(workDir, 'missing-pkg', '1.0.0')).toBeUndefined()
    })
})

// ---------------------------------------------------------------------------
// collectSupplyChainWarnings
// ---------------------------------------------------------------------------

describe('collectSupplyChainWarnings', () => {
    let workDir: string

    afterEach(() => {
        rmSync(workDir, { recursive: true, force: true })
    })

    function makeAction(packageName: string, toVersion: string, success = true) {
        return {
            type: 'dependency-upgrade' as const,
            repository: 'owner/repo',
            target: packageName,
            toVersion,
            success,
            fromVersion: '1.0.0',
        }
    }

    it('collects approved packages with lifecycle scripts', () => {
        workDir = mkdtempSync(join(tmpdir(), 'supply-chain-'))
        writeFileSync(join(workDir, 'pnpm-workspace.yaml'), 'allowBuilds:\n  esbuild: true\n  better-sqlite3: true\n')
        const esbuildDir = join(workDir, 'node_modules', '.pnpm', 'esbuild@0.25.12', 'node_modules', 'esbuild')
        mkdirSync(esbuildDir, { recursive: true })
        writeFileSync(join(esbuildDir, 'package.json'), JSON.stringify({ name: 'esbuild', version: '0.25.12', scripts: { postinstall: 'node install.js' } }))

        const warnings = collectSupplyChainWarnings(workDir, [
            makeAction('esbuild', '0.25.12'),
            makeAction('plain-pkg', '2.0.0'),
        ])

        expect(warnings).toHaveLength(1)
        expect(warnings[0]).toEqual({
            repository: 'owner/repo',
            packageName: 'esbuild',
            version: '0.25.12',
            scriptTypes: ['postinstall'],
        })
    })

    it('skips approved packages without lifecycle scripts', () => {
        workDir = mkdtempSync(join(tmpdir(), 'supply-chain-'))
        writeFileSync(join(workDir, 'pnpm-workspace.yaml'), 'allowBuilds:\n  esbuild: true\n')

        expect(collectSupplyChainWarnings(workDir, [makeAction('esbuild', '0.25.12')])).toEqual([])
    })

    it('returns empty when workspace has no approved builds', () => {
        workDir = mkdtempSync(join(tmpdir(), 'supply-chain-'))

        expect(collectSupplyChainWarnings(workDir, [makeAction('esbuild', '0.25.12')])).toEqual([])
    })

    it('deduplicates multiple actions for the same package', () => {
        workDir = mkdtempSync(join(tmpdir(), 'supply-chain-'))
        writeFileSync(join(workDir, 'pnpm-workspace.yaml'), 'allowBuilds:\n  esbuild: true\n')
        const esbuildDir = join(workDir, 'node_modules', '.pnpm', 'esbuild@0.25.12', 'node_modules', 'esbuild')
        mkdirSync(esbuildDir, { recursive: true })
        writeFileSync(join(esbuildDir, 'package.json'), JSON.stringify({ name: 'esbuild', version: '0.25.12', scripts: { postinstall: 'x' } }))

        const warnings = collectSupplyChainWarnings(workDir, [
            makeAction('esbuild', '0.25.12'),
            makeAction('esbuild', '0.25.12'),
        ])

        expect(warnings).toHaveLength(1)
    })

    it('ignores failed and no-version upgrade actions', () => {
        workDir = mkdtempSync(join(tmpdir(), 'supply-chain-'))
        writeFileSync(join(workDir, 'pnpm-workspace.yaml'), 'allowBuilds:\n  esbuild: true\n')
        const esbuildDir = join(workDir, 'node_modules', '.pnpm', 'esbuild@0.25.12', 'node_modules', 'esbuild')
        mkdirSync(esbuildDir, { recursive: true })
        writeFileSync(join(esbuildDir, 'package.json'), JSON.stringify({ name: 'esbuild', version: '0.25.12', scripts: { postinstall: 'x' } }))

        const warnings = collectSupplyChainWarnings(workDir, [
            makeAction('esbuild', '0.25.12', false),
            { ...makeAction('esbuild', '0.25.12'), toVersion: undefined },
        ])

        expect(warnings).toHaveLength(0)
    })
})
