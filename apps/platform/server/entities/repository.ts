import {
    Column,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
} from 'typeorm'
import { BaseEntity } from './base-entity'
import { Credential } from './credential'
import { Organization } from './organization'
import { normalizeRepositoryTags } from '#server/utils/repository-tags'

/** 仓库托管平台（当前仅 GitHub） */
export type RepositoryPlatform = 'github'

/**
 * 目标仓库（平台控制面记录，数据面执行由 Executor 承担）。
 * owner/name/platform 组合唯一（同一平台同一仓库只允许一条记录）。
 * 注意：复合唯一索引必须声明在类级——TypeORM 1.x 列级 @Index(['a','b','c'])
 * 会错误生成仅含末列的单列索引（实测 UNIQUE(platform)），导致第二个仓库必然 500。
 */
@Entity('repository')
@Index(['owner', 'name', 'platform'], { unique: true })
export class Repository extends BaseEntity {
    /**
     * 所属组织 id（物理可空列：存量库 ALTER TABLE 无法加无默认值 NOT NULL 列；
     * 应用层强制非空——创建路径经 resolveOrganizationId 填充，初始化时存量数据统一挂默认组织）
     */
    @Index()
    @Column({ type: 'varchar', length: 36, nullable: true })
    organizationId!: string | null

    /** 所属组织实体（仅查询时加载，不参与写入） */
    @ManyToOne(() => Organization, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'organization_id' })
    organization!: Organization | null

    @Column({ type: 'varchar', length: 100 })
    owner!: string

    @Column({ type: 'varchar', length: 100 })
    name!: string

    @Column({ type: 'varchar', length: 32, default: 'github' })
    platform!: RepositoryPlatform

    @Column({ type: 'varchar', length: 100, default: 'main' })
    defaultBranch!: string

    /** 包管理器（默认 pnpm；支持 pnpm/npm/yarn） */
    @Column({ type: 'varchar', length: 32, default: 'pnpm' })
    packageManager!: string

    /** 关联凭据（可选：扫描依赖 GitHub API 时需要，如 Dependabot alerts） */
    @Index()
    @Column({ type: 'varchar', length: 36, nullable: true })
    credentialId!: string | null

    /** 关联凭据实体（仅查询时加载，不参与写入） */
    @ManyToOne(() => Credential, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'credential_id' })
    credential!: Credential | null

    /**
     * 目标 workflow 文件名（仓库内相对路径，如 `.github/workflows/security-auto-fix.yml`）。
     * ActionTriggerExecutor（B 模式）触发 `workflow_dispatch` 时使用；
     * 未配置则平台走容器内执行（A 模式，默认）。
     */
    @Column({ type: 'varchar', length: 255, nullable: true })
    actionWorkflowFile!: string | null

    /** 执行后端（默认 container；配置 actionWorkflowFile 后可切换 github-action） */
    @Column({ type: 'varchar', length: 32, default: 'container' })
    executorKind!: string

    /**
     * AI 研判开关（默认 false，opt-in）
     * - false：扫描不触发 AI 研判（即使 Organization 已配置 API Key）
     * - true：按 aiTrigger 范围在 dependency upgrade validation failure / major upgrade 时触发
     * - 与 Organization.aiApiKeyEncrypted 配合：启用前必须先配置 Organization AI Key
     */
    @Column({ type: 'boolean', default: false, name: 'ai_enabled' })
    aiEnabled!: boolean

    /**
     * AI 研判触发范围（默认 both）
     * - failure：仅升级验证失败时触发
     * - major：仅 major 升级时触发
     * - both：failure + major 任一触发
     */
    @Column({ type: 'varchar', length: 16, default: 'both', name: 'ai_trigger' })
    aiTrigger!: 'failure' | 'major' | 'both'

    /** 备注（可选） */
    @Column({ type: 'text', nullable: true })
    note!: string | null

    /** 最近扫描时间（扫描任务回填） */
    @Column({ type: 'datetime', nullable: true })
    lastScanAt!: Date | null

    /**
     * 仓库标签（JSON 数组字符串，如 '["frontend","critical"]'；用于批量选择策略，
     * 空数组存 null）。选择用 JSON 字符串列而非关联表：标签量小且仅用于选择过滤，
     * 演进路径：后续需要标签管理 UI 时再升级为独立关联表。
     */
    @Column({ type: 'text', nullable: true })
    tags!: string | null

    /**
     * 沙箱资源限额覆盖（JSON 字符串，可选；与 sandbox-executor.ts SandboxExecutorOptions.sandboxLimits 对齐）：
     * `{ memoryMb?: number, cpu?: number }` —— 缺省走平台 SANDBOX_DEFAULTS（2048MB/1.0）。
     * 限额优先级：仓库级 > 沙箱级 > 平台默认（见 sandbox-executor.ts:107 注释）。
     * UI 暂不暴露该字段（UI 仅做执行方式选择，限额覆盖走 API 层；仓库级可选）。
     * 演进路径：未来若需要批量仓库限额 UI（如 monorepo 大仓库统一调高 memoryMb），可在执行方式 Dropdown 旁加折叠面板。
     */
    @Column({ type: 'text', nullable: true })
    sandboxLimits!: string | null

    /**
     * 仓库级沙箱镜像引用（可选；示例 `ghcr.io/owner/dependfix:latest`）。
     *
     * 缺省 → 平台 `SANDBOX_IMAGE` → `SANDBOX_IMAGE_REPO` + `SANDBOX_IMAGE_TAG`
     * （默认按平台 registry → Docker Hub → ghcr → ACR 逐源预检，tag 取平台构建版本）。
     * 外置 rootless daemon 通常没有本地构建的镜像，需显式配置仓库级值或平台 env；
     * 语法校验见 `utils/docker-image.ts`（执行期仍以 docker 拉取结果为准）。
     */
    @Column({ type: 'varchar', length: 255, nullable: true })
    sandboxImage!: string | null

    /**
     * 仓库级自定义验证命令（JSON 数组字符串，如 `'["pnpm install --frozen-lockfile","pnpm test"]'`）；
     * 覆盖引擎默认验证链（`DEFAULT_VERIFY_COMMANDS`），空数组存 null。
     *
     * **安全边界（重要）**：该字段等价于「远程命令执行面」——容器执行器把命令原样交给引擎验证链执行，
     * 自定义命令**不经过** `validateVerifyCommands` 的脚本存在性校验（与 CLI `--commands` 语义一致）。
     * 因此：写入门槛由 API 层 `requireRole(['admin', 'org_admin'])` 保证；变更登记 `AuditEvent`
     * （`verify_commands_update`）留痕；仅接受命令数组，不接受 shell 字符串拼接；单命令超时仍生效。
     */
    @Column({ type: 'text', nullable: true })
    verifyCommands!: string | null

    /**
     * PR Check 告警关注集（JSON 字符串，白名单；null = 未配置 = 全量只报警不阻断）。
     *
     * 形态：`{ providers?: string[], names?: string[], kinds?: ('check'|'status'|'deployment')[] }`。
     * 语义（详见 [pr-build-deploy-signals.md §9](../../../../docs/design/governance/pr-build-deploy-signals.md)）：
     * - 只有命中关注集的信号参与 `overallStatus` / `conclusion` / `failureSources` / `alertFiring` 判定；
     *   未命中的信号仍全量落库到 `PRCheck.signalsJson`，并在 UI 中标注「未关注」。
     * - 维度内取并集、维度间取交集，留空维度不限；三维全空等价于未配置。
     * - 配置变更在下一轮 polling 生效（不回溯历史行）。
     *
     * 解析 / 规范化统一走 `server/utils/pr-check-focus.ts`（与 API 校验共享常量）。
     */
    @Column({ type: 'text', nullable: true })
    prCheckFocus!: string | null

    // ---------------------------------------------------------------------
    // 仓库级执行预算与超时（2026-11-08；`null` = 继承全局）
    //
    // 口径见 [repo-execution-limits.md](../../../../docs/design/governance/repo-execution-limits.md) §4.1：
    // 库内一律毫秒（与引擎常量同源），前端输入 / 展示一律分钟。
    // 解析优先级与边界在 `server/utils/execution-limits.ts`（单一事实源）。
    // ---------------------------------------------------------------------

    /** 单仓执行上限（覆盖 `EXECUTION_TIMEOUT_MS`；另受平台封顶约束） */
    @Column({ type: 'integer', nullable: true, name: 'execution_timeout_ms' })
    executionTimeoutMs!: number | null

    /** 单条验证命令超时（覆盖 `DEPENDFIX_VERIFY_TIMEOUT_MS`） */
    @Column({ type: 'integer', nullable: true, name: 'verify_command_timeout_ms' })
    verifyCommandTimeoutMs!: number | null

    /** 安装类命令超时（覆盖 `DEPENDFIX_INSTALL_TIMEOUT_MS`） */
    @Column({ type: 'integer', nullable: true, name: 'install_timeout_ms' })
    installTimeoutMs!: number | null

    /** clone 超时（覆盖 `CLONE_TIMEOUT_MS`） */
    @Column({ type: 'integer', nullable: true, name: 'clone_timeout_ms' })
    cloneTimeoutMs!: number | null

    /**
     * 仓库级跨大版本升级授权（默认关闭）。
     *
     * 关闭：跨 major 告警记 `cross-major` 跳过（人工处理）；开启：满足准入条件（根 manifest 直接依赖 +
     * lockfile 单版本）的告警进入升级链，仍走完整验证与失败自动回滚。间接依赖 / 多版本共存维持人工。
     * 仅平台显式配置面（CLI 走 `--allow-major-upgrade`，Action 与 env 均无隐式通道）。
     */
    @Column({ type: 'boolean', default: false })
    allowMajorUpgrade!: boolean

    /**
     * PR 回环反馈配置（JSON 文本；`null` = 全默认）。
     *
     * 形状：`{ comment, closeFailed, retryFailed, windowHours }`，解析与默认值见
     * `server/services/pr-feedback/config.ts`；口径见
     * [pr-feedback-loop.md](../design/governance/pr-feedback-loop.md) §7。
     */
    @Column({ type: 'text', nullable: true, name: 'pr_feedback' })
    prFeedback!: string | null
}

/**
 * 解析 tags JSON 字符串 → 字符串数组（非法/缺失返回空数组，容错不抛错）。
 *
 * 归一与写入侧**同源**（`normalizeRepositoryTags`：trim + 去重保序），保证
 * 「按合法输入写入的值 = 读回的值」；存量脏数据（未 trim / 重复项）读时一并归一，
 * 无需回填。容量上限只在写入侧把关（读取保持宽容，不截断存量行）。
 */
export const parseTags = (raw: string | null | undefined): string[] => {
    if (!raw) {
        return []
    }
    try {
        const parsed: unknown = JSON.parse(raw)
        return Array.isArray(parsed)
            ? normalizeRepositoryTags(parsed.filter((tag): tag is string => typeof tag === 'string'))
            : []
    } catch {
        return []
    }
}

/**
 * 解析 verifyCommands JSON 字符串 → 命令数组（非法/缺失返回空数组，容错不抛错）。
 * 与 parseTags 同模式（防御脏数据阻塞 list 渲染）；字段裁剪：丢弃非字符串项，并对命令 trim +
 * 丢弃 trim 后为空串的项（纵深防御：与 schema 写入侧 trim 语义对齐，避免历史脏数据绕过校验）。
 */
export const parseVerifyCommands = (raw: string | null | undefined): string[] => {
    if (!raw) {
        return []
    }
    try {
        const parsed: unknown = JSON.parse(raw)
        return Array.isArray(parsed)
            ? parsed
                .filter((cmd): cmd is string => typeof cmd === 'string')
                .map((cmd) => cmd.trim())
                .filter((cmd) => cmd.length > 0)
            : []
    } catch {
        return []
    }
}

/**
 * 解析 sandboxLimits JSON 字符串 → 限额对象 `{ memoryMb?, cpu? }`。
 * 防御策略与 parseTags 一致：非法 JSON / 非对象 / 字段类型异常 → 返回 undefined，
 * SandboxExecutor 拿到 undefined 后走平台 SANDBOX_DEFAULTS（避免单条脏数据阻塞 list 渲染）。
 * 字段裁剪：仅保留有效字段（多出字段被丢弃；NaN/Infinity 等非有限数字被丢弃），
 * 保证下游 SandboxExecutor 收到的对象完全满足 Zod 校验契约（min/max 边界在 schema 层把关）。
 */
export const parseSandboxLimits = (
    raw: string | null | undefined,
): { memoryMb?: number, cpu?: number } | undefined => {
    if (!raw) {
        return undefined
    }
    try {
        const parsed: unknown = JSON.parse(raw)
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return undefined
        }
        const result: { memoryMb?: number, cpu?: number } = {}
        const obj = parsed as Record<string, unknown>
        if (typeof obj.memoryMb === 'number' && Number.isFinite(obj.memoryMb)) {
            result.memoryMb = obj.memoryMb
        }
        if (typeof obj.cpu === 'number' && Number.isFinite(obj.cpu)) {
            result.cpu = obj.cpu
        }
        return Object.keys(result).length > 0 ? result : undefined
    } catch {
        return undefined
    }
}
