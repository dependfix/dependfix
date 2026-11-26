#!/usr/bin/env node
/**
 * 平台镜像原生编译工具链变体断言（Docker 构建期与镜像冒烟共用）。
 *
 * 背景：平台镜像曾长期内置 `python3` / `make` / `g++`，供目标仓库原生模块
 * （better-sqlite3 等）在无 prebuild 时回退 node-gyp 源码编译。该工具链同时扩大了运行镜像的
 * 攻击面与体积；默认镜像不应无条件携带，但**必须保留可判读的 full 变体**，否则需要编译的
 * 仓库会静默失去能力。故把「默认 slim / 显式 full」变成构建期 fail-closed 断言：
 * 基底漂移把工具链带回来（slim 变体变胖）或缺工具（full 变体名不副实）都在构建时失败。
 *
 * 判定口径：
 * - `--variant=slim`（默认）：`python3` / `make` / `g++` 三者必须**全部不存在**；
 * - `--variant=full`：三者必须**全部存在**（逐项断言；busybox `command -v a b c` 只在全部缺失时非零，
 *   不能作为门禁）。
 *
 * 用法：
 *   node check-toolchain.mjs                  # 断言当前镜像为 slim 变体
 *   node check-toolchain.mjs --variant=full    # 断言当前镜像为 full 变体
 *
 * 不读取环境变量作为判定输入：探测面固定为 `PATH ∪ 固定系统目录`，避免镜像层注入 `PATH`
 * 后断言恒真（只看 `PATH` 时，`-e PATH=/usr/local/bin` 就能让满工具链镜像通过 slim 断言）。
 */

import { accessSync, constants, statSync } from 'node:fs'
import { delimiter, join } from 'node:path'
import { pathToFileURL } from 'node:url'

/** 原生模块源码编译所需的最小工具链（与 Dockerfile `executor-base` 阶段一致）。 */
export const NATIVE_TOOLCHAIN = ['python3', 'make', 'g++']

/** 合法变体；`slim` 为默认交付镜像。 */
export const TOOLCHAIN_VARIANTS = ['slim', 'full']

/**
 * 固定探测目录（Alpine / musl 发行版的实际安装位置）。
 *
 * 与 `PATH` 取并集：只信 `PATH` 时，注入 `PATH=/usr/local/bin` 就能让满工具链镜像通过 slim 断言
 * （fail-open）。这些目录在镜像里由 `apk` 固定写入，不受构建参数或运行时 ENV 影响。
 */
export const DEFAULT_PROBE_DIRS = ['/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin']

/**
 * 构造探测目录序列：`PATH` 各项（去空）在前，固定目录补后并去重。
 * @param {string} [pathValue] PATH 原值
 * @returns {string[]} 目录序列
 */
export function resolveProbeDirs(pathValue = process.env.PATH ?? '') {
    const fromPath = pathValue.split(delimiter).filter((dir) => dir)
    return [...new Set([...fromPath, ...DEFAULT_PROBE_DIRS])]
}

/**
 * 在探测目录中查找可执行文件。
 * @param {string} tool 工具名
 * @param {{path?: string, isExecutable?: (file: string) => boolean}} [options] 可注入依赖（单测用）
 * @returns {boolean} 是否存在可执行文件
 */
export function findExecutable(tool, options = {}) {
    const isExecutable = options.isExecutable ?? defaultIsExecutable
    return resolveProbeDirs(options.path).some((dir) => isExecutable(join(dir, tool)))
}

/**
 * 默认可执行判定：普通文件（或指向普通文件的符号链接）且具备执行位。
 * @param {string} file 绝对路径
 * @returns {boolean}
 */
export function defaultIsExecutable(file) {
    try {
        if (!statSync(file).isFile()) {
            return false
        }
        accessSync(file, constants.X_OK)
        return true
    } catch {
        return false
    }
}

/**
 * 从命令行参数解析变体（`--variant=slim|full`）。
 * @param {string[]} argv `process.argv.slice(2)`
 * @param {string} [fallback] 未指定时的变体
 * @returns {'slim' | 'full'}
 */
export function parseVariant(argv, fallback = 'slim') {
    const arg = argv.find((item) => item.startsWith('--variant='))
    const value = arg ? arg.slice('--variant='.length) : fallback
    if (!TOOLCHAIN_VARIANTS.includes(value)) {
        throw new Error(`--variant 只接受 ${TOOLCHAIN_VARIANTS.join(' / ')}：${value}`)
    }
    return value
}

/**
 * 判定工具链是否与变体一致。
 * @param {'slim' | 'full'} variant 期望变体
 * @param {Record<string, boolean>} found 各工具是否存在
 * @returns {{ok: boolean, reason: string}}
 */
export function checkToolchain(variant, found) {
    const present = NATIVE_TOOLCHAIN.filter((tool) => found[tool])
    const missing = NATIVE_TOOLCHAIN.filter((tool) => !found[tool])
    const state = NATIVE_TOOLCHAIN.map((tool) => `${tool}:${found[tool] ? 'present' : 'absent'}`).join(' ')
    if (variant === 'slim') {
        if (present.length > 0) {
            return {
                ok: false,
                reason: `variant=slim 但镜像含原生编译工具链（${present.join(', ')}）；应从 executor-base-slim 构建默认平台镜像`,
            }
        }
        return { ok: true, reason: `variant=slim ${state}` }
    }
    if (missing.length > 0) {
        return {
            ok: false,
            reason: `variant=full 但镜像缺原生编译工具链（${missing.join(', ')}）；full 变体必须与 executor-base 一致`,
        }
    }
    return { ok: true, reason: `variant=full ${state}` }
}

/**
 * 命令行入口。
 * @param {string[]} argv `process.argv.slice(2)`
 * @param {Pick<Console, 'log' | 'error'>} [log]
 * @param {(tool: string) => boolean} [probe] 工具存在性探针（单测用）
 * @returns {number} 退出码
 */
export function main(argv, log = console, probe = (tool) => findExecutable(tool)) {
    const variant = parseVariant(argv)
    const found = Object.fromEntries(NATIVE_TOOLCHAIN.map((tool) => [tool, probe(tool)]))
    const result = checkToolchain(variant, found)
    if (!result.ok) {
        log.error(`[toolchain] FAIL: ${result.reason}`)
        log.error('[toolchain] 变体口径见 docs/design/governance/platform-image-variants.md')
        return 1
    }
    log.log(`[toolchain] ${result.reason}`)
    return 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    try {
        process.exitCode = main(process.argv.slice(2))
    } catch (error) {
        console.error(`[toolchain] ${error.message}`)
        process.exitCode = 1
    }
}
