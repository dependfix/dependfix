import { createHash } from 'node:crypto'
import type { AlertSource } from './index'

/**
 * 规范化上游告警唯一 ID（M20）。
 *
 * 设计目标：跨次扫描稳定可比较、平台 ScanResult 唯一索引第二段。
 * 单一 canonical 格式 `${source}:${identifier}`，identifier 按 source 不同：
 *
 * - `dependabot` → `${source}:${alertNumber}`（GitHub numeric alert number）
 * - `code-scanning` → `${source}:${alertNumber}`（GitHub numeric alert number）
 * - `code-quality` → `${source}:${findingNumber}`（GitHub numeric finding number）
 * - `pnpm-audit` → `${source}:${packageName}:${sha256(advisoryId).slice(0,16)}`
 *   （pnpm audit 无 numeric alert number；同一 GHSA 可影响多个包，需含 packageName
 *   区分；advisoryId 用 sha256 16 字符稳定 + 碰撞概率 ~2^-64 极低）
 *
 * @param source - 告警数据源
 * @param raw - 原始 ID 组件（按 source 形态不同）：
 *   - dependabot/code-scanning/code-quality：`{ alertNumber }`
 *   - pnpm-audit：`{ packageName, advisoryId }`
 * @returns 规范化字符串，平台 ScanResult `upstreamId` 列直接存储
 *
 * @example
 * ```ts
 * normalizeUpstreamId('dependabot', { alertNumber: 42 })
 * // => 'dependabot:42'
 *
 * normalizeUpstreamId('pnpm-audit', { packageName: 'nanoid', advisoryId: 'GHSA-2v37-7h3g-55p8' })
 * // => 'pnpm-audit:nanoid:<sha256-prefix>'
 * ```
 */
export function normalizeUpstreamId(
    source: AlertSource,
    raw:
        | { alertNumber: number | string }
        | { packageName: string, advisoryId: string },
): string {
    if (source === 'pnpm-audit') {
        if (!('packageName' in raw) || !('advisoryId' in raw)) {
            throw new TypeError('normalizeUpstreamId: pnpm-audit requires { packageName, advisoryId }')
        }
        const { packageName, advisoryId } = raw as { packageName: string, advisoryId: string }
        if (!packageName || !advisoryId) {
            throw new TypeError('normalizeUpstreamId: pnpm-audit requires non-empty { packageName, advisoryId }')
        }
        const digest = createHash('sha256')
            .update(`${packageName}:${advisoryId}`)
            .digest('hex')
            .slice(0, 16)
        // packageName 用 : 分隔时可能与字段冲突 → 仅当不含 ':' 时直存，否则 hex
        const pkgSegment = packageName.includes(':') ? createHash('sha256').update(packageName).digest('hex').slice(0, 16) : packageName
        return `${source}:${pkgSegment}:${digest}`
    }

    if (!('alertNumber' in raw)) {
        throw new TypeError(`normalizeUpstreamId: ${source} requires { alertNumber }`)
    }
    return `${source}:${String(raw.alertNumber)}`
}
