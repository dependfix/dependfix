import { defineConfig } from 'tsdown'

/**
 * 沙箱专用打包配置：输出自包含 CLI（不依赖 workspace node_modules）。
 *
 * - `deps.alwaysBundle` 内联全部运行期依赖（普通发布产物仍保持外置，见 tsdown.config.ts）
 * - `copy` 把包清单与产品 skill 静态目录放进同一输出根：
 *   `sandbox/package.json`（`--version` 读它）+ `sandbox/skills/dependfix-remediator`
 * - 输出目录 `sandbox/` 由 `.gitignore` 忽略，Dockerfile 复制到 `/app/sandbox/`
 */
export default defineConfig({
    platform: 'node',
    entry: ['src/bin.ts'],
    outDir: 'sandbox',
    format: ['esm'],
    fixedExtension: true,
    hash: false,
    nodeProtocol: true,
    sourcemap: false,
    clean: true,
    dts: false,
    minify: false,
    shims: true,
    deps: {
        alwaysBundle: [/.*/],
    },
    copy: [
        // 仅供 `--version` 读取 name/version；该目录不用于安装依赖（勿在此执行 pnpm install）
        { from: 'package.json', to: 'sandbox' },
        // `**/*` + `flatten: false`：保留 glob 基路径下的 `skills/dependfix-remediator` 结构
        { from: '../skills/dependfix-remediator/**/*', to: 'sandbox', flatten: false },
    ],
})
