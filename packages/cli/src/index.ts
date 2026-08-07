import { pathToFileURL } from 'node:url'
import { runMain } from 'citty'
import { toAppError } from '@dependfix/core'
import { dependfixCommand, runCli, type CliRunResult } from './cli/runner'

export * from '@dependfix/core'
export * from './app'
export * from './cli'
export * from './cli/runner'
export * from './config'
export * from './fixers/dependency'
export * from './fixers/pnpm'
export * from './github'
export * from './runners'
// 平台化管线抽象（独立平台前置）：local 与 platform 共用编排核心
export { createPipeline } from './app/pipeline'
export type { Pipeline, PipelineDeps, PipelineLogger, PipelineParseResult } from './app/pipeline'

/**
 * 简化调用的入口（内部数据处理，非 CLI 使用）。
 */
export function main(args: string[] = process.argv.slice(2)): CliRunResult {
    return runCli(args)
}

function isExecutedAsEntryPoint(): boolean {
    const entry = process.argv[1]

    if (!entry) {
        return false
    }

    return import.meta.url === pathToFileURL(entry).href
}

if (isExecutedAsEntryPoint()) {
    // 优先使用 citty 接管（自动 --help、子命令等）
    void runMain(dependfixCommand).catch((error: unknown) => {
        const appError = toAppError(error, 'CLI_EXECUTION_FAILED')
        console.error(appError.message)
        process.exitCode = 1
    })
}
