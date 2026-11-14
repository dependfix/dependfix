import type { RunResult } from '@dependfix/core'
import type { RuntimeConfig } from '@dependfix/engine'

/** 执行器类型标识 */
export type ExecutorKind = 'container' | 'sandbox' | 'github-action' | 'local'

/** 资源指标来源：Linux cgroup v2 / v1；none = 不可采集 */
export type ResourceSource = 'cgroup-v2' | 'cgroup-v1' | 'none'

/**
 * 执行窗口的资源快照（container 进程内采样 / sandbox 容器内 cgroup 采样；
 * action 执行器显式 `source: 'none'` + 原因）。
 *
 * `null` 一律表示「不可采集」，不得由消费方推断为 0：
 * - `memoryMaxBytes`：cgroup 内存上限；无限制 / 不可读 → null（`limitReason` 说明）
 * - `peakRssBytes`：执行窗口内 cgroup `memory.current` 采样峰值（含页缓存）
 * - `oomKilled`：执行前后 cgroup `oom_kill` 计数是否增加；计数不可读 → null
 */
export interface ExecutorResourceUsage {
    memoryMaxBytes: number | null
    peakRssBytes: number | null
    oomKilled: boolean | null
    source: ResourceSource
    /** 指标不可采集 / 部分不可采集的原因（落库供 UI 提示） */
    degradedReason?: string
    /** memoryMaxBytes 为 null 的原因（unlimited / invalid 等） */
    limitReason?: string
    /** 峰值采样次数（0 = 未采集） */
    samples?: number
    /** 执行结果错误文本中出现 SIGKILL（辅助归因，不单独断言 OOM） */
    sigkillDetected?: boolean
}

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
        /**
         * 仓库级自定义验证命令（来自 Repository.verifyCommands；见 docs/standards/platform.md §3.8）。
         * 缺省（undefined / 空数组）→ 引擎走默认验证链 `DEFAULT_VERIFY_COMMANDS`。
         * 安全：等价于远程命令执行面，写入门槛见 API 层 requireRole(['admin','org_admin'])。
         */
        verifyCommands?: string[]
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
    /**
     * `fix-and-pr` 交付创建的 PR 编号（新建或命中同内容 PR）。
     *
     * 非 PR 交付（fix / report-only / 无新 commit）缺省；落库到 `ScanRun.prNumber`，
     * 供 PR 回环反馈判定「观察态」（见 docs/design/governance/pr-feedback-loop.md §3）。
     */
    prNumber?: number
    /** 执行日志（JSON 数组：[{timestamp, level, message, context}]） */
    logsJson?: string
    /** 执行窗口内存 / OOM 快照（容器执行器采集；缺省 = 未接入，落库为 NULL + 原因） */
    resource?: ExecutorResourceUsage
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
