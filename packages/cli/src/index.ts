import { pathToFileURL } from 'node:url'
import { toAppError } from '@dependfix/core'
import { runCli, runDependfixMain, type CliRunResult } from './cli/runner'

export * from '@dependfix/core'
export * from './app'
export * from './cli'
export * from './cli/runner'
export * from './config'
export * from './fixers/dependency'
export * from './fixers/pnpm'
// engine 公共面（github/code-scanning 等，随拆包批次扩面）。
// 技术债：engine 后续并入 fixers/config 等模块时，与 cli 自身同名导出会因
// `export *` 静默排除（ambient conflict）——届时需改为显式选择性导出。
export * from '@dependfix/engine'
export * from './runners'
// report 模块最小导出（mcp history tool 复用；仅暴露查询函数，保持 API 面最小）
export { queryRepoHistory } from './report/archiver'
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
    void runDependfixMain().catch((error: unknown) => {
        const appError = toAppError(error, 'CLI_EXECUTION_FAILED')
        console.error(appError.message)
        process.exitCode = 1
    })
}
