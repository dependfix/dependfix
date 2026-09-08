import type { z } from 'zod'

/**
 * zod optional 语义区分 helper（todo.md §M25.4 follow-up 落地）。
 *
 * 背景（[经验归档 §五十六 M24.1 教训 4](../design/governance/experience-archive.md)）：
 * - `z.enum([...]).optional()` / `z.boolean().optional()` 接受 `undefined` 为合法值
 * - `safeParse(undefined).success === true`，但 `result.data === undefined`
 * - 区分「未传字段」与「传 undefined」需显式 `data !== undefined` 判断
 * - 直接用 `result.data === 'some-value'` 三元永远 false（因为 data 可能是 undefined）
 *
 * 解决方案：本 helper 强制返回 `{ success, value, isProvided }` 三态结构：
 * - `success`：schema 解析是否成功（true = 值合法或 undefined 可接受）
 * - `value`：解析后的值（失败时为 undefined）
 * - `isProvided`：调用方是否实际传递了值（区分「未传」与「传 undefined」）
 *
 * @example
 * ```typescript
 * const schema = z.enum(['true', 'false']).optional()
 * const { success, value, isProvided } = parseOptional(schema, query.alertFiring)
 * if (!success) {
 *   throw createLocalizedError(event, { statusCode: 400, code: 'INVALID_QUERY' })
 * }
 * // isProvided=false → query 未传（默认值）
 * // isProvided=true && value='false' → query='false'
 * // isProvided=true && value='true' → query='true'
 * ```
 */
export interface ParseOptionalResult<T> {
    /** schema 解析是否成功（false = 提供了非法值） */
    success: boolean
    /** 解析后的值（success=true 时为合法值；失败时为 undefined） */
    value?: T
    /** 调用方是否实际传递了 key（区分「未传 query.alertFiring」与「query.alertFiring=undefined」） */
    isProvided: boolean
}

/**
 * 解析 query 字段并强制三态语义区分。
 *
 * @param schema - zod schema（应包含 .optional() / .nullable() 以允许 undefined / null）
 * @param data - 待解析值（通常来自 query[fieldName] 或 body[fieldName]）
 * @returns { success, value?, isProvided }
 */
export const parseOptional = <T>(
    schema: z.ZodType<T>,
    data: unknown,
): ParseOptionalResult<T> => {
    // 三态判断：未传 / 传 undefined / 传具体值
    const isProvided = data !== undefined
    const result = schema.safeParse(data)
    return {
        success: result.success,
        value: result.success ? result.data : undefined,
        isProvided,
    }
}
