// 凭据脱敏工具（决策 3 凭据泄露防护）：
// apiKey 仅运行时持有；日志、错误消息、报告输出必须经过脱敏。

/**
 * 对文本中的敏感值做脱敏替换（保留首 4 尾 4 字符便于定位）。
 *
 * - 短值（<= 8 字符）不替换（避免误伤普通单词）
 * - 空数组直接返回原文
 *
 * @example
 * maskSecrets('call failed with key sk-abc12345xyz', ['sk-abc12345xyz'])
 * // → 'call failed with key sk-a****yz'
 */
export function maskSecrets(text: string, secrets: string[]): string {
    if (!text || secrets.length === 0) {
        return text
    }
    let result = text
    for (const secret of secrets) {
        if (typeof secret !== 'string' || secret.length <= 8) {
            continue
        }
        result = result.split(secret).join(maskValue(secret))
    }
    return result
}

/** 单值脱敏：保留首 4 尾 4 字符，中间以星号填充。 */
export function maskValue(secret: string): string {
    if (secret.length <= 8) {
        return '****'
    }
    return `${secret.slice(0, 4)}****${secret.slice(-4)}`
}
