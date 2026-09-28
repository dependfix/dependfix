import { describe, expect, it } from 'vitest'
import { conclusionTagTone } from './pr-check-style'

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
