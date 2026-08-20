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
     * UI 暂不暴露该字段（M11 T1005-B 决策：UI 仅做执行方式选择，限额覆盖走 API 层；与 M10 决策 D5「仓库级可选」一致）。
     * 演进路径：未来若需要批量仓库限额 UI（如 monorepo 大仓库统一调高 memoryMb），可在执行方式 Dropdown 旁加折叠面板。
     */
    @Column({ type: 'text', nullable: true })
    sandboxLimits!: string | null
}

/** 解析 tags JSON 字符串 → 字符串数组（非法/缺失返回空数组，容错不抛错） */
export const parseTags = (raw: string | null | undefined): string[] => {
    if (!raw) {
        return []
    }
    try {
        const parsed: unknown = JSON.parse(raw)
        return Array.isArray(parsed)
            ? parsed.filter((tag): tag is string => typeof tag === 'string')
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
