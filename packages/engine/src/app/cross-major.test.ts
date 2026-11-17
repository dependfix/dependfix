// cross-major.test.ts — 跨 major / 混合实例 / 仅传递依赖的纯读判定（基线前置与链路共用谓词）。
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { NormalizedSecurityAlert } from '@dependfix/core'
import {
    assessLockfileWork,
    classifyBelowTargetInstances,
    createCrossMajorContext,
    isAutoMajorEligible,
    isNonWritableMixedInstance,
    hasWritableOverrideWork,
    isManualCrossMajorAlert,
    isTransitiveOnlyCrossMajor,
    isVersionAffected,
} from './cross-major'

const makeAlert = (overrides: Partial<NormalizedSecurityAlert> = {}): NormalizedSecurityAlert => ({
    id: 1,
    source: 'dependabot',
    repository: 'foo/bar',
    defaultBranch: 'main',
    severity: 'high',
    packageEcosystem: 'npm',
    packageName: 'vite',
    manifestPath: 'pnpm-lock.yaml',
    ruleId: 'GHSA-test',
    summary: 'test advisory',
    htmlUrl: '',
    fixable: true,
    fixStrategy: 'upgrade',
    recommendedVersion: '6.4.3',
    upstreamId: 'dependabot:1',
    ...overrides,
})

describe('isVersionAffected（advisory 受影响区间）', () => {
    it('命中区间 / 不命中区间', () => {
        expect(isVersionAffected('5.4.14', '< 6.4.3')).toBe(true)
        expect(isVersionAffected('7.0.0', '< 6.4.3')).toBe(false)
        expect(isVersionAffected('5.4.14', '>=6.0.0 <6.4.3')).toBe(false)
    })

    it('区间缺失 / 无法解析 / 版本非法 → 保守视为受影响', () => {
        expect(isVersionAffected('5.4.14', undefined)).toBe(true)
        expect(isVersionAffected('5.4.14', 'not-a-range')).toBe(true)
        expect(isVersionAffected('not-a-version', '< 6.4.3')).toBe(true)
    })
})

describe('classifyBelowTargetInstances', () => {
    const alert = makeAlert({ vulnerableRange: '>=6.0.0 <6.4.3' })

    it('全部受影响 → all-affected；部分 → mixed；全部不在区间 → none-affected', () => {
        expect(classifyBelowTargetInstances(alert, ['6.1.0', '6.2.0'])).toBe('all-affected')
        expect(classifyBelowTargetInstances(alert, ['6.1.0', '5.4.14'])).toBe('mixed')
        expect(classifyBelowTargetInstances(alert, ['5.4.14', '4.0.0'])).toBe('none-affected')
        expect(classifyBelowTargetInstances(alert, [])).toBe('none-affected')
    })
})

describe('跨 major 谓词（allowMajorUpgrade 准入不放宽）', () => {
    let workDir: string

    beforeEach(() => {
        workDir = mkdtempSync(join(tmpdir(), 'dependfix-cross-major-'))
        writeFileSync(join(workDir, 'package.json'), JSON.stringify({
            name: 'fixture',
            version: '1.0.0',
            dependencies: { vite: '^5.0.0' },
        }, null, 2))
        writeFileSync(join(workDir, 'pnpm-lock.yaml'), [
            'lockfileVersion: \'9.0\'',
            '',
            '  vite@5.4.14:',
            '    resolution: {integrity: sha512-a}',
            '',
        ].join('\n'))
    })

    afterEach(() => {
        rmSync(workDir, { recursive: true, force: true })
    })

    it('未开开关：需跨 major 的告警按人工处理', () => {
        const ctx = createCrossMajorContext({ workDir, config: { allowMajorUpgrade: false } })
        expect(isManualCrossMajorAlert(makeAlert(), ctx)).toBe(true)
        expect(isAutoMajorEligible(makeAlert(), ctx)).toBe(false)
        expect(isTransitiveOnlyCrossMajor(makeAlert(), ctx)).toBe(false)
    })

    it('开关开 + 根直接依赖 + 单实例 → 自动准入（不算人工）', () => {
        const ctx = createCrossMajorContext({ workDir, config: { allowMajorUpgrade: true } })
        expect(isAutoMajorEligible(makeAlert(), ctx)).toBe(true)
        expect(isManualCrossMajorAlert(makeAlert(), ctx)).toBe(false)
    })

    it('dependencyType 优先：direct 的成员包直赖不算 transitive-only', () => {
        writeFileSync(join(workDir, 'pnpm-lock.yaml'), [
            'lockfileVersion: \'9.0\'',
            '',
            '  chokidar@3.6.0:',
            '    resolution: {integrity: sha512-c}',
            '',
        ].join('\n'))
        const ctx = createCrossMajorContext({ workDir, config: { allowMajorUpgrade: true } })
        // 非根直接依赖但 dependencyType=direct（workspace 成员直接依赖）→ 不得标 transitive-only
        const memberDirect = makeAlert({ packageName: 'chokidar', dependencyType: 'direct' })
        expect(isTransitiveOnlyCrossMajor(memberDirect, ctx)).toBe(false)
        expect(isManualCrossMajorAlert(memberDirect, ctx)).toBe(true)
    })

    it('dependencyType 优先：transitive 的根直接同名包仍记 transitive-only', () => {
        const ctx = createCrossMajorContext({ workDir, config: { allowMajorUpgrade: true } })
        // 根直接依赖但 dependencyType=transitive（同名包的另一实例）→ 按传递依赖处理
        const transitive = makeAlert({ dependencyType: 'transitive' })
        expect(isTransitiveOnlyCrossMajor(transitive, ctx)).toBe(true)
    })

    it('开关开但仅传递依赖 → 仍按人工，并归因为 transitive-only', () => {
        // 传递依赖也要在 lockfile 里有实例（否则不构成「需跨 major」的判定对象）
        writeFileSync(join(workDir, 'pnpm-lock.yaml'), [
            'lockfileVersion: \'9.0\'',
            '',
            '  chokidar@3.6.0:',
            '    resolution: {integrity: sha512-c}',
            '',
        ].join('\n'))
        const ctx = createCrossMajorContext({ workDir, config: { allowMajorUpgrade: true } })
        const transitive = makeAlert({ packageName: 'chokidar' })
        expect(isAutoMajorEligible(transitive, ctx)).toBe(false)
        expect(isTransitiveOnlyCrossMajor(transitive, ctx)).toBe(true)
        expect(isManualCrossMajorAlert(transitive, ctx)).toBe(true)
    })
})

describe('assessLockfileWork（基线前置）', () => {
    let workDir: string

    beforeEach(() => {
        workDir = mkdtempSync(join(tmpdir(), 'dependfix-cross-major-'))
        writeFileSync(join(workDir, 'package.json'), JSON.stringify({
            name: 'fixture',
            version: '1.0.0',
            dependencies: { vite: '^5.0.0' },
        }, null, 2))
    })

    afterEach(() => {
        rmSync(workDir, { recursive: true, force: true })
    })

    it('全部为人工跨 major → 无可写工作', () => {
        writeFileSync(join(workDir, 'pnpm-lock.yaml'), [
            'lockfileVersion: \'9.0\'',
            '',
            '  vite@5.4.14:',
            '    resolution: {integrity: sha512-a}',
            '',
        ].join('\n'))
        const ctx = createCrossMajorContext({ workDir, config: { allowMajorUpgrade: false } })
        const work = assessLockfileWork([makeAlert()], ctx)
        expect(work.noWritableWork).toBe(true)
        expect(work.manual).toHaveLength(1)
        expect(work.convergedMixed).toHaveLength(0)
    })

    it('混合实例但低实例已不在受影响区间 → 视为已收敛，无可写工作', () => {
        writeFileSync(join(workDir, 'pnpm-lock.yaml'), [
            'lockfileVersion: \'9.0\'',
            '',
            '  vite@5.4.14:',
            '    resolution: {integrity: sha512-a}',
            '',
            '  vite@6.4.3:',
            '    resolution: {integrity: sha512-b}',
            '',
        ].join('\n'))
        const ctx = createCrossMajorContext({ workDir, config: { allowMajorUpgrade: false } })
        const alert = makeAlert({ vulnerableRange: '>=6.0.0 <6.4.3' })
        expect(isNonWritableMixedInstance(alert, [alert], ctx)).toBe(true)
        const work = assessLockfileWork([alert], ctx)
        expect(work.noWritableWork).toBe(true)
        expect(work.convergedMixed).toHaveLength(1)
    })

    it('最高实例未达标：即使低实例不在区间也不得判「无可写工作」（链路会常规升级写盘）', () => {
        writeFileSync(join(workDir, 'pnpm-lock.yaml'), [
            'lockfileVersion: \'9.0\'',
            '',
            '  vite@5.0.0:',
            '    resolution: {integrity: sha512-a}',
            '',
        ].join('\n'))
        const ctx = createCrossMajorContext({ workDir, config: { allowMajorUpgrade: false } })
        const alert = makeAlert({ recommendedVersion: '5.0.1', vulnerableRange: '< 5.0.0' })
        expect(isNonWritableMixedInstance(alert, [alert], ctx)).toBe(false)
        expect(assessLockfileWork([alert], ctx).noWritableWork).toBe(false)
    })

    it('真实 GitHub 逗号区间可解析（不得整体落到保守 true）', () => {
        expect(isVersionAffected('4.0.0', '>= 1.0.0, < 4.17.21')).toBe(true)
        expect(isVersionAffected('4.17.21', '>= 1.0.0, < 4.17.21')).toBe(false)
        expect(isVersionAffected('3.0.0', '>= 4.0.0, < 4.19.1')).toBe(false)
    })

    it('混合实例且低实例仍受影响：单条 advisory 不覆盖低 major → 仍无可写工作（group 路径按 mixed-instance 跳过）', () => {
        writeFileSync(join(workDir, 'pnpm-lock.yaml'), [
            'lockfileVersion: \'9.0\'',
            '',
            '  vite@5.4.14:',
            '    resolution: {integrity: sha512-a}',
            '',
            '  vite@6.4.3:',
            '    resolution: {integrity: sha512-b}',
            '',
        ].join('\n'))
        const ctx = createCrossMajorContext({ workDir, config: { allowMajorUpgrade: false } })
        const alert = makeAlert({ vulnerableRange: '< 6.4.3' })
        // 低 major（5）线没有目标 → 版本化 override 不写盘 → 前置判「无工作」是安全的
        expect(isNonWritableMixedInstance(alert, [alert], ctx)).toBe(true)
        expect(assessLockfileWork([alert], ctx).noWritableWork).toBe(true)
    })

    it('同包另一条 advisory 覆盖低 major → 版本化 override 会写盘，不得跳过基线', () => {
        writeFileSync(join(workDir, 'pnpm-lock.yaml'), [
            'lockfileVersion: \'9.0\'',
            '',
            '  vite@5.4.14:',
            '    resolution: {integrity: sha512-a}',
            '',
            '  vite@6.4.3:',
            '    resolution: {integrity: sha512-b}',
            '',
        ].join('\n'))
        const ctx = createCrossMajorContext({ workDir, config: { allowMajorUpgrade: false } })
        const highMajor = makeAlert({ id: 1, recommendedVersion: '6.4.3', vulnerableRange: '< 6.4.3' })
        const lowMajor = makeAlert({ id: 2, recommendedVersion: '5.4.20', vulnerableRange: '< 5.4.20' })
        expect(hasWritableOverrideWork([highMajor, lowMajor], ['5.4.14'])).toBe(true)
        expect(isNonWritableMixedInstance(highMajor, [highMajor, lowMajor], ctx)).toBe(false)
        expect(assessLockfileWork([highMajor, lowMajor], ctx).noWritableWork).toBe(false)
    })
})
