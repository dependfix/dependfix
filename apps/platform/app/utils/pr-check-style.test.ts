import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { checkAttributionI18nKey, checkAttributionTone, conclusionTagTone, shouldShowAttribution } from './pr-check-style'

describe('conclusionTagTone', () => {
    describe('danger（CI 异常失败）', () => {
        it('failure → danger', () => {
            expect(conclusionTagTone('failure')).toBe('danger')
        })
        it('timed_out → danger', () => {
            expect(conclusionTagTone('timed_out')).toBe('danger')
        })
        it('action_required → danger', () => {
            expect(conclusionTagTone('action_required')).toBe('danger')
        })
    })

    describe('success', () => {
        it('success → success', () => {
            expect(conclusionTagTone('success')).toBe('success')
        })
    })

    describe('warning（CI 进行中）', () => {
        it('pending → warning', () => {
            expect(conclusionTagTone('pending')).toBe('warning')
        })
    })

    describe('primary（中性 / 已关闭）', () => {
        it('neutral → primary', () => {
            expect(conclusionTagTone('neutral')).toBe('primary')
        })
        it('cancelled → primary', () => {
            expect(conclusionTagTone('cancelled')).toBe('primary')
        })
        it('stale → primary', () => {
            expect(conclusionTagTone('stale')).toBe('primary')
        })
        it('skipped → primary', () => {
            expect(conclusionTagTone('skipped')).toBe('primary')
        })
    })
})

describe('checkAttributionTone', () => {
    it('self_caused 最危险；pre_existing / unknown 需人工确认；其余解释性中性', () => {
        expect(checkAttributionTone('self_caused')).toBe('danger')
        expect(checkAttributionTone('pre_existing')).toBe('warning')
        expect(checkAttributionTone('unknown')).toBe('warning')
        expect(checkAttributionTone('external_noise')).toBe('neutral')
        expect(checkAttributionTone('cancelled')).toBe('neutral')
    })
})

describe('checkAttributionI18nKey', () => {
    const locales = ['zh-CN', 'en-US'] as const
    const readLocale = (locale: string): Record<string, unknown> =>
        JSON.parse(readFileSync(join(import.meta.dirname, `../../i18n/locales/${locale}.json`), 'utf8')) as Record<string, unknown>

    it('五类归因映射到字面量键，且两份 locale 均存在该键', () => {
        const attributions = ['self_caused', 'pre_existing', 'external_noise', 'cancelled', 'unknown'] as const
        for (const locale of locales) {
            const messages = readLocale(locale)
            for (const attribution of attributions) {
                const key = checkAttributionI18nKey(attribution)
                // 整路径取值：前两级拼错同样失败
                const value = key.split('.').reduce<unknown>((node, segment) =>
                    (node && typeof node === 'object' ? (node as Record<string, unknown>)[segment] : undefined), messages)
                expect(value, `${locale}:${key}`).toEqual(expect.any(String))
            }
        }
    })

    it('五类归因映射到互不相同的键（防止把某类改指到另一类的文案）', () => {
        const attributions = ['self_caused', 'pre_existing', 'external_noise', 'cancelled', 'unknown'] as const
        const keys = attributions.map((attribution) => checkAttributionI18nKey(attribution))
        expect(new Set(keys).size).toBe(attributions.length)
        expect(checkAttributionI18nKey('self_caused')).toBe('prChecks.signalAttribution.selfCaused')
        expect(checkAttributionI18nKey('external_noise')).toBe('prChecks.signalAttribution.externalNoise')
    })

    it('未知归因回退 unknown 键', () => {
        expect(checkAttributionI18nKey('something_else')).toBe('prChecks.signalAttribution.unknown')
    })
})

describe('shouldShowAttribution', () => {
    it('无归因 / 成功 / 进行中不展示；失败与取消（skipped）展示', () => {
        expect(shouldShowAttribution({ state: 'failure' })).toBe(false)
        expect(shouldShowAttribution({ state: 'success', attribution: 'unknown' })).toBe(false)
        expect(shouldShowAttribution({ state: 'pending', attribution: 'unknown' })).toBe(false)
        expect(shouldShowAttribution({ state: 'failure', attribution: 'self_caused' })).toBe(true)
        expect(shouldShowAttribution({ state: 'skipped', attribution: 'cancelled' })).toBe(true)
        expect(shouldShowAttribution({ state: 'error', attribution: 'external_noise' })).toBe(true)
    })
})
