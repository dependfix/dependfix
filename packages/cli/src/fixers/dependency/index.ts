export interface DependencyFixerDescriptor {
    module: 'dependency-fixer'
    ecosystem: 'npm'
}

export function createDependencyFixerDescriptor(): DependencyFixerDescriptor {
    return {
        module: 'dependency-fixer',
        ecosystem: 'npm',
    }
}
