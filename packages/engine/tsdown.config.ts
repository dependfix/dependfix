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
    // hash:false 时 entry 与共享 chunk 会争用同一文件名（dts 侧实测：共享 chunk 抢占
    // index.d.mts，入口声明被挤出为 index2.d.mts，而 package.json#types 指向 index.d.mts
    // → 平台侧 TS2305）。把 chunk 统一隔离到 chunks/ 子目录，entry 名保持稳定。
    outputOptions: {
        chunkFileNames: (chunk) => (chunk.name.endsWith('.d')
            ? `chunks/${chunk.name.slice(0, -2)}.d.mts`
            : `chunks/${chunk.name}.mjs`),
    },
    nodeProtocol: true,
    sourcemap: true,
    clean: true,
    dts: true,
    minify: false,
    shims: true,
})
