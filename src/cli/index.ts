import { createApplicationSkeleton } from '../app'
import { compactRecord } from '../utils'

export interface CliInvocation {
    mode: 'report-only' | 'fix' | 'fix-and-pr'
    rawArgs: string[]
}

export interface CliRunResult {
    ok: true
    invocation: CliInvocation
}

export function parseCliArgs(args: string[]): CliInvocation {
    const [firstArg, ...restArgs] = args

    if (firstArg === 'fix' || firstArg === 'fix-and-pr' || firstArg === 'report-only') {
        return {
            mode: firstArg,
            rawArgs: restArgs,
        }
    }

    return {
        mode: 'report-only',
        rawArgs: args,
    }
}

export function runCli(args: string[] = process.argv.slice(2)): CliRunResult {
    const app = createApplicationSkeleton()
    const invocation = parseCliArgs(args)

    app.logger.info('MVP skeleton is ready', compactRecord({
        mode: invocation.mode,
        args: invocation.rawArgs.length > 0 ? invocation.rawArgs : undefined,
    }))

    return {
        ok: true,
        invocation,
    }
}
