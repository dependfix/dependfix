import { createConfigLayerDescriptor } from './config'
import { createLogger, type Logger } from './core'
import { createDependencyFixerDescriptor } from './fixers/dependency'
import { createCodeScanningFixerDescriptor } from './fixers/code-scanning'
import { createPnpmLockfileFixerDescriptor } from './fixers/pnpm'
import { createGitHubClientDescriptor } from './github'
import { createRunnerDescriptor } from './runners'

export interface ApplicationSkeleton {
    logger: Logger
    modules: {
        config: ReturnType<typeof createConfigLayerDescriptor>
        github: ReturnType<typeof createGitHubClientDescriptor>
        fixers: [
            ReturnType<typeof createDependencyFixerDescriptor>,
            ReturnType<typeof createPnpmLockfileFixerDescriptor>,
            ReturnType<typeof createCodeScanningFixerDescriptor>,
        ]
        runner: ReturnType<typeof createRunnerDescriptor>
    }
}

export function createApplicationSkeleton(): ApplicationSkeleton {
    return {
        logger: createLogger({ name: 'auto-fix-github-security' }),
        modules: {
            config: createConfigLayerDescriptor(),
            github: createGitHubClientDescriptor(),
            fixers: [
                createDependencyFixerDescriptor(),
                createPnpmLockfileFixerDescriptor(),
                createCodeScanningFixerDescriptor(),
            ],
            runner: createRunnerDescriptor(),
        },
    }
}
