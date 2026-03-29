import { pathToFileURL } from 'node:url'
import { runCli } from './cli'

export * from './app'
export * from './cli'
export * from './config'
export * from './core'
export * from './core/alerts'
export * from './core/filters'
export * from './core/planner'
export * from './core/report'
export * from './fixers/code-scanning'
export * from './fixers/dependency'
export * from './fixers/pnpm'
export * from './github'
export * from './runners'
export * from './utils'

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
    void main()
}
