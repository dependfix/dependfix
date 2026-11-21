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

/**
 * 审计代理注入状态（运行结果披露用）。
 *
 * - `injected`：审计代理已注入执行子进程（deny-by-default 生效）
 * - `existing-proxy`：环境已有代理，未注入（deny-by-default 不生效，仅保留命令输出 URL 提取）
 * - `disabled`：`DEPENDFIX_NETWORK_AUDIT=false` 显式关闭
 * - `unavailable`：代理启动失败或运行未经过审计初始化（原因见 note）
 */
export type NetworkAuditInjectionStatus = 'injected' | 'existing-proxy' | 'disabled' | 'unavailable'

/** 审计代理注入记录（只描述状态，不含凭据 / 目标）。 */
export interface NetworkAuditInjectionRecord {
    status: NetworkAuditInjectionStatus
    /** 额外说明（如「环境已有 HTTP(S)_PROXY，deny-by-default 未生效」） */
    note?: string
}
