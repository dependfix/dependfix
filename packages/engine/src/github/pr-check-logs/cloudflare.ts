import {
    mapHttpFailure,
    parseJsonSafe,
    requestWithTimeout,
    toAvailable,
    toFailure,
    type ProviderLogDeps,
    type ProviderLogRequest,
    type ProviderLogResult,
} from './index'

/**
 * Cloudflare Workers Builds adapter（只读）。
 *
 * 流程（官方 API）：
 * 1. `GET /accounts/{account_id}/builds/workers/{worker_tag}/builds` —— 列出构建；
 * 2. 用 `build_trigger_metadata.commit_hash`（兼容 camelCase）匹配 PR head SHA；
 * 3. `GET /accounts/{account_id}/builds/builds/{build_uuid}/logs` —— 取日志。
 *
 * 缺 `cloudflareAccountId` / `cloudflareWorkerTag` → `unsupported_target`（零请求）；
 * 找不到匹配构建 → `not_found`（不拿「最新构建」冒充，避免展示别的提交的日志）。
 */

interface CloudflareBuild {
    build_uuid?: unknown
    buildUuid?: unknown
    build_trigger_metadata?: { commit_hash?: unknown, commitHash?: unknown }
    buildTriggerMetadata?: { commit_hash?: unknown, commitHash?: unknown }
}

const readString = (value: unknown): string | null => (typeof value === 'string' && value.trim() !== '' ? value : null)

/** 从 build 记录读取 commit hash（snake_case 优先，兼容 camelCase） */
const readCommitHash = (build: CloudflareBuild): string | null => {
    const trigger = build.build_trigger_metadata ?? build.buildTriggerMetadata
    if (!trigger) {
        return null
    }
    return readString(trigger.commit_hash) ?? readString(trigger.commitHash)
}

/** 从 build 记录读取 build uuid */
const readBuildUuid = (build: CloudflareBuild): string | null =>
    readString(build.build_uuid) ?? readString(build.buildUuid)

interface CloudflareLogsPage {
    lines: string[]
    cursor: string | null
    truncated: boolean
}

/**
 * 解析一页日志。
 *
 * 官方 `builds_BuildLogsResponse.lines` 是 `[timestamp, message]` 二元组数组；
 * 同时兼容历史测试 / 第三方代理可能返回的 string 或 `{line|text|message}` 形态。
 */
const parseLogsPage = (payload: unknown): CloudflareLogsPage | null => {
    if (!payload || typeof payload !== 'object') {
        return null
    }
    const record = payload as { result?: unknown, cursor?: unknown, truncated?: unknown }
    const result = record.result
    let rawLines: unknown[] | null = null
    let cursor: string | null = null
    let truncated = false
    if (Array.isArray(result)) {
        rawLines = result
    } else if (result && typeof result === 'object') {
        const resultRecord = result as { lines?: unknown, cursor?: unknown, truncated?: unknown }
        if (Array.isArray(resultRecord.lines)) {
            rawLines = resultRecord.lines
        }
        cursor = readString(resultRecord.cursor)
        truncated = resultRecord.truncated === true
    }
    if (!rawLines) {
        return null
    }
    const lines = rawLines.map((entry) => {
        // 官方形态：[timestamp, message]
        if (Array.isArray(entry)) {
            return readString(entry[1]) ?? ''
        }
        if (typeof entry === 'string') {
            return entry
        }
        if (!entry || typeof entry !== 'object') {
            return ''
        }
        const lineRecord = entry as { line?: unknown, text?: unknown, message?: unknown }
        return readString(lineRecord.line) ?? readString(lineRecord.text) ?? readString(lineRecord.message) ?? ''
    }).filter((line) => line !== '')
    return {
        lines,
        cursor: readString(record.cursor) ?? cursor,
        truncated: truncated || record.truncated === true,
    }
}

/** 分页跟随上限（每页 ≤ 3 次请求；超限按已取到的尾部截断，不无限翻） */
export const CLOUDFLARE_LOG_MAX_PAGES = 3

export const fetchCloudflareLogTail = async (
    request: ProviderLogRequest,
    deps: ProviderLogDeps,
): Promise<ProviderLogResult> => {
    const { cloudflareAccountId: accountId, cloudflareWorkerTag: workerTag } = request.targets
    if (!accountId || !workerTag) {
        return { available: false, provider: 'cloudflare', reason: 'unsupported_target' }
    }
    const base = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/builds`
    try {
        const buildsResponse = await requestWithTimeout(`${base}/workers/${encodeURIComponent(workerTag)}/builds`, request.token, deps)
        if (!buildsResponse.ok) {
            return {
                available: false,
                provider: 'cloudflare',
                reason: mapHttpFailure(buildsResponse.status),
                status: buildsResponse.status,
            }
        }
        const buildsPayload = await parseJsonSafe(buildsResponse)
        const builds = (buildsPayload as { result?: unknown } | null)?.result
        if (!Array.isArray(builds)) {
            return { available: false, provider: 'cloudflare', reason: 'unsupported_response' }
        }
        const matched = (builds as CloudflareBuild[]).find((build) => readCommitHash(build) === request.headSha)
        const buildUuid = matched ? readBuildUuid(matched) : null
        if (!buildUuid) {
            return { available: false, provider: 'cloudflare', reason: 'not_found' }
        }

        const logsResponse = await requestWithTimeout(`${base}/builds/${encodeURIComponent(buildUuid)}/logs`, request.token, deps)
        if (!logsResponse.ok) {
            return {
                available: false,
                provider: 'cloudflare',
                reason: mapHttpFailure(logsResponse.status),
                status: logsResponse.status,
            }
        }
        let logsPayload = await parseJsonSafe(logsResponse)
        let page = parseLogsPage(logsPayload)
        if (!page) {
            return { available: false, provider: 'cloudflare', reason: 'unsupported_response' }
        }
        const collected = [...page.lines]
        for (let pageIndex = 1; page.cursor && page.truncated && pageIndex < CLOUDFLARE_LOG_MAX_PAGES; pageIndex += 1) {
            const nextResponse = await requestWithTimeout(
                `${base}/builds/${encodeURIComponent(buildUuid)}/logs?cursor=${encodeURIComponent(page.cursor)}`,
                request.token,
                deps,
            )
            if (!nextResponse.ok) {
                return {
                    available: false,
                    provider: 'cloudflare',
                    reason: mapHttpFailure(nextResponse.status),
                    status: nextResponse.status,
                }
            }
            logsPayload = await parseJsonSafe(nextResponse)
            page = parseLogsPage(logsPayload)
            if (!page) {
                break
            }
            collected.push(...page.lines)
        }
        return toAvailable('cloudflare', collected.join('\n'), request)
    } catch (error) {
        return toFailure('cloudflare', error)
    }
}
