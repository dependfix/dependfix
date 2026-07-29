import type { RunResult } from './types'

/**
 * 生成 JSON 格式报告字符串。
 * 直接对 RunResult 调用 JSON.stringify，无自定义序列化逻辑。
 */
export function generateJsonReport(result: RunResult): string {
    return JSON.stringify(result, null, 2)
}
