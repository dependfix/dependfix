#!/usr/bin/env node
/**
 * Node 运行时安全基线断言（Docker 构建期与镜像冒烟共用）。
 *
 * 背景：2026-11-11 Node.js 安全公告（7 个 HIGH：HTTP/2 会话拆除断言 CVE-2026-123863、
 * HTTPS 零长 TLS 写堆拷贝 CVE-2026-123864、TLS 1.2 重协商改 servername 绕过客户端证书认证 CVE-2026-123872 等）
 * 只在修复版本生效。镜像长期钉住基础镜像 digest，上游未跟进时运行时会静默停留在受影响版本；
 * 构建期 fail-closed 比发布后再审计更可靠。
 *
 * 判定口径：按发布线取各线的最低已修复版本。不属于 22 / 24 / 26 发布线的版本（含 EOL 的
 * 20 / 23 / 25）一律判失败——它们不再接收安全补丁，`>= 某条线的最低版本` 的简单下界会让
 * 未修复的 25.x / 26.0 混过检查。
 *
 * 与发布包 engines 的关系：engines 只声明支持面 22 / 24；CI 以 `lts/*` 动态跟随（当前 26.x），
 * 本脚本的断言面更宽（含 26），用于将来基底切到 26.13.1+ 时不被误拦。二者口径不同是有意的，不是遗漏。
 *
 * 用法：
 *   node check-node-version.mjs                  # 校验当前进程的 Node 版本
 *   node check-node-version.mjs --version=24.18.1  # 校验指定版本（排查 / 负例复现用）
 *
 * 不读取环境变量：避免镜像层注入同名 ENV 后断言恒真。
 */

import { pathToFileURL } from 'node:url'

/** 各发布线的最低已修复版本（2026-11-11 安全公告） */
export const NODE_SECURITY_BASELINE = {
    '22': '22.23.5',
    '24': '24.22.3',
    '26': '26.13.1',
}

/**
 * 解析版本号为数字三元组。
 * @param {string} version 形如 `24.22.3` / `v24.22.3` / `24.22.3-rc.1`
 * @returns {{major: number, minor: number, patch: number}}
 */
export function parseVersion(version) {
    const match = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(String(version).trim())
    if (!match) {
        throw new Error(`无法解析 Node 版本号：${version}`)
    }
    return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) }
}

/**
 * 同发布线内的版本比较（跨发布线按 major 比较）。
 * @param {string} actual
 * @param {string} minimum
 * @returns {boolean}
 */
export function isAtLeast(actual, minimum) {
    const a = parseVersion(actual)
    const b = parseVersion(minimum)
    if (a.major !== b.major) {
        return a.major > b.major
    }
    if (a.minor !== b.minor) {
        return a.minor > b.minor
    }
    return a.patch >= b.patch
}

/**
 * 判定一个 Node 版本是否达到安全基线。
 * @param {string} version
 * @returns {{ok: boolean, minimum: string | null, reason: string}}
 */
export function checkNodeVersion(version) {
    const { major } = parseVersion(version)
    const minimum = NODE_SECURITY_BASELINE[major]
    if (!minimum) {
        return {
            ok: false,
            minimum: null,
            reason: `Node ${version} 不在仍接收安全补丁的发布线（22 / 24 / 26）内`,
        }
    }
    if (!isAtLeast(version, minimum)) {
        return { ok: false, minimum, reason: `Node ${version} 低于 ${major}.x 安全基线 ${minimum}` }
    }
    return { ok: true, minimum, reason: `Node ${version} >= ${minimum}` }
}

/**
 * 从命令行参数解析显式指定的版本（`--version=24.18.1`）。
 * @param {string[]} argv `process.argv.slice(2)`
 * @param {string} [fallback] 未指定时使用的版本
 * @returns {string}
 */
export function resolveVersionArg(argv, fallback = process.versions.node) {
    const arg = argv.find((item) => item.startsWith('--version='))
    return arg ? arg.slice('--version='.length) : fallback
}

/**
 * 命令行入口。
 * @param {string} [version] 待校验版本，缺省取当前进程
 * @param {Pick<Console, 'log' | 'error'>} [log]
 * @returns {number} 退出码
 */
export function main(version = process.versions.node, log = console) {
    const result = checkNodeVersion(version)
    if (!result.ok) {
        log.error(`[node-baseline] ${result.reason}`)
        log.error('[node-baseline] 修复版本见 https://nodejs.org/en/blog/vulnerability/november-2026-security-releases')
        return 1
    }
    log.log(`[node-baseline] ${result.reason}`)
    return 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    process.exitCode = main(resolveVersionArg(process.argv.slice(2)))
}
