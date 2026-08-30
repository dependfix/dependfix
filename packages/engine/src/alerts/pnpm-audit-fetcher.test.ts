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

    it('strips range prefix from patched_versions (legacy without actions)', () => {
        // pnpm 11 的 advisories 输出常不带 actions（actionMap 为空）→ patched_versions 为 range 字符串；
        // 不剥离前缀会让 compareSemver 退化为 [0,0,0]，当前版本被误判已达标而假跳过（T801 实证回归）
        const risks = parseAuditReport({
            advisories: {
                '123': {
                    id: 123,
                    module_name: 'minimist',
                    patched_versions: '>=0.2.4',
                    severity: 'critical',
                    title: 'Prototype Pollution in minimist',
                    url: 'https://github.com/advisories/GHSA-xvch-5gv4-984h',
                },
            },
        })
        expect(risks).toHaveLength(1)
        expect(risks[0].patchedVersion).toBe('0.2.4')
    })

    it('strips range prefix with upper bound (patched_versions ">=1.2.3 <2")', () => {
        const risks = parseAuditReport({
            advisories: {
                '456': {
                    id: 456,
                    module_name: 'foo',
                    patched_versions: '>=1.2.3 <2',
                    severity: 'high',
                    title: 't',
                    url: 'https://npmjs.com/advisories/456',
                },
            },
        })
        expect(risks[0].patchedVersion).toBe('1.2.3')
    })

    it('extracts pre-release versions (patched_versions ">=1.2.3-beta.1" / ">=2.0.0-rc.1+build.5")', () => {
        // semver pre-release / build metadata 是合法形态：剥离前缀后保留 pre-release 段
        // （build metadata 非 [0-9a-z.] 字符集，止步于 "+"，与原行为一致）
        const risks = parseAuditReport({
            advisories: {
                '777': {
                    id: 777,
                    module_name: 'prerelease-pkg',
                    patched_versions: '>=1.2.3-beta.1',
                    severity: 'high',
                    title: 't',
                    url: 'https://npmjs.com/advisories/777',
                },
            },
        })
        expect(risks[0].patchedVersion).toBe('1.2.3-beta.1')
        const rcRisks = parseAuditReport({
            advisories: {
                '778': {
                    id: 778,
                    module_name: 'prerelease-pkg',
                    patched_versions: '>=2.0.0-rc.1+build.5',
                    severity: 'high',
                    title: 't',
                    url: 'https://npmjs.com/advisories/778',
                },
            },
        })
        expect(rcRisks[0].patchedVersion).toBe('2.0.0-rc.1')
    })

    it('completes quickly on long digit strings (ReDoS regression)', () => {
        // CodeQL js/polynomial-redos 告警 22：原 /(\d+\.\d+(?:\.\d+)?(?:-[0-9a-z.]+)?)/i 对
        // "000...0." 呈二次方回溯（10 万字符实测 ~8.5s）；改 ^ 锚定 + 有界量词后线性（~0.2ms）。
        // 回归保护：长数字串输入须在宽松阈值内完成，且失败形态行为不变（回退原值）。
        const longDigits = `${'0'.repeat(100_000)}.`
        const start = Date.now()
        const risks = parseAuditReport({
            advisories: {
                '999': {
                    id: 999,
                    module_name: 'redos-regression',
                    patched_versions: longDigits,
                    severity: 'high',
                    title: 't',
                    url: 'https://npmjs.com/advisories/999',
                },
            },
        })
        const elapsed = Date.now() - start
        // 无版本匹配 → normalizePatchedVersionValue 回退原值（与修复前行为一致）
        expect(risks[0].patchedVersion).toBe(longDigits)
        expect(elapsed).toBeLessThan(1000)
    })

    it('treats legacy sentinel patched_versions as unfixable (no regression on sentinel interception)', () => {
        // 哨兵值（<0.0.0 / manual review required 等）必须先于 range 剥离拦截——否则会被剥离为裸版本误判可修
        // （patchedVersion 为 null 时上层 mapAuditRiskToAlert 派生 fixable=false）
        for (const sentinel of ['<0.0.0', 'manual review required', 'none', 'unavailable']) {
            const risks = parseAuditReport({
                advisories: {
                    '789': {
                        id: 789,
                        module_name: 'bar',
                        patched_versions: sentinel,
                        severity: 'critical',
                        title: 't',
                        url: 'https://npmjs.com/advisories/789',
                    },
                },
            })
            expect(risks[0].patchedVersion).toBeNull()
        }
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
        expect(alerts[0].upstreamId).toMatch(/^pnpm-audit:fast-uri:[a-f0-9]{16}$/)
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
        // fixAvailable string 形态同样剥离 range 前缀（compareSemver 无法解析 ">=x.y.z"，T801 实证）
        expect(alerts[0].recommendedVersion).toBe('3.14.1')
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

    // 修复断言：spawn 命令必须显式指定官方 registry，防止用户 .npmrc /
    // npm_config_registry 配置的镜像站（如 npmmirror）导致 audit metadata 漏报。
    // 对齐 changelog-fetcher.ts 默认口径（registryBaseUrl ?? 'https://registry.npmjs.org'）。
    // 追溯见 backlog.md「pnpm audit 拉取应显式指定官方 registry」登记。
    it('spawns pnpm audit with explicit --registry=https://registry.npmjs.org/', async () => {
        emitSpawn(JSON.stringify(MODERN_AUDIT_JSON))
        await fetchPnpmAuditAlerts({ workDir: '/repo', repository: 'owner/repo' })

        expect(spawnMock).toHaveBeenCalledTimes(1)
        const [command] = spawnMock.mock.calls[0]
        // spawn('pnpm audit --json --registry=https://registry.npmjs.org/', { shell: true, ... })
        expect(command).toContain('--registry=https://registry.npmjs.org/')
        expect(command).toContain('--json')
        // 防止未来误改回不带 registry 的形式
        expect(command).not.toMatch(/^pnpm audit --json$/)
    })
})
