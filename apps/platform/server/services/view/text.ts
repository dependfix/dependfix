import { redactAbsolutePaths, sanitizeDeep, sanitizeString } from '#server/utils/sanitize'

/** v1 自由文本清洗：脱敏 + 绝对路径归一（与日志 digest 同一条路径规则） */
export const sanitizeV1Text = (value: string): string => redactAbsolutePaths(sanitizeString(value))

/** 深度清洗对象里的字符串（summary 等自由结构），并防原型键 */
export const sanitizeV1Value = (value: unknown): unknown => {
    if (typeof value === 'string') {
        return sanitizeV1Text(value)
    }
    if (Array.isArray(value)) {
        return value.map(sanitizeV1Value)
    }
    if (value && typeof value === 'object') {
        const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>
        for (const [key, child] of Object.entries(value)) {
            if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
                continue
            }
            result[key] = sanitizeV1Value(child)
        }
        return result
    }
    return value
}

/** 组合：先 sanitizeDeep（对象键脱敏 / Error 展开），再逐字符串做路径归一 */
export const sanitizeV1Payload = (value: unknown): unknown => sanitizeV1Value(sanitizeDeep(value))
