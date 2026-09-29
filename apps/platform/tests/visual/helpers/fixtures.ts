import type { APIRequestContext } from '@playwright/test'
import { type AlertsRowgroupFixtures, seedCustomFixtures } from '../../e2e/helpers/fixtures.helper'

/**
 * 视觉回归专属 fixtures 数据集。
 *
 * 为什么不复用 e2e 的 `ALERTS_ROWGROUP_FIXTURES`：
 * - e2e 数据集不含仓库标签，`repos` 页「标签」列只能落空态（视觉基线失去该列的兜底能力）；
 * - e2e 数据集的 `firstSeenAt` / `lastSeenAt` 缺省 → fixtures 端点填 `now()`，每次运行不同；
 *   视觉基线需要**逐像素可复现**，故本数据集显式钉死时间戳。
 *
 * 数据规模遵循 minimum fixture 原则：3 仓库（2 个带标签 + 1 个无标签）+ 3 次扫描 + 7 条告警。
 *
 * 数据集刻意让**每个包只有一档 severity**（lodash=high / node-fetch=medium / axios=critical /
 * minimist=low）：alerts 页分组键是包名，而默认排序按 severity 降序——同一包跨多档 severity 时，
 * 排序会把这些行拆到不同 severity 区块，分组头随之重复出现（既有行为，非本批引入）。
 * 视觉基线取「分组连续」的形态，以覆盖分组头 + 展开行 + 4 档 severity 标签 + 4 种 source +
 * 5 种 fixStatus 呈现。不要扩展本集合，除非新增视觉用例确实需要。
 */
export const VISUAL_FIXTURES: AlertsRowgroupFixtures = {
    repos: [
        { owner: 'acme', name: 'web-app', tags: ['frontend', 'critical'] },
        { owner: 'acme', name: 'api-gateway', tags: ['backend'] },
        { owner: 'acme', name: 'unlabeled-tool' },
    ],
    scanRuns: [
        {
            repositoryOwner: 'acme',
            repositoryName: 'web-app',
            mode: 'fix-and-pr',
            severityThreshold: 'high',
            executorKind: 'container',
            status: 'completed',
            summary: { alertsFound: 4, alertsFixed: 2 },
        },
        {
            repositoryOwner: 'acme',
            repositoryName: 'api-gateway',
            mode: 'report-only',
            severityThreshold: 'medium',
            executorKind: 'container',
            status: 'completed',
            summary: { alertsFound: 2, alertsFixed: 0 },
        },
        {
            repositoryOwner: 'acme',
            repositoryName: 'unlabeled-tool',
            mode: 'report-only',
            severityThreshold: 'low',
            executorKind: 'container',
            status: 'completed',
            summary: { alertsFound: 1, alertsFixed: 0 },
        },
    ],
    scanResults: [
        // run 0 / web-app：lodash 三档 source（dependabot / code-scanning / code-quality），统一 high
        {
            scanRunIndex: 0,
            upstreamId: 'dependabot:lodash-001',
            source: 'dependabot',
            severity: 'high',
            packageName: 'lodash',
            manifestPath: 'package.json',
            ruleId: null,
            summary: 'prototype pollution',
            fixable: true,
            fixStrategy: 'upgrade',
            recommendedVersion: '4.18.0',
            fixStatus: 'success',
            occurrenceCount: 2,
            firstSeenAt: '2026-08-01T02:00:00.000Z',
            lastSeenAt: '2026-08-20T02:00:00.000Z',
        },
        {
            scanRunIndex: 0,
            upstreamId: 'code-scanning:lodash-001',
            source: 'code-scanning',
            severity: 'high',
            packageName: 'lodash',
            manifestPath: 'src/utils/sanitize.ts',
            ruleId: 'js/incomplete-sanitization',
            summary: 'incomplete sanitization',
            fixable: false,
            fixStrategy: 'manual',
            fixStatus: 'failed',
            occurrenceCount: 1,
            firstSeenAt: '2026-08-02T02:00:00.000Z',
            lastSeenAt: '2026-08-21T02:00:00.000Z',
        },
        {
            scanRunIndex: 0,
            upstreamId: 'code-quality:lodash-001',
            source: 'code-quality',
            severity: 'high',
            packageName: 'lodash',
            manifestPath: 'src/utils/lodash-helper.ts',
            ruleId: 'typescript:S1854',
            summary: 'useless assignment',
            fixable: false,
            fixStrategy: null,
            fixStatus: 'pending',
            occurrenceCount: 3,
            firstSeenAt: '2026-08-03T02:00:00.000Z',
            lastSeenAt: '2026-08-22T02:00:00.000Z',
        },
        // run 0 / web-app：node-fetch（medium，覆盖 medium 档标签与 converged 状态）
        {
            scanRunIndex: 0,
            upstreamId: 'dependabot:node-fetch-001',
            source: 'dependabot',
            severity: 'medium',
            packageName: 'node-fetch',
            manifestPath: 'package.json',
            ruleId: null,
            summary: 'SSRF',
            fixable: true,
            fixStrategy: 'lock',
            fixStatus: 'converged',
            occurrenceCount: 1,
            firstSeenAt: '2026-08-04T02:00:00.000Z',
            lastSeenAt: '2026-08-23T02:00:00.000Z',
        },
        // run 1 / api-gateway：axios 两条（critical）
        {
            scanRunIndex: 1,
            upstreamId: 'pnpm-audit:axios-001',
            source: 'pnpm-audit',
            severity: 'critical',
            packageName: 'axios',
            manifestPath: 'package.json',
            ruleId: null,
            summary: 'CVE-2026-0001',
            fixable: true,
            fixStrategy: 'upgrade',
            recommendedVersion: '1.7.5',
            fixStatus: 'pending',
            occurrenceCount: 1,
            firstSeenAt: '2026-08-05T02:00:00.000Z',
            lastSeenAt: '2026-08-24T02:00:00.000Z',
        },
        {
            scanRunIndex: 1,
            upstreamId: 'dependabot:axios-001',
            source: 'dependabot',
            severity: 'critical',
            packageName: 'axios',
            manifestPath: 'package.json',
            ruleId: null,
            summary: 'SSRF',
            fixable: true,
            fixStrategy: 'upgrade',
            recommendedVersion: '1.7.5',
            fixStatus: 'success',
            occurrenceCount: 4,
            firstSeenAt: '2026-08-06T02:00:00.000Z',
            lastSeenAt: '2026-08-25T02:00:00.000Z',
        },
        // run 2 / unlabeled-tool：minimist（low + not-tried）
        {
            scanRunIndex: 2,
            upstreamId: 'pnpm-audit:minimist-001',
            source: 'pnpm-audit',
            severity: 'low',
            packageName: 'minimist',
            manifestPath: 'package.json',
            ruleId: null,
            summary: 'prototype pollution',
            fixable: true,
            fixStrategy: 'wait-upstream',
            fixStatus: 'not-tried',
            occurrenceCount: 1,
            firstSeenAt: '2026-08-07T02:00:00.000Z',
            lastSeenAt: '2026-08-26T02:00:00.000Z',
        },
    ],
}

/**
 * 重置视觉回归数据集：先按 owner/name 级联清理（幂等），再注入。
 *
 * 清理是**逐像素可复现**的前提：`scanRuns` 每次注入都是新记录，
 * 不清理会让分组行数 / 扫描历史随运行次数漂移。
 * 复用 e2e 的 `seedCustomFixtures`（同一 fixtures 端点与重试口径），仅数据集不同。
 */
export async function resetVisualFixtures(request: APIRequestContext): Promise<void> {
    const deleteResponse = await request.delete('/api/e2e/fixtures', {
        data: { repos: VISUAL_FIXTURES.repos.map(({ owner, name }) => ({ owner, name })) },
        maxRetries: 2,
    })
    if (!deleteResponse.ok()) {
        const body = await deleteResponse.text().catch(() => '')
        throw new Error(
            `[visual fixtures] DELETE /api/e2e/fixtures failed: ${deleteResponse.status()} ${deleteResponse.statusText()}${body ? ` body=${body}` : ''}`,
        )
    }
    await seedCustomFixtures(request, VISUAL_FIXTURES)
}
