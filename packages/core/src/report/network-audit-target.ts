// network-audit-target.ts — 外联目标的最小化展示（报告安全形态）。
//
// deny-by-default 拦截的证据字段不落 payload：恶意脚本通过 URL query 外带凭据时，网络层已拦截，
// 但查询串不得原样回显进报告 / 导出（防御纵深，最小暴露）。只保留 host[:port]。

/**
 * 将外联目标收敛为 `host[:port]`（丢弃协议、路径与查询串）。
 *
 * - `evil.example.com:443`（CONNECT）→ 原样
 * - `https://evil.example.com/exfil?token=x` → `evil.example.com`
 * - `[::1]:443` / `http://host:8080/path` → 保留方括号 / 端口
 * - 空 / 无法解析 → `<unknown-target>`
 */
export function redactNetworkTarget(target: string): string {
    let t = target.trim()
    const protoIdx = t.indexOf('://')
    if (protoIdx >= 0) {
        t = t.slice(protoIdx + 3)
    }
    const slashIdx = t.indexOf('/')
    if (slashIdx >= 0) {
        t = t.slice(0, slashIdx)
    }
    // 剥离 URL 内联凭据（`user:pass@host`）：token-in-userinfo 形态不得进报告 / 导出
    const atIdx = t.lastIndexOf('@')
    if (atIdx >= 0) {
        t = t.slice(atIdx + 1)
    }
    return t || '<unknown-target>'
}
