import { defineConfig } from 'tsdown'

export default defineConfig({
    platform: 'node',
    entry: {
        index: 'src/index.ts',
        auth: 'src/auth/index.ts',
    },
    outDir: 'dist',
    format: ['esm'],
    fixedExtension: true,
    hash: false,
    nodeProtocol: true,
    sourcemap: true,
    clean: true,
    dts: true,
    minify: false,
    shims: true,
})
