// run-egress.ts — 运行级外联审计的生命周期接线（app 主流程只保留两个调用点）。
//
// 拆出理由：`app/index.ts` 已压在 max-lines 上限，审计的启动 / 收口 / 结果附加属于可独立测试的
// 机械接线，集中在此处也避免主流程继续膨胀。

import { redactNetworkTarget, type FixError, type RunResult } from '@dependfix/core'
import { discoverRegistryHosts } from '../runners/registry-discovery'
import { startRunEgressAudit, stopRunEgressAudit, type RunEgressSnapshot } from '../runners/egress-audit'

/** 启动运行级审计（allowlist 含 workDir 配置面动态发现的 registry host）。 */
export async function beginRunEgressAudit(workDir: string): Promise<void> {
    await startRunEgressAudit({ extraAllowedDomains: discoverRegistryHosts(workDir).hosts })
}

/** 停止审计并返回快照（未启动时为 undefined）。 */
export async function finishRunEgressAudit(): Promise<RunEgressSnapshot | undefined> {
    return stopRunEgressAudit()
}

/**
 * 把审计结果附加到 RunResult（有记录时）：`networkAudit` 全量、`networkViolations` 只含违规，
 * 同时把违规计数写入 summary 供平台列表 / 详情 / 导出读取。
 */
export function attachRunEgressResult(
    runResult: RunResult,
    snapshot: RunEgressSnapshot | undefined,
    errors?: FixError[],
): boolean {
    if (!snapshot || snapshot.entries.length === 0) {
        return false
    }
    runResult.networkAudit = snapshot.entries
    runResult.networkViolations = snapshot.violations
    runResult.summary.networkViolations = snapshot.violations.length
    runResult.summary.networkAudited = snapshot.entries.length
    if (snapshot.violations.length === 0) {
        return false
    }
    // 违规不写成「成功」：记一条非跳过类审计错误，使出口码不为 0（平台据此不判「验证通过」）
    errors?.push({
        repository: '*',
        stage: 'verify',
        category: 'NETWORK_VIOLATION',
        message: `non-allowlisted outbound target(s) blocked: ${snapshot.violations
            .map((entry) => `${entry.method} ${redactNetworkTarget(entry.target)}`)
            .slice(0, 5)
            .join(', ')}`,
    })
    return true
}
