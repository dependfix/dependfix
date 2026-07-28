export interface CodeScanningFixerDescriptor {
    module: 'code-scanning-fixer'
    mode: 'suggest-only'
}

export function createCodeScanningFixerDescriptor(): CodeScanningFixerDescriptor {
    return {
        module: 'code-scanning-fixer',
        mode: 'suggest-only',
    }
}
