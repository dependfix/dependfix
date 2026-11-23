import {
    joinLogLines,
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
 * Vercel adapter（只读）。
 *
 * 流程（官方 REST）：
 * 1. `GET https://api.vercel.com/v7/deployments?projectId=<id>&sha=<headSha>&limit=1`
 *    —— 用仓库级 projectId + PR head SHA 定位部署（无需猜项目名）；
 * 2. `GET https://api.vercel.com/v3/deployments/<uid>/events?builds=1&direction=backward&limit=200`
 *    —— 取构建事件（含 `text`），拼成日志正文。
 *
 * 缺 `vercelProjectId` → `unsupported_target`（零请求）；401/403/429/超时按枚举降级。
 */

interface VercelDeployment {
    uid?: unknown
    id?: unknown
}

const parseDeploymentId = (payload: unknown): string | null => {
    if (!payload || typeof payload !== 'object') {
        return null
    }
    const deployments = (payload as { deployments?: unknown }).deployments
    if (!Array.isArray(deployments) || deployments.length === 0) {
        return null
    }
    const first = deployments[0] as VercelDeployment
    if (typeof first.uid === 'string') {
        return first.uid
    }
    return typeof first.id === 'string' ? first.id : null
}

/** Vercel events 响应：数组（可能嵌套 payload.text）→ 文本行（backward 返回新→旧，反转成时间正序） */
const parseEvents = (payload: unknown): string[] => {
    if (!Array.isArray(payload)) {
        return []
    }
    return (payload as unknown[]).slice().reverse().map((item) => {
        if (typeof item === 'string') {
            return item
        }
        if (!item || typeof item !== 'object') {
            return ''
        }
        const record = item as { text?: unknown, payload?: { text?: unknown } }
        if (typeof record.text === 'string') {
            return record.text
        }
        return typeof record.payload?.text === 'string' ? record.payload.text : ''
    })
}

export const fetchVercelLogTail = async (
    request: ProviderLogRequest,
    deps: ProviderLogDeps,
): Promise<ProviderLogResult> => {
    const projectId = request.targets.vercelProjectId
    if (!projectId) {
        return { available: false, provider: 'vercel', reason: 'unsupported_target' }
    }
    try {
        const deploymentsUrl = `https://api.vercel.com/v7/deployments?projectId=${encodeURIComponent(projectId)}&sha=${encodeURIComponent(request.headSha)}&limit=1`
        const deploymentsResponse = await requestWithTimeout(deploymentsUrl, request.token, deps)
        if (!deploymentsResponse.ok) {
            return {
                available: false,
                provider: 'vercel',
                reason: mapHttpFailure(deploymentsResponse.status),
                status: deploymentsResponse.status,
            }
        }
        const deploymentId = parseDeploymentId(await parseJsonSafe(deploymentsResponse))
        if (!deploymentId) {
            return { available: false, provider: 'vercel', reason: 'not_found' }
        }

        const eventsUrl = `https://api.vercel.com/v3/deployments/${encodeURIComponent(deploymentId)}/events?builds=1&direction=backward&limit=200`
        const eventsResponse = await requestWithTimeout(eventsUrl, request.token, deps)
        if (!eventsResponse.ok) {
            return {
                available: false,
                provider: 'vercel',
                reason: mapHttpFailure(eventsResponse.status),
                status: eventsResponse.status,
            }
        }
        const eventsPayload = await parseJsonSafe(eventsResponse)
        if (!Array.isArray(eventsPayload)) {
            return { available: false, provider: 'vercel', reason: 'unsupported_response' }
        }
        return toAvailable('vercel', joinLogLines(parseEvents(eventsPayload)), request)
    } catch (error) {
        return toFailure('vercel', error)
    }
}
