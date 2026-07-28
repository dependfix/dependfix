import { createLogger, type Logger } from '@dependfix/core'
import { createConfigLayerDescriptor, type RuntimeConfig } from './config'
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

export interface CreateApplicationSkeletonOptions {
    config: RuntimeConfig
}

export function createApplicationSkeleton(options: CreateApplicationSkeletonOptions): ApplicationSkeleton {
    return {
        logger: createLogger({ name: 'dependfix' }),
        modules: {
            config: createConfigLayerDescriptor(options.config),
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
