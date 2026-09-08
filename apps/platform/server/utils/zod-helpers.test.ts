import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { parseOptional } from './zod-helpers'

describe('parseOptional', () => {
    const booleanOptional = z.boolean().optional()
    const enumOptional = z.enum(['true', 'false']).optional()

    describe('boolean schema', () => {
        it('未传：isProvided=false + success=true + value=undefined', () => {
            const result = parseOptional(booleanOptional, undefined)
            expect(result.isProvided).toBe(false)
            expect(result.success).toBe(true)
            expect(result.value).toBeUndefined()
        })

        it('传 true：isProvided=true + success=true + value=true', () => {
            const result = parseOptional(booleanOptional, true)
            expect(result.isProvided).toBe(true)
            expect(result.success).toBe(true)
            expect(result.value).toBe(true)
        })

        it('传 false：isProvided=true + success=true + value=false', () => {
            const result = parseOptional(booleanOptional, false)
            expect(result.isProvided).toBe(true)
            expect(result.success).toBe(true)
            expect(result.value).toBe(false)
        })

        it('传非法值（字符串）：isProvided=true + success=false + value=undefined', () => {
            const result = parseOptional(booleanOptional, 'not-a-boolean')
            expect(result.isProvided).toBe(true)
            expect(result.success).toBe(false)
            expect(result.value).toBeUndefined()
        })

        it('传 null：isProvided=true + success=false + value=undefined（.optional() 不含 null）', () => {
            const result = parseOptional(booleanOptional, null)
            expect(result.isProvided).toBe(true)
            expect(result.success).toBe(false)
            expect(result.value).toBeUndefined()
        })
    })

    describe('enum schema', () => {
        it('未传：isProvided=false + success=true + value=undefined', () => {
            const result = parseOptional(enumOptional, undefined)
            expect(result.isProvided).toBe(false)
            expect(result.success).toBe(true)
            expect(result.value).toBeUndefined()
        })

        it('传 "true"：isProvided=true + success=true + value="true"', () => {
            const result = parseOptional(enumOptional, 'true')
            expect(result.isProvided).toBe(true)
            expect(result.success).toBe(true)
            expect(result.value).toBe('true')
        })

        it('传 "false"：isProvided=true + success=true + value="false"', () => {
            const result = parseOptional(enumOptional, 'false')
            expect(result.isProvided).toBe(true)
            expect(result.success).toBe(true)
            expect(result.value).toBe('false')
        })

        it('传非法值：isProvided=true + success=false + value=undefined', () => {
            const result = parseOptional(enumOptional, 'invalid')
            expect(result.isProvided).toBe(true)
            expect(result.success).toBe(false)
            expect(result.value).toBeUndefined()
        })
    })

    describe('嵌套对象 schema', () => {
        const nestedSchema = z.object({ id: z.string() }).optional()

        it('未传对象：isProvided=false + success=true + value=undefined', () => {
            const result = parseOptional(nestedSchema, undefined)
            expect(result.isProvided).toBe(false)
            expect(result.success).toBe(true)
        })

        it('传合法对象：isProvided=true + success=true + value={id:"x"}', () => {
            const result = parseOptional(nestedSchema, { id: 'x' })
            expect(result.isProvided).toBe(true)
            expect(result.success).toBe(true)
            expect(result.value).toEqual({ id: 'x' })
        })

        it('传非法对象（缺字段）：isProvided=true + success=false', () => {
            const result = parseOptional(nestedSchema, { name: 'x' })
            expect(result.isProvided).toBe(true)
            expect(result.success).toBe(false)
        })
    })

    describe('实战：alertFiring 三态语义（§五十六 M24.1 Phase 3 W2 + Phase 2 W6 衍生物）', () => {
        it('正确区分「未传」「传 true」「传 false」「非法值」', () => {
            const cases = [
                { input: undefined, expected: { isProvided: false, success: true, value: undefined, alertFiring: undefined } },
                { input: 'true', expected: { isProvided: true, success: true, value: 'true', alertFiring: true } },
                { input: 'false', expected: { isProvided: true, success: true, value: 'false', alertFiring: false } },
                { input: 'invalid', expected: { isProvided: true, success: false, value: undefined, alertFiring: undefined } },
            ]
            for (const { input, expected } of cases) {
                const { success, value, isProvided } = parseOptional(enumOptional, input)
                // 应用层语义：alertFiring = success && isProvided && value === 'true' ? true : success && isProvided && value === 'false' ? false : undefined
                let alertFiring: boolean | undefined
                if (success && isProvided) {
                    if (value === 'true') { alertFiring = true } else if (value === 'false') { alertFiring = false } else { alertFiring = undefined }
                } else {
                    alertFiring = undefined
                }
                expect({ isProvided, success, value, alertFiring }).toEqual(expected)
            }
        })
    })
})
