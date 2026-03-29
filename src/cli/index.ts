import { createApplicationSkeleton } from '../app'
import {
    type CliConfigOverrides,
    type RuntimeMode,
    resolveRuntimeConfig,
} from '../config'
import { compactRecord } from '../utils'

export interface CliInvocation {
    mode?: RuntimeMode
    configOverrides: CliConfigOverrides
    rawArgs: string[]
}

export interface CliRunResult {
    ok: true
    invocation: CliInvocation
    config: ReturnType<typeof resolveRuntimeConfig>
}

function readOptionValue(args: string[], index: number, optionName: string): [string, number] {
    const value = args[index + 1]

    if (!value || value.startsWith('--')) {
        throw new Error(`Missing value for ${optionName}`)
    }

    return [value, index + 1]
}

function appendRepositories(target: string[], value: string) {
    for (const repository of value.split(',')) {
        const trimmed = repository.trim()

        if (trimmed) {
            target.push(trimmed)
        }
    }
}

export function parseCliArgs(args: string[]): CliInvocation {
    const rawArgs = [...args]
    const remainingArgs = [...args]
    let mode: RuntimeMode | undefined

    const firstArg = remainingArgs[0]

    if (firstArg === 'fix' || firstArg === 'fix-and-pr' || firstArg === 'report-only') {
        mode = firstArg
        remainingArgs.shift()
    }

    const configOverrides: CliConfigOverrides = mode ? { mode } : {}
    const repositories: string[] = []

    for (let index = 0; index < remainingArgs.length; index += 1) {
        const arg = remainingArgs[index]

        if (arg === '--dry-run') {
            configOverrides.dryRun = true
            continue
        }

        if (arg === '--no-dry-run') {
            configOverrides.dryRun = false
            continue
        }

        if (arg === '--create-pr') {
            configOverrides.createPullRequest = true
            continue
        }

        if (arg === '--no-create-pr') {
            configOverrides.createPullRequest = false
            continue
        }

        if (arg.startsWith('--mode=')) {
            configOverrides.mode = arg.slice('--mode='.length) as RuntimeMode
            continue
        }

        if (arg === '--mode') {
            const [value, nextIndex] = readOptionValue(remainingArgs, index, '--mode')
            configOverrides.mode = value as RuntimeMode
            index = nextIndex
            continue
        }

        if (arg.startsWith('--severity-threshold=')) {
            configOverrides.severityThreshold = arg.slice('--severity-threshold='.length) as CliConfigOverrides['severityThreshold']
            continue
        }

        if (arg === '--severity-threshold') {
            const [value, nextIndex] = readOptionValue(remainingArgs, index, '--severity-threshold')
            configOverrides.severityThreshold = value as CliConfigOverrides['severityThreshold']
            index = nextIndex
            continue
        }

        if (arg.startsWith('--repository=')) {
            appendRepositories(repositories, arg.slice('--repository='.length))
            continue
        }

        if (arg === '--repository') {
            const [value, nextIndex] = readOptionValue(remainingArgs, index, '--repository')
            appendRepositories(repositories, value)
            index = nextIndex
            continue
        }

        if (arg.startsWith('--repositories=')) {
            appendRepositories(repositories, arg.slice('--repositories='.length))
            continue
        }

        if (arg === '--repositories') {
            const [value, nextIndex] = readOptionValue(remainingArgs, index, '--repositories')
            appendRepositories(repositories, value)
            index = nextIndex
            continue
        }

        if (arg.startsWith('--github-token=')) {
            configOverrides.githubToken = arg.slice('--github-token='.length)
            continue
        }

        if (arg === '--github-token') {
            const [value, nextIndex] = readOptionValue(remainingArgs, index, '--github-token')
            configOverrides.githubToken = value
            index = nextIndex
            continue
        }

        if (arg.startsWith('--max-alerts-per-repository=')) {
            configOverrides.maxAlertsPerRepository = Number.parseInt(arg.slice('--max-alerts-per-repository='.length), 10)
            continue
        }

        if (arg === '--max-alerts-per-repository') {
            const [value, nextIndex] = readOptionValue(remainingArgs, index, '--max-alerts-per-repository')
            configOverrides.maxAlertsPerRepository = Number.parseInt(value, 10)
            index = nextIndex
            continue
        }
    }

    if (repositories.length > 0) {
        configOverrides.repositories = repositories
    }

    return {
        mode: configOverrides.mode,
        configOverrides,
        rawArgs,
    }
}

export function runCli(args: string[] = process.argv.slice(2)): CliRunResult {
    const invocation = parseCliArgs(args)
    const config = resolveRuntimeConfig({
        env: process.env,
        cliOverrides: invocation.configOverrides,
    })
    const app = createApplicationSkeleton({ config })

    app.logger.info('Runtime configuration resolved', compactRecord({
        mode: config.mode,
        severityThreshold: config.severityThreshold,
        repositories: config.repositories,
        dryRun: config.dryRun,
        createPullRequest: config.createPullRequest,
        maxAlertsPerRepository: config.maxAlertsPerRepository,
        args: invocation.rawArgs.length > 0 ? invocation.rawArgs : undefined,
    }))

    return {
        ok: true,
        invocation,
        config,
    }
}
