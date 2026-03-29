export interface PnpmLockfileFixerDescriptor {
    module: 'pnpm-lockfile-fixer'
    command: 'pnpm i --frozen-lockfile'
}

export function createPnpmLockfileFixerDescriptor(): PnpmLockfileFixerDescriptor {
    return {
        module: 'pnpm-lockfile-fixer',
        command: 'pnpm i --frozen-lockfile',
    }
}
