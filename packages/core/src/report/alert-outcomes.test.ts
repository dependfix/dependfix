import { describe, expect, it } from 'vitest'
import {
    ALERT_FIX_STATUSES,
    alertOutcomeKey,
    buildAlertOutcomes,
    isAlertOutcomeStatus,
    type AlertFixOutcome,
} from './alert-outcomes'
import { isAlertFixedByActions, type FixAction } from './types'
import { makeAction, makeAlert } from './report.test-helpers'

/**
 * 告警级修复结果（RunResult.alertOutcomes）的推导契约：
 * 四态映射、显式记录优先级、键唯一性（含仓库维度）、缺 upstreamId 不落条目。
 */

const outcomeFor = (
    alert: ReturnType<typeof makeAlert>,
    overrides: Partial<AlertFixOutcome> = {},
): AlertFixOutcome => ({
    repository: alert.repository,
    source: alert.source,
    upstreamId: alert.upstreamId,
    manifestPath: alert.manifestPath,
    status: 'converged',
    ...overrides,
})

describe('alertOutcomeKey', () => {
    it('is stable for the same key parts', () => {
        const parts = {
            repository: 'owner/repo',
            source: 'dependabot',
            upstreamId: 'dependabot:1',
            manifestPath: 'package.json',
        }
        expect(alertOutcomeKey(parts)).toBe(alertOutcomeKey(parts))
    })

    it('separates the same upstreamId across repositories (多仓运行不串号)', () => {
        const base = { source: 'dependabot', upstreamId: 'dependabot:42', manifestPath: 'package.json' }
        expect(alertOutcomeKey({ ...base, repository: 'owner/a' }))
            .not.toBe(alertOutcomeKey({ ...base, repository: 'owner/b' }))
    })

    it('separates the same upstreamId with different manifest paths', () => {
        const base = { repository: 'owner/repo', source: 'pnpm-audit', upstreamId: 'pnpm-audit:lodash:abc' }
        expect(alertOutcomeKey({ ...base, manifestPath: 'package.json' }))
            .not.toBe(alertOutcomeKey({ ...base, manifestPath: 'docs/package.json' }))
    })

    it('treats null and undefined manifestPath as the same key', () => {
        const base = { repository: 'owner/repo', source: 'code-quality', upstreamId: 'code-quality:7' }
        expect(alertOutcomeKey({ ...base, manifestPath: null })).toBe(alertOutcomeKey(base))
    })
})

describe('isAlertOutcomeStatus', () => {
    it('accepts only the four conclusion statuses (not-tried 属缺键语义)', () => {
        for (const status of ['success', 'converged', 'failed', 'skipped']) {
            expect(isAlertOutcomeStatus(status)).toBe(true)
        }
        for (const value of ['not-tried', 'pending', 'SUCCESS', '', null, undefined, 1]) {
            expect(isAlertOutcomeStatus(value)).toBe(false)
        }
        // 结论状态是完整取值域的真子集
        expect(ALERT_FIX_STATUSES).toContain('not-tried')
        expect([...ALERT_FIX_STATUSES].filter((status) => status !== 'not-tried'))
            .toEqual(['success', 'converged', 'failed', 'skipped'])
    })
})

describe('buildAlertOutcomes', () => {
    it('derives success from the same predicate as alertsUnfixed', () => {
        const alert = makeAlert({ recommendedVersion: '5.4.21' })
        const outcomes = buildAlertOutcomes([alert], [makeAction({ toVersion: '^5.4.21' })])
        expect(outcomes).toEqual([
            {
                repository: 'owner/repo',
                source: 'dependabot',
                upstreamId: 'dependabot:1',
                manifestPath: 'package.json',
                status: 'success',
                reason: undefined,
            },
        ])
    })

    it('prefers explicit records over derived package-level success (同包两清单)', () => {
        // 同包（vite）两清单：根清单升级到达标版本，docs 清单被显式记为子目录跳过。
        // 包级成功谓词会命中两条（isAlertFixedByActions 无清单维度），显式记录必须胜出。
        const rootAlert = makeAlert({ upstreamId: 'dependabot:1', packageName: 'vite', recommendedVersion: '5.4.21' })
        const subAlert = makeAlert({
            upstreamId: 'dependabot:2',
            manifestPath: 'docs/package.json',
            packageName: 'vite',
            recommendedVersion: '5.4.21',
        })
        const explicit = new Map<string, AlertFixOutcome>([
            [alertOutcomeKey(subAlert), outcomeFor(subAlert, { status: 'skipped', reason: 'subdirectory-manifest' })],
        ])
        const outcomes = buildAlertOutcomes(
            [rootAlert, subAlert],
            [makeAction({ target: 'vite', toVersion: '^5.4.21' })],
            explicit,
        )
        // 包级谓词确实命中两条（否则本用例证明不了优先级）
        expect(isAlertFixedByActions(subAlert, [makeAction({ target: 'vite', toVersion: '^5.4.21' })])).toBe(true)
        expect(outcomes.find((outcome) => outcome.upstreamId === 'dependabot:1')).toMatchObject({ status: 'success' })
        expect(outcomes.find((outcome) => outcome.upstreamId === 'dependabot:2'))
            .toMatchObject({ status: 'skipped', reason: 'subdirectory-manifest' })
    })

    it('keeps explicit skip even when the same package was upgraded for another instance', () => {
        const alert = makeAlert({ packageName: 'vite', recommendedVersion: '5.4.21' })
        // 同包动作成功（包级命中）但该实例被显式记为跨 major 跳过
        const explicit = new Map<string, AlertFixOutcome>([
            [alertOutcomeKey(alert), outcomeFor(alert, { status: 'skipped', reason: 'cross-major' })],
        ])
        const outcomes = buildAlertOutcomes([alert], [makeAction({ target: 'vite', toVersion: '^5.4.21' })], explicit)
        expect(outcomes[0]).toMatchObject({ status: 'skipped', reason: 'cross-major' })
    })

    it('does not let one repository record leak into another with the same upstreamId', () => {
        const alertA = makeAlert({ repository: 'owner/a', upstreamId: 'dependabot:7' })
        const alertB = makeAlert({ repository: 'owner/b', upstreamId: 'dependabot:7' })
        const explicit = new Map<string, AlertFixOutcome>([
            [alertOutcomeKey(alertA), outcomeFor(alertA)],
        ])
        const outcomes = buildAlertOutcomes([alertA, alertB], [], explicit)
        expect(outcomes).toHaveLength(1)
        expect(outcomes[0]).toMatchObject({ repository: 'owner/a', status: 'converged' })
    })

    it('derives failed from a failed upgrade action, excluding non-attributable failures', () => {
        const alert = makeAlert()
        const failed = buildAlertOutcomes([alert], [
            makeAction({ success: false, toVersion: '', error: 'ERESOLVE unable to resolve' }),
        ])
        expect(failed[0]).toMatchObject({ status: 'failed', reason: 'ERESOLVE unable to resolve' })

        // 环境性失败 / 既有失败 / AI 辅助动作都不归因告警结果
        for (const overrides of [
            { environmentalFailure: true },
            { preExisting: true },
            { strategy: 'ai-patch' },
            { noOp: true },
        ] as Partial<FixAction>[]) {
            expect(buildAlertOutcomes([alert], [makeAction({ success: false, ...overrides })])).toEqual([])
        }
    })

    it('derives skipped from noOp policy actions and from non-fixable alerts', () => {
        const alert = makeAlert()
        const protectedAlert = buildAlertOutcomes([alert], [
            makeAction({ success: true, noOp: true, strategy: 'override-protected', toVersion: '4.17.21' }),
        ])
        expect(protectedAlert[0]).toMatchObject({ status: 'skipped', reason: 'override-protected' })

        const repeated = buildAlertOutcomes([alert], [
            makeAction({ success: true, noOp: true, strategy: 'repeated-failure', toVersion: '4.17.21' }),
        ])
        expect(repeated[0]).toMatchObject({ status: 'skipped', reason: 'repeated-failure' })

        // 仍持有推荐版本（如 pnpm-audit / 手工构造）保持 not-fixable
        const notFixable = makeAlert({ fixable: false })
        expect(buildAlertOutcomes([notFixable], [])[0]).toMatchObject({ status: 'skipped', reason: 'not-fixable' })

        // Dependabot 无补丁版本：单独归因，建议 dismiss 而不是混入「不可自动修复」
        const noPatch = makeAlert({ fixable: false, fixStrategy: null, recommendedVersion: '' })
        expect(buildAlertOutcomes([noPatch], [])[0]).toMatchObject({ status: 'skipped', reason: 'no-patch' })

        // 非 Dependabot 源（pnpm-audit / Code Scanning）仍为 not-fixable
        const auditNoPatch = makeAlert({ source: 'pnpm-audit', fixable: false, fixStrategy: null, recommendedVersion: '' })
        expect(buildAlertOutcomes([auditNoPatch], [])[0]).toMatchObject({ status: 'skipped', reason: 'not-fixable' })
    })

    it('omits alerts without a conclusion (not-tried) and alerts without upstreamId', () => {
        const alert = makeAlert()
        expect(buildAlertOutcomes([alert], [])).toEqual([])
        expect(buildAlertOutcomes([makeAlert({ upstreamId: '' })], [
            makeAction({ toVersion: '^4.17.21' }),
        ])).toEqual([])
    })

    it('maps code-scanning outcomes by ruleId + filePath', () => {
        const alert = makeAlert({
            source: 'code-scanning',
            ruleId: 'eol-last',
            manifestPath: 'src/foo.ts',
            packageName: 'eol-last',
            recommendedVersion: '',
            upstreamId: 'code-scanning:9',
        })
        const fixed = buildAlertOutcomes([alert], [
            makeAction({
                type: 'code-scanning-fix',
                target: 'eol-last',
                filePath: 'src/foo.ts',
                toVersion: undefined,
            }),
        ])
        expect(fixed[0]).toMatchObject({ status: 'success', upstreamId: 'code-scanning:9' })

        const failed = buildAlertOutcomes([alert], [
            makeAction({
                type: 'code-scanning-fix',
                target: 'eol-last',
                filePath: 'src/other.ts',
                toVersion: undefined,
                success: false,
                error: 'template mismatch',
            }),
        ])
        // 不同文件 → 不是同一条告警的失败动作
        expect(failed).toEqual([])
    })

    it('treats a noOp code-scanning fix as converged (文件本就合规)', () => {
        const alert = makeAlert({
            source: 'code-scanning',
            ruleId: 'eol-last',
            manifestPath: 'src/foo.ts',
            packageName: 'eol-last',
            recommendedVersion: '',
        })
        const outcomes = buildAlertOutcomes([alert], [
            makeAction({
                type: 'code-scanning-fix',
                target: 'eol-last',
                filePath: 'src/foo.ts',
                toVersion: undefined,
                noOp: true,
            }),
        ])
        expect(outcomes[0]).toMatchObject({ status: 'converged', reason: 'no change needed' })
    })

    it('does not treat a skip(context) noOp code-scanning action as converged (带 error 属无法处理)', () => {
        // skip(reason) 也是 success + noOp，但带 error：无模板 / 路径越界 / 读不到文件 / 模板不适用
        const alert = makeAlert({
            source: 'code-scanning',
            ruleId: 'no-such-rule',
            manifestPath: 'src/foo.ts',
            packageName: 'no-such-rule',
            recommendedVersion: '',
            fixable: false,
        })
        const outcomes = buildAlertOutcomes([alert], [
            makeAction({
                type: 'code-scanning-fix',
                target: 'no-such-rule',
                filePath: 'src/foo.ts',
                toVersion: undefined,
                noOp: true,
                error: 'no fix template for rule "no-such-rule" — falling back to suggestion mode',
            }),
        ])
        expect(outcomes[0]?.status).not.toBe('converged')
        expect(outcomes[0]).toMatchObject({ status: 'skipped', reason: 'not-fixable' })
    })

    it('does not attribute dependency actions to code-quality findings', () => {
        const alert = makeAlert({
            source: 'code-quality',
            packageName: 'lodash',
            ruleId: 'lodash',
            manifestPath: 'src/foo.ts',
            fixable: false,
            recommendedVersion: '',
        })
        const outcomes = buildAlertOutcomes([alert], [
            makeAction({ success: false, target: 'lodash', toVersion: '' }),
        ])
        expect(outcomes[0]).toMatchObject({ status: 'skipped', reason: 'not-fixable' })
    })
})
