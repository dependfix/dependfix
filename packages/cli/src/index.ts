import { pathToFileURL } from 'node:url'
import { toAppError } from '@dependfix/core'
import { runCli, runDependfixMain, type CliRunResult } from './cli/runner'

export * from '@dependfix/core'
export * from './cli'
export * from './cli/runner'
// engine 公共面（github/fixers/config/report/multirepo/helpers/grouping/runners/
// alerts/ai/app——cli 的执行内核已全部收归 engine，本行是 cli 公共面的单一转发源）。
// 技术债：engine 与 cli 自身（skills 等）同名导出会因 `export *` 静默排除
// （ambient conflict）——出现时需改为显式选择性导出。
export * from '@dependfix/engine'
// 平台化管线抽象（local 与 platform 共用编排核心；依赖 CLI 参数解析，归属 cli 层）
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
