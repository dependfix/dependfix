import { describe, expect, it } from 'vitest'
import { renderTemplate, DEFAULT_LOCALE, type MailTemplateKind, type MailLocale } from './templates'

const ALL_LOCALES: MailLocale[] = ['en-US', 'zh-CN']
const ALL_KINDS: MailTemplateKind[] = ['verification', 'reset-password', 'change-email']

describe('renderTemplate', () => {
    it('DEFAULT_LOCALE = en-US', () => {
        expect(DEFAULT_LOCALE).toBe('en-US')
    })

    it.each(ALL_LOCALES)('渲染 %s verification 模板', (locale) => {
        const result = renderTemplate(locale, 'verification', {
            email: 'user@example.com',
            url: 'https://app.example.com/verify?token=abc',
            appName: 'dependfix',
        })
        expect(result.subject.length).toBeGreaterThan(0)
        expect(result.html).toContain('<!DOCTYPE html>')
        expect(result.html).toContain('https://app.example.com/verify?token=abc')
        expect(result.html).toContain('user@example.com') // body 或 fallback 中
        expect(result.text).toContain('https://app.example.com/verify?token=abc')
    })

    it.each(ALL_LOCALES)('渲染 %s reset-password 模板', (locale) => {
        const result = renderTemplate(locale, 'reset-password', {
            email: 'user@example.com',
            url: 'https://app.example.com/reset?token=xyz',
        })
        expect(result.html).toContain('https://app.example.com/reset?token=xyz')
        expect(result.text).toContain('https://app.example.com/reset?token=xyz')
    })

    it.each(ALL_LOCALES)('渲染 %s change-email 模板（含 newEmail 字段）', (locale) => {
        const result = renderTemplate(locale, 'change-email', {
            email: 'old@example.com',
            newEmail: 'new@example.com',
            url: 'https://app.example.com/confirm?token=ccc',
        })
        expect(result.html).toContain('new@example.com')
        expect(result.text).toContain('new@example.com')
    })

    describe('边界', () => {
        it.each(ALL_KINDS)('缺失 email → 抛错 MAIL_TEMPLATE_INVALID（fail-closed）', (kind) => {
            expect(() => renderTemplate('en-US', kind, {
                email: '',
                url: 'https://example.com',
            })).toThrow(/MAIL_TEMPLATE_INVALID/)
        })

        it.each(ALL_KINDS)('缺失 url → 抛错 MAIL_TEMPLATE_INVALID', (kind) => {
            expect(() => renderTemplate('en-US', kind, {
                email: 'user@example.com',
                url: '',
            })).toThrow(/MAIL_TEMPLATE_INVALID/)
        })

        it('HTML 转义：appName 含 HTML 标签不解析', () => {
            const result = renderTemplate('en-US', 'verification', {
                email: 'user@example.com',
                url: 'https://example.com',
                appName: '<script>alert(1)</script>',
            })
            expect(result.html).not.toContain('<script>alert(1)</script>')
            expect(result.html).toContain('&lt;script&gt;')
        })

        it('HTML 转义：url 含引号不破坏属性', () => {
            const result = renderTemplate('en-US', 'verification', {
                email: 'user@example.com',
                url: 'https://example.com/?q="x"',
            })
            expect(result.html).not.toContain('href="https://example.com/?q="x""')
            expect(result.html).toContain('&quot;')
        })

        describe('URL scheme 白名单（W1 防御纵深）', () => {
            it('javascript: scheme → 抛错 MAIL_TEMPLATE_INVALID（fail-closed）', () => {
                expect(() => renderTemplate('en-US', 'verification', {
                    email: 'user@example.com',
                    url: 'javascript:fetch("https://evil.com")',
                })).toThrow(/MAIL_TEMPLATE_INVALID.*scheme/)
            })

            it('data: scheme → 抛错 MAIL_TEMPLATE_INVALID', () => {
                expect(() => renderTemplate('en-US', 'verification', {
                    email: 'user@example.com',
                    url: 'data:text/html,<script>alert(1)</script>',
                })).toThrow(/MAIL_TEMPLATE_INVALID.*scheme/)
            })

            it('vbscript: scheme → 抛错 MAIL_TEMPLATE_INVALID', () => {
                expect(() => renderTemplate('en-US', 'verification', {
                    email: 'user@example.com',
                    url: 'vbscript:msgbox(1)',
                })).toThrow(/MAIL_TEMPLATE_INVALID.*scheme/)
            })

            it('无 scheme（相对路径）→ 抛错 MAIL_TEMPLATE_INVALID', () => {
                expect(() => renderTemplate('en-US', 'verification', {
                    email: 'user@example.com',
                    url: '/verify?token=abc',
                })).toThrow(/MAIL_TEMPLATE_INVALID/)
            })

            it('scheme 大小写不敏感：HTTPS: 与 https: 均允许', () => {
                expect(() => renderTemplate('en-US', 'verification', {
                    email: 'user@example.com',
                    url: 'HTTPS://example.com',
                })).not.toThrow()
                expect(() => renderTemplate('en-US', 'verification', {
                    email: 'user@example.com',
                    url: 'Http://example.com',
                })).not.toThrow()
            })
        })

        it('html lang 属性跟随 locale（W3 i18n 可访问性）', () => {
            const en = renderTemplate('en-US', 'verification', {
                email: 'user@example.com',
                url: 'https://example.com',
            })
            const zh = renderTemplate('zh-CN', 'verification', {
                email: 'user@example.com',
                url: 'https://example.com',
            })
            expect(en.html).toMatch(/<html\s+lang="en-US">/)
            expect(zh.html).toMatch(/<html\s+lang="zh-CN">/)
        })

        it('默认 appName = dependfix', () => {
            const result = renderTemplate('en-US', 'verification', {
                email: 'user@example.com',
                url: 'https://example.com',
            })
            expect(result.html).toContain('dependfix')
        })

        it('默认 expirationMinutes = 60', () => {
            const result = renderTemplate('en-US', 'verification', {
                email: 'user@example.com',
                url: 'https://example.com',
            })
            // 60 minutes 出现在文案中
            expect(result.text).toMatch(/60\s*(minutes|分钟)/)
        })

        it('自定义 expirationMinutes', () => {
            const result = renderTemplate('en-US', 'verification', {
                email: 'user@example.com',
                url: 'https://example.com',
                expirationMinutes: 30,
            })
            expect(result.text).toMatch(/30\s*minutes/)
        })
    })

    describe('i18n 双语', () => {
        it('en-US 与 zh-CN 文案不同', () => {
            const en = renderTemplate('en-US', 'verification', {
                email: 'user@example.com',
                url: 'https://example.com',
            })
            const zh = renderTemplate('zh-CN', 'verification', {
                email: 'user@example.com',
                url: 'https://example.com',
            })
            expect(en.subject).not.toBe(zh.subject)
            expect(en.html).not.toBe(zh.html)
        })

        it('en-US 文案含英文标识', () => {
            const result = renderTemplate('en-US', 'verification', {
                email: 'user@example.com',
                url: 'https://example.com',
            })
            expect(result.subject).toMatch(/Verify/i)
        })

        it('zh-CN 文案含中文标识', () => {
            const result = renderTemplate('zh-CN', 'verification', {
                email: 'user@example.com',
                url: 'https://example.com',
            })
            expect(result.subject).toMatch(/验证/)
        })
    })
})
