// versioned-overrides.test.ts — hasMultipleMajorVersions / buildVersionedOverrides（多版本共存 → 版本化 overrides）。
// 拆分自 app/helpers.test.ts（原 1031 行超 max-lines 1000）。
import { rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildVersionedOverrides, hasMultipleMajorVersions } from './helpers'

// ---------------------------------------------------------------------------
// hasMultipleMajorVersions / buildVersionedOverrides（多版本共存 → 版本化 overrides）
// ---------------------------------------------------------------------------

describe('hasMultipleMajorVersions', () => {
    it('returns true when lockfile has multiple major versions of the package', () => {
        const lockfilePath = join(tmpdir(), 'vite-lock.yaml')
        writeFileSync(lockfilePath, [
            'lockfileVersion: \'9.0\'',
            '',
            '  vite@5.4.14:',
            '    resolution: {integrity: sha512-old}',
            '',
            '  vite@8.2.0:',
            '    resolution: {integrity: sha512-new}',
            '',
        ].join('\n'))

        expect(hasMultipleMajorVersions(lockfilePath, 'vite')).toBe(true)

        rmSync(lockfilePath, { force: true })
    })

    it('returns false for single version or same-major coexistence', () => {
        const lockfilePath = join(tmpdir(), 'fast-uri-lock.yaml')
        writeFileSync(lockfilePath, [
            'lockfileVersion: \'9.0\'',
            '',
            '  fast-uri@3.1.0:',
            '    resolution: {integrity: sha512-a}',
            '',
            '  fast-uri@3.1.5:',
            '    resolution: {integrity: sha512-b}',
            '',
        ].join('\n'))

        expect(hasMultipleMajorVersions(lockfilePath, 'fast-uri')).toBe(false)

        rmSync(lockfilePath, { force: true })
    })

    it('returns false when lockfile missing', () => {
        expect(hasMultipleMajorVersions(join(tmpdir(), 'missing.yaml'), 'vite')).toBe(false)
    })
})

describe('buildVersionedOverrides', () => {
    const lockfilePath = join(tmpdir(), 'vite-lock.yaml')

    const alert = (packageName: string, recommendedVersion: string, overrides: Partial<Record<string, unknown>> = {}) => ({
        id: 1,
        source: 'dependabot' as const,
        repository: 'owner/repo',
        defaultBranch: 'main',
        severity: 'high' as const,
        packageEcosystem: 'npm' as const,
        packageName,
        manifestPath: 'pnpm-lock.yaml',
        ruleId: 'GHSA-xxx',
        summary: 'test',
        htmlUrl: '',
        fixable: true,
        fixStrategy: 'upgrade' as const,
        recommendedVersion,
        ...overrides,
    })

    beforeEach(() => {
        writeFileSync(lockfilePath, [
            'lockfileVersion: \'9.0\'',
            '',
            '  vite@5.4.14:',
            '    resolution: {integrity: sha512-old}',
            '',
            '  vite@8.2.0:',
            '    resolution: {integrity: sha512-new}',
            '',
        ].join('\n'))
    })

    afterEach(() => {
        rmSync(lockfilePath, { force: true })
    })

    /** 单 major 共存 fixture（fast-uri@3.1.0 + 3.1.5，同 major 多小版本场景） */
    const writeFastUriLockfile = (): void => {
        writeFileSync(lockfilePath, [
            'lockfileVersion: \'9.0\'',
            '',
            '  fast-uri@3.1.0:',
            '    resolution: {integrity: sha512-a}',
            '',
            '  fast-uri@3.1.5:',
            '    resolution: {integrity: sha512-b}',
            '',
        ].join('\n'))
    }

    it('uses major-version key and covers the whole line (body-parser@1 style)', () => {
        const overrides = buildVersionedOverrides(lockfilePath, [alert('vite', '5.4.21')])
        // vite@5.4.14 < 5.4.21 → `vite@5` 大版本 key 覆盖整条 5.x 线；8.2.0 无推荐不覆盖
        expect(overrides).toEqual({ 'vite@5': '^5.4.21' })
    })

    it('groups multiple alerts by major and takes highest target per line (vite 5.x + 8.x alerts)', () => {
        // 多 GHSA：5.x 线推荐最高 5.4.21，8.x 线推荐最高 8.2.1（模拟 run 31028234123）
        const overrides = buildVersionedOverrides(lockfilePath, [
            alert('vite', '5.4.15'),
            alert('vite', '5.4.21'),
            alert('vite', '8.2.1'),
        ])
        expect(overrides).toEqual({
            'vite@5': '^5.4.21',
            'vite@8': '^8.2.1',
        })
    })

    it('uses plain key for same-major multi-version coexistence (fast-uri@3.1.0 + 3.1.5)', () => {
        writeFastUriLockfile()
        const overrides = buildVersionedOverrides(lockfilePath, [alert('fast-uri', '3.1.5')])
        // 单 major（仅 3.x 共存）用无版本号 key，避免 `fast-uri@3` 与既有无版本号条目分裂
        expect(overrides).toEqual({ 'fast-uri': '^3.1.5' })
    })

    it('merges existing plain override to max for single-major package', () => {
        writeFastUriLockfile()
        const overrides = buildVersionedOverrides(
            lockfilePath,
            [alert('fast-uri', '3.1.5')],
            { 'fast-uri': '^3.1.3' },
        )
        // 已有无版本号 ^3.1.3 < 推荐 3.1.5 → 升级目标取 max
        expect(overrides).toEqual({ 'fast-uri': '^3.1.5' })
    })

    it('keeps existing plain override untouched when already >= target', () => {
        writeFastUriLockfile()
        const overrides = buildVersionedOverrides(
            lockfilePath,
            [alert('fast-uri', '3.1.5')],
            { 'fast-uri': '^3.1.8' },
        )
        // 已有 ^3.1.8 已 >= 推荐 → 无需写入
        expect(overrides).toEqual({})
    })

    it('merges existing versioned override to max for multi-major package', () => {
        const overrides = buildVersionedOverrides(lockfilePath, [alert('vite', '5.4.21')], { 'vite@5': '^5.4.15' })
        // 多 major（5.x + 8.x）→ 版本化 key，目标与已有条目取 max；无关包条目不参与
        expect(overrides).toEqual({ 'vite@5': '^5.4.21' })
        const compat = buildVersionedOverrides(lockfilePath, [alert('vite', '5.4.21')], { 'brace-expansion': '^2.0.3' })
        expect(compat).toEqual({ 'vite@5': '^5.4.21' })
    })

    it('reuses existing versioned key when single-major package has legacy @major entry', () => {
        writeFastUriLockfile()
        const overrides = buildVersionedOverrides(lockfilePath, [alert('fast-uri', '3.1.5')], { 'fast-uri@3': '^3.1.3' })
        // 单 major 已有历史 @major 条目 → 沿用版本化 key（避免无版本号新条目被精确 key 截获），目标取 max
        expect(overrides).toEqual({ 'fast-uri@3': '^3.1.5' })
    })

    it('returns empty when target is higher than all instances (already safe)', () => {
        const overrides = buildVersionedOverrides(lockfilePath, [alert('vite', '5.4.10')])
        expect(overrides).toEqual({})
    })

    it('returns empty when recommendedVersion missing', () => {
        const noTarget = alert('vite', '5.4.21', { recommendedVersion: undefined })
        expect(buildVersionedOverrides(lockfilePath, [noTarget])).toEqual({})
    })

    it('returns empty when no alerts provided', () => {
        expect(buildVersionedOverrides(lockfilePath, [])).toEqual({})
    })
})
