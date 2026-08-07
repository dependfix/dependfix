#!/usr/bin/env node
import { toAppError } from '@dependfix/core'
import { runDependfixMain } from './cli/runner'

void runDependfixMain().catch((error: unknown) => {
    const appError = toAppError(error, 'CLI_EXECUTION_FAILED')
    console.error(appError.message)
    process.exitCode = 1
})
