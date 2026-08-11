import { describe, expect, it } from 'vitest'
import { resolveLocale } from './i18n-detect'

const DEFAULT = 'zh-CN'

describe('resolveLocale（语言检测优先级纯函数）', () => {
    it('URL 前缀/query 优先于 Cookie', () => {
        expect(resolveLocale(['en', 'zh-CN'], DEFAULT)).toBe('en')
    })

    it('Cookie 优先于 Accept-Language', () => {
        expect(resolveLocale([null, 'en', 'zh-CN'], DEFAULT)).toBe('en')
    })

    it('Accept-Language 优先于默认 locale', () => {
        expect(resolveLocale([null, null, 'en'], DEFAULT)).toBe('en')
    })

    it('全部候选为空时回退默认 locale', () => {
        expect(resolveLocale([null, '', undefined], DEFAULT)).toBe('zh-CN')
    })

    it('空候选列表回退默认 locale', () => {
        expect(resolveLocale([], DEFAULT)).toBe('zh-CN')
    })

    it('默认 locale 为空时返回空串（调用方兜底）', () => {
        expect(resolveLocale([null], '')).toBe('')
    })

    it('候选为 zh-CN 时命中默认语言', () => {
        expect(resolveLocale(['zh-CN', 'en'], DEFAULT)).toBe('zh-CN')
    })
})
