import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

/**
 * OCI runtime 抽象层。
 *
 * 设计要点（见 docs/design/governance/executor-sandbox.md §7.1 与 todo.md §M10 决策会议结论）：
 * - 接口契约按 OCI runtime 兼容设计：当前实现 `DockerAdapter` 走 Docker Engine；
 *   未来切 Sysbox 仅切换启动参数 `--runtime=sysbox-runc`，业务代码无需改动
 * - daemon 探测：注入 sandbox-executor 时先 `isAvailable()`，探测失败降级回
 *   `ContainerExecutor`（决策会议结论：并存，向后兼容）
 * - 零信任默认：网络 `none`（白名单由后续任务的应用层代理承接，不依赖 docker 网络隔离）、
 *   user 默认 `100:100`（rootless 标配；rootful daemon 上亦生效但无 user namespace 隔离）
 *
 * 安全边界：凭据通过 `-e KEY=VALUE` 注入容器进程 env，不进 cmd 字段（避免 spy/test 日志
 * 泄露）、不进 git URL（避免 exec 错误回显）、不进 docker daemon 配置文件（避免 docker
 * inspect 可见）。当前仍走 docker CLI args，未来切 docker socket API 可换 stdin/env 注入。
 * bind mount 源 workDir 由 sandbox-executor 准备（沙箱进程内构造的临时目录）。
 */

/** 容器执行规格（OCI runtime 子集，足够 pnpm 脚本类场景） */
export interface ContainerSpec {
    /** 镜像名/ID（沙箱复用 apps/platform/Dockerfile runtime 阶段） */
    image: string
    /** 容器内用户（默认 '100:100'——rootless 标配） */
    user?: string
    /** 容器内工作目录（必须同时出现在 mounts 中） */
    workDir: string
    /** bind mount 列表（沙箱场景至少一项：workDir → 容器内路径） */
    mounts?: { src: string, dst: string, readonly?: boolean }[]
    /** 环境变量（沙箱场景至少一项：GITHUB_TOKEN / GITHUB_REPOSITORY） */
    env?: Record<string, string>
    /** 内存上限 MB（缺省 2048；仓库级覆盖见 todo.md §M10 决策会议结论 Q5） */
    memoryMb?: number
    /** CPU 上限（缺省 1.0） */
    cpu?: number
    /** OCI runtime 名（缺省读 SANDBOX_RUNTIME env；未设则 'runc'） */
    runtime?: string
    /** 网络模式（沙箱默认 'none'——白名单由后续应用层代理承载） */
    network?: 'host' | 'bridge' | 'none'
    /** 执行超时（ms；默认 30 分钟——与 ContainerExecutor 对齐） */
    timeoutMs?: number
    /** 容器退出后清理（默认 true——沙箱不留存） */
    autoRemove?: boolean
}

/** stdout/stderr 流式捕获选项 */
export interface StdioOpt {
    /** 最大捕获字节数（默认 10 MiB——防恶意脚本输出轰炸；超出截断 + exitCode 标 partial） */
    maxBuffer?: number
}

/** RuntimeAdapter 统一返回（结构化，便于 sandbox-executor 组装 ScanExecutorResult） */
export interface ContainerRunResult {
    stdout: string
    stderr: string
    exitCode: number
    /** 输出被截断标记（maxBuffer 触发） */
    truncated?: boolean
}

/** 抽象接口——任何 OCI 兼容 runtime 实现该契约即可被 sandbox-executor 复用 */
export interface RuntimeAdapter {
    /** adapter 名称（用于日志 / 调试） */
    readonly name: string
    /** 探测 daemon/runtime 可用性（不抛错，返回布尔） */
    isAvailable(): Promise<boolean>
    /**
     * 启动容器执行命令。
     *
     * 抛错语义：daemon 不可用 / 镜像缺失 / 启动失败 → 抛 Error（caller 决定降级路径）；
     * 命令自身失败 → 返回 ContainerRunResult 且 exitCode !== 0。
     */
    run(spec: ContainerSpec, cmd: string[], stdio?: StdioOpt): Promise<ContainerRunResult>
}

/** 默认配置常量（模块级读取 SANDBOX_RUNTIME env；env 变更需重启进程） */
export const SANDBOX_DEFAULTS = {
    user: '100:100',
    memoryMb: 2048,
    cpu: 1.0,
    runtime: process.env.SANDBOX_RUNTIME ?? 'runc',
    network: 'none' as const,
    timeoutMs: 30 * 60 * 1000,
    autoRemove: true,
    maxBuffer: 10 * 1024 * 1024,
}

/**
 * Docker Engine 适配器（当前实现，OCI runtime 兼容子集）。
 *
 * 适用场景：宿主机装了 Docker daemon（rootless 推荐——见 todo.md §M10 决策会议结论 Q1）。
 * 部署形态：自托管 docker-compose（决策会议结论 Q3，K8s+Helm 仅 backlog 预留）。
 *
 * 拼装规则：
 * - 凭据/环境变量走 `-e KEY=VALUE`（不进 cmd 字段；纵深防御）
 * - 资源限额走 `--memory` / `--cpus`（docker daemon 统一处理，与 cgroup v1/v2 解耦）
 * - 网络默认 `none`（沙箱场景；白名单由后续应用层代理承载）
 */
export class DockerAdapter implements RuntimeAdapter {
    readonly name = 'docker'

    constructor(private readonly options: { dockerBin?: string } = {}) {}

    /**
     * 探测 daemon 可用性：`docker info` 退出码 + ServerVersion 解析（无 server 段即未运行）。
     * 不抛错——daemon 不可用时降级回 ContainerExecutor（决策会议结论：并存）。
     *
     * 超时 5s：docker daemon 健康检查经验值（daemon 卡死多在 1-3s 内可见）。
     * maxBuffer 1 KiB：`{{.ServerVersion}}` 输出远小于此。
     */
    async isAvailable(): Promise<boolean> {
        try {
            const { stdout } = await execFileAsync(this.options.dockerBin ?? 'docker', ['info', '--format', '{{.ServerVersion}}'], {
                timeout: 5000,
                maxBuffer: 1024,
            })
            const version = stdout.trim()
            // ServerVersion 存在即 daemon 运行中（rootless/rootful 都通过——本探测不区分）
            return version.length > 0
        } catch {
            return false
        }
    }

    async run(spec: ContainerSpec, cmd: string[], stdio?: StdioOpt): Promise<ContainerRunResult> {
        const args = this.buildRunArgs(spec, cmd)
        const maxBuffer = stdio?.maxBuffer ?? SANDBOX_DEFAULTS.maxBuffer
        try {
            const { stdout, stderr } = await execFileAsync(this.options.dockerBin ?? 'docker', args, {
                timeout: spec.timeoutMs ?? SANDBOX_DEFAULTS.timeoutMs,
                maxBuffer,
            })
            return { stdout, stderr, exitCode: 0 }
        } catch (error) {
            // execFile 失败：exit code 非 0 或 ENOENT/超时
            const err = error as NodeJS.ErrnoException & {
                code?: string | number
                stdout?: string
                stderr?: string
                killed?: boolean
                signal?: string
            }
            // 超时（killed=true + signal SIGTERM）：包装为退出码 124（与 timeout(1) 命令一致语义）
            if (err.killed && err.signal === 'SIGTERM') {
                return {
                    stdout: err.stdout ?? '',
                    stderr: `${err.stderr ?? ''}\n[docker] execution timeout`,
                    exitCode: 124,
                    truncated: true,
                }
            }
            // 命令自身退出码非 0：execFile 抛错时 stdout/stderr/code 都附在 error 上
            if (typeof err.code === 'number') {
                return {
                    stdout: err.stdout ?? '',
                    stderr: err.stderr ?? '',
                    exitCode: err.code,
                }
            }
            // 其他（ENOENT/EPIPE 等真异常）——caller 处理降级
            throw error
        }
    }

    /**
     * 拼装 `docker run` 参数（公开便于单测 snapshot 验证——拼装 bug 在真起容器前难暴露）。
     * 测试入口：通过 `(new DockerAdapter()).buildRunArgs(spec, cmd)` 调用。
     */
    buildRunArgs(spec: ContainerSpec, cmd: string[]): string[] {
        const args: string[] = ['run']
        if (spec.autoRemove ?? SANDBOX_DEFAULTS.autoRemove) {
            args.push('--rm')
        }
        args.push('--runtime', spec.runtime ?? SANDBOX_DEFAULTS.runtime)
        args.push('--user', spec.user ?? SANDBOX_DEFAULTS.user)
        args.push('--network', spec.network ?? SANDBOX_DEFAULTS.network)
        if (spec.memoryMb ?? SANDBOX_DEFAULTS.memoryMb) {
            args.push('--memory', `${spec.memoryMb ?? SANDBOX_DEFAULTS.memoryMb}m`)
        }
        if (spec.cpu ?? SANDBOX_DEFAULTS.cpu) {
            args.push('--cpus', String(spec.cpu ?? SANDBOX_DEFAULTS.cpu))
        }
        // 挂载点（沙箱场景必含 workDir）
        for (const mount of spec.mounts ?? []) {
            if (mount.readonly) {
                args.push('--mount', `type=bind,source=${mount.src},target=${mount.dst},readonly`)
            } else {
                args.push('--volume', `${mount.src}:${mount.dst}`)
            }
        }
        // 环境变量（独立段，便于未来切 docker socket API 时统一迁移）
        for (const [key, value] of Object.entries(spec.env ?? {})) {
            args.push('-e', `${key}=${value}`)
        }
        args.push('-w', spec.workDir)
        args.push(spec.image)
        args.push(...cmd)
        return args
    }
}

/**
 * @internal
 *
 * Spy adapter（仅供 vitest 使用）：记录 run() 调用参数 + 返回预设结果。
 *
 * **生产代码禁止导入**——sandbox-executor / scan-orchestrator 集成时应注入 `DockerAdapter`
 * 或自定义 OCI runtime 实现。本类与 `DockerAdapter` 同模块导出仅为单测便利，未来如需在
 * 跨包测试中复用，建议迁至 `apps/platform/tests/` 或 `packages/test-utils/` 独立维护。
 */
export class SpyRuntimeAdapter implements RuntimeAdapter {
    readonly name = 'spy'
    readonly calls: { spec: ContainerSpec, cmd: string[] }[] = []
    private readonly availability: boolean
    private readonly result: ContainerRunResult | Error

    constructor(options: { available?: boolean, result?: ContainerRunResult | Error } = {}) {
        this.availability = options.available ?? true
        this.result = options.result ?? { stdout: '', stderr: '', exitCode: 0 }
    }

    // eslint-disable-next-line @typescript-eslint/require-await -- interface RuntimeAdapter 契约要求 async;spy 内部同步即可
    async isAvailable(): Promise<boolean> {
        return this.availability
    }

    // eslint-disable-next-line @typescript-eslint/require-await -- 同上:契约要求 async 返回 Promise
    async run(spec: ContainerSpec, cmd: string[]): Promise<ContainerRunResult> {
        this.calls.push({ spec, cmd })
        if (this.result instanceof Error) {
            throw this.result
        }
        return this.result
    }
}

// SpyRuntimeAdapter 仅供测试使用，生产代码禁止导入（见上方 @internal 注释）
// 后续如需强约束，建议在 eslint.config.* 加 `no-restricted-imports` 规则限定 src 目录禁入
