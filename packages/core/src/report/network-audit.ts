// network-audit.ts — 运行级外联审计记录（RunResult.networkAudit / networkViolations）。
//
// 只记录方法与目标，不含请求 / 响应体；violation 标记 deny-by-default 拦截。

/** 外联审计来源：本地拦截代理 / 命令输出 URL 提取。 */
export type NetworkAuditSource = 'proxy' | 'command-output'

/** 单条外联审计记录（与引擎 `NetworkAuditEntry` 同形）。 */
export interface NetworkAuditEntry {
    /** 记录时间（ISO） */
    time: string
    source: NetworkAuditSource
    /** 请求方法（CONNECT / GET / POST / …） */
    method: string
    /** 外联目标（proxy：host:port；command-output：完整 URL） */
    target: string
    /** deny-by-default 拦截的违规外联 */
    violation?: boolean
}
