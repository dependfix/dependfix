#!/usr/bin/env node
/**
 * 跨 registry digest 一致性断言（CI merge 阶段与本地复算共用）。
 *
 * 背景：`docker.yml` 用一次构建把同一镜像推三个 registry（Docker Hub / GHCR / ACR），
 * `merge` 用同一 digest 合成 tag。如果某次改动让三个 registry 拿到不同内容（例如把某个
 * registry 改回独立构建、或 tag 规则漂移），多架构 manifest 仍会「看起来正常」——只有把
 * 每个 tag 在各 registry 的 per-arch manifest digest 逐个比较才能发现。
 *
 * 断言分两层（任一失败即非零）：
 * 1. tag 集合三向相等且非空（三处 metadata 规则是重复字面量，漂移不会体现在 digest 上）；
 * 2. 每个 tag 在三个 registry 的 `linux/<arch>=<digest>` 签名逐字相同；不一致时短退避复读一次
 *    （push 腿与 release 派发并发发布会造成窗口内瞬时不一致），仍不一致才失败；
 *   单次读取的传输层抖动（registry auth 端点 reset / 5xx）另按 3 次退避（3s / 6s）重试，不误判为不一致；
 *   401/403、非 JSON、index 形态变化等确定性失败不重试，直接 fail-closed。
 *
 * 用法（CI）：
 *   node scripts/release/verify-cross-registry-digests.mjs --summary "$GITHUB_STEP_SUMMARY"
 *   读取 TAGS_DOCKERHUB / TAGS_GHCR / TAGS_ACR / TAGS_SANDBOX_* / TAGS_SANDBOX_FULL_* 环境变量。
 *
 * 用法（本地复算某组镜像）：
 *   node scripts/release/verify-cross-registry-digests.mjs \
 *     --label=platform \
 *     --repos=caomeiyouren/dependfix,ghcr.io/dependfix/dependfix,registry.cn-hangzhou.aliyuncs.com/caomeiyouren/dependfix \
 *     --tags=latest
 */

import { execFileSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import process from 'node:process'
import { isDirectExecution } from '../shared/cli.mjs'

/** 默认镜像组（与 docker.yml 的发布形态一致）。 */
export const IMAGE_GROUPS = [
    {
        label: 'platform',
        repos: [
            'caomeiyouren/dependfix',
            'ghcr.io/dependfix/dependfix',
            'registry.cn-hangzhou.aliyuncs.com/caomeiyouren/dependfix',
        ],
        envKeys: { dh: 'TAGS_DOCKERHUB', gh: 'TAGS_GHCR', acr: 'TAGS_ACR' },
    },
    {
        label: 'sandbox',
        repos: [
            'caomeiyouren/dependfix-sandbox',
            'ghcr.io/dependfix/dependfix-sandbox',
            'registry.cn-hangzhou.aliyuncs.com/caomeiyouren/dependfix-sandbox',
        ],
        envKeys: { dh: 'TAGS_SANDBOX_DOCKERHUB', gh: 'TAGS_SANDBOX_GHCR', acr: 'TAGS_SANDBOX_ACR' },
    },
    {
        label: 'sandbox-full',
        repos: [
            'caomeiyouren/dependfix-sandbox-full',
            'ghcr.io/dependfix/dependfix-sandbox-full',
            'registry.cn-hangzhou.aliyuncs.com/caomeiyouren/dependfix-sandbox-full',
        ],
        envKeys: { dh: 'TAGS_SANDBOX_FULL_DOCKERHUB', gh: 'TAGS_SANDBOX_FULL_GHCR', acr: 'TAGS_SANDBOX_FULL_ACR' },
    },
]

/**
 * 从 `repo:tag` 多行列表提取 tag 名（去重、排序）。
 * @param {string} tags 多行或空白分隔的完整镜像引用
 * @returns {string[]}
 */
export function tagNames(tags) {
    return [...new Set(
        String(tags ?? '')
            .split(/\s+/)
            .filter(Boolean)
            .map((ref) => ref.slice(ref.lastIndexOf(':') + 1)),
    )].sort()
}

/**
 * 从 `imagetools inspect --raw` 的 index JSON 提取 `linux/<arch>=<digest>` 签名。
 *
 * 只认 `linux` 平台（provenance 关闭时不会有 attestation 条目）；排序后拼接，便于逐字比较。
 * @param {string} raw index manifest JSON 文本
 * @returns {string} 形如 `amd64=sha256:… arm64=sha256:…`
 */
export function signatureFromIndex(raw) {
    const index = JSON.parse(String(raw))
    const manifests = Array.isArray(index?.manifests) ? index.manifests : []
    const entries = manifests
        .filter((item) => item?.platform?.os === 'linux' && item?.platform?.architecture && item?.digest)
        .map((item) => `${item.platform.architecture}=${item.digest}`)
        .sort()
    if (entries.length === 0) {
        throw new Error('index 中没有 linux 平台的 manifest 条目（形态变化或权限不足？）')
    }
    return `${entries.join(' ')} `
}

/**
 * 读取单个镜像 ref 的签名（失败抛错，调用方按失败处理）。
 * @param {string} ref
 * @param {(ref: string) => string} inspect
 * @returns {string}
 */
export function readSignature(ref, inspect) {
    return signatureFromIndex(inspect(ref))
}

/**
 * 校验三向 tag 集合一致且非空。
 * @param {string} label
 * @param {string[][]} tagLists 三个 registry 的 tag 列表
 * @returns {string[]} 归一的 tag 名（排序）
 */
export function ensureTagSets(label, tagLists) {
    if (tagLists.some((list) => list.length === 0)) {
        throw new Error(`${label} 存在空 tag 列表（metadata 输出异常？三 registry 均应产出相同 tag）`)
    }
    const [first, ...rest] = tagLists.map((list) => list.join(' '))
    if (rest.some((item) => item !== first)) {
        throw new Error(
            `${label} 三 registry 的 tag 集合不一致：${tagLists.map((list) => `[${list.join(',')}]`).join(' vs ')}`,
        )
    }
    return tagNames(first)
}

/** 单次 inspect 的网络抖动重试上限（如 ACR oauth 端点 reset、registry 5xx）。 */
export const INSPECT_ATTEMPTS = 3

/**
 * 传输层抖动特征（大小写不敏感）。401/403、非 JSON、index 形态变化等确定性失败不重试——
 * 重试只会拉长门禁且在日志里把权限问题伪装成网络抖动。
 */
const TRANSIENT_ERROR = /reset by peer|econnreset|etimedout|timeout|timed out|unexpected eof|\beof\b|\btls\b|connection (?:refused|closed|reset)|temporarily unavailable|no such host|i\/o timeout|\b(?:429|5\d\d)\b/i

/**
 * 判断一次读取失败是否值得重试。
 * @param {unknown} error
 * @returns {boolean}
 */
export function isTransientError(error) {
    return TRANSIENT_ERROR.test(error instanceof Error ? error.message : String(error))
}

/**
 * 读取单个镜像 ref 的签名；传输层抖动时短退避重试。
 *
 * 抖动不得被当成 digest 不一致：2026-11-27 的 Publish Docker Image 因
 * `dockerauth.cn-hangzhou.aliyuncs.com` 连接被 reset 使整条发布门禁判红（镜像本身已发布成功）。
 * 确定性失败立即抛出、重试耗尽仍抛错 → 上层 fail-closed，不放宽判定。
 * @param {string} ref
 * @param {(ref: string) => string} inspect
 * @param {{attempts?: number, sleep?: (ms: number) => Promise<void>, log?: Pick<Console, 'warn'>}} [options]
 * @returns {Promise<string>}
 */
export async function readSignatureWithRetry(ref, inspect, { attempts = INSPECT_ATTEMPTS, sleep = defaultSleep, log = console } = {}) {
    let lastError
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
            return readSignature(ref, inspect)
        } catch (error) {
            lastError = error
            if (attempt === attempts || !isTransientError(error)) {
                break
            }
            const reason = error instanceof Error ? error.message : String(error)
            log.warn?.(`[digest] ${ref} 读取失败（第 ${attempt}/${attempts} 次，传输层抖动），重试：${reason}`)
            await sleep(3_000 * attempt)
        }
    }
    throw new Error(`${ref} 读取失败：${lastError instanceof Error ? lastError.message : String(lastError)}`)
}

/**
 * 比较同镜像同 tag 在三 registry 的签名；不一致时退避复读一次。
 * @param {{label: string, tag: string, repos: string[], inspect: (ref: string) => string, sleep?: (ms: number) => Promise<void>, log?: Pick<Console, 'warn'>}} options
 * @returns {Promise<{label: string, tag: string, signatures: string[]}>}
 */
export async function compareTag({ label, tag, repos, inspect, sleep = defaultSleep, log = console }) {
    let signatures = []
    const consistent = () => signatures.length > 0 && signatures.every((item) => item === signatures[0])
    for (let attempt = 1; attempt <= 2; attempt += 1) {
        signatures = []
        for (const repo of repos) {
            signatures.push(await readSignatureWithRetry(`${repo}:${tag}`, inspect, { sleep, log }))
        }
        if (consistent()) {
            return { label, tag, signatures }
        }
        if (attempt === 1) {
            await sleep(15_000)
        }
    }
    throw new Error(
        `${label} tag ${tag} 跨 registry digest 不一致：${repos.map((repo, index) => `${repo}=${signatures[index]}`).join(' vs ')}`,
    )
}

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * 默认 inspect 实现：调用 `docker buildx imagetools inspect --raw`。
 * @param {string} ref
 * @param {{exec?: typeof execFileSync}} [deps]
 * @returns {string}
 */
export function inspectWithBuildx(ref, deps = {}) {
    const exec = deps.exec ?? execFileSync
    return exec('docker', ['buildx', 'imagetools', 'inspect', ref, '--raw'], {
        encoding: 'utf-8',
        timeout: 120_000,
    })
}

/**
 * 解析 CLI 参数（`--name=value` / `--name value`）。
 * @param {string[]} argv
 * @returns {{summary: string | null, label: string | null, repos: string[] | null, tags: string[] | null}}
 */
export function parseArgs(argv) {
    const read = (name) => {
        const flag = `--${name}`
        const index = argv.findIndex((item) => item === flag || item.startsWith(`${flag}=`))
        if (index === -1) {
            return null
        }
        const current = argv[index]
        if (current.startsWith(`${flag}=`)) {
            return current.slice(flag.length + 1)
        }
        const next = argv[index + 1]
        return next && !next.startsWith('--') ? next : null
    }
    const repos = read('repos')
    const tags = read('tags')
    return {
        summary: read('summary'),
        label: read('label'),
        repos: repos ? repos.split(',').map((item) => item.trim()).filter(Boolean) : null,
        tags: tags ? tags.split(',').map((item) => item.trim()).filter(Boolean) : null,
    }
}

/**
 * 主流程。
 * @param {string[]} argv
 * @param {{env?: NodeJS.ProcessEnv, inspect?: (ref: string) => string, sleep?: (ms: number) => Promise<void>, log?: Pick<Console, 'log' | 'error'> & Partial<Pick<Console, 'warn'>>, appendSummary?: (text: string) => void}} [deps]
 * @returns {Promise<number>} 退出码（0 一致 / 1 不一致或读不到）
 */
export async function main(argv, deps = {}) {
    const env = deps.env ?? process.env
    const inspect = deps.inspect ?? ((ref) => inspectWithBuildx(ref))
    const sleep = deps.sleep ?? defaultSleep
    const log = deps.log ?? console
    const appendSummary = deps.appendSummary ?? ((text) => {
        const target = parseArgs(argv).summary
        if (target) {
            appendFileSync(target, text, 'utf-8')
        }
    })
    const args = parseArgs(argv)

    // 本地复算模式：显式给出 label / repos / tags，不读 TAGS_* 环境变量
    const groups = args.repos && args.tags
        ? [{ label: args.label ?? 'image', repos: args.repos, tags: args.tags }]
        : IMAGE_GROUPS.map((group) => ({
            label: group.label,
            repos: group.repos,
            tags: null,
            envKeys: group.envKeys,
        }))

    try {
        for (const group of groups) {
            const tags = group.tags
                ?? ensureTagSets(group.label, [
                    tagNames(env[group.envKeys.dh] ?? ''),
                    tagNames(env[group.envKeys.gh] ?? ''),
                    tagNames(env[group.envKeys.acr] ?? ''),
                ])
            for (const tag of tags) {
                const result = await compareTag({ label: group.label, tag, repos: group.repos, inspect, sleep, log })
                const line = `${group.label} ${tag} → ${result.signatures[0]} `
                log.log(`[digest] ${line}`)
                appendSummary(`- \`${group.label}\` \`${tag}\` → dh/gh/acr 一致：\`${result.signatures[0].trim()}\`\n`)
            }
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        log.error(`[digest] FAIL：${message}`)
        appendSummary(`- **FAIL**：${message}\n`)
        return 1
    }
    log.log('[digest] OK：跨 registry digest 一致')
    return 0
}

if (isDirectExecution(import.meta.url)) {
    process.exitCode = await main(process.argv.slice(2))
}
