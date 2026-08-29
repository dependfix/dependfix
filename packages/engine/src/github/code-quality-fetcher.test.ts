import { describe, expect, it, afterEach } from 'vitest'
import nock from 'nock'
import { AppError } from '@dependfix/core'
import { fromPat } from '../auth'
import { createGitHubClient } from './client'
import { fetchCodeQualityFindings, mapCodeQualitySeverity } from './code-quality-fetcher'

const API_BASE = 'https://api.github.com'
const FINDINGS_PATH = '/repos/foo/bar/code-quality/findings'

function setupClient(token = 'test-token') {
    return createGitHubClient({ auth: fromPat(token) })
}

function makeRawFinding(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        number: 1,
        state: 'open',
        url: `https://api.github.com/repos/foo/bar/code-quality/findings/1`,
        rule: {
            id: 'java/useless-null-check',
            title: 'Useless null check',
            description: 'Checking whether an expression is null...',
            severity: 'warning',
            category: 'maintainability',
        },
        location: {
            path: 'java/UselessNullCheck.java',
            start_line: 9,
            start_column: 4,
            end_line: 9,
            end_column: 18,
        },
        message: {
            text: 'This check is useless.',
            markdown: 'This check is useless.',
        },
        created_at: '2026-01-23T12:34:56Z',
        ...overrides,
    }
}

describe('fetchCodeQualityFindings', () => {
    afterEach(() => {
        nock.cleanAll()
    })

    // -----------------------------------------------------------------------
    // Happy Path
    // -----------------------------------------------------------------------

    it('returns normalized alerts for a repo with open findings', async () => {
        nock(API_BASE)
            .get(FINDINGS_PATH)
            .query({ state: 'open', per_page: 100 })
            .reply(200, [makeRawFinding(), makeRawFinding({ number: 2 })])

        const client = setupClient()
        const findings = await fetchCodeQualityFindings(client, { owner: 'foo', repo: 'bar' })

        expect(findings).toHaveLength(2)
        expect(findings.every((f) => f.source === 'code-quality')).toBe(true)
        expect(findings.every((f) => f.repository === 'foo/bar')).toBe(true)
    })

    it('correctly maps all fields from Code Quality API response', async () => {
        nock(API_BASE)
            .get(FINDINGS_PATH)
            .query(true)
            .reply(200, [makeRawFinding()])

        const client = setupClient()
        const [finding] = await fetchCodeQualityFindings(client, { owner: 'foo', repo: 'bar' })

        expect(finding.id).toBe(1)
        expect(finding.source).toBe('code-quality')
        expect(finding.repository).toBe('foo/bar')
        expect(finding.defaultBranch).toBe('')
        expect(finding.severity).toBe('medium') // warning → medium
        expect(finding.packageEcosystem).toBe('code-quality')
        expect(finding.packageName).toBe('Useless null check')
        expect(finding.manifestPath).toBe('java/UselessNullCheck.java')
        expect(finding.ruleId).toBe('java/useless-null-check')
        expect(finding.summary).toBe('This check is useless.')
        // api URL → web URL 转换
        expect(finding.htmlUrl).toBe('https://github.com/foo/bar/code-quality/findings/1')
        expect(finding.recommendedVersion).toBe('')
        expect(finding.alertClass).toBe('report-only') // C 类默认
        expect(finding.startLine).toBe(9)
        expect(finding.endLine).toBe(9)
    })

    it('maps severity: error → high, warning → medium, note → low', async () => {
        nock(API_BASE)
            .get(FINDINGS_PATH)
            .query(true)
            .reply(200, [
                makeRawFinding({ number: 1, rule: { id: 'js/x', title: 'X', severity: 'error' } }),
                makeRawFinding({ number: 2, rule: { id: 'js/y', title: 'Y', severity: 'warning' } }),
                makeRawFinding({ number: 3, rule: { id: 'js/z', title: 'Z', severity: 'note' } }),
            ])

        const client = setupClient()
        const findings = await fetchCodeQualityFindings(client, { owner: 'foo', repo: 'bar' })

        expect(findings[0].severity).toBe('high')
        expect(findings[1].severity).toBe('medium')
        expect(findings[2].severity).toBe('low')
    })

    it('falls back to unknown severity when severity is missing or invalid', async () => {
        nock(API_BASE)
            .get(FINDINGS_PATH)
            .query(true)
            .reply(200, [
                makeRawFinding({ number: 1, rule: { id: 'js/x', title: 'X', severity: null } }),
                makeRawFinding({ number: 2, rule: { id: 'js/y', title: 'Y' } }),
            ])

        const client = setupClient()
        const findings = await fetchCodeQualityFindings(client, { owner: 'foo', repo: 'bar' })

        expect(findings[0].severity).toBe('unknown')
        expect(findings[1].severity).toBe('unknown')
    })

    it('always classifies as report-only (C class default per backlog code-quality entry)', async () => {
        nock(API_BASE)
            .get(FINDINGS_PATH)
            .query(true)
            .reply(200, [
                makeRawFinding({ rule: { id: 'js/security-rule', title: 'Security', severity: 'error' } }),
            ])

        const client = setupClient()
        const [finding] = await fetchCodeQualityFindings(client, { owner: 'foo', repo: 'bar' })

        // 首版统一归 C 类（不实现模板化修复）
        expect(finding.alertClass).toBe('report-only')
        expect(finding.fixable).toBe(false)
        expect(finding.fixStrategy).toBe(null)
    })

    it('uses rule title as packageName and rule id as ruleId', async () => {
        nock(API_BASE)
            .get(FINDINGS_PATH)
            .query(true)
            .reply(200, [
                makeRawFinding({
                    rule: { id: 'py/complex-method', title: 'Complex method', severity: 'warning' },
                }),
            ])

        const client = setupClient()
        const [finding] = await fetchCodeQualityFindings(client, { owner: 'foo', repo: 'bar' })

        expect(finding.packageName).toBe('Complex method')
        expect(finding.ruleId).toBe('py/complex-method')
    })

    it('falls back to rule id as packageName when rule title is missing', async () => {
        nock(API_BASE)
            .get(FINDINGS_PATH)
            .query(true)
            .reply(200, [
                makeRawFinding({
                    rule: { id: 'go/missing-rule', severity: 'warning' },
                }),
            ])

        const client = setupClient()
        const [finding] = await fetchCodeQualityFindings(client, { owner: 'foo', repo: 'bar' })

        expect(finding.packageName).toBe('go/missing-rule')
    })

    it('returns empty array for a repo with no findings', async () => {
        nock(API_BASE)
            .get(FINDINGS_PATH)
            .query(true)
            .reply(200, [])

        const client = setupClient()
        const findings = await fetchCodeQualityFindings(client, { owner: 'foo', repo: 'bar' })

        expect(findings).toHaveLength(0)
    })

    // -----------------------------------------------------------------------
    // Cursor pagination
    // -----------------------------------------------------------------------

    it('paginates via after cursor in Link header', async () => {
        const page1 = [makeRawFinding({ number: 1 }), makeRawFinding({ number: 2 })]
        const page2 = [makeRawFinding({ number: 3 })]

        nock(API_BASE)
            .get(FINDINGS_PATH)
            .query({ state: 'open', per_page: 100 })
            .reply(200, page1, {
                Link: '<https://api.github.com/repos/foo/bar/code-quality/findings?after=CURSOR_ABC&per_page=100>; rel="next"',
            })
            .get(FINDINGS_PATH)
            .query({ state: 'open', per_page: 100, after: 'CURSOR_ABC' })
            .reply(200, page2, {
                // 第二页无 next，终止循环
                Link: '<https://api.github.com/repos/foo/bar/code-quality/findings?before=CURSOR_ABC&per_page=100>; rel="prev"',
            })

        const client = setupClient()
        const findings = await fetchCodeQualityFindings(client, { owner: 'foo', repo: 'bar' })

        expect(findings).toHaveLength(3)
        expect(findings.map((f) => f.id)).toEqual([1, 2, 3])
    })

    it('terminates pagination when no Link header is present', async () => {
        nock(API_BASE)
            .get(FINDINGS_PATH)
            .query(true)
            .reply(200, [makeRawFinding({ number: 1 })])

        const client = setupClient()
        const findings = await fetchCodeQualityFindings(client, { owner: 'foo', repo: 'bar' })

        expect(findings).toHaveLength(1)
    })

    // -----------------------------------------------------------------------
    // Error handling
    // -----------------------------------------------------------------------

    it('maps 401 to AUTHENTICATION_FAILED AppError', async () => {
        nock(API_BASE)
            .get(FINDINGS_PATH)
            .query(true)
            .reply(401, { message: 'Bad credentials' })

        const client = setupClient()
        await expect(fetchCodeQualityFindings(client, { owner: 'foo', repo: 'bar' }))
            .rejects.toMatchObject({ code: 'AUTHENTICATION_FAILED' })
    })

    it('maps 403 to PERMISSION_DENIED AppError', async () => {
        nock(API_BASE)
            .get(FINDINGS_PATH)
            .query(true)
            .reply(403, { message: 'Resource not accessible by integration' })

        const client = setupClient()
        try {
            await fetchCodeQualityFindings(client, { owner: 'foo', repo: 'bar' })
            expect.fail('Expected fetchCodeQualityFindings to throw')
        } catch (error) {
            expect(error).toBeInstanceOf(AppError)
            expect((error as AppError).code).toBe('PERMISSION_DENIED')
            expect((error as AppError).message).toContain('fetch code quality findings for foo/bar')
        }
    })

    it('maps 404 to REPO_NOT_FOUND AppError', async () => {
        nock(API_BASE)
            .get(FINDINGS_PATH)
            .query(true)
            .reply(404, { message: 'Not Found' })

        const client = setupClient()
        await expect(fetchCodeQualityFindings(client, { owner: 'foo', repo: 'bar' }))
            .rejects.toMatchObject({ code: 'REPO_NOT_FOUND' })
    })

    // -----------------------------------------------------------------------
    // Defensive termination: 重复 cursor / 异常长分页 / 非法 Link URL
    // -----------------------------------------------------------------------

    it('terminates pagination when Link header contains duplicate cursor (API anomaly)', async () => {
        const sameCursor = 'CURSOR_LOOP'
        nock(API_BASE)
            .get(FINDINGS_PATH)
            .query({ state: 'open', per_page: 100 })
            .reply(200, [makeRawFinding({ number: 1 })], {
                Link: `<https://api.github.com/repos/foo/bar/code-quality/findings?after=${sameCursor}&per_page=100>; rel="next"`,
            })
            .get(FINDINGS_PATH)
            .query({ state: 'open', per_page: 100, after: sameCursor })
            .reply(200, [makeRawFinding({ number: 2 })], {
                // 同一 cursor 再发一次（API 异常 / Link header 异常）：触发 seenCursors 防御
                Link: `<https://api.github.com/repos/foo/bar/code-quality/findings?after=${sameCursor}&per_page=100>; rel="next"`,
            })

        const client = setupClient()
        const findings = await fetchCodeQualityFindings(client, { owner: 'foo', repo: 'bar' })

        // 第二页之后检测到 cursor 重复 → 中止（不会无限循环），只取到 2 条
        expect(findings).toHaveLength(2)
    })

    it('falls back to undefined when Link header URL is malformed (parseNextCursor catch branch)', async () => {
        nock(API_BASE)
            .get(FINDINGS_PATH)
            .query({ state: 'open', per_page: 100 })
            .reply(200, [makeRawFinding({ number: 1 })], {
                // 非法 URL：new URL() 抛 TypeError，parseNextCursor 返回 undefined → 自然终止
                Link: '<not a valid url>; rel="next"',
            })

        const client = setupClient()
        const findings = await fetchCodeQualityFindings(client, { owner: 'foo', repo: 'bar' })

        expect(findings).toHaveLength(1)
    })

    it('returns undefined when Link header has rel="next" but no after parameter', async () => {
        nock(API_BASE)
            .get(FINDINGS_PATH)
            .query({ state: 'open', per_page: 100 })
            .reply(200, [makeRawFinding({ number: 1 })], {
                // rel=next 但 URL 无 after 参数（异常）；searchParams.get 返回 null ?? undefined
                Link: '<https://api.github.com/repos/foo/bar/code-quality/findings?per_page=100>; rel="next"',
            })

        const client = setupClient()
        const findings = await fetchCodeQualityFindings(client, { owner: 'foo', repo: 'bar' })

        expect(findings).toHaveLength(1)
    })
})

describe('mapCodeQualitySeverity', () => {
    it('maps error → high', () => {
        expect(mapCodeQualitySeverity('error')).toBe('high')
    })

    it('maps warning → medium', () => {
        expect(mapCodeQualitySeverity('warning')).toBe('medium')
    })

    it('maps note → low', () => {
        expect(mapCodeQualitySeverity('note')).toBe('low')
    })

    it('returns unknown for missing or invalid values', () => {
        expect(mapCodeQualitySeverity(null)).toBe('unknown')
        expect(mapCodeQualitySeverity(undefined)).toBe('unknown')
        expect(mapCodeQualitySeverity('')).toBe('unknown')
        expect(mapCodeQualitySeverity('critical')).toBe('unknown')
    })
})
