#!/usr/bin/env node
import { runMain } from 'citty'
import { toAppError } from '@dependfix/core'
import { dependfixCommand } from './cli'

void runMain(dependfixCommand).catch((error: unknown) => {
    const appError = toAppError(error, 'CLI_EXECUTION_FAILED')
    console.error(appError.message)
    process.exitCode = 1
})
