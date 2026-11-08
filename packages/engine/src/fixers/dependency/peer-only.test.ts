// peer-only.test.ts — peer 后缀实例识别与「override 未生效」归因。
//
// 背景（2026-11-01 rss-to-memos-sync vite 实证）：peer-only 包写入 overrides 后，pnpm 只改
// peerDependencies 的 range，已锁定实例不变（`--force` 亦不重解析）。生效校验必须把它
// 归因为「无法自动修复（peer-only）」，而不是普通的「override 未生效」失败动作。
import { rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { scanPeerOnlyInstances } from './lockfile-versions'
import { classifyPeerOnlyFailure, verifyVersionedOverridesAppliedDetailed } from './override-verification'

const lockfilePath = join(tmpdir(), 'peer-only-lock.yaml')

afterEach(() => {
    rmSync(lockfilePath, { force: true })
})

const writeLockfile = (lines: string[]) => {
    writeFileSync(lockfilePath, ['lockfileVersion: \'9.0\'', '', ...lines, ''].join('\n'))
}

describe('scanPeerOnlyInstances', () => {
    it('detects peer-suffixed instances when no direct instance exists', () => {
        writeLockfile([
            '  vite@8.3.1(vitest@3.0.0):',
            '    resolution: {integrity: sha512-a}',
        ])

        expect(scanPeerOnlyInstances(lockfilePath, 'vite')).toEqual({
            peerOnlyVersions: ['8.3.1'],
            hasDirectInstances: false,
        })
    })

    it('reports direct instances when bare snapshot key coexists', () => {
        writeLockfile([
            '  vite@8.3.1:',
            '    resolution: {integrity: sha512-a}',
            '',
            '  vite@8.3.1(@types/node@24.0.0):',
            '    resolution: {integrity: sha512-b}',
        ])

        expect(scanPeerOnlyInstances(lockfilePath, 'vite')).toEqual({
            peerOnlyVersions: ['8.3.1'],
            hasDirectInstances: true,
        })
    })

    it('treats v9 /pkg/version keys as direct instances', () => {
        writeLockfile([
            '  /vite/8.3.1:',
            '    resolution: {integrity: sha512-a}',
        ])

        expect(scanPeerOnlyInstances(lockfilePath, 'vite').hasDirectInstances).toBe(true)
    })

    it('returns empty result when lockfile is missing', () => {
        expect(scanPeerOnlyInstances(join(tmpdir(), 'missing-peer-lock.yaml'), 'vite')).toEqual({
            peerOnlyVersions: [],
            hasDirectInstances: false,
        })
    })
})

describe('classifyPeerOnlyFailure', () => {
    it('classifies failure as peer-only when every remaining version is peer-suffixed', () => {
        writeLockfile([
            '  vite@8.3.1(vitest@3.0.0):',
            '    resolution: {integrity: sha512-a}',
        ])

        expect(classifyPeerOnlyFailure(lockfilePath, 'vite', ['8.3.1'])).toBe(true)
    })

    it('does not classify when a direct instance exists', () => {
        writeLockfile([
            '  vite@8.3.1:',
            '    resolution: {integrity: sha512-a}',
        ])

        expect(classifyPeerOnlyFailure(lockfilePath, 'vite', ['8.3.1'])).toBe(false)
    })

    it('does not classify when a remaining version has no peer form', () => {
        writeLockfile([
            '  vite@8.3.1(vitest@3.0.0):',
            '    resolution: {integrity: sha512-a}',
        ])

        expect(classifyPeerOnlyFailure(lockfilePath, 'vite', ['8.2.0'])).toBe(false)
    })

    it('classifies when direct instances already meet the target and only peer instances lag', () => {
        // 直接实例已达标不应否决 peer-only 归因（否则仍会被当成普通未生效回滚）
        writeLockfile([
            '  vite@8.3.3:',
            '    resolution: {integrity: sha512-a}',
            '',
            '  vite@8.3.1(vitest@3.0.0):',
            '    resolution: {integrity: sha512-b}',
        ])

        expect(classifyPeerOnlyFailure(lockfilePath, 'vite', ['8.3.1'])).toBe(true)
    })
})

describe('scanPeerOnlyInstances edge forms', () => {
    it('handles quoted scoped package keys', () => {
        writeLockfile([
            '  \'@scope/pkg@1.0.0(peer@2.0.0)\':',
            '    resolution: {integrity: sha512-a}',
        ])

        expect(scanPeerOnlyInstances(lockfilePath, '@scope/pkg')).toEqual({
            peerOnlyVersions: ['1.0.0'],
            hasDirectInstances: false,
        })
    })

    it('does not attribute inner peer package versions to the target package', () => {
        writeLockfile([
            '  vite@8.3.1(vitest@3.0.0):',
            '    resolution: {integrity: sha512-a}',
        ])

        expect(scanPeerOnlyInstances(lockfilePath, 'vitest')).toEqual({
            peerOnlyVersions: [],
            hasDirectInstances: false,
        })
    })
})

describe('verifyVersionedOverridesAppliedDetailed', () => {
    it('returns peerOnly flag for peer-only instances', () => {
        writeLockfile([
            '  vite@8.3.1(vitest@3.0.0):',
            '    resolution: {integrity: sha512-a}',
        ])

        const failure = verifyVersionedOverridesAppliedDetailed(lockfilePath, [{
            packageName: 'vite',
            overrides: { vite: '^8.3.3' },
        }])

        expect(failure).toEqual({
            packageName: 'vite',
            message: 'vite: 8.3.1 remain below 8.3.3',
            peerOnly: true,
        })
    })

    it('keeps plain failure shape for non-peer instances', () => {
        writeLockfile([
            '  vite@8.3.1:',
            '    resolution: {integrity: sha512-a}',
        ])

        const failure = verifyVersionedOverridesAppliedDetailed(lockfilePath, [{
            packageName: 'vite',
            overrides: { vite: '^8.3.3' },
        }])

        expect(failure).toEqual({
            packageName: 'vite',
            message: 'vite: 8.3.1 remain below 8.3.3',
            peerOnly: false,
        })
    })

    it('returns undefined when every instance reaches the target', () => {
        writeLockfile([
            '  vite@8.3.3(vitest@3.0.0):',
            '    resolution: {integrity: sha512-a}',
        ])

        expect(verifyVersionedOverridesAppliedDetailed(lockfilePath, [{
            packageName: 'vite',
            overrides: { vite: '^8.3.3' },
        }])).toBeUndefined()
    })
})
