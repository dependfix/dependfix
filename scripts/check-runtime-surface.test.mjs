import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it, vi } from 'vitest'
import {
    applyExemptions,
    collectSurfaceFromImage,
    compareApkVersion,
    compareNodeVersion,
    evaluateApkRisks,
    evaluateNodeRisk,
    latestSecurityRelease,
    main,
    normalizeNodeVersion,
    parseApkVersion,
    parseArgs,
    parseSurfaceOutput,
    renderSummary,
    resolveAlpineBranch,
    splitApkEntry,
    validateBaseline,
} from './check-runtime-surface.mjs'

const created = []

function makeDir() {
    const dir = mkdtempSync(join(tmpdir(), 'dependfix-surface-'))
    created.push(dir)
    return dir
}

function writeJson(file, value) {
    mkdirSync(join(file, '..'), { recursive: true })
    writeFileSync(file, JSON.stringify(value), 'utf-8')
    return file
}

const NODE_INDEX = [
    { version: 'v26.13.1', security: true },
    { version: 'v26.13.0', security: false },
    { version: 'v26.12.1', security: true },
    { version: 'v24.22.3', security: true },
]

const SECDB_MAIN = {
    packages: [
        { pkg: { name: 'zlib', secfixes: { '1.3.2-r1': ['CVE-2026-85091'], '1.4-r0': ['CVE-2026-4738'] } } },
        { pkg: { name: 'musl', secfixes: { '1.2.5-r10': ['CVE-2026-1'] } } },
        { pkg: { name: 'no-secfixes' } },
    ],
}

const SURFACE_OK = ['node=v26.13.1', 'alpine=3.24.4', 'zlib-1.4-r0', 'musl-1.2.5-r10', 'git-2.51.0-r0'].join('\n')
const SURFACE_VULNERABLE = ['node=v26.13.0', 'alpine=3.24.4', 'zlib-1.3.2-r1', 'musl-1.2.5-r10'].join('\n')

afterAll(() => {
    for (const dir of created) {
        rmSync(dir, { recursive: true, force: true })
    }
})

describe('check-runtime-surface', () => {
    it('解析 apk 包行：包名可含连字符与数字开头，版本含日期型与 -rN', () => {
        expect(splitApkEntry('alpine-baselayout-data-3.7.2-r1')).toEqual({
            name: 'alpine-baselayout-data',
            version: '3.7.2-r1',
        })
        expect(splitApkEntry('zlib-1.4-r0')).toEqual({ name: 'zlib', version: '1.4-r0' })
        expect(splitApkEntry('7zip-26.01-r0')).toEqual({ name: '7zip', version: '26.01-r0' })
        // 真实日期型版本（secdb 中 quickjs 的形态）不得被切成 `quickjs-2021-03` + `27-r5`
        expect(splitApkEntry('quickjs-2021-03-27-r5')).toEqual({ name: 'quickjs', version: '2021-03-27-r5' })
        expect(splitApkEntry('cacti-1.2.31-0')).toEqual({ name: 'cacti', version: '1.2.31-0' })
        expect(splitApkEntry('WARNING: fetching https://example.invalid')).toBeNull()
        expect(splitApkEntry('')).toBeNull()
    })

    it('apk 版本比较覆盖数字段 / 日期型 / 字母版次 / 下划线后缀 / 修订号', () => {
        expect(compareApkVersion('1.3.2-r1', '1.4-r0')).toBeLessThan(0)
        expect(compareApkVersion('1.4-r0', '1.4-r0')).toBe(0)
        expect(compareApkVersion('1.4-r1', '1.4-r0')).toBeGreaterThan(0)
        expect(compareApkVersion('1.2.3_rc1', '1.2.3')).toBeLessThan(0)
        expect(compareApkVersion('1.2.3_p1', '1.2.3')).toBeGreaterThan(0)
        expect(compareApkVersion('1.2.3a', '1.2.3')).toBeGreaterThan(0)
        expect(compareApkVersion('1.2.3b', '1.2.3a')).toBeGreaterThan(0)
        expect(compareApkVersion('2021-03-27-r5', '2021-04-01-r0')).toBeLessThan(0)
        expect(parseApkVersion('2.0_rc1-r0')).toMatchObject({ segments: [2, 0], suffixRank: 3, revision: 0 })
        // secdb 真实存在的非常规版本串：比较必须抛错（由调用方按 unknown 处理），不得静默返回相等
        expect(() => compareApkVersion('6.6.2p1-r0', '6.6.2-r0')).toThrow('无法解析 apk 版本')
        expect(() => parseApkVersion('1.2.3_zz9')).toThrow('未知的 apk 版本后缀')
    })

    it('解析采集输出：node / alpine 行必填，无法解析的包行单列', () => {
        const parsed = parseSurfaceOutput(SURFACE_OK)
        expect(parsed.nodeVersion).toBe('v26.13.1')
        expect(parsed.alpineRelease).toBe('3.24.4')
        expect(parsed.packages).toEqual({ zlib: '1.4-r0', musl: '1.2.5-r10', git: '2.51.0-r0' })
        expect(parsed.unparsed).toEqual([])

        const withNoise = parseSurfaceOutput('node=v26.13.1\nalpine=3.24.4\nWARNING: x\nbroken-line')
        expect(withNoise.unparsed).toEqual(['broken-line'])
        expect(() => parseSurfaceOutput('alpine=3.24.4')).toThrow('缺 node= / alpine=')
    })

    it('Alpine 版本映射到 secdb 分支', () => {
        expect(resolveAlpineBranch('3.24.4')).toBe('v3.24')
        expect(resolveAlpineBranch(' 3.23.2 ')).toBe('v3.23')
        expect(() => resolveAlpineBranch('edge')).toThrow('无法解析 Alpine 版本')
    })

    it('Node 版本归一化与比较：预发布后缀按数字三元组处理', () => {
        expect(normalizeNodeVersion('v26.13.0-rc.1')).toEqual([26, 13, 0])
        expect(normalizeNodeVersion('26.13.1')).toEqual([26, 13, 1])
        expect(normalizeNodeVersion('v26')).toBeNull()
        expect(compareNodeVersion('26.13.0-rc.1', '26.13.1')).toBeLessThan(0)
        expect(() => compareNodeVersion('nonsense', '26.13.1')).toThrow('无法解析 Node 版本')
    })

    it('Node 面：落后同线最新 security 发布即命中，等值或更高不命中，无法解析不静默通过', () => {
        expect(latestSecurityRelease(NODE_INDEX, 26)).toBe('26.13.1')
        expect(latestSecurityRelease(NODE_INDEX, 25)).toBeNull()

        expect(evaluateNodeRisk('v26.13.0', NODE_INDEX)).toMatchObject({ id: 'node:v26.13.0', severity: 'high' })
        expect(evaluateNodeRisk('v26.13.1', NODE_INDEX)).toBeNull()
        expect(evaluateNodeRisk('v26.14.0', NODE_INDEX)).toBeNull()
        // 预发布版本低于同线安全发布：必须命中（审计实证的静默 PASS 通道）
        expect(evaluateNodeRisk('v26.13.0-rc.1', NODE_INDEX)).toMatchObject({ severity: 'high' })
        // 无法解析的版本串：unknown，不得当作「不落后」
        expect(evaluateNodeRisk('v26.x', NODE_INDEX)).toMatchObject({ severity: 'unknown' })
        // 不在索引里的线无法确认补丁状态：按 high 报，而不是静默通过
        expect(evaluateNodeRisk('v20.1.0', NODE_INDEX)).toMatchObject({ severity: 'high' })
        // 索引里没有该线的 security 记录：unknown（不臆造结论）
        expect(evaluateNodeRisk('v26.13.1', [{ version: 'v26.13.1', security: false }])).toMatchObject({
            severity: 'unknown',
        })
    })

    it('apk 面：落后 secdb 修复版本即命中，并汇总相关 CVE', () => {
        const findings = evaluateApkRisks({ zlib: '1.3.2-r1', musl: '1.2.5-r10', other: '1.0' }, {
            zlib: { '1.3.2-r1': ['CVE-2026-85091'], '1.4-r0': ['CVE-2026-4738'] },
            musl: { '1.2.5-r10': ['CVE-2026-1'] },
        })
        expect(findings).toHaveLength(1)
        expect(findings[0]).toMatchObject({
            id: 'apk:zlib',
            severity: 'unknown',
            installed: '1.3.2-r1',
            fixed: '1.4-r0',
            cves: ['CVE-2026-4738'],
        })
    })

    it('apk 面：版本无法比较时产出 unknown finding（不得静默放过）', () => {
        const findings = evaluateApkRisks({ opensmtpd: '6.6.2-r0' }, {
            opensmtpd: { '6.6.2p1-r0': ['CVE-2026-X'] },
        })
        expect(findings).toHaveLength(1)
        expect(findings[0]).toMatchObject({ id: 'apk:opensmtpd', severity: 'unknown' })
        expect(findings[0].message).toContain('无法比较')
    })

    it('豁免清单：reason / expires 必填且格式校验，fixed 可锁定修复版本', () => {
        expect(() => validateBaseline({ exempt: [{ id: 'apk:zlib' }] })).toThrow('缺 reason')
        expect(() => validateBaseline({ exempt: [{ id: 'apk:zlib', reason: 'x' }] })).toThrow('expires')
        expect(() => validateBaseline({ exempt: [{ id: 'apk:zlib', reason: 'x', expires: '2026/01/01' }] })).toThrow(
            'YYYY-MM-DD',
        )
        expect(() => validateBaseline({ exempt: 'nope' })).toThrow('必须是数组')

        const findings = [
            { id: 'apk:zlib', fixed: '1.4-r0' },
            { id: 'node:v26.13.0' },
        ]
        const baseline = {
            exempt: [
                { id: 'apk:zlib', fixed: '1.4-r0', reason: '误报', expires: '2026-12-01' },
                { id: 'node:v26.13.0', reason: '待抬基座', expires: '2026-11-01' },
            ],
        }
        const result = applyExemptions(findings, baseline, '2026-11-26')
        expect(result.active).toEqual([{ id: 'node:v26.13.0' }])
        expect(result.exempted).toHaveLength(1)

        // fixed 不匹配时不得被同一包名豁免吃掉（新修复版本必须重新出现）
        const newer = applyExemptions([{ id: 'apk:zlib', fixed: '1.5-r0' }], baseline, '2026-11-26')
        expect(newer.active).toEqual([{ id: 'apk:zlib', fixed: '1.5-r0' }])
    })

    it('摘要包含镜像 / Node / Alpine / apk 清单 / 数据源 / 结论', () => {
        const markdown = renderSummary({
            image: 'example:test',
            nodeVersion: 'v26.13.1',
            alpineRelease: '3.24.4',
            branch: 'v3.24',
            packageCount: 2,
            packages: [
                ['zlib', '1.3.2-r1'],
                ['musl', '1.2.5-r10'],
            ],
            verdict: 'FAIL（命中 findings）',
            findings: [
                {
                    id: 'apk:zlib',
                    severity: 'unknown',
                    source: 'secdb.alpinelinux.org',
                    message: 'zlib 1.3.2-r1 低于 1.4-r0',
                },
            ],
            exempted: [],
        })
        expect(markdown).toContain('| 镜像 | `example:test` |')
        expect(markdown).toContain('| 结论 | FAIL（命中 findings） |')
        expect(markdown).toContain('| `apk:zlib` | unknown | secdb.alpinelinux.org |')
        expect(markdown).toContain('<details><summary>apk 清单（2）</summary>')
        expect(markdown).toContain('| zlib | 1.3.2-r1 |')
    })

    it('参数解析支持镜像 / fixture / 摘要 / 日期，含空格分隔形态', () => {
        expect(parseArgs(['--image=example:test', '--today=2026-11-26'])).toMatchObject({
            image: 'example:test',
            today: '2026-11-26',
            secdbDir: null,
        })
        expect(parseArgs(['--image', 'example:test2', '--summary', 'out.md'])).toMatchObject({
            image: 'example:test2',
            summary: 'out.md',
        })
    })

    it('main：干净基线 exit 0，命中 findings exit 1，数据源异常 / 空清单 exit 2', async () => {
        const dir = makeDir()
        const nodeIndex = writeJson(join(dir, 'node-index.json'), NODE_INDEX)
        const secdbDir = join(dir, 'secdb')
        writeJson(join(secdbDir, 'v3.24', 'main.json'), SECDB_MAIN)
        const baseline = writeJson(join(dir, 'baseline.json'), { exempt: [] })
        const summary = join(dir, 'summary.md')
        const log = { log: vi.fn(), error: vi.fn() }
        const baseArgs = [
            `--image=fixture:ok`,
            `--node-index=${nodeIndex}`,
            `--secdb-dir=${secdbDir}`,
            `--baseline=${baseline}`,
            `--summary=${summary}`,
            '--today=2026-11-26',
        ]

        const cleanCollect = () => SURFACE_OK
        await expect(main([...baseArgs], { log, collect: cleanCollect })).resolves.toBe(0)
        expect(readFileSync(summary, 'utf-8')).toContain('| 结论 | PASS |')
        expect(readFileSync(summary, 'utf-8')).toContain('apk 清单（3）')

        await expect(main(baseArgs, { log, collect: () => SURFACE_VULNERABLE })).resolves.toBe(1)
        expect(readFileSync(summary, 'utf-8')).toContain('`apk:zlib`')
        expect(readFileSync(summary, 'utf-8')).toContain('1.3.2-r1 低于 secdb 修复版本 1.4-r0')

        // 空 apk 清单：不得 PASS
        await expect(
            main(baseArgs, { log, collect: () => 'node=v26.13.1\nalpine=3.24.4\n' }),
        ).resolves.toBe(2)

        // 无法解析的包行：不得 PASS
        await expect(
            main(baseArgs, { log, collect: () => 'node=v26.13.1\nalpine=3.24.4\nbroken-line' }),
        ).resolves.toBe(2)

        const brokenCollect = () => 'node=v26.13.1\nalpine=edge\n'
        await expect(main(baseArgs, { log, collect: brokenCollect })).resolves.toBe(2)
        expect(log.error).toHaveBeenCalledWith(expect.stringContaining('UNKNOWN'))

        const badIndex = writeJson(join(dir, 'bad-index.json'), { not: 'array' })
        const badIndexArgs = baseArgs.map((item) => (item.startsWith('--node-index=') ? `--node-index=${badIndex}` : item))
        await expect(main(badIndexArgs, { log, collect: () => SURFACE_OK })).resolves.toBe(2)

        // 豁免清单非法（缺 expires）：fail-closed，不得静默放行
        const badBaseline = writeJson(join(dir, 'bad-baseline.json'), { exempt: [{ id: 'apk:zlib', reason: 'x' }] })
        const badBaselineArgs = baseArgs.map((item) =>
            item.startsWith('--baseline=') ? `--baseline=${badBaseline}` : item,
        )
        await expect(main(badBaselineArgs, { log, collect: () => SURFACE_VULNERABLE })).resolves.toBe(2)
    })

    it('采集失败（docker 异常）按 unknown 处理，不得 PASS', async () => {
        const dir = makeDir()
        const log = { log: vi.fn(), error: vi.fn() }
        const collect = () => {
            throw new Error('docker: command not found')
        }
        await expect(main([`--summary=${join(dir, 's.md')}`], { log, collect })).resolves.toBe(2)
        expect(log.error).toHaveBeenCalledWith(expect.stringContaining('docker: command not found'))
    })

    it('collectSurfaceFromImage 以单次 docker run 采集（注入 exec 断言 argv）', () => {
        const exec = vi.fn(() => 'node=v26.13.1\nalpine=3.24.4\nzlib-1.4-r0')
        const output = collectSurfaceFromImage('example:test', { exec })
        expect(output).toContain('node=v26.13.1')
        const [command, args, options] = exec.mock.calls[0]
        expect(command).toBe('docker')
        expect(args.slice(0, 5)).toEqual(['run', '--rm', '--entrypoint', 'sh', 'example:test'])
        expect(args[5]).toBe('-c')
        expect(args[6]).toContain('apk info -v')
        expect(options).toMatchObject({ encoding: 'utf-8' })
    })
})
