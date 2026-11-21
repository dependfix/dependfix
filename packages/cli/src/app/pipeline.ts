// 平台化管线抽象（独立平台前置）：
// local（CLI）与 platform 模式共用同一编排核心——参数解析 → 配置解析 →
// DependfixApp.run → 退出码。process.env / console / process.exitCode
// 全部经 PipelineDeps 注入，platform 可替换 env / logger / config resolver / exit。

import { writeFile } from 'node:fs/promises'
import { connect } from 'node:net'
import { resolveRuntimeConfig, queryRepoHistory, formatHistory, DependfixApp, type CliConfigOverrides } from '@dependfix/engine'
import {
    formatRegistryProbeFailure,
    REGISTRY_PROBE_OK_SENTINEL,
    resolveRegistryProbeTimeoutMs,
    type RegistryProbeFailure,
} from '@dependfix/core'
import { parseCliArgs, type CliInvocation } from '../cli'

export interface PipelineLogger {
    info(msg: string): void
    error(msg: string): void
}

export interface PipelineDeps {
    /** 环境变量来源（默认 process.env）——platform 模式注入自定义 env */
    env?: NodeJS.ProcessEnv
    /** 日志输出（默认 console）——platform 模式注入自定义 logger */
    logger?: PipelineLogger
    /**
     * 配置解析（默认 resolveRuntimeConfig）。
     * platform 模式可注入自定义解析（如从数据库读取配置再合并 env）。
     */
    resolveConfig?: (opts: { env: NodeJS.ProcessEnv, cliOverrides: CliConfigOverrides }) => ReturnType<typeof resolveRuntimeConfig>
    /** 退出码设置（默认 process.exitCode）——platform 模式注入 */
    exit?: (code: number) => void
}

export interface PipelineParseResult {
    ok: true
    invocation: CliInvocation
    config: ReturnType<typeof resolveRuntimeConfig>
}

export interface Pipeline {
    /** 解析参数并解析配置（不执行扫描） */
    parse(rawArgs: string[]): PipelineParseResult
    /** 执行一次完整运行（含 history 查询分支），返回退出码 */
    run(rawArgs: string[]): Promise<number>
}

/**
 * 安装源连通性预检（TCP 连接级，只读、不发起 HTTP 请求、不发送凭据）。
 *
 * 目标接受完整 URL 或 `host[:port]`（缺省 https / 443）。超时按 `SANDBOX_REGISTRY_PROBE_TIMEOUT_MS`
 * 解析（默认 5s，1s-30s），供沙箱执行器在 clone / 安装前快速失败。
 */
export function probeRegistryConnectivity(
    target: string,
    timeoutMs: number = resolveRegistryProbeTimeoutMs(undefined),
): Promise<{ ok: boolean, host: string, port: number, durationMs: number, failure?: RegistryProbeFailure }> {
    const normalized = target.includes('://') ? target : `https://${target}`
    let host = target
    let port = 0
    try {
        const url = new URL(normalized)
        host = url.hostname
        port = Number(url.port || (url.protocol === 'http:' ? 80 : 443))
    } catch {
        return Promise.resolve({
            ok: false,
            host,
            port,
            durationMs: 0,
            failure: { host, port, code: 'invalid-target', durationMs: 0 },
        })
    }
    const startedAt = Date.now()
    return new Promise((resolve) => {
        let settled = false
        const socket = connect({ host, port })
        const settle = (failure?: RegistryProbeFailure) => {
            if (settled) {
                return
            }
            settled = true
            socket.destroy()
            resolve({
                ok: !failure,
                host,
                port,
                durationMs: failure?.durationMs ?? Date.now() - startedAt,
                ...(failure ? { failure } : {}),
            })
        }
        socket.setTimeout(timeoutMs)
        socket.once('connect', () => settle())
        socket.once('timeout', () => settle({ host, port, code: 'timeout', durationMs: Date.now() - startedAt }))
        socket.once('error', (error: NodeJS.ErrnoException) => settle({
            host,
            port,
            code: error.code ?? 'error',
            durationMs: Date.now() - startedAt,
        }))
    })
}

export function createPipeline(deps: PipelineDeps = {}): Pipeline {
    const env = deps.env ?? process.env
    const logger = deps.logger ?? console
    const resolveConfig = deps.resolveConfig ?? ((opts: { env: NodeJS.ProcessEnv, cliOverrides: CliConfigOverrides }) => resolveRuntimeConfig(opts))
    const exit = deps.exit ?? ((code: number) => {
        process.exitCode = code
    })

    return {
        parse(rawArgs: string[]): PipelineParseResult {
            const invocation = parseCliArgs(rawArgs)
            const config = resolveConfig({ env, cliOverrides: invocation.configOverrides })
            return { ok: true, invocation, config }
        },

        async run(rawArgs: string[]): Promise<number> {
            const invocation = parseCliArgs(rawArgs)

            // --probe-registry：独立预检命令（只读 TCP，不执行扫描、不要求 token/仓库配置）
            if (invocation.registryProbeTarget) {
                const timeoutMs = resolveRegistryProbeTimeoutMs(
                    env.SANDBOX_REGISTRY_PROBE_TIMEOUT_MS,
                )
                const probe = await probeRegistryConnectivity(invocation.registryProbeTarget, timeoutMs)
                if (!probe.ok && probe.failure) {
                    logger.error(formatRegistryProbeFailure(probe.failure))
                    logger.error(`registry 不可达（${probe.host}:${probe.port}，${probe.durationMs}ms，上限 ${timeoutMs}ms）：请检查目标 daemon 的出站策略或仓库级 registry 配置`)
                    exit(3)
                    return 3
                }
                logger.info(`${REGISTRY_PROBE_OK_SENTINEL} ${probe.host}:${probe.port} ${probe.durationMs}ms`)
                exit(0)
                return 0
            }

            // --history：独立查询命令（读归档索引，不执行扫描、不要求 token/仓库配置）
            if (invocation.configOverrides.history) {
                const entries = queryRepoHistory(invocation.configOverrides.history)
                logger.info(formatHistory(entries, invocation.configOverrides.history))
                return 0
            }

            const config = resolveConfig({ env, cliOverrides: invocation.configOverrides })
            const app = new DependfixApp({
                config,
                verbose: invocation.configOverrides.verbose,
                commands: invocation.configOverrides.commands,
            })

            const { result, exitCode } = await app.run()

            // 显式结果契约（沙箱执行器唯一读取源）：不复用报告副产物 summary.json——
            // 报告写入失败只记日志、不阻断运行，不能作为执行结果依据。
            if (invocation.resultJsonPath) {
                try {
                    await writeFile(invocation.resultJsonPath, JSON.stringify({ exitCode, result }), 'utf8')
                } catch (error) {
                    logger.error(`Failed to write result JSON to ${invocation.resultJsonPath}: ${error instanceof Error ? error.message : String(error)}`)
                    exit(1)
                    return 1
                }
            }

            exit(exitCode)
            return exitCode
        },
    }
}
