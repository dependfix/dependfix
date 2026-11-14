/**
 * 运行失败分类（单一事实源，纯函数）。
 *
 * 背景：`ScanRun.status='failed'` 语义过载——网络 / 环境类失败可重试，验证门禁 / 交付失败
 * 必须人工研判，但列表只显示「失败」。本模块把三套并存且碎片化的失败信号（平台执行器
 * `error.code`、引擎 `RunResult.errors[].category`、GitHub `AppError.code`）归一化为
 * `failure_code` / `failure_stage` / `failure_kind` 三列，落库以支持 SQL 筛选与汇总。
 *
 * 设计依据：[run-failure-taxonomy.md §4 分类模型](../../../../docs/design/governance/run-failure-taxonomy.md)。
 *
 * 边界：
 * - 仅 `failed` / `dispatched` 两个终态参与分类；`degraded` 是「业务完成 + 路径偏离」，不计入失败。
 * - 无法判定的码一律归 `unknown`（不猜测）；集中映射表 + `unknown` 兜底 = 抗分类漂移。
 * - 回填场景只有 `errorJson` 可用（引擎 `result.errors` 未落库），因此无法细分时依赖
 *   `engine_delivery_failed` message 中的 `（CATEGORY）` 回读细分。
 */

/** 失败阶段（面向 UI，见设计稿 §4.1） */
export type RunFailureStage =
    | 'source'
    | 'clone'
    | 'install'
    | 'fix'
    | 'verify'
    | 'deliver'
    | 'runtime'
    | 'cleanup'
    | 'unknown'

/** 处置建议（见设计稿 §4.2） */
export type RunFailureKind = 'transient' | 'deterministic' | 'unknown'

/** 失败阶段全集（API 校验 / 前端下拉选项用） */
export const RUN_FAILURE_STAGES: readonly RunFailureStage[] = [
    'source',
    'clone',
    'install',
    'fix',
    'verify',
    'deliver',
    'runtime',
    'cleanup',
    'unknown',
] as const

/** 处置建议全集 */
export const RUN_FAILURE_KINDS: readonly RunFailureKind[] = [
    'transient',
    'deterministic',
    'unknown',
] as const

/** 单次分类结果（`code` 为归一化后的原始码 / 类别，便于审计） */
export interface RunFailureClassification {
    code: string | null
    stage: RunFailureStage | null
    kind: RunFailureKind | null
}

/** 分类输入（run 终结时的可用信息；回填时 `engineCategories` 缺省） */
export interface RunFailureInput {
    /** ScanRun.status */
    status: string
    /** 落库 / 待落库的 errorJson（执行级或状态机派生错误） */
    error?: { code?: string | null, message?: string | null } | null
    /** 引擎 result.errors[].category（仅 run 终结时可得） */
    engineCategories?: readonly (string | null | undefined)[] | null
}

/** 可分类终态：degraded 为业务完整 + 路径偏离，不计入失败分类 */
const CLASSIFIABLE_STATUSES: ReadonlySet<string> = new Set(['failed', 'dispatched'])

/** `engine_delivery_failed` 的 message 形态：`引擎交付阶段失败（VERIFICATION_FAILED）：...` */
const DELIVERY_CATEGORY_PATTERN = /（([A-Za-z_]+)）/

interface FailureCodeMapping {
    stage: RunFailureStage
    kind: RunFailureKind
}

/**
 * 集中映射表：归一化码 → 阶段 + 处置建议。
 *
 * 覆盖三类来源（平台 error.code / 引擎 FixError.category / GitHub AppError.code）。
 * 未命中的码由 `classifyRunFailure` 归 `unknown`（抗分类漂移，见设计稿 §7 风险）。
 */
const FAILURE_CODE_MAP: Readonly<Record<string, FailureCodeMapping>> = {
    // source — 告警获取 / 仓库发现
    FETCH_FAILED: { stage: 'source', kind: 'unknown' },
    DISCOVERY_FAILED: { stage: 'source', kind: 'unknown' },
    EMPTY_REPO_LIST: { stage: 'source', kind: 'deterministic' },
    AUTHENTICATION_FAILED: { stage: 'source', kind: 'deterministic' },
    PERMISSION_DENIED: { stage: 'source', kind: 'deterministic' },
    ALERTS_DISABLED: { stage: 'source', kind: 'deterministic' },
    REPO_NOT_FOUND: { stage: 'source', kind: 'deterministic' },
    RATE_LIMITED: { stage: 'source', kind: 'transient' },
    NETWORK_ERROR: { stage: 'source', kind: 'transient' },
    GITHUB_API_ERROR: { stage: 'source', kind: 'unknown' },

    // clone — 仓库克隆
    clone_timeout: { stage: 'clone', kind: 'transient' },

    // install — 依赖安装 / lockfile
    LOCKFILE_NOT_FOUND: { stage: 'install', kind: 'deterministic' },
    MANIFEST_MISMATCH: { stage: 'install', kind: 'deterministic' },
    LOCKFILE_VERSION_MISMATCH: { stage: 'install', kind: 'deterministic' },
    CORRUPTED_LOCKFILE: { stage: 'install', kind: 'deterministic' },
    CREDENTIAL_ERROR: { stage: 'install', kind: 'deterministic' },
    RESOLVE_ERROR: { stage: 'install', kind: 'unknown' },
    MINIMUM_RELEASE_AGE: { stage: 'install', kind: 'deterministic' },
    // 基线已判安装失败但复检通过（拒绝「已合规」捷径后结构兜底全败）：
    // 锁文件本身需要人工确认，属确定性失败（当前仅在环境性失败外写审计，防御性登记）。
    PRECONDITION_FAILED: { stage: 'install', kind: 'deterministic' },
    // 环境性安装失败（诊断步无 stderr 诊断：被信号杀死 / 超时 / 静默非零退出）。
    // 引擎侧记 `ENVIRONMENT_ERROR` 并标记为**非归因**（`SKIPPED_AUDIT_CATEGORIES` +
    // `FixAction.environmentalFailure`）→ 不驱动 status=failed、不参与 exit code；
    // 故本项在当前编排路径上**不可达**（`failed` 分支的 `errorJson` 恒有值，见
    // `scan-orchestrator.service.ts` 落库段；其余失败写路径均传显式 error）。
    // 保留为**防御性映射**（同表内 `EMPTY_REPO_LIST` / `SCRIPT_NOT_FOUND` 等同类）：
    // 一旦内部回退读 `result.errors` 的路径被改动而变得可达，该信号应落 `install` + 可重试，
    // 而非笼统归入 `runtime` + `engine_exit_2`。注意 `resolveFailureCode` 取「首个可映射类别」，
    // 若该回退路径可达需同时核验优先级，避免把真实失败误标为 install/transient。
    ENVIRONMENT_ERROR: { stage: 'install', kind: 'transient' },

    // fix — 修复应用
    PROCESS_FAILED: { stage: 'fix', kind: 'unknown' },
    OVERRIDE_PROTECTED: { stage: 'fix', kind: 'deterministic' },
    FAMILY_LOCKSTEP_FAILED: { stage: 'fix', kind: 'deterministic' },

    // verify — 验证门禁
    VERIFICATION_FAILED: { stage: 'verify', kind: 'deterministic' },
    PRE_EXISTING_FAILURE: { stage: 'verify', kind: 'deterministic' },
    ROLLBACK_GRANULARITY_DEGRADED: { stage: 'verify', kind: 'deterministic' },
    SCRIPT_NOT_FOUND: { stage: 'verify', kind: 'deterministic' },
    network_violation: { stage: 'verify', kind: 'deterministic' },
    // 运行级外联违规（引擎 `NETWORK_VIOLATION`，deny-by-default 拦截）：与验证链同类，确定性失败
    NETWORK_VIOLATION: { stage: 'verify', kind: 'deterministic' },
    // 沙箱出站策略缺失（审计关闭 / 白名单被清空）：执行器第二道闸拒绝，属确定性配置错误
    sandbox_fix_requires_egress_policy: { stage: 'runtime', kind: 'deterministic' },
    // 沙箱 clone 基地址非法或不在出站白名单内：执行器执行前拒绝，属确定性配置错误
    sandbox_clone_host_not_allowed: { stage: 'runtime', kind: 'deterministic' },
    // 沙箱镜像缺失 / 不可拉取：配置 / 环境问题，确定性失败（此前落未知阶段）
    sandbox_image_unavailable: { stage: 'runtime', kind: 'deterministic' },

    // 运行预算不足：主动跳过未开始的工作（引擎侧属跳过类白名单，正常路径不可达；防御性映射）
    BUDGET_EXHAUSTED: { stage: 'runtime', kind: 'transient' },

    // runtime — 运行级取消（引擎 `ABORTED` 类别：平台执行超时 / 运维中止后引擎协作式收尾）。
    // 当前编排路径上超时由执行器以 `execution_timeout` 记录（`errorJson` 优先），本项为
    // **防御性映射**：一旦某条回退路径改读引擎类别，该信号应落 `runtime` + 可重试，
    // 而非 `engine_exit_2`（后者是"所有仓库失败"的笼统码，会掩盖"被中止"这一事实）。
    ABORTED: { stage: 'runtime', kind: 'transient' },

    // deliver — commit / push / PR 交付
    COMMIT_FAILED: { stage: 'deliver', kind: 'deterministic' },
    // 自包含交付推送失败（引擎 `PUSH_FAILED`）：分支未推，确定性失败
    PUSH_FAILED: { stage: 'deliver', kind: 'deterministic' },
    // 提交集合判定：未声明的已跟踪改动 / 只有生成物或未跟踪文件 → 未交付，需人工清理工作区
    UNEXPECTED_CHANGES: { stage: 'deliver', kind: 'deterministic' },
    NO_CHANGES: { stage: 'deliver', kind: 'deterministic' },
    push_failed: { stage: 'deliver', kind: 'unknown' },
    PR_CREATION_FAILED: { stage: 'deliver', kind: 'deterministic' },
    pr_creation_failed: { stage: 'deliver', kind: 'deterministic' },
    ROLLBACK_FAILED: { stage: 'deliver', kind: 'deterministic' },

    // cleanup — 分支 / PR 清理（best-effort）
    BRANCH_DELETE_FAILED: { stage: 'cleanup', kind: 'unknown' },
    PR_CLOSE_FAILED: { stage: 'cleanup', kind: 'unknown' },
    CLEANUP_DETECT_FAILED: { stage: 'cleanup', kind: 'unknown' },
    CLEANUP_FAILED: { stage: 'cleanup', kind: 'unknown' },
    supersede_failed: { stage: 'cleanup', kind: 'unknown' },

    // runtime — 执行器 / 编排 / 环境 / 队列
    execution_timeout: { stage: 'runtime', kind: 'transient' },
    execution_failed: { stage: 'runtime', kind: 'unknown' },
    sandbox_unavailable: { stage: 'runtime', kind: 'transient' },
    container_unavailable: { stage: 'runtime', kind: 'transient' },
    orchestration_failed: { stage: 'runtime', kind: 'unknown' },
    engine_exit_2: { stage: 'runtime', kind: 'deterministic' },
    FATAL: { stage: 'runtime', kind: 'unknown' },
    result_fetch_failed: { stage: 'runtime', kind: 'transient' },
    run_url_not_resolved: { stage: 'runtime', kind: 'transient' },
    workflow_not_configured: { stage: 'runtime', kind: 'deterministic' },
    enqueue_failed: { stage: 'runtime', kind: 'transient' },
    orphan_run: { stage: 'runtime', kind: 'transient' },
    force_failed: { stage: 'runtime', kind: 'deterministic' },
    SCAN_PENDING_MERGED: { stage: 'runtime', kind: 'deterministic' },

    // unknown — 状态机已标记交付失败但 message 无法细分类别
    engine_delivery_failed: { stage: 'unknown', kind: 'deterministic' },
}

/**
 * 从 `engine_delivery_failed` 的 message 回读引擎类别（`（CATEGORY）`）。
 * 无法解析时返回 `null`（回填场景信息不足 → 调用方走 `engine_delivery_failed` 兜底）。
 */
export const parseEngineDeliveryCategory = (message: string | null | undefined): string | null => {
    if (!message) {
        return null
    }
    const match = DELIVERY_CATEGORY_PATTERN.exec(message)
    return match?.[1] ?? null
}

/** 归一化原始码：engine_delivery_failed → 内层类别；无 errorJson 时回退引擎类别首个可映射项 */
const resolveFailureCode = (input: RunFailureInput): string | null => {
    const code = input.error?.code
    if (code === 'engine_delivery_failed') {
        return parseEngineDeliveryCategory(input.error?.message) ?? 'engine_delivery_failed'
    }
    if (code) {
        return code
    }
    const categories = input.engineCategories?.filter((category): category is string => Boolean(category))
    if (categories && categories.length > 0) {
        // 优先返回映射表内可识别的类别（避免首个未知类别掩盖后续已知类别）
        return categories.find((category) => FAILURE_CODE_MAP[category]) ?? categories[0] ?? null
    }
    return null
}

/**
 * 分类运行失败（纯函数）。
 *
 * - 非 `failed` / `dispatched` 状态 → 三字段均为 `null`（调用方据此清空历史分类）
 * - 无法判定码 → `code=null` + `stage='unknown'` + `kind='unknown'`（保守，不猜测）
 * - 未纳入映射表的码 → 保留 `code` 供审计，`stage` / `kind` 归 `unknown`
 */
export const classifyRunFailure = (input: RunFailureInput): RunFailureClassification => {
    if (!CLASSIFIABLE_STATUSES.has(input.status)) {
        return { code: null, stage: null, kind: null }
    }
    const code = resolveFailureCode(input)
    if (!code) {
        // `failed` 但无任何失败信息 → unknown（不猜测）；`dispatched` 仅表示「已派发待回执」，
        // 无错误码时不属失败分类（避免把进行中的派发记录混入 byFailureStage.unknown）
        return input.status === 'failed'
            ? { code: null, stage: 'unknown', kind: 'unknown' }
            : { code: null, stage: null, kind: null }
    }
    const mapping = FAILURE_CODE_MAP[code]
    if (!mapping) {
        return { code, stage: 'unknown', kind: 'unknown' }
    }
    return { code, stage: mapping.stage, kind: mapping.kind }
}

/** 分类落点（结构化子集，避免服务层 import 实体造成分层倒置） */
export interface FailureClassificationTarget {
    failureCode: string | null
    failureStage: RunFailureStage | null
    failureKind: RunFailureKind | null
}

/**
 * 就地写入分类三列（供 run 终结 / 队列失败 / 清理等所有失败写路径复用）。
 * 非失败终态会被清空，保证「复用既有 run 记录」时不残留上一次执行的分类。
 */
export const applyFailureClassification = (
    target: FailureClassificationTarget,
    input: RunFailureInput,
): RunFailureClassification => {
    const classification = classifyRunFailure(input)
    target.failureCode = classification.code
    target.failureStage = classification.stage
    target.failureKind = classification.kind
    return classification
}
