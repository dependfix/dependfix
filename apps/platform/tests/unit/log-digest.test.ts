import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { generateApiKey } from '../../server/utils/api-key'
import {
    buildLogTemplate,
    byteLength,
    cleanLogMessage,
    digestLogEntries,
    formatLogDigest,
    LOG_DIGEST_MAX_ERROR_GROUPS,
    LOG_DIGEST_MAX_GROUPS,
    paginateDigest,
    prepareRawLogEntries,
    LOG_DIGEST_MAX_ERROR_BYTES,
    LOG_DIGEST_MAX_MESSAGE_BYTES,
    type LogDigestEntry,
} from '../../shared/log-digest'

const letters = (index: number): string => {
    let label = ''
    let value = index
    do {
        label = String.fromCharCode(97 + (value % 26)) + label
        value = Math.floor(value / 26) - 1
    } while (value >= 0)
    return label
}

const fixtureUrl = new URL('../fixtures/log-digest/max-sample.json', import.meta.url)
const fixture = JSON.parse(readFileSync(fixtureUrl, 'utf8')) as LogDigestEntry[]

describe('shared/log-digest 清洗', () => {
    it('去除 ANSI、URL 内嵌凭据、绝对路径与 token', () => {
        const cleaned = cleanLogMessage(
            '\u001b[31mGET https://user:pass@example.com/api?x=1 from /root/private/repo failed with ghp_shortinvalid\u001b[0m',
        )
        expect(cleaned).not.toContain('\u001b')
        expect(cleaned).toContain('https://***@example.com')
        expect(cleaned).toContain('<path>')
        expect(cleaned).not.toContain('/root/private/repo')
        expect(cleaned).not.toContain('ghp_shortinvalid')
    })

    it('dependfix API key 前缀 dfk_ 进入脱敏规则（含 base64url 的 - 字符）', () => {
        const generated = generateApiKey()
        const cleaned = cleanLogMessage(`raw key ${generated} leaked`)
        expect(cleaned).toContain('dfk_***')
        expect(cleaned).not.toContain(generated.slice(4))
        expect(cleanLogMessage('raw key dfk_abc-def_ghi leaked')).toBe('raw key dfk_*** leaked')
        // Authorization 头由更前置的规则整体替换（不保留前缀，同样安全）
        expect(cleanLogMessage('Authorization: Bearer dfk_abcdefghijklmnopqrstuvwxyz failed'))
            .toBe('Authorization: Bearer *** failed')
    })

    it('敏感键名赋值（env / query / JSON）脱敏值而保留键名', () => {
        const cleaned = cleanLogMessage('password=hunter2 _authToken=npm_secret ?access_token=abc123 {"token": "json-secret"}')
        expect(cleaned).toContain('password=***')
        expect(cleaned).toContain('_authToken=***')
        expect(cleaned).toContain('access_token=***')
        expect(cleaned).toContain('"token": ***')
        expect(cleaned).not.toContain('hunter2')
        expect(cleaned).not.toContain('json-secret')
    })

    it('绝对路径前缀必须有右边界，不误伤 /application 与 /homepage', () => {
        expect(cleanLogMessage('/application/main.js and /homepage')).toBe('/application/main.js and /homepage')
        expect(cleanLogMessage('/app/workspace/package.json')).toBe('<path>')
    })

    it('Authorization 头与私钥块沿用 sanitizeString 规则', () => {
        const cleaned = cleanLogMessage('Authorization: Bearer abc.def.ghi\n-----BEGIN PRIVATE KEY-----\nsecret\n-----END PRIVATE KEY-----')
        expect(cleaned).toContain('Authorization: Bearer ***')
        expect(cleaned).toContain('[redacted-private-key]')
        expect(cleaned).not.toContain('secret')
    })

    it('绝对路径之外的普通相对路径不被归一化', () => {
        expect(cleanLogMessage('read package.json under apps/platform')).toBe('read package.json under apps/platform')
    })
})

describe('shared/log-digest 模板归一化', () => {
    it('时间戳 / 数字（单位保留）/ UUID / hex / URL path 归一，保留 scheme 与域名端口', () => {
        const template = buildLogTemplate(
            '2026-11-19T10:00:00.123Z fetched 200ms 3 items id 550e8400-e29b-41d4-a716-446655440000 sha deadbeefcafe from https://registry.example.com:8443/pkg/name?page=2',
        )
        expect(template).toContain('<ts>')
        expect(template).toContain('<n>ms')
        expect(template).toContain('<id>')
        expect(template).toContain('https://registry.example.com:8443<path>')
        expect(template).not.toContain('200ms')
    })

    it('多行正文按行独立归一后保留换行结构', () => {
        const template = buildLogTemplate(cleanLogMessage('Error: failed after 200ms\n    at run (/app/src/main.ts:10:2)'))
        expect(template.split('\n')).toHaveLength(2)
        expect(template).toContain('<n>ms')
        expect(template).toContain('<path>')
    })
})

describe('shared/log-digest 分组', () => {
    it('最大样本 grouped 序列化 < 10 KB，2 条 error 均在输出且正文可读', () => {
        const result = digestLogEntries(fixture)
        expect(byteLength(JSON.stringify(result))).toBeLessThan(10240)
        const errors = result.groups.filter((group) => group.level === 'error')
        expect(errors).toHaveLength(2)
        for (const group of errors) {
            expect(group.count).toBe(1)
            expect(group.template).not.toContain('\u001b')
            expect(group.template).not.toContain('/app/workspace')
            expect(group.template).not.toContain('/usr/lib')
            expect(group.template).toContain('<path>')
            expect(group.sample.length).toBeGreaterThan(0)
        }
    })

    it('level=warn 时 total=991 / groupCount=3 / 最大组 count=989', () => {
        const result = digestLogEntries(fixture, { level: 'warn' })
        expect(result.total).toBe(991)
        expect(result.groupCount).toBe(3)
        expect(Math.max(...result.groups.map((group) => group.count))).toBe(989)
    })

    it('error 不折叠：即使清洗后正文相同也逐条成组', () => {
        const result = digestLogEntries([
            { timestamp: '2026-01-01T00:00:00Z', level: 'error', message: 'failed at /app/x' },
            { timestamp: '2026-01-01T00:00:01Z', level: 'error', message: 'failed at /app/x' },
        ])
        expect(result.groups).toHaveLength(2)
        expect(result.groups.every((group) => group.count === 1)).toBe(true)
    })

    it('error 不折叠：同级别不同错误各自成组，组内按时间升序', () => {
        const result = digestLogEntries(fixture, { level: 'error' })
        expect(result.groups).toHaveLength(2)
        expect(result.groups.every((group) => group.count === 1)).toBe(true)
        expect(result.groups[0]!.firstAt < result.groups[1]!.firstAt).toBe(true)
    })

    it('组内 count 降序，级别 error → warn → info → debug', () => {
        const result = digestLogEntries(fixture)
        expect(result.groups.slice(0, 2).map((group) => group.level)).toEqual(['error', 'error'])
        expect(result.groups.slice(2, 5).map((group) => group.level)).toEqual(['warn', 'warn', 'warn'])
        const warnCounts = result.groups.filter((group) => group.level === 'warn').map((group) => group.count)
        expect(warnCounts[0]).toBe(989)
        expect(warnCounts[1]).toBe(1)
        const tail = result.groups.slice(5).map((group) => group.level)
        expect(tail.every((level) => level === 'info' || level === 'debug')).toBe(true)
    })

    it('context 不参与模板与分组，仅附在 sample 上', () => {
        const result = digestLogEntries([
            { timestamp: '2026-01-01T00:00:00Z', level: 'info', message: 'done in 2s', context: { repo: 'a/b' } },
            { timestamp: '2026-01-01T00:00:01Z', level: 'info', message: 'done in 1s', context: { repo: 'c/d' } },
        ])
        expect(result.groups).toHaveLength(1)
        expect(result.groups[0]!.template).toBe('done in <n>s')
        expect(result.groups[0]!.sample).toContain('{"repo":"a/b"}')
    })

    it('sample 为首次出现的清洗后原文，firstAt 与 sample 同一次遍历取值', () => {
        const result = digestLogEntries([
            { timestamp: '2026-01-01T00:00:02Z', level: 'info', message: 'done in 2s' },
            { timestamp: '2026-01-01T00:00:01Z', level: 'info', message: 'done in 1s' },
        ])
        expect(result.groups).toHaveLength(1)
        const [group] = result.groups
        expect(group!.count).toBe(2)
        expect(group!.firstAt).toBe('2026-01-01T00:00:02Z')
        expect(group!.sample).toBe('done in 2s')
        expect(group!.lastAt).toBe('2026-01-01T00:00:02Z')
    })
})

describe('shared/log-digest 截断与 droppedBefore', () => {
    it('单条清洗后超过 2 KB 时按 UTF-8 字节截断并置 errorTruncated', () => {
        const result = digestLogEntries([
            { timestamp: '2026-01-01T00:00:00Z', level: 'info', message: 'x'.repeat(LOG_DIGEST_MAX_MESSAGE_BYTES + 10) },
        ])
        expect(result.errorTruncated).toBe(true)
        expect(byteLength(result.groups[0]!.template)).toBeLessThanOrEqual(LOG_DIGEST_MAX_MESSAGE_BYTES)
    })

    it('context 序列化后超过 2 KB 时截断 sample 并置 errorTruncated', () => {
        const result = digestLogEntries([
            {
                timestamp: '2026-01-01T00:00:00Z',
                level: 'info',
                message: 'boom',
                context: { payload: 'z'.repeat(50000) },
            },
        ])
        expect(result.errorTruncated).toBe(true)
        expect(byteLength(result.groups[0]!.sample)).toBeLessThanOrEqual(LOG_DIGEST_MAX_MESSAGE_BYTES)
        expect(byteLength(formatLogDigest(result))).toBeLessThan(4096)
    })

    it('error 组数超过上限时置 errorTruncated', () => {
        const entries = Array.from({ length: LOG_DIGEST_MAX_ERROR_GROUPS + 1 }, (_, index) => ({
            timestamp: '2026-01-01T00:00:00Z',
            level: 'error',
            message: `failure ${index}`,
        }))
        const result = digestLogEntries(entries)
        expect(result.errorTruncated).toBe(true)
        expect(result.returned).toBe(LOG_DIGEST_MAX_ERROR_GROUPS)
    })

    it('error 正文字节合计超过 64 KB 时截断并置 errorTruncated', () => {
        const message = 'e'.repeat(1000)
        const entries = Array.from({ length: Math.ceil(LOG_DIGEST_MAX_ERROR_BYTES / 1000) + 1 }, (_, index) => ({
            timestamp: `2026-01-01T00:00:${String(index % 60).padStart(2, '0')}Z`,
            level: 'error',
            message: `${message}-${index}`,
        }))
        const result = digestLogEntries(entries)
        expect(result.errorTruncated).toBe(true)
        expect(result.groups.length).toBeLessThan(entries.length)
    })

    it('组数超过上限时由 paginateDigest 截断并置 truncated（分页可达后续组）', () => {
        const entries = Array.from({ length: LOG_DIGEST_MAX_GROUPS + 1 }, (_, index) => ({
            timestamp: '2026-01-01T00:00:00Z',
            level: 'info',
            message: `unique message ${letters(index)}`,
        }))
        const full = digestLogEntries(entries)
        expect(full.groupCount).toBe(LOG_DIGEST_MAX_GROUPS + 1)
        const first = paginateDigest(full, 1, LOG_DIGEST_MAX_GROUPS)
        expect(first.returned).toBe(LOG_DIGEST_MAX_GROUPS)
        expect(first.truncated).toBe(true)
        const second = paginateDigest(full, 2, LOG_DIGEST_MAX_GROUPS)
        expect(second.returned).toBe(1)
        expect(second.truncated).toBe(false)
        expect(formatLogDigest(first)).toContain('only the first 200 of 201 groups are shown')
    })

    it('droppedBefore 三态：null 未知 / 0 未丢 / >0 提示丢弃', () => {
        expect(digestLogEntries([], {}).droppedBefore).toBeNull()
        expect(digestLogEntries([], { droppedBefore: 0 }).droppedBefore).toBe(0)
        const result = digestLogEntries(fixture, { droppedBefore: 12 })
        const text = formatLogDigest(result)
        expect(result.droppedBefore).toBe(12)
        expect(text).toContain('dropped before: 12')
        expect(text).toContain('12 earlier entries were dropped')
    })
})

describe('shared/log-digest v1 查询扩展', () => {
    it('query 子串过滤在分组前生效', () => {
        const result = digestLogEntries(fixture, { level: 'warn', query: 'deprecated' })
        expect(result.total).toBe(1)
        expect(result.groupCount).toBe(1)
    })

    it('paginateDigest 按组分页并重算 returned / truncated', () => {
        const result = digestLogEntries(fixture)
        const page = paginateDigest(result, 2, 2)
        expect(page.returned).toBe(2)
        expect(page.groupCount).toBe(result.groupCount)
        expect(page.truncated).toBe(true)
        expect(page.groups).toEqual(result.groups.slice(2, 4))
    })

    it('raw 视图同源清洗、过滤、分页与 droppedBefore', () => {
        const raw = prepareRawLogEntries(fixture, { level: 'warn', query: 'retry', page: 1, pageSize: 3, droppedBefore: 12 })
        expect(raw.total).toBe(989)
        expect(raw.returned).toBe(3)
        expect(raw.truncated).toBe(true)
        expect(raw.droppedBefore).toBe(12)
        expect(raw.entries[0]!.message).not.toContain('')
        expect(raw.entries[0]!.message).toContain('<path>')
        expect(raw.entries[0]!.message).not.toContain('/root')
    })

    it('raw 视图对超长正文截断并置 errorTruncated', () => {
        const raw = prepareRawLogEntries([
            { timestamp: '2026-01-01T00:00:00Z', level: 'info', message: 'x'.repeat(LOG_DIGEST_MAX_MESSAGE_BYTES + 1) },
        ])
        expect(raw.errorTruncated).toBe(true)
        expect(byteLength(raw.entries[0]!.message)).toBeLessThanOrEqual(LOG_DIGEST_MAX_MESSAGE_BYTES)
    })
})

describe('shared/log-digest 可粘贴文本', () => {
    it('包含分组摘要、计数、截断提示与丢弃提示', () => {
        const result = digestLogEntries(fixture, { droppedBefore: 3 })
        const text = formatLogDigest(result)
        expect(text).toContain('# dependfix execution log digest (grouped)')
        expect(text).toContain('- total entries: 1000')
        expect(text).toContain('- groups:')
        expect(text).toContain('- dropped before: 3')
        expect(text).toContain('- truncated: no')
        expect(text).toContain('- error truncated: no')
        expect(text).toContain('## ERROR')
        expect(text).toContain('## WARN')
        expect(text).toContain('count: 989')
        expect(byteLength(text)).toBeLessThan(16 * 1024)
    })

    it('未知丢弃数明确写 unknown，不伪装为 0', () => {
        const text = formatLogDigest(digestLogEntries([], { droppedBefore: null }))
        expect(text).toContain('unknown')
    })
})
