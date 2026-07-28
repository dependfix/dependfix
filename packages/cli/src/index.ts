import { pathToFileURL } from 'node:url'
import { toAppError } from '@dependfix/core'
import { runCli } from './cli'

export * from '@dependfix/core'
export * from './app'
export * from './cli'
export * from './config'
export * from './fixers/code-scanning'
export * from './fixers/dependency'
export * from './fixers/pnpm'
export * from './github'
export * from './runners'

export function main(args: string[] = process.argv.slice(2)) {
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
    try {
        main()
    } catch (error) {
        const appError = toAppError(error, 'CLI_EXECUTION_FAILED')
        console.error(appError.message)
        process.exitCode = 1
    }
}
