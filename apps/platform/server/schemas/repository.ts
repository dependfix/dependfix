import { formatDurationMs } from '@dependfix/core'
import { z } from 'zod'
import {
    MAX_PR_CHECK_FOCUS_ENTRIES,
    MAX_PR_CHECK_FOCUS_NAME_LENGTH,
    MAX_PR_CHECK_FOCUS_PROVIDER_LENGTH,
    PR_CHECK_FOCUS_KINDS,
} from '#server/utils/pr-check-focus'
import {
    MAX_REPOSITORY_TAGS,
    MAX_REPOSITORY_TAG_LENGTH,
    normalizeRepositoryTags,
} from '#server/utils/repository-tags'
import { isValidDockerImage, MAX_DOCKER_IMAGE_LENGTH } from '#server/utils/docker-image'
import {
    MAX_CLONE_TIMEOUT_MS,
    MAX_COMMAND_TIMEOUT_MS,
    MAX_INSTALL_TIMEOUT_MS,
    MAX_MAX_EXECUTION_TIMEOUT_MS,
    MIN_CLONE_TIMEOUT_MS,
    MIN_COMMAND_TIMEOUT_MS,
    MIN_EXECUTION_TIMEOUT_MS,
    MIN_INSTALL_TIMEOUT_MS,
} from '#server/utils/execution-limits'

/**
 * 是否含换行 / 控制字符（含 DEL）。
 * 用于保持「一项 = 一条命令行」不变量；用 charCodeAt 判定而非正则，避免 eslint no-control-regex。
 */
const hasControlChar = (value: string): boolean => {
    for (let i = 0; i < value.length; i++) {
        const code = value.charCodeAt(i)
        if (code < 0x20 || code === 0x7F) {
            return true
        }
    }
    return false
}

/**
 * 仓库标签写入闸门（`POST /api/repos` / `PUT /api/repos/[id]` / e2e fixtures 共用）。
 *
 * - 逐项 trim / 非空 / 长度上限（{@link MAX_REPOSITORY_TAG_LENGTH}）
 * - 归一去重（保序）：重复标签不占额度，存进列的即读回的值
 * - 去重后条目数 ≤ {@link MAX_REPOSITORY_TAGS}，超限由 API 层转 400
 *
 * 读取侧（`parseTags`）复用同一 `normalizeRepositoryTags`，但**不施加容量上限**：
 * 存量超限行保持可读（宽容），容量只在写入把关。
 */
export const repositoryTagsSchema = z.array(
    z.string().trim().min(1, '标签不能为空')
        .max(MAX_REPOSITORY_TAG_LENGTH, `单个标签最长 ${MAX_REPOSITORY_TAG_LENGTH} 字符`),
)
    .transform((tags) => normalizeRepositoryTags(tags))
    .refine(
        (tags) => tags.length <= MAX_REPOSITORY_TAGS,
        `最多 ${MAX_REPOSITORY_TAGS} 个标签（去重后）`,
    )

/**
 * 仓库字段基线（**不含默认值**）。
 *
 * 拆出理由（repo-execution-limits.md 决策 D3）：`repositoryUpdateSchema` 直接用
 * `.partial()`——若字段带 `.default()`，Zod 的 partial 仍会在缺省字段上注入默认值，
 * 导致「PUT 只改 note」把 `executorKind` / `defaultBranch` / `packageManager` 静默重置。
 * create 侧在 {@link repositoryBase} 中显式补默认值。
 */
export const repositoryFieldShape = {
    owner: z.string().trim().min(1, 'owner 不能为空').max(100).regex(/^[A-Za-z0-9_.-]+$/, 'owner 含非法字符'),
    name: z.string().trim().min(1, '仓库名不能为空').max(100).regex(/^[A-Za-z0-9_.-]+$/, '仓库名含非法字符'),
    platform: z.enum(['github']),
    defaultBranch: z.string().trim().min(1).max(100),
    packageManager: z.enum(['pnpm', 'npm', 'yarn']),
    credentialId: z.string().trim().max(36).nullable().optional(),
    actionWorkflowFile: z.string().trim().max(255).nullable().optional(),
    executorKind: z.enum(['container', 'github-action', 'sandbox']),
    note: z.string().max(500).nullable().optional(),
    /** 仓库标签（数组形式输入；空数组在 API 层转 null 存储；更新语义：undefined=不修改 / null 或 [] = 清空） */
    tags: repositoryTagsSchema.nullable().optional(),
    /**
     * 沙箱资源限额覆盖（可选；缺省走平台 SANDBOX_DEFAULTS：2048MB / 1.0 CPU）。
     * `.strict()`：未知键直接 400，避免 Zod 静默剥离造成「配了不生效」。
     */
    sandboxLimits: z.object({
        memoryMb: z.number().int().min(64, 'memoryMb 至少 64MB').max(32768, 'memoryMb 至多 32768MB (32GB)').optional(),
        cpu: z.number().min(0.1, 'cpu 至少 0.1').max(16, 'cpu 至多 16').optional(),
    }).strict().nullable().optional(),
    /**
     * 仓库级沙箱镜像（可选；空 / null = 平台默认：SANDBOX_IMAGE 或 SANDBOX_IMAGE_REPO + TAG）。
     * 只校验语法，镜像可达性由执行期 docker 拉取决定。
     */
    sandboxImage: z.string().trim()
        .max(MAX_DOCKER_IMAGE_LENGTH, `镜像地址最长 ${MAX_DOCKER_IMAGE_LENGTH} 字符`)
        .refine((value) => value.length === 0 || isValidDockerImage(value), '镜像地址格式不合法（示例：ghcr.io/owner/dependfix:latest）')
        .nullable().optional(),
    /**
     * 仓库级自定义验证命令（覆盖引擎默认验证链）；安全边界与语义见实体字段注释。
     */
    verifyCommands: z.array(
        z.string().trim().min(1, '验证命令不能为空').max(500, '单条验证命令最长 500 字符')
            .refine((cmd) => !hasControlChar(cmd), '验证命令不能包含换行或控制字符'),
    ).max(20, '最多 20 条验证命令').nullable().optional(),
    /**
     * PR Check 告警关注集（仓库级白名单；null / 三维全空 = 未配置 = 全量只报警不阻断）。
     * 语义见 `server/utils/pr-check-focus.ts`；`.strict()` 拒绝未知维度。
     */
    prCheckFocus: z.object({
        providers: z.array(
            z.string().trim().min(1, '关注集 provider 不能为空')
                .max(MAX_PR_CHECK_FOCUS_PROVIDER_LENGTH, `关注集 provider 最长 ${MAX_PR_CHECK_FOCUS_PROVIDER_LENGTH} 字符`),
        ).max(MAX_PR_CHECK_FOCUS_ENTRIES, `关注集 provider 最多 ${MAX_PR_CHECK_FOCUS_ENTRIES} 项`).optional(),
        names: z.array(
            z.string().trim().min(1, '关注集 name 不能为空')
                .max(MAX_PR_CHECK_FOCUS_NAME_LENGTH, `关注集 name 最长 ${MAX_PR_CHECK_FOCUS_NAME_LENGTH} 字符`),
        ).max(MAX_PR_CHECK_FOCUS_ENTRIES, `关注集 name 最多 ${MAX_PR_CHECK_FOCUS_ENTRIES} 项`).optional(),
        kinds: z.array(
            z.string().trim().pipe(z.enum(PR_CHECK_FOCUS_KINDS)),
        ).max(MAX_PR_CHECK_FOCUS_ENTRIES, `关注集 kind 最多 ${MAX_PR_CHECK_FOCUS_ENTRIES} 项`).optional(),
    }).strict().nullable().optional(),
    // -----------------------------------------------------------------
    // 仓库级执行预算与超时（毫秒；null / undefined = 继承全局）
    // 运行期优先级与封顶见 server/utils/execution-limits.ts
    // -----------------------------------------------------------------
    executionTimeoutMs: z.number().int().min(MIN_EXECUTION_TIMEOUT_MS, '执行上限至少 1 分钟')
        .max(MAX_MAX_EXECUTION_TIMEOUT_MS, '执行上限超出平台允许范围').nullable().optional(),
    verifyCommandTimeoutMs: z.number().int().min(MIN_COMMAND_TIMEOUT_MS, '验证命令超时至少 10 秒')
        .max(MAX_COMMAND_TIMEOUT_MS, '验证命令超时超出允许范围').nullable().optional(),
    installTimeoutMs: z.number().int().min(MIN_INSTALL_TIMEOUT_MS, '安装超时至少 10 秒')
        .max(MAX_INSTALL_TIMEOUT_MS, '安装超时超出允许范围').nullable().optional(),
    cloneTimeoutMs: z.number().int().min(MIN_CLONE_TIMEOUT_MS, 'clone 超时至少 1 分钟')
        .max(MAX_CLONE_TIMEOUT_MS, 'clone 超时超出允许范围').nullable().optional(),
    /** 仓库级跨大版本升级授权（默认关闭；开启后仍走完整验证与失败回滚） */
    allowMajorUpgrade: z.boolean().optional(),
} as const

/** 子项超时不得超过执行上限（写入时交叉校验，错误挂在子项字段）。 */
const validateExecutionLimitInvariant = (
    data: { executionTimeoutMs?: number | null, verifyCommandTimeoutMs?: number | null, installTimeoutMs?: number | null, cloneTimeoutMs?: number | null },
    ctx: z.RefinementCtx,
): void => {
    const execution = data.executionTimeoutMs
    if (execution === undefined || execution === null) {
        return
    }
    const children: [keyof typeof data, string][] = [
        ['verifyCommandTimeoutMs', '验证命令超时'],
        ['installTimeoutMs', '安装超时'],
        ['cloneTimeoutMs', 'clone 超时'],
    ]
    for (const [field, label] of children) {
        const value = data[field]
        if (typeof value === 'number' && value > execution) {
            ctx.addIssue({
                code: 'custom',
                path: [field],
                message: `${label}不能大于执行上限（${formatDurationMs(execution)}）`,
            })
        }
    }
}

/** 仓库创建校验（含默认值与交叉校验）。 */
export const repositoryBase = z.object({
    ...repositoryFieldShape,
    platform: repositoryFieldShape.platform.default('github'),
    defaultBranch: repositoryFieldShape.defaultBranch.default('main'),
    packageManager: repositoryFieldShape.packageManager.default('pnpm'),
    executorKind: repositoryFieldShape.executorKind.default('container'),
})

/** 创建：github-action 必须声明 workflow + 执行超时不变量。 */
export const repositorySchema = repositoryBase.superRefine((data, ctx) => {
    if (data.executorKind === 'github-action' && !data.actionWorkflowFile?.trim()) {
        ctx.addIssue({
            code: 'custom',
            path: ['actionWorkflowFile'],
            message: '选择 GitHub Action 执行时必须填写目标 workflow 文件路径',
        })
    }
    validateExecutionLimitInvariant(data, ctx)
})

/**
 * 仓库更新：允许部分字段。
 *
 * 注意：基线 `repositoryFieldShape` **不带默认值**——`.partial()` 只对缺省字段放行，
 * 不会注入 `platform` / `defaultBranch` / `packageManager` / `executorKind`（否则只改 note 的
 * PUT 会静默重置执行器与分支）。含 refinement 的 schema 不能直接 `.partial()`（Zod v4 限制），
 * 故先 partial 再挂 superRefine。
 */
export const repositoryUpdateSchema = z.object(repositoryFieldShape).partial().superRefine((data, ctx) => {
    if (data.executorKind === 'github-action' && !data.actionWorkflowFile?.trim()) {
        ctx.addIssue({
            code: 'custom',
            path: ['actionWorkflowFile'],
            message: '选择 GitHub Action 执行时必须填写目标 workflow 文件路径',
        })
    }
    validateExecutionLimitInvariant(data, ctx)
})

export type RepositoryInput = z.infer<typeof repositorySchema>
