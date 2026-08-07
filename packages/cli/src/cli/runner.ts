// CLI 执行层（解析与执行分离）：
// - cli/index.ts：argsDef + parseCliArgs（纯解析，无执行依赖）
// - cli/runner.ts：runCli / runApp / dependfixCommand（经 createPipeline 执行）
// - app/pipeline.ts：createPipeline（local 与 platform 共用编排核心）
//
// 依赖方向：runner → pipeline → cli/index（纯解析），无循环。

import { defineCommand } from 'citty'
import { toAppError } from '@dependfix/core'
import { createPipeline, type PipelineLogger } from '../app/pipeline'
import type { RuntimeConfig } from '../config'
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

export const dependfixCommand = defineCommand({
    meta: {
        name: 'dependfix',
        version: '0.1.0',
        description: '自动化处理 Dependabot / Code Scanning 安全告警的修复工具',
    },
    args: argsDef,
    async run({ rawArgs }) {
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
