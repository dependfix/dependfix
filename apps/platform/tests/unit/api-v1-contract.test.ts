import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { API_V1_FIELDS, API_V1_FORBIDDEN_FIELDS, API_V1_PAGE_SIZE_DEFAULT, API_V1_PAGE_SIZE_MAX } from '#server/schemas/api-v1-fields'

const doc = readFileSync(new URL('../../../../docs/guide/api-v1.md', import.meta.url), 'utf8')

const snapshot = (): {
    fields: Record<string, string[]>
    pagination: Record<string, number>
    forbidden: string[]
} => {
    const match = /<!-- api-v1-snapshot:start -->\s*```json\s*([\s\S]*?)```\s*<!-- api-v1-snapshot:end -->/.exec(doc)
    if (!match) {
        throw new Error('missing snapshot')
    }
    return JSON.parse(match[1]!)
}

describe('api-v1.md 契约快照', () => {
    it('与字段常量完全一致（防文档/代码漂移）', () => {
        const parsed = snapshot()
        expect(parsed.fields).toEqual(API_V1_FIELDS)
        expect(parsed.forbidden).toEqual(API_V1_FORBIDDEN_FIELDS)
        expect(parsed.pagination).toMatchObject({
            default: API_V1_PAGE_SIZE_DEFAULT,
            max: API_V1_PAGE_SIZE_MAX,
            runsMax: 200,
            logsDefault: 50,
            logsMax: 200,
        })
    })
})
