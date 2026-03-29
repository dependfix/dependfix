export type RuntimeMode = 'report-only' | 'fix' | 'fix-and-pr'

export interface ConfigLayerDescriptor {
    module: 'config'
    supportedModes: RuntimeMode[]
}

export function createConfigLayerDescriptor(): ConfigLayerDescriptor {
    return {
        module: 'config',
        supportedModes: ['report-only', 'fix', 'fix-and-pr'],
    }
}
