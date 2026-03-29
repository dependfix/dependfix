export interface CommandExecutionDescriptor {
    module: 'runner'
    commands: string[]
}

export function createRunnerDescriptor(commands: string[] = []): CommandExecutionDescriptor {
    return {
        module: 'runner',
        commands,
    }
}
