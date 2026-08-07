// CLI 执行层（解析与执行分离）：
// - cli/index.ts：argsDef + parseCliArgs（纯解析，无执行依赖）
// - cli/runner.ts：runCli / runApp / dependfixCommand（经 createPipeline 执行）
// - app/pipeline.ts：createPipeline（local 与 platform 共用编排核心）
//
// 依赖方向：runner → pipeline → cli/index（纯解析），无循环。

import { defineCommand, renderUsage, runCommand, runMain, showUsage } from 'citty'
import { toAppError } from '@dependfix/core'
import { createPipeline, type PipelineLogger } from '../app/pipeline'
import type { RuntimeConfig } from '../config'
import { skillsCommand } from '../skills'
import { argsDef, type CliInvocation } from './index'

export interface CliRunResult {
    ok: true
    invocation: CliInvocation
    config: RuntimeConfig
}

/** 默认 CLI 日志（console）；platform 场景经 createPipeline 注入自定义 logger */
const cliLogger: PipelineLogger = console

// ---------------------------------------------------------------------------
// Public API（签名与行为保持兼容）
// ---------------------------------------------------------------------------

export function runCli(rawArgs: string[]): CliRunResult {
    return createPipeline({ logger: cliLogger }).parse(rawArgs)
}

// ---------------------------------------------------------------------------
// App execution
// ---------------------------------------------------------------------------

async function runApp(rawArgs: string[]): Promise<number> {
    return createPipeline({ logger: cliLogger }).run(rawArgs)
}

// ---------------------------------------------------------------------------
// citty command
// ---------------------------------------------------------------------------
// 注意：不使用 citty subCommands 字段——citty 0.2.2 在 subCommands 模式下会
// ① 子命令执行后继续执行父 run；② 不匹配子命令的 positional（如 fix）抛
// Unknown command。因此 skills 子命令由 run 首部编程路由（runCommand），
// 主流程 positional 命令面不受影响。

export const dependfixCommand = defineCommand({
    meta: {
        name: 'dependfix',
        version: '0.1.0',
        description: '自动化处理 Dependabot / Code Scanning 安全告警的修复工具',
    },
    args: argsDef,
    async run({ rawArgs }) {
        // skills 子命令路由（install / doctor）
        if (rawArgs[0] === 'skills') {
            await runCommand(skillsCommand, { rawArgs: rawArgs.slice(1) })
            return
        }

        let exitCode = 1
        try {
            exitCode = await runApp(rawArgs)
        } catch (error: unknown) {
            const appError = toAppError(error, 'CLI_EXECUTION_FAILED')
            console.error(`Error: ${appError.message}`)
            exitCode = 1
        }
        process.exitCode = exitCode
    },
})

// ---------------------------------------------------------------------------
// 入口封装：补 skills 子命令的 --help 路由
// ---------------------------------------------------------------------------
// citty runMain 在 runCommand 前拦截内建 --help，且 resolveSubCommand 依赖
// subCommands 字段下钻；dependfixCommand 无该字段（见上），故 skills 相关
// --help 会被截获为主命令 usage。此处显式路由到 skills usage。

export async function runDependfixMain(rawArgs: string[] = process.argv.slice(2)): Promise<void> {
    if (rawArgs[0] === 'skills' && (rawArgs.includes('--help') || rawArgs.includes('-h'))) {
        console.info(await renderUsage(skillsCommand))
        process.exitCode = 0
        return
    }
    await runMain(dependfixCommand, { showUsage })
}
