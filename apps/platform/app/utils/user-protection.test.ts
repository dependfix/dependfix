import { describe, expect, it } from 'vitest'
import { isSelfTarget } from './user-protection'

describe('isSelfTarget（用户管理 self-mutation 拦截）', () => {
    it('目标用户 ID === 当前用户 ID → 视为 self', () => {
        expect(isSelfTarget('user-1', 'user-1')).toBe(true)
    })

    it('目标用户 ID !== 当前用户 ID → 非 self', () => {
        expect(isSelfTarget('user-1', 'user-2')).toBe(false)
    })

    it('当前用户 ID 为 null（未登录）→ 非 self（避免误判）', () => {
        expect(isSelfTarget('user-1', null)).toBe(false)
    })

    it('当前用户 ID 为 undefined（session 未就绪）→ 非 self（避免误判）', () => {
        expect(isSelfTarget('user-1', undefined)).toBe(false)
    })

    it('当前用户 ID 为空串 → 非 self（按 null-safe 规则，falsy 一律 false）', () => {
        expect(isSelfTarget('user-1', '')).toBe(false)
    })

    it('目标/当前用户 ID 均为空串 → 非 self（null-safe 兜底，避免误判）', () => {
        expect(isSelfTarget('', '')).toBe(false)
    })
})
