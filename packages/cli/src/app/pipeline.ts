// 平台化管线抽象（独立平台前置）：
// local（CLI）与 platform 模式共用同一编排核心——参数解析 → 配置解析 →
// DependfixApp.run → 退出码。process.env / console / process.exitCode
// 全部经 PipelineDeps 注入，platform 可替换 env / logger / config resolver / exit。

import { parseCliArgs, type CliInvocation } from '../cli'
import { resolveRuntimeConfig, type CliConfigOverrides } from '../config'
import { queryRepoHistory } from '../report/archiver'
import { formatHistory } from '../report/history'
import { DependfixApp } from './index'

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

            const { exitCode } = await app.run()
            exit(exitCode)
            return exitCode
        },
    }
}
