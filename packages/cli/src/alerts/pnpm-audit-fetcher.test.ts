import { describe, expect, it, vi, beforeEach } from 'vitest'
import { normalizeAuditSeverity } from '@dependfix/core'
import {
    fetchPnpmAuditAlerts,
    hashAdvisoryId,
    parseAuditReport,
} from './pnpm-audit-fetcher'

// ---------------------------------------------------------------------------
// Mock child_process（fetchPnpmAuditAlerts 依赖 spawn 执行 pnpm audit）
// ---------------------------------------------------------------------------

const spawnMock = vi.hoisted(() => vi.fn())

vi.mock('node:child_process', () => ({
    spawn: spawnMock,
}))

function emitSpawn(stdout: string, stderr = '', code = 0): void {
    spawnMock.mockReturnValue({
        stdout: {
            on: vi.fn((event: string, cb: (chunk: Buffer) => void) => {
                if (event === 'data') {
                    cb(Buffer.from(stdout))
                }
            }),
        },
        stderr: {
            on: vi.fn((event: string, cb: (chunk: Buffer) => void) => {
                if (event === 'data') {
                    cb(Buffer.from(stderr))
                }
            }),
        },
        on: vi.fn((event: string, cb: (code: number | Error) => void) => {
            if (event === 'error') {
                /* noop */
            }
            if (event === 'close') {
                cb(code)
            }
        }),
    })
}

// ---------------------------------------------------------------------------
// Fixtures（legacy 与 modern 两种 pnpm audit JSON 格式）
// ---------------------------------------------------------------------------

const MODERN_AUDIT_JSON = {
    vulnerabilities: {
        'fast-uri': {
            name: 'fast-uri',
            severity: 'high',
            isDirect: false,
            via: [
                {
                    source: 1098902,
                    name: 'fast-uri',
                    dependency: 'fast-uri',
                    title: 'Insufficient Precision in Number Parsing',
                    url: 'https://github.com/advisories/GHSA-f8p3-7c7w-h6x4',
                    severity: 'high',
                    cwe: ['CWE-1333'],
                    cvss: { score: 7.5, vectorString: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H' },
                    range: '<=3.1.4',
                },
            ],
            effects: [],
            nodes: ['fast-uri', 'fast-uri>foo'],
            fixAvailable: { name: 'fast-uri', version: '3.1.5', isSemVerMajor: false },
        },
        lodash: {
            name: 'lodash',
            severity: 'high',
            isDirect: false,
            via: [
                {
                    source: 1082048,
                    name: 'lodash',
                    dependency: 'lodash',
                    title: 'Prototype Pollution in lodash',
                    url: 'https://github.com/advisories/GHSA-jf85-cpcp-j695',
                    severity: 'high',
                },
            ],
            effects: [],
            nodes: ['lodash'],
            fixAvailable: false,
        },
    },
    metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 2, critical: 0 }, dependencies: 42, devDependencies: 0, optionalDependencies: 0, peerDependencies: 0 },
}

const LEGACY_AUDIT_JSON = {
    actions: [
        {
            action: 'update',
            module: 'js-yaml',
            target: '3.14.1',
            resolves: [{ id: 786, path: '>js-yaml', dev: false, optional: false, bundled: false }],
        },
    ],
    advisories: {
        '786': {
            findings: [{ version: '3.13.1', paths: ['>js-yaml'] }],
            id: 786,
            module_name: 'js-yaml',
            patched_versions: '>=3.14.1',
            severity: 'high',
            title: 'Code Injection via load() in js-yaml',
            url: 'https://npmjs.com/advisories/786',
        },
    },
    metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 1, critical: 0 }, dependencies: 10 },
}

// ---------------------------------------------------------------------------
// parseAuditReport
// ---------------------------------------------------------------------------

describe('parseAuditReport', () => {
    it('parses modern format (vulnerabilities/via) with fixAvailable object', () => {
        const risks = parseAuditReport(MODERN_AUDIT_JSON)
        const fastUri = risks.find((r) => r.packageName === 'fast-uri')
        expect(fastUri).toBeDefined()
        // pnpm audit via 项无 github_advisory_id/cves，advisoryId 取 url（与参考实现 resolveAdvisoryId 一致）
        expect(fastUri?.advisoryId).toBe('https://github.com/advisories/GHSA-f8p3-7c7w-h6x4')
        expect(fastUri?.severity).toBe('high')
        expect(fastUri?.patchedVersion).toBe('3.1.5')
        expect(fastUri?.htmlUrl).toContain('GHSA-f8p3-7c7w-h6x4')

        const lodash = risks.find((r) => r.packageName === 'lodash')
        expect(lodash?.patchedVersion).toBeNull()
        expect(lodash?.advisoryId).toBe('https://github.com/advisories/GHSA-jf85-cpcp-j695')
    })

    it('parses legacy format (advisories/actions) with action target', () => {
        const risks = parseAuditReport(LEGACY_AUDIT_JSON)
        expect(risks).toHaveLength(1)
        const jsYaml = risks[0]
        expect(jsYaml.packageName).toBe('js-yaml')
        // legacy advisory 有 url 字段 → advisoryId 取 url（高于原始 id）
        expect(jsYaml.advisoryId).toBe('https://npmjs.com/advisories/786')
        expect(jsYaml.patchedVersion).toBe('3.14.1')
        expect(jsYaml.severity).toBe('high')
        expect(jsYaml.title).toBe('Code Injection via load() in js-yaml')
    })

    it('deduplicates by packageName:advisoryId:severity (idempotent)', () => {
        const first = parseAuditReport(MODERN_AUDIT_JSON)
        const second = parseAuditReport(MODERN_AUDIT_JSON)
        expect(first).toEqual(second)
        expect(first.map((r) => r.packageName)).toEqual(['fast-uri', 'lodash'])
    })

    it('handles empty / invalid input', () => {
        expect(parseAuditReport(null)).toEqual([])
        expect(parseAuditReport({})).toEqual([])
        expect(parseAuditReport('not-an-object')).toEqual([])
    })
})

// ---------------------------------------------------------------------------
// normalizeAuditSeverity（口径对齐 security-alert-remediator）
// ---------------------------------------------------------------------------

describe('normalizeAuditSeverity', () => {
    it('maps npm advisory severity vocabulary to AlertSeverity', () => {
        expect(normalizeAuditSeverity('critical')).toBe('critical')
        expect(normalizeAuditSeverity('high')).toBe('high')
        expect(normalizeAuditSeverity('error')).toBe('high')
        expect(normalizeAuditSeverity('moderate')).toBe('medium')
        expect(normalizeAuditSeverity('medium')).toBe('medium')
        expect(normalizeAuditSeverity('warning')).toBe('medium')
        expect(normalizeAuditSeverity('low')).toBe('low')
        expect(normalizeAuditSeverity('info')).toBe('low')
        expect(normalizeAuditSeverity('note')).toBe('low')
    })

    it('maps unknown / empty values to unknown (no throw)', () => {
        expect(normalizeAuditSeverity('weird-level')).toBe('unknown')
        expect(normalizeAuditSeverity('')).toBe('unknown')
        expect(normalizeAuditSeverity(null)).toBe('unknown')
        expect(normalizeAuditSeverity(undefined)).toBe('unknown')
    })

    it('is case-insensitive', () => {
        expect(normalizeAuditSeverity('HIGH')).toBe('high')
        expect(normalizeAuditSeverity('  Moderate ')).toBe('medium')
    })
})

// ---------------------------------------------------------------------------
// hashAdvisoryId
// ---------------------------------------------------------------------------

describe('hashAdvisoryId', () => {
    it('is stable for the same package/advisory pair', () => {
        expect(hashAdvisoryId('fast-uri', 'GHSA-f8p3-7c7w-h6x4')).toBe(hashAdvisoryId('fast-uri', 'GHSA-f8p3-7c7w-h6x4'))
    })

    it('differs across packages or advisories', () => {
        expect(hashAdvisoryId('fast-uri', 'GHSA-a')).not.toBe(hashAdvisoryId('fast-uri', 'GHSA-b'))
        expect(hashAdvisoryId('lodash', 'GHSA-a')).not.toBe(hashAdvisoryId('fast-uri', 'GHSA-a'))
    })

    it('produces a non-negative 32-bit integer', () => {
        const id = hashAdvisoryId('foo', 'CVE-2026-0001')
        expect(Number.isInteger(id)).toBe(true)
        expect(id).toBeGreaterThanOrEqual(0)
        expect(id).toBeLessThanOrEqual(0xFFFFFFFF)
    })
})

// ---------------------------------------------------------------------------
// fetchPnpmAuditAlerts（spawn 路径）
// ---------------------------------------------------------------------------

describe('fetchPnpmAuditAlerts', () => {
    beforeEach(() => {
        spawnMock.mockReset()
    })

    it('returns normalized alerts with source pnpm-audit and injected repository', async () => {
        emitSpawn(JSON.stringify(MODERN_AUDIT_JSON))
        const alerts = await fetchPnpmAuditAlerts({ workDir: '/repo', repository: 'owner/repo' })

        expect(alerts).toHaveLength(2)
        expect(alerts[0].source).toBe('pnpm-audit')
        expect(alerts[0].repository).toBe('owner/repo')
        expect(alerts[0].packageName).toBe('fast-uri')
        expect(alerts[0].ruleId).toBe('https://github.com/advisories/GHSA-f8p3-7c7w-h6x4')
        expect(alerts[0].severity).toBe('high')
        expect(alerts[0].fixable).toBe(true)
        expect(alerts[0].fixStrategy).toBe('upgrade')
        expect(alerts[0].recommendedVersion).toBe('3.1.5')
        expect(alerts[0].packageEcosystem).toBe('npm')
        expect(alerts[0].dependencyType).toBeUndefined()

        const lodash = alerts.find((a) => a.packageName === 'lodash')
        expect(lodash?.fixable).toBe(false)
        expect(lodash?.fixStrategy).toBeNull()
        expect(lodash?.recommendedVersion).toBe('')
    })

    it('maps fixAvailable string form (legacy modern variant)', async () => {
        const report = {
            vulnerabilities: {
                'js-yaml': {
                    name: 'js-yaml',
                    severity: 'high',
                    via: [{ title: 't', severity: 'high', url: 'https://example.com/a' }],
                    nodes: ['js-yaml'],
                    fixAvailable: '>=3.14.1',
                },
            },
        }
        emitSpawn(JSON.stringify(report))
        const alerts = await fetchPnpmAuditAlerts({ workDir: '/repo', repository: 'local' })
        expect(alerts[0].recommendedVersion).toBe('>=3.14.1')
    })

    it('parses alerts even when pnpm audit exits nonzero (vulnerabilities found = exit 1 is normal)', async () => {
        // 发现漏洞时 pnpm audit 返回 exit 1 但 JSON 输出有效——必须成功解析
        emitSpawn(JSON.stringify(MODERN_AUDIT_JSON), '', 1)
        const alerts = await fetchPnpmAuditAlerts({ workDir: '/repo', repository: 'local' })
        expect(alerts).toHaveLength(2)
    })

    it('rejects with AppError AUDIT_FAILED on empty output (no lockfile)', async () => {
        emitSpawn('', 'ERR_PNPM_NO_LOCKFILE', 1)
        await expect(fetchPnpmAuditAlerts({ workDir: '/repo', repository: 'local' }))
            .rejects.toThrow(/pnpm audit produced no JSON output/)
    })

    it('rejects with AppError AUDIT_FAILED on spawn error (pnpm not found)', async () => {
        spawnMock.mockReturnValue({
            stdout: { on: vi.fn() },
            stderr: { on: vi.fn() },
            on: vi.fn((event: string, cb: (code: number | Error) => void) => {
                if (event === 'error') {
                    cb(new Error('spawn pnpm ENOENT'))
                }
            }),
        })
        await expect(fetchPnpmAuditAlerts({ workDir: '/repo', repository: 'local' }))
            .rejects.toThrow(/Failed to run pnpm audit/)
    })

    it('rejects with AppError AUDIT_FAILED on invalid JSON', async () => {
        emitSpawn('not-json', '', 0)
        await expect(fetchPnpmAuditAlerts({ workDir: '/repo', repository: 'local' }))
            .rejects.toThrow(/Failed to parse pnpm audit JSON/)
    })
})
