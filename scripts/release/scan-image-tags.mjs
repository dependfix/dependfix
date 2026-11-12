/**
 * scan-image-tags.mjs —— 历史镜像 tag 巡检
 *
 * 目的：给发布后的镜像面产出「已验证 / 未证实」清单，避免把「tag 存在」当成「双架构可用」。
 * 判定（只做 registry manifest 读，不拉取、不运行）：
 * - verified：`docker buildx imagetools inspect` 可解析，且 manifest 列表同时含
 *   `linux/amd64` 与 `linux/arm64`；
 * - unverified：缺凭证 / 镜像不存在 / 网络失败 / 单架构 / 输出不可解析 —— 一律写「未证实」，
 *   并记录原因；不写「通过」。
 *
 * 运行时健康检查不在本脚本（见 docker.yml 的 post-release smoke：各架构原生 runner 实际启动）。
 * 巡检范围：**仅 GHCR** 通道（Docker Hub / ACR 不在面内），verified 不代表三通道可用。
 * 用法：
 *   node scripts/release/scan-image-tags.mjs [--window=10] [--repo=owner/repo] [--image=ghcr.io/owner/repo]
 *                                            [--tags=platform-1.0.0,platform-0.7.0] [--json]
 *   取值支持 `--key=value` 与 `--key value` 两种形态（CI 与手工调用共用同一解析器）。
 * 退出码：0 报告已产出（即使含 unverified） / 1 内部错误 / 2 参数错误
 */
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { getCliArgs, isDirectExecution } from '../shared/cli.mjs'

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
const PLATFORM_GIT_TAG_PREFIX = '@dependfix/platform@'
const REQUIRED_ARCHITECTURES = ['amd64', 'arm64']
const DEFAULT_WINDOW = 10
const MAX_WINDOW = 100

/** git tag `@dependfix/platform@x.y.z` → 镜像 tag `platform-x.y.z`。 */
export function imageTagForVersion(version) {
    return `platform-${version}`
}

/**
 * 从 git tag 列表（`@dependfix/platform@*`，已按版本降序）取窗口内的镜像 tag。
 * 非匹配行忽略；窗口非法时抛错（fail-closed 的参数语义）。
 */
export function resolveCandidateTags(gitTagLines, window = DEFAULT_WINDOW) {
    if (!Number.isInteger(window) || window < 1 || window > MAX_WINDOW) {
        throw new Error(`--window 必须是 1-${MAX_WINDOW} 的整数`)
    }
    const versions = []
    for (const line of gitTagLines) {
        const tag = String(line).trim()
        if (!tag.startsWith(PLATFORM_GIT_TAG_PREFIX)) {
            continue
        }
        const version = tag.slice(PLATFORM_GIT_TAG_PREFIX.length)
        if (version) {
            versions.push(version)
        }
    }
    return versions.slice(0, window).map(imageTagForVersion)
}

/** 解析 `docker buildx imagetools inspect --format '{{json .}}'` 输出里的架构列表；不可解析返回 null。 */
export function parseArchitectures(output) {
    let data
    try {
        data = JSON.parse(output)
    } catch {
        return null
    }
    if (!Array.isArray(data?.manifests)) {
        return null
    }
    const architectures = new Set()
    for (const entry of data.manifests) {
        const arch = entry?.platform?.architecture
        const os = entry?.platform?.os
        if (typeof arch === 'string' && (os === undefined || os === 'linux')) {
            architectures.add(arch)
        }
    }
    return [...architectures].sort()
}

/** 评估单个镜像 tag（依赖注入便于测试）：inspect(ref) 返回 imagetools 输出；任何异常 / 不可解析 / 缺架构一律 unverified（fail-open）。 */
export function evaluateTag(tag, inspect, image) {
    const ref = `${image}:${tag}`
    let output
    try {
        output = inspect(ref)
    } catch (failure) {
        const detail = failure instanceof Error ? firstLine(failure.message) : String(failure)
        return { tag, status: 'unverified', reason: `manifest 查询失败：${detail}` }
    }
    const architectures = parseArchitectures(output)
    if (architectures === null) {
        return { tag, status: 'unverified', reason: 'manifest 输出不可解析（可能为单架构或非 JSON）' }
    }
    const missing = REQUIRED_ARCHITECTURES.filter((arch) => !architectures.includes(arch))
    if (missing.length > 0) {
        return {
            tag,
            status: 'unverified',
            reason: `缺少架构 ${missing.join(' / ')}（实际 ${architectures.join(' / ') || '无'}）`,
        }
    }
    return { tag, status: 'verified', reason: `双架构 manifest（${architectures.join(' / ')}）` }
}

function firstLine(text) {
    return String(text).split('\n')[0].trim()
}

/** Markdown 报告（固定表头；无候选 tag 时明确写「未发现候选 tag」，不写通过）。 */
export function formatMarkdownReport(rows, { image }) {
    const lines = [
        `## 镜像 tag 巡检（${image}）`,
        '',
        '> verified = 双架构 manifest 可解析；unverified = 未证实（含缺凭证 / 缺镜像 / 网络失败 / 单架构），不构成运行通过。',
        '',
    ]
    if (rows.length === 0) {
        lines.push('未发现候选 tag（窗口内没有 `@dependfix/platform@*` 发布 tag）。')
        return `${lines.join('\n')}\n`
    }
    lines.push('| 镜像 tag | 结论 | 依据 |', '|:--|:--:|:--|')
    for (const row of rows) {
        lines.push(`| \`${row.tag}\` | ${row.status} | ${row.reason} |`)
    }
    return `${lines.join('\n')}\n`
}

/**
 * 解析参数（等号与空格两种取值形态都接受；未知参数 fail-closed）。
 * CI 与手工调用共用同一入口，避免「工作流写法与脚本写法不一致」的静默空转。
 */
export function parseScanArgs(argv = []) {
    const options = { window: DEFAULT_WINDOW, repo: null, image: null, tags: null, json: false }
    const valueKeys = new Set(['--window', '--repo', '--image', '--tags'])
    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index]
        if (arg === '--json') {
            options.json = true
            continue
        }
        const separator = arg.indexOf('=')
        const key = separator === -1 ? arg : arg.slice(0, separator)
        const inlineValue = separator === -1 ? undefined : arg.slice(separator + 1)
        if (!valueKeys.has(key)) {
            throw new Error(`未知参数：${arg}`)
        }
        const value = inlineValue ?? argv[index + 1]
        if (inlineValue === undefined) {
            index += 1
        }
        if (!value || value.startsWith('--')) {
            throw new Error(`${key} 缺少取值`)
        }
        if (key === '--window') {
            if (!/^\d+$/.test(value)) {
                throw new Error('--window 必须是正整数')
            }
            options.window = Number(value)
            if (options.window < 1 || options.window > MAX_WINDOW) {
                throw new Error(`--window 必须是 1-${MAX_WINDOW} 的整数`)
            }
            continue
        }
        options[key.slice(2)] = value
    }
    return options
}

function resolveRepo(explicit) {
    if (explicit) {
        return explicit
    }
    if (process.env.GITHUB_REPOSITORY) {
        return process.env.GITHUB_REPOSITORY
    }
    try {
        const remote = execFileSync('git', ['remote', 'get-url', 'origin'], {
            cwd: repoRoot,
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'pipe'],
        }).trim()
        const match = /github\.com[:/]([^/]+)\/([^/.]+)(?:\.git)?$/.exec(remote)
        return match ? `${match[1]}/${match[2]}` : null
    } catch {
        return null
    }
}

function listPlatformGitTags() {
    return execFileSync('git', ['tag', '--list', `${PLATFORM_GIT_TAG_PREFIX}*`, '--sort=-v:refname'], {
        cwd: repoRoot,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
    })
        .split('\n')
        .filter(Boolean)
}

function inspectRef(ref) {
    try {
        return execFileSync('docker', ['buildx', 'imagetools', 'inspect', ref, '--format', '{{json .}}'], {
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'pipe'],
        })
    } catch (failure) {
        // 保留 registry 侧可读原因（denied / unauthorized / no such host），供报告「未证实」归类
        const stderr = failure?.stderr ? String(failure.stderr).trim().split('\n').filter(Boolean).at(-1) : ''
        throw new Error(stderr || String(failure?.message ?? failure).split('\n')[0])
    }
}

export function main({
    argv = getCliArgs(),
    log = (line) => console.log(line),
    error = (line) => console.error(line),
    deps = {},
} = {}) {
    let options
    try {
        options = parseScanArgs(argv)
    } catch (failure) {
        error(`[scan-image-tags] ${failure.message}`)
        return 2
    }
    // 显式 --image 时不再依赖仓库 slug（参数正交：给定镜像即可巡检）
    const repo = options.image ? null : options.repo || resolveRepo(null)
    if (!options.image && !repo) {
        error('[scan-image-tags] 无法确定仓库 slug（--repo 或 GITHUB_REPOSITORY / origin remote）')
        return 2
    }
    const image = options.image || `ghcr.io/${repo}`
    const listTags = deps.listTags ?? listPlatformGitTags
    const inspect = deps.inspect ?? inspectRef
    let tags
    try {
        tags = options.tags
            ? options.tags.split(',').map((tag) => tag.trim()).filter(Boolean)
            : resolveCandidateTags(listTags(), options.window)
    } catch (failure) {
        error(`[scan-image-tags] ${failure.message}`)
        return 2
    }
    const rows = tags.map((tag) => evaluateTag(tag, inspect, image))
    if (options.json) {
        log(JSON.stringify({ image, tags: rows }, null, 2))
    } else {
        log(formatMarkdownReport(rows, { image }).trimEnd())
    }
    return 0
}

/* v8 ignore start -- CLI 入口守卫：进程级副作用不可在单测内触发（与其它脚本同惯例） */
if (isDirectExecution(import.meta.url)) {
    process.exitCode = main()
}
/* v8 ignore stop */
