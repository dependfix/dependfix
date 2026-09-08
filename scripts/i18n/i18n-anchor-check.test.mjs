import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
    findSuspiciousMatches,
    loadLocaleMap,
    main,
    shouldIgnore,
} from './i18n-anchor-check.mjs'

const writeLocale = (root, localeName, content) => {
    const dir = resolve(root, 'locales')
    mkdirSync(dir, { recursive: true })
    writeFileSync(resolve(dir, `${localeName}.json`), JSON.stringify(content, null, 4))
}

let root

beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'i18n-anchor-check-test-'))
})

afterEach(() => {
    rmSync(root, { recursive: true, force: true })
})

describe('shouldIgnore', () => {
    it('忽略 null / undefined', () => {
        expect(shouldIgnore(null, 'en-US')).toBe(true)
        expect(shouldIgnore(undefined, 'en-US')).toBe(true)
    })

    it('忽略数字 / 布尔等非字符串', () => {
        expect(shouldIgnore(42, 'en-US')).toBe(true)
        expect(shouldIgnore(true, 'en-US')).toBe(true)
        expect(shouldIgnore(false, 'en-US')).toBe(true)
    })

    it('忽略纯 ASCII 字符串（产品名 / 版本号 / 技术术语）', () => {
        expect(shouldIgnore('dependfix', 'en-US')).toBe(true)
        expect(shouldIgnore('PR Checks', 'en-US')).toBe(true)
        expect(shouldIgnore('Owner *', 'en-US')).toBe(true)
        expect(shouldIgnore('v1.2.3', 'en-US')).toBe(true)
    })

    it('忽略 i18n 占位符（{name} / {count, number}）', () => {
        expect(shouldIgnore('{percent}%', 'en-US')).toBe(true)
        expect(shouldIgnore('{count, number}', 'en-US')).toBe(true)
    })

    it('不忽略 en-US locale 中的中文字符串（污染信号）', () => {
        expect(shouldIgnore('未登录或会话已过期', 'en-US')).toBe(false)
    })

    it('不忽略 zh-CN locale 中的中文字符串（合理）', () => {
        expect(shouldIgnore('未登录或会话已过期', 'zh-CN')).toBe(false)
    })
})

describe('loadLocaleMap', () => {
    it('加载并扁平化嵌套对象', async () => {
        writeLocale(root, 'zh-CN', { a: { b: '中文', c: { d: '嵌套' } } })
        writeLocale(root, 'en-US', { a: { b: 'English', c: { d: 'nested' } } })
        const map = await loadLocaleMap(resolve(root, 'locales/zh-CN.json'))
        expect(map.get('a.b')).toBe('中文')
        expect(map.get('a.c.d')).toBe('嵌套')
    })
})

describe('findSuspiciousMatches', () => {
    it('检测 en-US locale 中的中文污染', () => {
        // 模拟 §五十六 Phase 4 B1 报告的场景：en-US.json alerts.errors.loadFailed 被中文污染
        const zhCN = new Map([
            ['common.appName', 'dependfix'], // 纯英文，正常
            ['alerts.errors.loadFailed', '加载失败：{message}'], // 中文短语，需要翻译
        ])
        const enUS = new Map([
            ['common.appName', 'dependfix'], // 纯英文，正常
            ['alerts.errors.loadFailed', '加载失败：{message}'], // ❌ 污染：en-US 也含中文
        ])
        const suspicious = findSuspiciousMatches(zhCN, 'zh-CN', enUS, 'en-US')
        expect(suspicious).toContain('alerts.errors.loadFailed')
        expect(suspicious).not.toContain('common.appName') // 纯 ASCII 字符串忽略
    })

    it('忽略 locale 名称结尾的 key（结构化本地化数据）', () => {
        const zhCN = new Map([
            ['serverErrors.UNAUTHORIZED.zh-CN', '未登录或会话已过期'],
            ['serverErrors.UNAUTHORIZED.en', 'Not signed in'],
            ['common.appName', 'dependfix'],
        ])
        const enUS = new Map([
            ['serverErrors.UNAUTHORIZED.zh-CN', '未登录或会话已过期'],
            ['serverErrors.UNAUTHORIZED.en', 'Not signed in'],
            ['common.appName', 'dependfix'],
        ])
        const suspicious = findSuspiciousMatches(zhCN, 'zh-CN', enUS, 'en-US')
        expect(suspicious).toEqual([])
    })

    it('正常翻译不被误报（zh-CN 与 en-US 值不同）', () => {
        const zhCN = new Map([
            ['common.greeting', '你好'],
            ['common.farewell', '再见'],
        ])
        const enUS = new Map([
            ['common.greeting', 'Hello'],
            ['common.farewell', 'Goodbye'],
        ])
        const suspicious = findSuspiciousMatches(zhCN, 'zh-CN', enUS, 'en-US')
        expect(suspicious).toEqual([])
    })
})

describe('main CLI', () => {
    it('干净的 zh-CN + en-US locale 返回 exit code 0', async () => {
        writeLocale(root, 'zh-CN', { a: '中文', b: '纯英文' })
        writeLocale(root, 'en-US', { a: 'English', b: 'Pure English' })
        const code = await main([
            'node',
            'i18n-anchor-check.mjs',
            `--locale-root=${resolve(root, 'locales')}`,
        ])
        expect(code).toBe(0)
    })

    it('故意污染 en-US locale（含中文）返回 exit code 1', async () => {
        writeLocale(root, 'zh-CN', { alerts: '告警' })
        writeLocale(root, 'en-US', { alerts: '告警' }) // ❌ 污染：en-US 应该是 "Alerts"
        const code = await main([
            'node',
            'i18n-anchor-check.mjs',
            `--locale-root=${resolve(root, 'locales')}`,
        ])
        expect(code).toBe(1)
    })

    it('JSON 格式输出', async () => {
        writeLocale(root, 'zh-CN', { alerts: '告警' })
        writeLocale(root, 'en-US', { alerts: '告警' })
        const code = await main([
            'node',
            'i18n-anchor-check.mjs',
            `--locale-root=${resolve(root, 'locales')}`,
            '--format=json',
        ])
        expect(code).toBe(1)
    })
})
