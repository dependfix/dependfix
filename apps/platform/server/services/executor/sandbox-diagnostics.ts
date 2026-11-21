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

export function buildLogsJson(stdout: string, stderr: string, maxLines = 100): { logsJson: string, dropped: number } {
    const now = new Date().toISOString()
    const toLines = (text: string) => text.split('\n')
        .map((line) => sanitizeString(line.trim()))
        .filter(Boolean)
    const stdoutLines = toLines(stdout)
    const stderrLines = toLines(stderr)
    const keptStdout = stdoutLines.slice(-maxLines)
    const keptStderr = stderrLines.slice(-maxLines)
    const dropped = (stdoutLines.length - keptStdout.length) + (stderrLines.length - keptStderr.length)
    const entries = [
        ...keptStdout.map((message) => ({ timestamp: now, level: 'info', message })),
        ...keptStderr.map((message) => ({ timestamp: now, level: 'error', message })),
    ]
    return { logsJson: JSON.stringify(entries), dropped }
}


/**
 * 后台低频采样容器自身 cgroup（200ms）的 shell 片段：记录峰值用量、内存上限与 oom_kill 增量，
 * 停止时写一份 JSON。任一文件不可读 → 对应字段 null，由平台补 `degradedReason`。
 *
 * 依赖同一条 `sh -c` 脚本中由 `buildResourceSamplerInit` 设置的变量
 * （`RESOURCE_FILE` / `STOP_FILE` / `CG` / `LIMIT_FILE` / `USAGE_FILE` / `OOM_FILE`）。
 */
export function buildResourceSamplerScript(): string {
    return ' ( src=none; base_oom=; final_oom=; '
        + 'if [ -n "$OOM_FILE" ]; then base_oom=$(sed -n "s/^oom_kill //p" "$OOM_FILE" 2>/dev/null | head -1); fi; '
        + 'peak=0; samples=0; '
        + 'while [ ! -f "$STOP_FILE" ]; do '
        + 'cur=$(cat "$USAGE_FILE" 2>/dev/null); '
        + 'if [ -n "$cur" ]; then samples=$((samples+1)); if [ "$cur" -gt "$peak" ] 2>/dev/null; then peak=$cur; fi; fi; '
        + 'sleep 0.2 2>/dev/null || sleep 1; '
        + 'done; '
        + 'limit=$(cat "$LIMIT_FILE" 2>/dev/null); limit_json=null; limit_reason=; '
        // v1 unlimited 哨兵 ≈ 2^60（与 resource-usage 同源）；v2 为字符串 max（非数字）→ 同样落 null + unlimited。
        // 文件缺失 / 空 → null 且不带原因（未知 ≠ 无上限）
        + 'if [ -n "$limit" ]; then '
        + 'if [ "$limit" -lt 9223372036854771712 ] 2>/dev/null; then limit_json=$limit; else limit_reason=unlimited; fi; '
        + 'fi; '
        + 'peak_json=null; if [ "$samples" -gt 0 ] 2>/dev/null; then peak_json=$peak; fi; '
        + 'if [ -n "$OOM_FILE" ]; then final_oom=$(sed -n "s/^oom_kill //p" "$OOM_FILE" 2>/dev/null | head -1); fi; '
        + 'oom=null; if [ -n "$base_oom" ] && [ -n "$final_oom" ]; then '
        + 'if [ "$final_oom" -gt "$base_oom" ] 2>/dev/null; then oom=true; else oom=false; fi; fi; '
        + 'if [ "$samples" -gt 0 ] 2>/dev/null; then '
        + 'if [ "$CG" = v2 ]; then src=cgroup-v2; elif [ "$CG" = v1 ]; then src=cgroup-v1; fi; fi; '
        + `printf '{"memoryMaxBytes":%s,"peakRssBytes":%s,"oomKilled":%s,"samples":%s,"source":"%s","limitReason":"%s"}' `
        + '"$limit_json" "$peak_json" "$oom" "$samples" "$src" "$limit_reason" > "$RESOURCE_FILE" ) &'
}
