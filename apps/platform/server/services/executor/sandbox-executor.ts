import type { RunResult } from '@dependfix/core'
import type { ExecutorResourceUsage, ScanExecutor, ScanExecutorContext, ScanExecutorResult } from './types'
import { resolveDefaultSandboxImage, resolveSandboxImageCandidates, resolveImagePullTimeoutMs } from './sandbox-image'

export { deriveSandboxRepoFromPlatformImage, resolveDefaultSandboxImage, resolveSandboxImageCandidates } from './sandbox-image'
import { DockerAdapter, SANDBOX_DEFAULTS, type ContainerRunResult, type ContainerSpec, type RuntimeAdapter } from './runtime-adapter'
import { sanitizeString } from '#server/utils/sanitize'
import {
    buildSandboxResourceUsage,
    unavailableResourceUsage,
    type SandboxResourceSample,
} from '#server/utils/resource-usage'

/** 自包含 CLI 入口（镜像内由 Dockerfile 复制；本地联调可经 env 指向工作区产物） */
const DEFAULT_SANDBOX_ENTRY = process.env.DEPENDFIX_SANDBOX_ENTRY ?? '/app/sandbox/bin.mjs'

/** 随 bundle 复制的产品 skill 根目录（其下为 dependfix-remediator） */
const DEFAULT_SANDBOX_SKILLS_DIR = process.env.DEPENDFIX_SANDBOX_SKILLS_DIR ?? '/app/sandbox/skills'

/** 容器内结果文件路径（容器私有文件系统；不依赖宿主与平台容器的路径映射） */
const CONTAINER_RESULT_PATH = '/tmp/result.json'

/** 容器内资源采样输出（cgroup v2 / v1）与停止标记 */
const RESOURCE_RESULT_PATH = '/tmp/dependfix-resource.json'
const RESOURCE_STOP_PATH = '/tmp/dependfix-resource.stop'
const RESOURCE_SENTINEL_START = '__DEPENDFIX_RESOURCE_JSON_START__'
const RESOURCE_SENTINEL_END = '__DEPENDFIX_RESOURCE_JSON_END__'

/** 结果回传哨兵：CLI 日志走 stdout，只有哨兵之间的内容是显式结果契约 */
const RESULT_SENTINEL_START = '__DEPENDFIX_RESULT_JSON_START__'
const RESULT_SENTINEL_END = '__DEPENDFIX_RESULT_JSON_END__'

/** 放行的执行模式（fix / fix-and-pr 需出站策略就位，见 resolveEgressPolicy / 第二道闸） */
const SANDBOX_REPORT_ONLY = 'report-only'
const SANDBOX_ALLOWED_MODES: ReadonlySet<string> = new Set([SANDBOX_REPORT_ONLY, 'fix', 'fix-and-pr'])

/**
 * 沙箱 fix 的必需出站域（平台侧最小集合，与引擎默认白名单一致的相关项）。
 * 操作方可用 DEPENDFIX_ALLOWED_DOMAINS 追加；追加后并集作为容器内审计代理的白名单。
 */
const SANDBOX_REQUIRED_EGRESS_DOMAINS = ['github.com', 'api.github.com', '*.npmjs.org'] as const

/** 容器内 clone 目标目录（平台不挂载宿主目录） */
const CONTAINER_REPO_PATH = '/tmp/repo'

/**
 * clone 基地址（默认 GitHub；企业镜像 / 自建 GitLab / Gitee 可用 SANDBOX_CLONE_BASE_URL 覆盖）。
 * 目标仓库仍由平台构造（owner/name），不接受仓库级配置——避免被扫描目标改写 clone 源。
 */
const DEFAULT_CLONE_BASE_URL = process.env.SANDBOX_CLONE_BASE_URL?.trim().replace(/\/+$/, '') || 'https://github.com'

// 注：与 SANDBOX_IMAGE 同模式——模块加载期读取 env；实例选项可覆盖（测试 / 多实例场景）

/** 仅放行的告警源：report-only 的隔离论证依赖「不执行目标仓库代码」 */
const SANDBOX_ALLOWED_ALERT_SOURCE = 'github-dependabot'

/** runId 字符白名单(防御性——拒绝任何路径分隔符或父目录引用,即使来源是数据库生成 ID) */
const RUN_ID_PATTERN = /^[A-Za-z0-9_-]+$/

/** 沙箱执行选项 */
export interface SandboxExecutorOptions {
    /** 注入 RuntimeAdapter(默认 DockerAdapter——便于单测 spy 替换) */
    runtimeAdapter?: RuntimeAdapter
    /** 沙箱镜像名 */
    image?: string
    /** 自包含 CLI 入口（容器内路径） */
    entry?: string
    /** 产品 skill 根目录（容器内路径） */
    skillsDir?: string
    /** 沙箱级资源限额(缺省走平台 SANDBOX_DEFAULTS;仓库级覆盖由 Repository 实体 sandboxLimits 字段承载) */
    sandboxLimits?: { memoryMb?: number, cpu?: number }
    /** 单次执行超时(默认 30 分钟——与 ContainerExecutor 对齐) */
    timeoutMs?: number
    /** clone 基地址覆盖（默认读 SANDBOX_CLONE_BASE_URL，回退 https://github.com） */
    cloneBaseUrl?: string
    /** 出站策略覆盖（缺省读 env：DEPENDFIX_NETWORK_AUDIT / DEPENDFIX_ALLOWED_DOMAINS） */
    egress?: {
        enabled?: boolean
        allowlist?: string[]
    }
}

/** 解析后的出站策略（fix 模式的第二道闸依据）。 */
export interface SandboxEgressPolicy {
    enabled: boolean
    allowlist: string[]
}

/**
 * 解析出站策略：默认启用（可用 `DEPENDFIX_NETWORK_AUDIT=false` 关闭；env 路径总会并入必需域，
 * 「白名单被清空」仅经 options 可达，用于运维显式禁用或测试），
 * 白名单 = 平台必需域 ∪ 操作方配置域（`DEPENDFIX_ALLOWED_DOMAINS`，逗号分隔）。
 */
export function resolveEgressPolicy(overrides?: { enabled?: boolean, allowlist?: string[] }): SandboxEgressPolicy {
    const enabled = overrides?.enabled
        ?? process.env.DEPENDFIX_NETWORK_AUDIT?.trim().toLowerCase() !== 'false'
    // 显式传入白名单时以其为准（空数组 = 操作方清空 → 第二道闸拒绝 fix）
    if (overrides?.allowlist) {
        return { enabled, allowlist: [...overrides.allowlist] }
    }
    const configured = (process.env.DEPENDFIX_ALLOWED_DOMAINS ?? '')
        .split(',').map((item) => item.trim()).filter(Boolean)
    return {
        enabled,
        allowlist: [...new Set([...SANDBOX_REQUIRED_EGRESS_DOMAINS, ...configured])],
    }
}

/**
 * 沙箱执行器(隔离执行用户脚本——独立 Docker 容器)。
 *
 * 设计要点(见 docs/design/governance/executor-sandbox.md §3):
 * - **存在意义**:把可能执行恶意脚本的副作用隔离在独立容器内(与平台容器即沙箱的 A 模式对照)
 * - **不强绑定 rootless**:通过 RuntimeAdapter 抽象,daemon 不可用即降级回 ContainerExecutor(并存,向后兼容)
 * - **零信任默认**:user `100:100`(rootless 标配)+ cgroup 限额 + 不挂宿主 docker.sock
 * - **接口契约**:与 ContainerExecutor 同构——`kind: 'sandbox'` / `isAvailable()` / `execute(ctx)`
 *
 * 结果回传：不 bind-mount 宿主目录（平台容器与宿主 daemon 的路径视角不一致），
 * 由容器内自包含 CLI 写 `/tmp/result.json`，shell 用哨兵把内容打到 stdout；执行器只解析哨兵区间。
 *
 * 错误分类契约(caller 按 error.code 决定降级路径):
 * - `sandbox_unavailable`:RuntimeAdapter ENOENT/ENOTCONN/EACCES/ECONNREFUSED(daemon 不可用)
 * - `execution_timeout`:外层 withTimeout 触发 或 RuntimeAdapter 返回 exitCode 124
 * - `sandbox_image_unavailable`:docker exit 125 且 stderr 指向镜像缺失 / 无法拉取
 * - `sandbox_fix_requires_egress_policy`:非 report-only 被第二道闸拒绝
 * - `sandbox_clone_host_not_allowed`:clone 基地址非法或不在出站白名单内（配置偏离，不执行）
 * - `sandbox_alert_source_unsupported`:pnpm-audit 等会执行仓库代码的告警源被拒绝
 * - `execution_failed`:其他(结果缺失 / 解析失败 / 容器内执行失败)
 */
export class SandboxExecutor implements ScanExecutor {
    readonly kind = 'sandbox' as const

    private readonly adapter: RuntimeAdapter
    private readonly image: string
    private readonly entry: string
    private readonly skillsDir: string
    private readonly sandboxLimits: { memoryMb?: number, cpu?: number }
    private readonly timeoutMs: number
    private readonly egress: SandboxEgressPolicy
    private readonly cloneBaseUrl: string
    /** 镜像候选（预检时按序尝试；显式 image / SANDBOX_IMAGE 时只有一项） */
    private readonly imageCandidates: string[]
    /** 单个镜像拉取上限（预检用） */
    private readonly imagePullTimeoutMs: number

    constructor(options: SandboxExecutorOptions = {}) {
        this.adapter = options.runtimeAdapter ?? new DockerAdapter()
        this.image = options.image ?? resolveDefaultSandboxImage()
        this.entry = options.entry ?? DEFAULT_SANDBOX_ENTRY
        this.skillsDir = options.skillsDir ?? DEFAULT_SANDBOX_SKILLS_DIR
        this.sandboxLimits = options.sandboxLimits ?? {}
        this.timeoutMs = options.timeoutMs ?? SANDBOX_DEFAULTS.timeoutMs
        this.egress = resolveEgressPolicy(options.egress)
        this.cloneBaseUrl = (options.cloneBaseUrl ?? DEFAULT_CLONE_BASE_URL).replace(/\/+$/, '')
        this.imageCandidates = options.image ? [options.image] : resolveSandboxImageCandidates()
        this.imagePullTimeoutMs = resolveImagePullTimeoutMs()
    }

    /**
     * 探测 RuntimeAdapter 可用性(即 docker daemon 是否运行)。
     * 探测失败时调用方(scan-orchestrator)应降级回 ContainerExecutor 并 stderr 提示。
     */
    async isAvailable(): Promise<boolean> {
        return this.adapter.isAvailable()
    }

    async execute(ctx: ScanExecutorContext): Promise<ScanExecutorResult> {
        const startedAt = new Date().toISOString()

        // 防御性校验：runId 仅用于日志关联，仍拒绝异常形态（避免未来落盘时越界）
        if (!RUN_ID_PATTERN.test(ctx.runId)) {
            return {
                exitCode: 2,
                error: { code: 'execution_failed', message: `非法的 runId: ${sanitizeErrorMessage(ctx.runId)}` },
                startedAt,
                finishedAt: new Date().toISOString(),
            }
        }

        // fail-closed 第二道闸：只放行 report-only / fix / fix-and-pr；fix 类要求出站策略就位
        // （审计开启 + 白名单非空），否则拒绝执行且不 clone——这是绕过编排层时的兜底。
        if (!SANDBOX_ALLOWED_MODES.has(ctx.config.mode)) {
            return {
                exitCode: 2,
                error: {
                    code: 'sandbox_mode_unsupported',
                    message: `沙箱执行器不支持模式 ${ctx.config.mode}（支持 ${[...SANDBOX_ALLOWED_MODES].join(' / ')}）`,
                },
                startedAt,
                finishedAt: new Date().toISOString(),
            }
        }
        if (ctx.config.mode !== SANDBOX_REPORT_ONLY && (!this.egress.enabled || this.egress.allowlist.length === 0)) {
            return {
                exitCode: 2,
                error: {
                    code: 'sandbox_fix_requires_egress_policy',
                    message: `沙箱 ${ctx.config.mode} 需要出站审计策略（DEPENDFIX_NETWORK_AUDIT 未关闭且白名单非空），已拒绝执行`,
                },
                startedAt,
                finishedAt: new Date().toISOString(),
            }
        }
        if (ctx.config.mode !== SANDBOX_REPORT_ONLY) {
            // clone 发生在容器内但仍属外联：目标 host 必须命中出站白名单（fail-closed）。
            // 比对用 hostname（不含端口），与引擎侧 isDomainAllowed 口径一致；只允许 https 源
            // （明文源会让代码来源完整性失去传输层保护）
            const { protocol: cloneProtocol, hostname: cloneHostname } = parseBaseUrl(this.cloneBaseUrl)
            const allowed = cloneProtocol === 'https:' && cloneHostname.length > 0 && this.egress.allowlist.some((pattern) => {
                const p = pattern.trim().toLowerCase()
                return p.startsWith('*.')
                    ? cloneHostname.toLowerCase().endsWith(p.slice(1))
                    : cloneHostname.toLowerCase() === p
            })
            if (!allowed) {
                const reason = cloneProtocol !== 'https:'
                    ? `必须为 https 基地址（当前 ${cloneProtocol || '非法 URL'}）`
                    : `不在出站白名单内（${this.egress.allowlist.join(', ')}）`
                return {
                    exitCode: 2,
                    error: {
                        code: 'sandbox_clone_host_not_allowed',
                        message: `clone 基地址 ${sanitizeErrorMessage(this.cloneBaseUrl)} ${reason}`,
                    },
                    startedAt,
                    finishedAt: new Date().toISOString(),
                }
            }
        }
        // pnpm-audit 会在工作目录执行目标仓库安装链，破坏「report-only 不执行仓库代码」的隔离前提
        if (ctx.config.alertSource !== SANDBOX_ALLOWED_ALERT_SOURCE) {
            return {
                exitCode: 2,
                error: {
                    code: 'sandbox_alert_source_unsupported',
                    message: `沙箱 report-only 仅支持 ${SANDBOX_ALLOWED_ALERT_SOURCE}（${ctx.config.alertSource} 会执行目标仓库代码）`,
                },
                startedAt,
                finishedAt: new Date().toISOString(),
            }
        }

        const image = await this.resolveAvailableImage()
        if (!image) {
            return {
                exitCode: 2,
                error: {
                    code: 'sandbox_image_unavailable',
                    message: `沙箱镜像均不可用（已尝试：${this.imageCandidates.join('、')}）：请检查目标 daemon 的 registry 可达性，`
                        + '或在仓库设置填写「沙箱镜像」/ 配置 SANDBOX_IMAGE、SANDBOX_IMAGE_REPO',
                },
                resource: unavailableResourceUsage('沙箱镜像预检失败，未启动容器'),
                startedAt,
                finishedAt: new Date().toISOString(),
            }
        }
        try {
            const spec = this.buildSpec(ctx, image)
            const cmd = this.buildCmd(ctx)
            const runResult = await withTimeout(this.adapter.run(spec, cmd), this.timeoutMs)
            return this.parseRunResult(runResult, startedAt, ctx)
        } catch (error) {
            const result = classifyError(error, this.timeoutMs, startedAt)
            // 异常 / 超时无法取回容器内读数：显式 unavailable，不写 0
            result.resource = unavailableResourceUsage('沙箱执行异常或超时，资源读数未回传')
            return result
        }
    }

    /**
     * 预检并选择镜像：adapter 支持 `ensureImage` 时按候选顺序（本地 inspect → 拉取），
     * 第一个可用即返回；不支持（测试替身）时直接用首个候选，由 run 的镜像错误兜底。
     */
    private async resolveAvailableImage(): Promise<string | undefined> {
        const ensureImage = this.adapter.ensureImage?.bind(this.adapter)
        if (!ensureImage) {
            return this.image
        }
        for (const candidate of this.imageCandidates) {
            if (await ensureImage(candidate, { timeoutMs: this.imagePullTimeoutMs })) {
                return candidate
            }
        }
        return undefined
    }

    /**
     * 拼装 ContainerSpec:env 注入 token + cgroup 限额透传，不挂载宿主目录。
     * 限额优先级:仓库级 sandboxLimits(Repository 实体字段) > 沙箱级 sandboxLimits > SANDBOX_DEFAULTS。
     *
     * 网络：report-only 访问 GitHub API；fix / fix-and-pr 在容器内 clone + install + 验证，
     * 出站面由 CLI 的运行级审计代理按 deny-by-default 白名单约束（`DEPENDFIX_ALLOWED_DOMAINS`）。
     */
    buildSpec(ctx: ScanExecutorContext, image: string = this.image): ContainerSpec {
        return {
            image,
            // 容器私有可写目录（镜像内存在）；结果文件与报告都落在这里，不跨宿主路径
            workDir: '/tmp',
            env: {
                GITHUB_TOKEN: ctx.credential?.token ?? '',
                GITHUB_REPOSITORY: `${ctx.repository.owner}/${ctx.repository.name}`,
                // 自包含产物不依赖 node_modules：skills 静态目录随 bundle 复制
                DEPENDFIX_SKILLS_DIR: this.skillsDir,
                // fix 类：把出站策略交给容器内 CLI（其运行级审计代理按此白名单做 deny-by-default）
                ...(ctx.config.mode !== SANDBOX_REPORT_ONLY && {
                    DEPENDFIX_ALLOWED_DOMAINS: this.egress.allowlist.join(','),
                }),
                // AI 研判 env 注入：report-only 不使用 AI，且只放行 report-only → 当前不注入；
                // 保留条件供 fix 模式放行后复用（按仓库最小注入，不在 report-only 泄露组织级 Key）。
                ...(ctx.config.mode !== 'report-only' && ctx.config.ai?.enabled && {
                    DEPENDFIX_AI: 'true',
                    DEPENDFIX_AI_PROVIDER: ctx.config.ai.provider,
                    DEPENDFIX_AI_MODEL: ctx.config.ai.model,
                    DEPENDFIX_AI_BASE_URL: ctx.config.ai.baseUrl ?? '',
                    DEPENDFIX_AI_TRIGGER: ctx.config.ai.trigger,
                    ...(ctx.config.ai.apiKey && { DEPENDFIX_AI_API_KEY: ctx.config.ai.apiKey }),
                    ...(ctx.config.ai.apiUrl && { DEPENDFIX_AI_API_URL: ctx.config.ai.apiUrl }),
                }),
            },
            memoryMb: this.sandboxLimits.memoryMb,
            cpu: this.sandboxLimits.cpu,
            network: 'bridge',
            timeoutMs: this.timeoutMs,
            autoRemove: SANDBOX_DEFAULTS.autoRemove,
        }
    }

    /**
     * 拼装容器内执行命令：自包含 CLI 把显式结果写入 `/tmp/result.json`，随后用哨兵把结果打到
     * stdout（日志与结果同流，靠哨兵切分）。
     *
     * fix / fix-and-pr：先 clone 目标仓库到容器私有目录（不挂载宿主目录），再在该目录执行 CLI；
     * clone 源由平台构造（默认 github.com，可经 SANDBOX_CLONE_BASE_URL 指向镜像 / 自建 Git，
     * 其 host 必须命中出站白名单），审计面由容器内 CLI 的运行级代理覆盖
     * 安装 / 验证 / 修复命令。
     *
     * 凭据只走 env（`GITHUB_TOKEN`），不进 argv——避免 docker inspect / 错误回显泄露。
     * 报告副产物 `dependfix-reports/**` 不作为结果来源（写报告失败不阻断运行）。
     */
    buildCmd(ctx: ScanExecutorContext): string[] {
        const repo = `${ctx.repository.owner}/${ctx.repository.name}`
        const cliArgs = [
            'node',
            this.entry,
            ctx.config.mode,
            '--repo', repo,
            '--severity-threshold', ctx.config.severityThreshold,
            '--alerts-source', ctx.config.alertSource,
            '--max-alerts-per-repository', String(ctx.config.maxAlertsPerRepository),
            '--max-concurrency', String(ctx.config.maxConcurrency),
            '--result-json', CONTAINER_RESULT_PATH,
        ]
        if (ctx.config.mode === 'fix') {
            // 沙箱内没有平台侧 workDir 可以接管交付：提交在容器内完成；
            // 仅 GitHub HTTPS 源具备凭据 helper → 才额外推送（其它源强制 push 必然失败）
            cliArgs.push('--commit')
            if (shouldInjectCloneCredential(this.cloneBaseUrl)) {
                cliArgs.push('--push')
            }
        }
        if (ctx.config.codeScanningEnabled) {
            cliArgs.push('--code-scanning')
        }
        if (ctx.config.codeQualityEnabled) {
            cliArgs.push('--code-quality')
        }
        const cli = cliArgs.map(shQuote).join(' ')
        // fix 类：容器内 bootstrap —— clone 到容器私有目录后在该目录执行 CLI（不挂载宿主目录）
        // 凭据 header 的注入源在构建期静态判定（仅 https://github.com），脚本里不再出现源判断
        const cloneUrl = shQuote(`${this.cloneBaseUrl}/${repo}.git`)
        // bootstrap 失败（clone / cd）也要先停采样并回传读数再退出：回传只含资源哨兵，
        // 结果哨兵缺失仍按「未回传显式结果」处理，退出码语义不变
        const flushResource = `touch ${RESOURCE_STOP_PATH}; wait 2>/dev/null; `
            + `printf '\\n${RESOURCE_SENTINEL_START}\\n'; cat ${RESOURCE_RESULT_PATH} 2>/dev/null; `
            + `printf '\\n${RESOURCE_SENTINEL_END}\\n'`
        const cloneCommand = shouldInjectCloneCredential(this.cloneBaseUrl)
            // 凭据只从 env 读取并转成 basic header，不落 argv 明文；无 token 时匿名 clone（公开仓库）
            ? `if [ -n "$GITHUB_TOKEN" ]; then `
            + `h=$(printf 'x-access-token:%s' "$GITHUB_TOKEN" | base64 | tr -d '\\n'); `
            + `git -c http.extraheader="Authorization: basic $h" clone --depth 1 ${cloneUrl} ${CONTAINER_REPO_PATH}; `
            + `else git clone --depth 1 ${cloneUrl} ${CONTAINER_REPO_PATH}; fi || { ${flushResource}; exit 1; }`
            : `git clone --depth 1 ${cloneUrl} ${CONTAINER_REPO_PATH} || { ${flushResource}; exit 1; }`
        // 容器内 push（fix / fix-and-pr）复用同一 token：写 credential helper（只含命令，不含密钥），
        // 避免把 token 落进 .git/config；非 GitHub 源不注入
        const credentialHelper = shouldInjectCloneCredential(this.cloneBaseUrl)
            ? `git config --local credential.https://github.com.helper '!f() { echo username=x-access-token; echo "password=$GITHUB_TOKEN"; }; f'`
            : null
        const bootstrap = ctx.config.mode === SANDBOX_REPORT_ONLY
            ? []
            : [
                `rm -rf ${CONTAINER_REPO_PATH}`,
                cloneCommand,
                `cd ${CONTAINER_REPO_PATH} || { ${flushResource}; exit 1; }`,
                ...(credentialHelper ? [credentialHelper] : []),
            ]
        const script = [
            // 采样先于 bootstrap：覆盖容器内 clone + 安装 + 修复（与 container 路径窗口对齐）
            this.buildResourceSamplerInit(),
            this.buildResourceSampler(),
            ...bootstrap,
            cli,
            'code=$?',
            // 先停采样并等待写盘，再回传读数；采样失败不影响 CLI 退出码
            `touch ${RESOURCE_STOP_PATH}`,
            'wait 2>/dev/null',
            `printf '\\n${RESOURCE_SENTINEL_START}\\n'`,
            `cat ${RESOURCE_RESULT_PATH} 2>/dev/null`,
            `printf '\\n${RESOURCE_SENTINEL_END}\\n'`,
            `printf '\\n${RESULT_SENTINEL_START}\\n'`,
            `cat ${shQuote(CONTAINER_RESULT_PATH)} 2>/dev/null`,
            `printf '\\n${RESULT_SENTINEL_END}\\n'`,
            'exit $code',
            // 换行分隔：后台采样器以 `&` 结尾，不能用 `;` 拼接（`& ;` 是语法错误）
        ].join('\n')
        return ['sh', '-c', script]
    }

    /**
     * 资源采样初始化：判定 cgroup 版本与文件路径（容器内 cgroup namespace 私有）。
     * 采样器与 CLI 共用同一个 `sh -c` 进程，变量由前一条命令设置。
     */
    private buildResourceSamplerInit(): string {
        return `RESOURCE_FILE=${RESOURCE_RESULT_PATH}; STOP_FILE=${RESOURCE_STOP_PATH}; `
            + 'rm -f "$RESOURCE_FILE" "$STOP_FILE"; '
            + 'CG=none; '
            + 'if [ -f /sys/fs/cgroup/memory.current ]; then '
            + 'CG=v2; LIMIT_FILE=/sys/fs/cgroup/memory.max; '
            + 'USAGE_FILE=/sys/fs/cgroup/memory.current; OOM_FILE=/sys/fs/cgroup/memory.events; '
            + 'elif [ -f /sys/fs/cgroup/memory/memory.usage_in_bytes ]; then '
            + 'CG=v1; LIMIT_FILE=/sys/fs/cgroup/memory/memory.limit_in_bytes; '
            + 'USAGE_FILE=/sys/fs/cgroup/memory/memory.usage_in_bytes; OOM_FILE=/sys/fs/cgroup/memory/memory.oom_control; '
            + 'else LIMIT_FILE=; USAGE_FILE=; OOM_FILE=; fi'
    }

    /**
     * 后台低频采样容器自身 cgroup（200ms）：记录峰值用量、内存上限与 oom_kill 增量，
     * 停止时写一份 JSON。任一文件不可读 → 对应字段 null，由平台补 `degradedReason`。
     */
    private buildResourceSampler(): string {
        return ' ( src=none; base_oom=; final_oom=; '
            + 'if [ -n "$OOM_FILE" ]; then base_oom=$(sed -n "s/^oom_kill //p" "$OOM_FILE" 2>/dev/null | head -1); fi; '
            + 'peak=0; samples=0; '
            + 'while [ ! -f "$STOP_FILE" ]; do '
            + 'cur=$(cat "$USAGE_FILE" 2>/dev/null); '
            + 'if [ -n "$cur" ]; then samples=$((samples+1)); if [ "$cur" -gt "$peak" ] 2>/dev/null; then peak=$cur; fi; fi; '
            + 'sleep 0.2 2>/dev/null || sleep 1; '
            + 'done; '
            + 'limit=$(cat "$LIMIT_FILE" 2>/dev/null); limit_json=null; limit_reason=; '
            // v1 unlimited 哨兵 ≈ 2^60（与 resource-usage 同源）；v2 为字符串 max（非数字）→ 同样落 null + unlimited。
            // 文件缺失 / 空 → null 且不带原因（未知 ≠ 无上限）
            + 'if [ -n "$limit" ]; then '
            + 'if [ "$limit" -lt 9223372036854771712 ] 2>/dev/null; then limit_json=$limit; else limit_reason=unlimited; fi; '
            + 'fi; '
            + 'peak_json=null; if [ "$samples" -gt 0 ] 2>/dev/null; then peak_json=$peak; fi; '
            + 'if [ -n "$OOM_FILE" ]; then final_oom=$(sed -n "s/^oom_kill //p" "$OOM_FILE" 2>/dev/null | head -1); fi; '
            + 'oom=null; if [ -n "$base_oom" ] && [ -n "$final_oom" ]; then '
            + 'if [ "$final_oom" -gt "$base_oom" ] 2>/dev/null; then oom=true; else oom=false; fi; fi; '
            + 'if [ "$samples" -gt 0 ] 2>/dev/null; then '
            + 'if [ "$CG" = v2 ]; then src=cgroup-v2; elif [ "$CG" = v1 ]; then src=cgroup-v1; fi; fi; '
            + `printf '{"memoryMaxBytes":%s,"peakRssBytes":%s,"oomKilled":%s,"samples":%s,"source":"%s","limitReason":"%s"}' `
            + '"$limit_json" "$peak_json" "$oom" "$samples" "$src" "$limit_reason" > "$RESOURCE_FILE" ) &'
    }

    /**
     * 从 stdout 分离资源读数哨兵区间：返回去掉该区间的日志文本与统一资源快照。
     *
     * 缺失 / 非 JSON 一律按 unavailable 处理（不伪造 0），不影响主结果解析。
     */
    private extractSandboxResource(stdout: string): { stdout: string, resource: ExecutorResourceUsage } {
        const start = stdout.indexOf(RESOURCE_SENTINEL_START)
        const end = start >= 0
            ? stdout.indexOf(RESOURCE_SENTINEL_END, start + RESOURCE_SENTINEL_START.length)
            : -1
        if (start < 0 || end < 0) {
            return {
                stdout,
                resource: unavailableResourceUsage('沙箱资源采样器未回传读数（容器内 cgroup 不可读或采样器未启动）'),
            }
        }
        const raw = stdout.slice(start + RESOURCE_SENTINEL_START.length, end).trim()
        const stripped = `${stdout.slice(0, start)}${stdout.slice(end + RESOURCE_SENTINEL_END.length)}`
        let sample: SandboxResourceSample | null = null
        try {
            sample = JSON.parse(raw) as SandboxResourceSample
        } catch {
            sample = null
        }
        return { stdout: stripped, resource: buildSandboxResourceUsage(sample) }
    }

    /**
     * 从结果交付记录映射平台字段（runUrl / prNumber）：
     * - `pr-created`：runUrl = PR 地址（平台不再二次创建 PR）
     * - `pushed`：runUrl = 分支页（PR 失败时用于定位已推分支）
     * - 其余：不映射（未交付）
     */
    private mapDeliveryResult(ctx: ScanExecutorContext, result: RunResult | undefined): { runUrl?: string, prNumber?: number } {
        const delivery = result?.delivery
        if (!delivery) {
            return {}
        }
        if (delivery.status === 'pr-created' && delivery.prUrl) {
            return { runUrl: delivery.prUrl, ...(delivery.prNumber !== undefined ? { prNumber: delivery.prNumber } : {}) }
        }
        if (delivery.status === 'pushed' && delivery.branch && shouldInjectCloneCredential(this.cloneBaseUrl)) {
            const { host } = parseBaseUrl(this.cloneBaseUrl)
            return { runUrl: `https://${host || 'github.com'}/${ctx.repository.owner}/${ctx.repository.name}/tree/${delivery.branch}` }
        }
        return {}
    }

    /**
     * 解析 stdout 哨兵区间内的显式结果(fail-closed:任何结构/语义异常归 execution_failed)。
     *
     * 校验项:
     * 1. 哨兵区间存在且是合法 JSON（缺失 / 非 JSON → execution_failed，附日志尾部便于归因）
     * 2. payload.exitCode 为有限整数
     * 3. transport(runResult.exitCode)与 payload.exitCode 不矛盾(transport 非 0 则 payload 也必须非 0)
     * 4. payload.exitCode === 0 时 result 必须存在且符合 RunResult 必填字段契约
     * 5. 错误消息中的 stdout / stderr 一律经 sanitizeErrorMessage 防凭据泄露
     */
    private parseRunResult(runResult: ContainerRunResult, startedAt: string, ctx: ScanExecutorContext): ScanExecutorResult {
        const finishedAt = new Date().toISOString()
        const transportExitCode = runResult.exitCode
        // 资源读数与结果契约分开传：采样缺失不影响运行结论，只落 unavailable 原因
        const extracted = this.extractSandboxResource(runResult.stdout)
        const stdout = extracted.stdout
        const resource = extracted.resource

        // transport 超时分支:RuntimeAdapter 返回 exitCode 124(与 timeout(1) 命令一致语义)
        if (transportExitCode === 124) {
            return {
                exitCode: 2,
                error: {
                    code: 'execution_timeout',
                    message: `执行超时(${this.timeoutMs}ms 上限)`,
                },
                resource,
                startedAt,
                finishedAt,
            }
        }

        // 镜像缺失 / 无法拉取：docker run 返回 125，错误文本指向镜像而非代码
        if (transportExitCode === 125 && /unable to find image|manifest unknown|pull access denied/i.test(runResult.stderr)) {
            return {
                exitCode: 2,
                error: {
                    code: 'sandbox_image_unavailable',
                    message: `沙箱镜像不可用（${sanitizeErrorMessage(this.image)}）：请在仓库设置填写「沙箱镜像」，或配置 SANDBOX_IMAGE；`
                        + `镜像须在目标 daemon 内可拉取 / 已存在：${sanitizeErrorMessage(runResult.stderr.slice(0, 200))}`,
                },
                resource,
                startedAt,
                finishedAt,
            }
        }

        const start = stdout.lastIndexOf(RESULT_SENTINEL_START)
        const end = start >= 0
            ? stdout.indexOf(RESULT_SENTINEL_END, start + RESULT_SENTINEL_START.length)
            : -1
        if (start < 0 || end < 0) {
            return {
                exitCode: 2,
                error: {
                    code: 'execution_failed',
                    message: `沙箱未回传显式结果（stdout 头 200 字符:${sanitizeErrorMessage(stdout.slice(0, 200))}；stderr 头 200 字符:${sanitizeErrorMessage(runResult.stderr.slice(0, 200))}）`,
                },
                resource,
                startedAt,
                finishedAt,
            }
        }

        const raw = stdout.slice(start + RESULT_SENTINEL_START.length, end).trim()
        // 结果区间之外仍是 CLI 日志：剔除结果 JSON 后作为执行日志回传
        const stdoutLogs = `${stdout.slice(0, start)}${stdout.slice(end + RESULT_SENTINEL_END.length)}`
        const logsJson = buildLogsJson(stdoutLogs, runResult.stderr)

        let parsed: { exitCode?: number, result?: RunResult } | null = null
        try {
            parsed = JSON.parse(raw) as { exitCode?: number, result?: RunResult }
        } catch {
            return {
                exitCode: 2,
                error: {
                    code: 'execution_failed',
                    message: `沙箱结果非 JSON:${sanitizeErrorMessage(raw.slice(0, 200))}`,
                },
                resource,
                startedAt,
                finishedAt,
                logsJson,
            }
        }

        if (typeof parsed?.exitCode !== 'number' || !Number.isFinite(parsed.exitCode)) {
            return {
                exitCode: 2,
                error: {
                    code: 'execution_failed',
                    message: `沙箱结果结构无效:缺少 exitCode(结果头 200 字符:${sanitizeErrorMessage(raw.slice(0, 200))})`,
                },
                resource,
                startedAt,
                finishedAt,
                logsJson,
            }
        }

        // transport 失败但 payload 声称成功 → 视为执行失败(防止伪造)
        if (transportExitCode !== 0 && parsed.exitCode === 0) {
            return {
                exitCode: 2,
                error: {
                    code: 'execution_failed',
                    message: `transport exitCode ${transportExitCode} 与 payload exitCode 0 矛盾(stderr 头 200 字符:${sanitizeErrorMessage(runResult.stderr.slice(0, 200))})`,
                },
                resource,
                startedAt,
                finishedAt,
                logsJson,
            }
        }

        // payload 成功时必须携带合法 RunResult
        if (parsed.exitCode === 0) {
            const validation = validateRunResult(parsed.result)
            if (!validation.valid) {
                return {
                    exitCode: 2,
                    error: {
                        code: 'execution_failed',
                        message: `沙箱结果 result 校验失败:${validation.reason}`,
                    },
                    resource,
                    startedAt,
                    finishedAt,
                    logsJson,
                }
            }
        }

        return {
            exitCode: parsed.exitCode,
            result: parsed.result,
            ...this.mapDeliveryResult(ctx, parsed.result),
            resource,
            startedAt,
            finishedAt,
            logsJson,
        }
    }
}

/**
 * 是否对 clone 源注入 GitHub 凭据头：仅 `https://github.com`（其它源不接受 GitHub 的 basic 头，
 * 且不应把 token 交给非 GitHub 主机）。
 */
export function shouldInjectCloneCredential(baseUrl: string): boolean {
    const { protocol, hostname } = parseBaseUrl(baseUrl)
    return protocol === 'https:' && hostname === 'github.com'
}

/** 从基地址取协议 + host / hostname（非法形态回退空串：不注入凭据头，且在出站策略校验处 fail-closed） */
function parseBaseUrl(baseUrl: string): { protocol: string, host: string, hostname: string } {
    try {
        const url = new URL(baseUrl)
        return { protocol: url.protocol, host: url.host, hostname: url.hostname }
    } catch {
        return { protocol: '', host: '', hostname: '' }
    }
}

/** POSIX shell 单引号转义（命令参数全部经此包装，避免注入） */
function shQuote(value: string): string {
    return `'${value.replace(/'/g, '\'\\\'\'')}'`
}

/** 把 stdout / stderr 尾部转为执行日志 JSON（与 MemoryLogger 同形：timestamp / level / message） */
function buildLogsJson(stdout: string, stderr: string, maxLines = 100): string {
    const now = new Date().toISOString()
    const toLines = (text: string) => text.split('\n')
        .map((line) => sanitizeString(line.trim()))
        .filter(Boolean)
        .slice(-maxLines)
    const entries = [
        ...toLines(stdout).map((message) => ({ timestamp: now, level: 'info', message })),
        ...toLines(stderr).map((message) => ({ timestamp: now, level: 'error', message })),
    ]
    return JSON.stringify(entries)
}

/** 错误分类:统一从 catch 分支调用,避免错误分类逻辑散落 */
function classifyError(error: unknown, timeoutMs: number, startedAt: string): ScanExecutorResult {
    const finishedAt = new Date().toISOString()

    // 外层 withTimeout 触发的超时:ExecutionTimeoutError → execution_timeout
    if (error instanceof ExecutionTimeoutError) {
        return {
            exitCode: 2,
            error: {
                code: 'execution_timeout',
                message: `执行超时(${timeoutMs}ms 上限)`,
            },
            startedAt,
            finishedAt,
        }
    }

    // daemon 不可用:ENOENT(docker CLI 缺失)/ ENOTCONN(daemon 卡死)/ EACCES(无权限)/ ECONNREFUSED
    const code = (error as NodeJS.ErrnoException | undefined)?.code
    if (code === 'ENOENT' || code === 'ENOTCONN' || code === 'EACCES' || code === 'ECONNREFUSED') {
        const raw = error instanceof Error ? error.message : String(error)
        return {
            exitCode: 2,
            error: {
                code: 'sandbox_unavailable',
                message: `沙箱执行器不可用:${sanitizeErrorMessage(raw)}`,
            },
            startedAt,
            finishedAt,
        }
    }

    // 其他(容器启动失败 / 业务执行失败等):execution_failed
    const raw = error instanceof Error ? error.message : String(error)
    return {
        exitCode: 2,
        error: {
            code: 'execution_failed',
            message: sanitizeErrorMessage(raw),
        },
        startedAt,
        finishedAt,
    }
}

/**
 * 校验 RunResult 必填字段契约(运行时校验,弥补 `JSON.parse(...) as RunResult` 类型断言的盲点)。
 * 当前校验粒度:顶层必填字段类型 + summary 必填子字段数字类型 + repositories 非空数组。
 */
function validateRunResult(result: unknown): { valid: true } | { valid: false, reason: string } {
    if (!result || typeof result !== 'object') {
        return { valid: false, reason: 'result 不是对象' }
    }
    const r = result as Record<string, unknown>
    if (typeof r.runId !== 'string') {
        return { valid: false, reason: 'runId 缺失或非字符串' }
    }
    if (typeof r.startedAt !== 'string' || typeof r.finishedAt !== 'string') {
        return { valid: false, reason: 'startedAt/finishedAt 缺失或非字符串' }
    }
    if (!r.config || typeof r.config !== 'object') {
        return { valid: false, reason: 'config 缺失' }
    }
    if (!r.summary || typeof r.summary !== 'object') {
        return { valid: false, reason: 'summary 缺失' }
    }
    const summary = r.summary as Record<string, unknown>
    for (const key of ['repositoriesScanned', 'alertsFound', 'alertsFixable', 'alertsFixed', 'alertsFailed']) {
        if (typeof summary[key] !== 'number') {
            return { valid: false, reason: `summary.${key} 缺失或非数字` }
        }
    }
    if (!Array.isArray(r.repositories)) {
        return { valid: false, reason: 'repositories 不是数组' }
    }
    if (!Array.isArray(r.alerts) || !Array.isArray(r.actions) || !Array.isArray(r.errors)) {
        return { valid: false, reason: 'alerts/actions/errors 不是数组' }
    }
    return { valid: true }
}

/** 带超时的 Promise 包装(私有——与 container-executor.ts 同语义但独立,避免交叉依赖) */
class ExecutionTimeoutError extends Error {
    constructor(ms: number) {
        super(`operation timeout after ${ms}ms`)
        this.name = 'ExecutionTimeoutError'
    }
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    let timer: NodeJS.Timeout | undefined
    const timeoutPromise = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new ExecutionTimeoutError(ms)), ms)
    })
    try {
        return await Promise.race([promise, timeoutPromise])
    } finally {
        clearTimeout(timer)
    }
}

/**
 * 错误消息脱敏：抹除 URL 中可能内联的凭据（纵深防御，防 execFile argv 回显）。
 *
 * 已迁移至 #server/utils/sanitize.ts，此处保留导出以兼容既有调用。
 */
export function sanitizeErrorMessage(message: string): string {
    return sanitizeString(message)
}
