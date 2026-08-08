import type { RunResult } from '@dependfix/core'
import type { RuntimeConfig } from 'dependfix'

/** 执行器类型标识 */
export type ExecutorKind = 'container' | 'sandbox' | 'github-action' | 'local'

/** 执行上下文：平台侧组装，不携带任何平台密钥（凭据单独解密传递） */
export interface ScanExecutorContext {
    /** 平台侧 runId（对应 ScanRun.id） */
    runId: string
    /** 目标仓库（Repository 实体切片） */
    repository: {
        owner: string
        name: string
        defaultBranch: string
        packageManager?: 'pnpm' | 'npm' | 'yarn'
        /** ActionTriggerExecutor 使用：目标 workflow 文件名（仓库内路径，如 `.github/workflows/security-auto-fix.yml`） */
        actionWorkflowFile?: string
    }
    /** 复用 cli 的 RuntimeConfig（mode/severityThreshold/repositories 等） */
    config: RuntimeConfig
    /** 解密后的凭据（仅本次执行内存中持有，用后即弃） */
    credential?: { token: string }
    /** 工作目录：容器执行 = 数据卷下 runs/{runId}/；action 触发 = 不需要 */
    workDir: string
}

/** 执行结果：结构化回传（落库 ScanRun/ScanResult 的数据源） */
export interface ScanExecutorResult {
    exitCode: number
    /** cli 的 RunResult（repositories/alerts/actions/errors/summary） */
    result?: RunResult
    /** 执行级失败（非业务失败：超时/环境缺失/触发失败等） */
    error?: { code: string, message: string }
    /** B 模式：action run 页面 URL（触发后轮询定位；容器执行无此字段） */
    runUrl?: string
    /** B 模式：GitHub Actions run id（结果回填时下载 artifact 用） */
    runId?: number
    startedAt: string
    finishedAt: string
}

/** 执行后端统一契约：平台 scan-orchestrator 只依赖此接口，不感知具体实现 */
export interface ScanExecutor {
    readonly kind: ExecutorKind
    /** 执行前可用性探测（如容器内工具链存在性 / action 仓库权限校验） */
    isAvailable(): Promise<boolean>
    execute(ctx: ScanExecutorContext): Promise<ScanExecutorResult>
}
