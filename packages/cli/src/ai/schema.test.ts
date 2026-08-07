import { describe, expect, it } from 'vitest'
import { parseAssessment } from './schema'

// ---------------------------------------------------------------------------
// AI 输出 schema 解析
// ---------------------------------------------------------------------------

describe('parseAssessment', () => {
    it('parses valid plain JSON output', () => {
        const result = parseAssessment(JSON.stringify({
            classification: 'code-change',
            summary: '需要替换已移除的 API',
            changes: [{
                filePath: 'src/index.ts',
                replace: [{ search: 'oldApi()', replace: 'newApi()' }],
            }],
            confidence: 0.9,
            rationale: 'changelog 显示 oldApi 被移除',
        }))

        expect(result.ok).toBe(true)
        if (result.ok) {
            expect(result.value.classification).toBe('code-change')
            expect(result.value.changes).toHaveLength(1)
            expect(result.value.changes[0].filePath).toBe('src/index.ts')
            expect(result.value.confidence).toBe(0.9)
        }
    })

    it('parses JSON inside a markdown code block', () => {
        const text = '以下是研判结果：\n```json\n{"classification":"version-lock","summary":"锁定版本","changes":[],"confidence":0.8,"rationale":"x"}\n```'

        const result = parseAssessment(text)

        expect(result.ok).toBe(true)
        if (result.ok) {
            expect(result.value.classification).toBe('version-lock')
        }
    })

    it('parses JSON inside a bare code block (no json tag)', () => {
        const text = '```\n{"classification":"manual","summary":"m","changes":[],"confidence":0.5,"rationale":""}\n```'

        const result = parseAssessment(text)

        expect(result.ok).toBe(true)
        if (result.ok) {
            expect(result.value.classification).toBe('manual')
        }
    })

    it('rejects invalid classification enum', () => {
        const result = parseAssessment(JSON.stringify({
            classification: 'invalid-type',
            summary: 'm',
            changes: [],
            confidence: 0.5,
        }))

        expect(result.ok).toBe(false)
        if ('error' in result) {
            expect(result.error).toContain('schema validation failed')
            expect(result.error).toContain('classification')
        }
    })

    it('rejects empty search block', () => {
        const result = parseAssessment(JSON.stringify({
            classification: 'code-change',
            summary: 'm',
            changes: [{ filePath: 'a.ts', replace: [{ search: '', replace: 'x' }] }],
            confidence: 0.5,
        }))

        expect(result.ok).toBe(false)
    })

    it('rejects confidence out of range', () => {
        const result = parseAssessment(JSON.stringify({
            classification: 'manual',
            summary: 'm',
            changes: [],
            confidence: 1.5,
        }))

        expect(result.ok).toBe(false)
        if ('error' in result) {
            expect(result.error).toContain('confidence')
        }
    })

    it('rejects non-JSON output', () => {
        const result = parseAssessment('抱歉，我无法完成这个任务。')

        expect(result.ok).toBe(false)
        if ('error' in result) {
            expect(result.error).toContain('no JSON object found')
        }
    })

    it('rejects empty output', () => {
        expect(parseAssessment('').ok).toBe(false)
    })

    it('accepts missing optional fields with defaults (rationale, changes)', () => {
        const result = parseAssessment(JSON.stringify({
            classification: 'wait-upstream',
            summary: '等待上游修复',
            confidence: 0.7,
        }))

        expect(result.ok).toBe(true)
        if (result.ok) {
            expect(result.value.changes).toEqual([])
            expect(result.value.rationale).toBe('')
        }
    })

    it('limits schema error details to first 5 issues', () => {
        const result = parseAssessment(JSON.stringify({
            classification: 'manual',
            summary: '',
            changes: [{ filePath: '', replace: [] }],
            confidence: 9,
        }))

        expect(result.ok).toBe(false)
        if ('error' in result) {
            // 多问题只列出前 5 个
            expect(result.error.split('; ').length).toBeLessThanOrEqual(5)
        }
    })
})
