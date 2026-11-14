// sandbox-diagnostics.ts — 沙箱执行的输出诊断辅助（与执行流程解耦，便于单测与会话日志复用）。

import { sanitizeString } from '../../utils/sanitize'

/**
 * registry URL → 主机名，用于把镜像站并入出站白名单。
 *
 * 只接受 `https:` 且不含内嵌凭据：明文源会让包元数据走明文；URL 内的凭据会经
 * `docker run -e` 进入容器 Config.Env（`docker inspect` 可见），与凭据只走 env 的口径冲突。
 * 非法 / 不合格返回 null，由调用方忽略该配置并告警。
 */
export function registryHostname(registry: string): string | null {
    if (!registry) {
        return null
    }
    try {
        const url = new URL(registry)
        if (url.protocol !== 'https:' || url.username || url.password) {
            return null
        }
        return url.hostname || null
    } catch {
        return null
    }
}

/** 取多行文本末尾片段（保留最后若干完整行，脱敏后单行化；单行超长时截尾）。 */
export function lastLines(text: string, maxChars: number): string {
    const lines = text.split('\n').map((line) => line.trim()).filter(Boolean)
    const picked: string[] = []
    let size = 0
    // 分隔符 ' / ' 占 3 字符，一并计入上限，避免短行场景超限
    for (let i = lines.length - 1; i >= 0; i -= 1) {
        const line = lines[i]!
        if (size + line.length + 3 > maxChars) {
            break
        }
        picked.unshift(line)
        size += line.length + 3
    }
    if (picked.length === 0) {
        const tail = lines.at(-1)
        return tail ? sanitizeString(tail.slice(-maxChars)) : ''
    }
    return sanitizeString(picked.join(' / '))
}

export function buildLogsJson(stdout: string, stderr: string, maxLines = 100): string {
    const now = new Date().toISOString()
    const toLines = (text: string) => text.split('\n')
        .map((line) => sanitizeString(line.trim()))
        .filter(Boolean)
        .slice(-maxLines)
    const entries = [
        ...toLines(stdout).map((message) => ({ timestamp: now, level: 'info', message })),
        ...toLines(stderr).map((message) => ({ timestamp: now, level: 'error', message })),
    ]
    return JSON.stringify(entries)
}

