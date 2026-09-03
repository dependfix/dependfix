import { describe, expect, it } from 'vitest'
import { conclusionTagSeverity } from './pr-check-style'

describe('conclusionTagSeverity', () => {
    describe('danger（CI 异常失败）', () => {
        it('failure → danger', () => {
            expect(conclusionTagSeverity('failure')).toBe('danger')
        })
        it('timed_out → danger', () => {
            expect(conclusionTagSeverity('timed_out')).toBe('danger')
        })
        it('action_required → danger', () => {
            expect(conclusionTagSeverity('action_required')).toBe('danger')
        })
    })

    describe('success', () => {
        it('success → success', () => {
            expect(conclusionTagSeverity('success')).toBe('success')
        })
    })

    describe('warn（CI 进行中）', () => {
        it('pending → warn', () => {
            expect(conclusionTagSeverity('pending')).toBe('warn')
        })
    })

    describe('info（中性 / 已关闭）', () => {
        it('neutral → info', () => {
            expect(conclusionTagSeverity('neutral')).toBe('info')
        })
        it('cancelled → info', () => {
            expect(conclusionTagSeverity('cancelled')).toBe('info')
        })
        it('stale → info', () => {
            expect(conclusionTagSeverity('stale')).toBe('info')
        })
        it('skipped → info', () => {
            expect(conclusionTagSeverity('skipped')).toBe('info')
        })
    })
})
