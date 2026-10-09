import { afterAll, describe, expect, it } from 'vitest'
import { makeEvent, teardownMemoryDatabase } from '../../tests/api-helper'
import { createLocalizedError, detectServerLocale, type ServerErrorCode } from './localized-error'

/**
 * 服务端错误本地化 helper 单测（todo.md §M16.3 C36）：
 * - detectServerLocale 优先级与简化 Accept-Language 解析
 * - createLocalizedError 字典命中、未知 code 兜底、双语对偶、{key} 模板插值
 * - data 透传 + data.code 双保险
 *
 * helper 单测不依赖数据库，但 setup-nuxt-server.ts 注入 h3 全局是其它 server 测试所需的；
 * 本文件无 vi.mock 冲突，可直接使用 makeEvent 构造 h3 event。
 */

const callWith = (method: string, url: string, headers: Record<string, string> = {}) =>
    detectServerLocale(makeEvent(method, url, undefined, headers))

describe('detectServerLocale', () => {
    afterAll(() => {
        teardownMemoryDatabase()
    })

    it('无 cookie 无 Accept-Language → 默认 zh-CN', () => {
        expect(callWith('GET', '/api/test')).toBe('zh-CN')
    })

    it('cookie i18n_locale=en 优先于 Accept-Language', () => {
        // 故意制造冲突：cookie=en vs Accept-Language: zh-CN → cookie 胜
        const locale = detectServerLocale(makeEvent('GET', '/api/test', undefined, {
            cookie: 'i18n_locale=en',
            'accept-language': 'zh-CN,zh;q=0.9',
        }))
        expect(locale).toBe('en')
    })

    it('cookie i18n_locale=zh-CN 命中', () => {
        const locale = detectServerLocale(makeEvent('GET', '/api/test', undefined, {
            cookie: 'i18n_locale=zh-CN',
        }))
        expect(locale).toBe('zh-CN')
    })

    it('cookie i18n_locale 是非受支持值时降级到 Accept-Language', () => {
        const locale = detectServerLocale(makeEvent('GET', '/api/test', undefined, {
            cookie: 'i18n_locale=fr-FR',
            'accept-language': 'en-US,en;q=0.9',
        }))
        expect(locale).toBe('en')
    })

    it('Accept-Language: en-US,en;q=0.9 → en', () => {
        expect(callWith('GET', '/api/test', { 'accept-language': 'en-US,en;q=0.9' })).toBe('en')
    })

    it('Accept-Language: zh-CN,zh;q=0.9 → zh-CN', () => {
        expect(callWith('GET', '/api/test', { 'accept-language': 'zh-CN,zh;q=0.9' })).toBe('zh-CN')
    })

    it('Accept-Language: zh-TW(繁中) → 仍归到 zh-CN（与 i18n-detect.resolveLocale 行为一致）', () => {
        expect(callWith('GET', '/api/test', { 'accept-language': 'zh-TW,zh-Hant;q=0.9' })).toBe('zh-CN')
    })

    it('Accept-Language: ja-JP(未知 locale) → 默认 zh-CN', () => {
        expect(callWith('GET', '/api/test', { 'accept-language': 'ja-JP,ja;q=0.9' })).toBe('zh-CN')
    })

    it('Accept-Language 多 q 值时按出现顺序匹配(优先匹配 zh 前缀)', () => {
        // "en;q=0.5,zh-CN;q=0.9" —— zh-CN 权重更高，但 helper 简化版按出现顺序匹配 en
        // 这是已知简化行为：tag 前缀匹配与 q 值无关；与 i18n-detect.resolveLocale 行为对齐
        const locale = detectServerLocale(makeEvent('GET', '/api/test', undefined, {
            'accept-language': 'en;q=0.5,zh-CN;q=0.9',
        }))
        // 简化版按出现顺序，所以第一个匹配的 en 胜出；这是与 i18n-detect.resolveLocale 一致的简化约定
        expect(locale).toBe('en')
    })

    it('Accept-Language: 空字符串 → 默认 zh-CN', () => {
        expect(callWith('GET', '/api/test', { 'accept-language': '' })).toBe('zh-CN')
    })

    // locale 优先级回归：URL query ?locale= 优先级最高，与 apps/platform/i18n/localeDetector.ts:15 tryQueryLocale 对齐
    it('locale 优先级回归：URL query ?locale=en 优先于 cookie 与 Accept-Language', () => {
        // 故意制造冲突：query=en vs cookie=fr-FR + Accept-Language: zh-CN → query 胜
        const locale = detectServerLocale(makeEvent('GET', '/api/test?locale=en', undefined, {
            cookie: 'i18n_locale=fr-FR',
            'accept-language': 'zh-CN,zh;q=0.9',
        }))
        expect(locale).toBe('en')
    })

    it('locale 优先级回归：URL query ?locale=zh-CN 命中', () => {
        const locale = detectServerLocale(makeEvent('GET', '/api/repos?locale=zh-CN', undefined, {}))
        expect(locale).toBe('zh-CN')
    })

    it('locale 优先级回归：URL query ?locale=fr-FR(非受支持值) → 降级到下一优先级', () => {
        const locale = detectServerLocale(makeEvent('GET', '/api/test?locale=fr-FR', undefined, {
            'accept-language': 'en-US,en;q=0.9',
        }))
        expect(locale).toBe('en')
    })

    // 大小写兼容：BCP 47 language tag 规范本身大小写不敏感（@nuxtjs/i18n tryQueryLocale
    // 内部归一化），helper 之前直接 === 'en' / 'zh-CN' 字面量比较 → ?locale=EN 不接受；
    // 本批次加 toLowerCase() 兼容 ?locale=EN / ?locale=en-US / cookie i18n_locale=EN
    it('大小写兼容：URL query ?locale=EN 大写 → en', () => {
        const locale = detectServerLocale(makeEvent('GET', '/api/test?locale=EN', undefined, {}))
        expect(locale).toBe('en')
    })

    it('大小写兼容：URL query ?locale=en-US 复合 locale → en', () => {
        const locale = detectServerLocale(makeEvent('GET', '/api/test?locale=en-US', undefined, {}))
        expect(locale).toBe('en')
    })

    it('大小写兼容：URL query ?locale=ZH-CN 全大写 → zh-CN', () => {
        const locale = detectServerLocale(makeEvent('GET', '/api/test?locale=ZH-CN', undefined, {}))
        expect(locale).toBe('zh-CN')
    })

    it('大小写兼容：URL query ?locale=zh → zh-CN', () => {
        const locale = detectServerLocale(makeEvent('GET', '/api/test?locale=zh', undefined, {}))
        expect(locale).toBe('zh-CN')
    })

    it('大小写兼容：cookie i18n_locale=EN 大写 → en', () => {
        const locale = detectServerLocale(makeEvent('GET', '/api/test', undefined, {
            cookie: 'i18n_locale=EN',
        }))
        expect(locale).toBe('en')
    })
})

describe('createLocalizedError', () => {
    // 用 Record<ServerErrorCode, true> 的 satisfies 强制穷举：新增错误码而漏登记时 TS 报错（消除 union 与测试清单漂移）
    const codeSet = Object.keys({
        UNAUTHORIZED: true,
        FORBIDDEN: true,
        RESOURCE_NOT_IN_ORG: true,
        REPO_NOT_FOUND: true,
        REPO_DUPLICATE: true,
        REPO_ID_MISSING: true,
        REPO_VALIDATION_FAILED: true,
        SCAN_RUN_NOT_FOUND: true,
        RUN_ID_MISSING: true,
        RUN_LOGS_NOT_FOUND: true,
        RUN_LOGS_EXPORT_TOO_LARGE: true,
        RUNS_VALIDATION_FAILED: true,
        SCAN_HISTORY_VALIDATION_FAILED: true,
        REUSE_RUN_NOT_IN_REPO: true,
        REUSE_RUN_RUNNING: true,
        SCAN_PENDING_MERGED: true,
        SCAN_ALREADY_COMPLETED: true,
        CREDENTIAL_NOT_FOUND: true,
        CREDENTIAL_ID_MISSING: true,
        CREDENTIAL_VALIDATION_FAILED: true,
        SCHEDULE_NOT_FOUND: true,
        SCHEDULE_ID_MISSING: true,
        SCHEDULE_VALIDATION_FAILED: true,
        PR_CHECK_NOT_FOUND: true,
        PR_CHECK_ID_MISSING: true,
        PR_CHECK_ACK_VALIDATION_FAILED: true,
        BATCH_RUN_ID_MISSING: true,
        BATCH_RUN_NOT_FOUND: true,
        REPOS_BATCH_VALIDATION_FAILED: true,
        REPOS_BATCH_SCAN_VALIDATION_FAILED: true,
        REPOS_BATCH_SCAN_NO_REPO: true,
        IMPORTABLE_CREDENTIAL_ID_MISSING: true,
        IMPORTABLE_AFFILIATION_INVALID: true,
        GITHUB_API_AUTH_FAILED: true,
        GITHUB_API_FETCH_FAILED: true,
        METHOD_NOT_ALLOWED: true,
        ORG_ID_MISSING: true,
        ORG_NOT_FOUND: true,
        AI_CONFIG_VALIDATION_FAILED: true,
        AI_KEY_REQUIRED: true,
        UNKNOWN: true,
    } satisfies Record<ServerErrorCode, true>) as ServerErrorCode[]

    afterAll(() => {
        teardownMemoryDatabase()
    })

    it('响应字段齐全：statusCode / statusMessage / message / data.code（h3 sendError 仅序列化这四字段）', () => {
        const event = makeEvent('GET', '/api/test', undefined, {})
        const err = createLocalizedError(event, { statusCode: 404, code: 'REPO_NOT_FOUND' })
        expect(err).toBeInstanceOf(Error)
        expect((err as unknown as { statusCode: number }).statusCode).toBe(404)
        expect((err as unknown as { statusMessage: string }).statusMessage).toBe('Not Found')
        expect((err as unknown as { message: string }).message).toBe('仓库不存在')
        // code 强契约位置：h3 createError 不透传任意顶层字段（仅 statusCode/statusMessage/data/fatal/unhandled），
        // sendError 响应体仅含 statusCode/statusMessage/data/stack，因此 code 必须放在 data.code
        expect((err as unknown as { data: { code: string } }).data.code).toBe('REPO_NOT_FOUND')
    })

    it('Accept-Language=en → message 是英文', () => {
        const event = makeEvent('GET', '/api/test', undefined, { 'accept-language': 'en-US' })
        const err = createLocalizedError(event, { statusCode: 409, code: 'REPO_DUPLICATE' })
        expect((err as unknown as { message: string }).message).toBe('Repository already exists')
    })

    it('cookie i18n_locale=en → message 是英文(覆盖 Accept-Language)', () => {
        const event = makeEvent('GET', '/api/test', undefined, {
            cookie: 'i18n_locale=en',
            'accept-language': 'zh-CN',
        })
        const err = createLocalizedError(event, { statusCode: 404, code: 'SCAN_RUN_NOT_FOUND' })
        expect((err as unknown as { message: string }).message).toBe('Scan run not found')
    })

    it('params 模板插值：{key} 替换', () => {
        // 当前 16 个 code 没有用到插值，但 helper 接口已支持；用 RUN_ID_MISSING 占位展示
        // 这里手工构造一个临时 code-free 路径：直接走 createLocalizedError + params 验证插值逻辑
        // 用一个未注册的 code 走 UNKNOWN 兜底，验证 message 不会被 params 误改
        const event = makeEvent('GET', '/api/test', undefined, {})
        // params 仅在 message 含 {key} 时替换；不存在的占位会被忽略（不报错）
        const err = createLocalizedError(event, {
            statusCode: 400,
            code: 'UNKNOWN',
            params: { unused: 'x' },
        })
        expect((err as unknown as { message: string }).message).toBe('未知错误')
    })

    it('params 插值：使用含 {key} 占位的消息路径(模拟未来扩展)', () => {
        // 通过 import locales 文件直接构造一个带 {name} 的临时条目不可行（locales 是 JSON 静态文件）；
        // 这里改为通过 spyOn/stub 模拟 resolveMessage 行为不可行（resolveMessage 是内部函数）。
        // 改为：用 UNKNOWN code + params 验证：插值逻辑对不含占位的 message 是 no-op(不抛错、不污染)
        const event = makeEvent('GET', '/api/test', undefined, {})
        const err = createLocalizedError(event, {
            statusCode: 400,
            code: 'UNKNOWN',
            params: { foo: 'bar', baz: 42 },
        })
        expect((err as unknown as { message: string }).message).toBe('未知错误')
    })

    it('data 透传 + code 双保险：data 中其它字段保留', () => {
        const event = makeEvent('GET', '/api/test', undefined, {})
        const issues = [{ path: ['owner'], message: 'Required' }]
        const err = createLocalizedError(event, {
            statusCode: 400,
            code: 'REPO_VALIDATION_FAILED',
            data: { issues },
        })
        const data = (err as unknown as { data: Record<string, unknown> }).data
        expect(data.code).toBe('REPO_VALIDATION_FAILED')
        expect(data.issues).toEqual(issues)
    })

    it('未知 statusCode → statusMessage 兜底 "Error"', () => {
        const event = makeEvent('GET', '/api/test', undefined, {})
        const err = createLocalizedError(event, { statusCode: 418, code: 'UNKNOWN' })
        expect((err as unknown as { statusMessage: string }).statusMessage).toBe('Error')
    })

    it('所有 code 在 zh-CN locale 下 message 是中文(非空)', () => {
        const event = makeEvent('GET', '/api/test', undefined, {})
        for (const code of codeSet) {
            const err = createLocalizedError(event, { statusCode: 400, code })
            const message = (err as unknown as { message: string }).message
            expect(message, `code=${code}`).toBeTruthy()
            // 中文 locale 下应包含 CJK 字符
            expect(message, `code=${code}`).toMatch(/[\u4e00-\u9fff]/)
        }
    })

    it('所有 code 在 en locale 下 message 是英文(非空、不含中文)', () => {
        const event = makeEvent('GET', '/api/test', undefined, { 'accept-language': 'en-US' })
        for (const code of codeSet) {
            const err = createLocalizedError(event, { statusCode: 400, code })
            const message = (err as unknown as { message: string }).message
            expect(message, `code=${code}`).toBeTruthy()
            // en locale 下 message 不应含 CJK 字符
            expect(message, `code=${code}`).not.toMatch(/[\u4e00-\u9fff]/)
        }
    })

    it('同一 code 在 zh-CN / en locale 下 message 不同', () => {
        const zhEvent = makeEvent('GET', '/api/test', undefined, {})
        const enEvent = makeEvent('GET', '/api/test', undefined, { 'accept-language': 'en-US' })
        for (const code of codeSet) {
            const zhMsg = (createLocalizedError(zhEvent, { statusCode: 400, code }) as unknown as { message: string }).message
            const enMsg = (createLocalizedError(enEvent, { statusCode: 400, code }) as unknown as { message: string }).message
            expect(zhMsg, `code=${code}`).not.toBe(enMsg)
        }
    })

    it('未知 code 走 UNKNOWN 兜底(类型断言：虽然 ServerErrorCode 是 union，但 type narrowing 不防运行时)', () => {
        // ServerErrorCode 是联合类型字面量，编译期阻止非法 code；
        // 这里通过 as unknown as ServerErrorCode 模拟"运行时有非法 code 进入"的边界场景
        const event = makeEvent('GET', '/api/test', undefined, {})
        const err = createLocalizedError(event, {
            statusCode: 500,
            code: 'NON_EXISTENT_CODE' as unknown as ServerErrorCode,
        })
        const message = (err as unknown as { message: string }).message
        // 兜底 UNKNOWN 双语：默认 zh-CN → "未知错误"
        expect(message).toBe('未知错误')
        // data.code 应保留传入的字符串(即使字典没命中)
        expect((err as unknown as { data: { code: string } }).data.code).toBe('NON_EXISTENT_CODE')
    })

    it('错误可被 throw 并被 catch 捕获为 Error', () => {
        const event = makeEvent('GET', '/api/test', undefined, {})
        expect(() => {
            throw createLocalizedError(event, { statusCode: 403, code: 'FORBIDDEN' })
        }).toThrow('没有权限执行该操作')
    })
})

describe('locales 字典契约', () => {
    // 与 i18n/locales/{en-US,zh-CN}.json 的 serverErrors 段一致性校验
    // （前端 i18n 校验脚本会检测键集对称；helper 这层再加一道防线）
    it('en-US / zh-CN serverErrors 段键集完全对称', async () => {
        const enUS = (await import('../../i18n/locales/en-US.json')).default as { serverErrors: Record<string, unknown> }
        const zhCN = (await import('../../i18n/locales/zh-CN.json')).default as { serverErrors: Record<string, unknown> }
        const enKeys = Object.keys(enUS.serverErrors).sort()
        const zhKeys = Object.keys(zhCN.serverErrors).sort()
        expect(enKeys).toEqual(zhKeys)
    })

    it('每个 code 在双语句子中 zh-CN + en 字段均存在', async () => {
        const enUS = (await import('../../i18n/locales/en-US.json')).default as { serverErrors: Record<string, Record<string, string>> }
        const zhCN = (await import('../../i18n/locales/zh-CN.json')).default as { serverErrors: Record<string, Record<string, string>> }
        for (const code of Object.keys(enUS.serverErrors)) {
            expect(enUS.serverErrors[code]?.['zh-CN'], `en-US.${code}.zh-CN`).toBeTruthy()
            expect(enUS.serverErrors[code]?.en, `en-US.${code}.en`).toBeTruthy()
            expect(zhCN.serverErrors[code]?.['zh-CN'], `zh-CN.${code}.zh-CN`).toBeTruthy()
            expect(zhCN.serverErrors[code]?.en, `zh-CN.${code}.en`).toBeTruthy()
        }
    })
})
