import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
    EXEMPTIONS_REL,
    classifyCodeScanningAlert,
    classifyDependabotAlert,
    evaluateAlerts,
    exemptionKey,
    exemptionMatches,
    fetchAllPages,
    formatCollectionTime,
    formatLines,
    loadExemptions,
    main,
    mapRuleSeverity,
    normalizeSeverity,
    parseCli,
    parseNextLink,
    parseRepoSlug,
    permissionHint,
    printUsage,
    resolveRepoSlug,
    resolveToken,
    resolveTokens,
    runCheck,
    UsageError,
} from './check-release-security-alerts.mjs'

const REPO_ROOT = join(import.meta.dirname, '..')

/** 构造 fetch 响应桩（ok / status / json / headers / text）。 */
const stubResponse = ({ ok = true, status = 200, statusText = '', body = [], link = null, text } = {}) => ({
    ok,
    status,
    statusText,
    json: async () => body,
    headers: { get: (name) => (name.toLowerCase() === 'link' ? link : null) },
    ...(text === undefined ? {} : { text }),
})

const validExemptionText = JSON.stringify({
    exemptions: [
        {
            source: 'dependabot',
            id: 'GHSA-86w9-cpqp-85rv',
            severity: 'high',
            category: 'no-fix',
            target: 'node-forge <= 1.4.0',
            path: 'apps/platform > nuxt > node-forge',
            reason: '无修复版本',
            review: 'node-forge > 1.4.0',
            tracking: 'docs/plan/backlog.md',
        },
    ],
})

const dependabotAlert = (severity, id = 'GHSA-aaaa-bbbb-cccc') => ({
    number: 1,
    html_url: `https://github.com/x/y/security/dependabot/1`,
    security_advisory: { severity, ghsa_id: id },
    dependency: { package: { name: 'pkg' }, manifest_path: 'pnpm-lock.yaml' },
})

const codeScanningAlert = (severityLevel, id = 'js/sql-injection') => ({
    number: 2,
    html_url: 'https://github.com/x/y/security/code-scanning/2',
    rule: { id, name: 'SQL injection', security_severity_level: severityLevel },
    most_recent_instance: { location: { path: 'src/db.ts' } },
})

function failWith(message) {
    throw new Error(message)
}

const jsonResponse = (data, { status = 200, link = null } = {}) => ({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: { get: (name) => (name.toLowerCase() === 'link' ? link : null) },
    json: async () => data,
    text: async () => JSON.stringify(data),
})

describe('级别映射', () => {
    it('Code Scanning rule.severity 映射为同量纲级别', () => {
        expect(mapRuleSeverity('error')).toBe('high')
        expect(mapRuleSeverity('warning')).toBe('moderate')
        expect(mapRuleSeverity('note')).toBe('low')
        expect(mapRuleSeverity('none')).toBe('low')
        expect(mapRuleSeverity('unknown')).toBeNull()
    })

    it('GitHub 原值 medium 归一为 moderate；无法映射时为 unknown', () => {
        expect(normalizeSeverity('dependabot', 'critical')).toBe('critical')
        expect(normalizeSeverity('dependabot', 'medium')).toBe('moderate')
        expect(normalizeSeverity('code-scanning', 'medium')).toBe('moderate')
        expect(normalizeSeverity('code-scanning', 'error')).toBe('high')
        expect(normalizeSeverity('code-scanning', undefined)).toBe('unknown')
    })

    it('classify 保留 state（open / dismissed）', () => {
        expect(classifyDependabotAlert({ ...dependabotAlert('high'), state: 'dismissed' }).state).toBe('dismissed')
        expect(classifyCodeScanningAlert({ ...codeScanningAlert('high'), state: 'open' }).state).toBe('open')
        expect(classifyCodeScanningAlert(codeScanningAlert('high')).state).toBe('open')
    })

    it('security_severity_level 优先于 rule.severity', () => {
        const alert = { rule: { id: 'r1', severity: 'error', security_severity_level: 'critical' } }
        expect(classifyCodeScanningAlert(alert)).toMatchObject({ severity: 'critical', id: 'r1' })
        expect(classifyCodeScanningAlert({ rule: { id: 'r2', severity: 'warning' } })).toMatchObject({ severity: 'moderate' })
    })

    it('缺少 advisory / dependency 时降级为 unknown 而不是崩溃', () => {
        expect(classifyDependabotAlert({})).toMatchObject({ severity: 'unknown', id: 'unknown', target: 'unknown' })
    })
})

describe('豁免台账校验', () => {
    it('合法台账原样返回且 id 统一为字符串', () => {
        const { exemptions, errors } = loadExemptions(validExemptionText)
        expect(errors).toEqual([])
        expect(exemptions).toHaveLength(1)
        expect(exemptions[0].id).toBe('GHSA-86w9-cpqp-85rv')
    })

    it('JSON 解析失败 / 顶层结构错误时返回错误', () => {
        expect(loadExemptions('{').errors[0]).toContain('JSON 解析失败')
        expect(loadExemptions('[]').errors[0]).toContain('顶层必须为')
        expect(loadExemptions('{"exemptions":{}}').errors[0]).toContain('顶层必须为')
    })

    it('critical 不允许登记（禁用豁免）', () => {
        const text = JSON.stringify({ exemptions: [{ ...JSON.parse(validExemptionText).exemptions[0], severity: 'critical' }] })
        const { exemptions, errors } = loadExemptions(text)
        expect(exemptions).toEqual([])
        expect(errors.join('\n')).toContain('critical 禁止豁免')
    })

    it('字段缺失 / 枚举非法 / 重复条目均报错', () => {
        const base = JSON.parse(validExemptionText).exemptions[0]
        const { errors } = loadExemptions(
            JSON.stringify({
                exemptions: [
                    { ...base, source: 'snyk' },
                    { ...base, category: 'whatever' },
                    { ...base, tracking: '   ' },
                    base,
                    { ...base },
                ],
            }),
        )
        const joined = errors.join('\n')
        expect(joined).toContain('.source 必须是')
        expect(joined).toContain('.category 必须是')
        expect(joined).toContain('.tracking 必须是非空字符串')
        expect(joined).toContain('重复')
    })

    it('severity 非 high 的条目报错（moderate / low 无需登记）', () => {
        const base = JSON.parse(validExemptionText).exemptions[0]
        const { errors } = loadExemptions(JSON.stringify({ exemptions: [{ ...base, severity: 'moderate' }] }))
        expect(errors.join('\n')).toContain('severity 仅允许 high')
    })

    it('非对象条目跳过并报错', () => {
        expect(loadExemptions('{"exemptions":[null]}').errors).toContain('exemptions[0] 必须是对象')
    })

    it('Code Scanning 条目必须带实例路径 location', () => {
        const base = JSON.parse(validExemptionText).exemptions[0]
        const { errors } = loadExemptions(JSON.stringify({ exemptions: [{ ...base, source: 'code-scanning', id: 'js/sql-injection' }] }))
        expect(errors.join('\n')).toContain('.location 必须是非空字符串')
    })

    it('同一 rule 不同实例路径可分别登记（去重键含 location）', () => {
        const base = JSON.parse(validExemptionText).exemptions[0]
        const { exemptions, errors } = loadExemptions(
            JSON.stringify({
                exemptions: [
                    { ...base, source: 'code-scanning', id: 'js/sql-injection', location: 'a.ts' },
                    { ...base, source: 'code-scanning', id: 'js/sql-injection', location: 'b.ts' },
                ],
            }),
        )
        expect(errors).toEqual([])
        expect(exemptions).toHaveLength(2)
    })
})

describe('告警判定', () => {
    const exemption = JSON.parse(validExemptionText).exemptions[0]

    it('critical 即使登记了豁免也阻断（合规台账不会放过它）', () => {
        const result = evaluateAlerts({ dependabot: [dependabotAlert('critical', exemption.id)], exemptions: [] })
        expect(result.failures[0]).toMatchObject({ code: 'critical', id: exemption.id })
        expect(result.summary.critical).toBe(1)
    })

    it('high 未登记 → 阻断；已登记 → 放行并计入 exempted', () => {
        const blocked = evaluateAlerts({ dependabot: [dependabotAlert('high')], exemptions: [] })
        expect(blocked.failures[0].code).toBe('high-unexempted')

        const passed = evaluateAlerts({ dependabot: [dependabotAlert('high', exemption.id)], exemptions: [exemption] })
        expect(passed.failures).toEqual([])
        expect(passed.summary.exempted).toBe(1)
        expect(passed.warnings).toEqual([])
    })

    it('来源 / 编号不一致时不命中', () => {
        const entry = JSON.parse(validExemptionText).exemptions[0]
        expect(exemptionMatches({ source: 'code-scanning', id: entry.id, state: 'open' }, entry)).toBe(false)
        expect(exemptionMatches({ source: 'dependabot', id: 'GHSA-other', state: 'open' }, entry)).toBe(false)
    })

    it('Code Scanning high 按 rule id + 实例路径命中豁免', () => {
        const csExemption = { ...exemption, source: 'code-scanning', id: 'js/sql-injection', location: 'src/db.ts' }
        const result = evaluateAlerts({
            codeScanning: [codeScanningAlert('high', 'js/sql-injection')],
            exemptions: [csExemption],
        })
        expect(result.failures).toEqual([])
        expect(result.summary.exempted).toBe(1)

        const otherPath = evaluateAlerts({
            codeScanning: [{ ...codeScanningAlert('high', 'js/sql-injection'), most_recent_instance: { location: { path: 'src/other.ts' } } }],
            exemptions: [csExemption],
        })
        expect(otherPath.failures[0].code).toBe('high-unexempted')
    })

    it('同路径多条告警共用一条台账（文件级粒度）', () => {
        const csExemption = { ...exemption, source: 'code-scanning', id: 'js/sql-injection', location: 'src/db.ts' }
        const result = evaluateAlerts({
            codeScanning: [codeScanningAlert('high', 'js/sql-injection'), codeScanningAlert('high', 'js/sql-injection')],
            exemptions: [csExemption],
        })
        expect(result.failures).toEqual([])
        expect(result.summary.exempted).toBe(2)
        expect(result.warnings).toEqual([])
    })

    it('category 与告警状态绑定：false-positive 只放行 dismissed，no-fix 只放行 open', () => {
        const falsePositive = { ...exemption, category: 'false-positive' }
        const openWithFalsePositive = evaluateAlerts({ dependabot: [dependabotAlert('high', exemption.id)], exemptions: [falsePositive] })
        expect(openWithFalsePositive.failures[0].code).toBe('high-unexempted')

        const dismissedWithFalsePositive = evaluateAlerts({
            dependabot: [{ ...dependabotAlert('high', exemption.id), state: 'dismissed' }],
            exemptions: [falsePositive],
        })
        expect(dismissedWithFalsePositive.failures).toEqual([])

        const dismissedWithNoFix = evaluateAlerts({
            dependabot: [{ ...dependabotAlert('high', exemption.id), state: 'dismissed' }],
            exemptions: [exemption],
        })
        expect(dismissedWithNoFix.failures[0].code).toBe('high-dismissed-unregistered')
    })

    it('moderate / low / GitHub 原值 medium 均不阻断；unknown 阻断', () => {
        const result = evaluateAlerts({
            dependabot: [dependabotAlert('moderate'), dependabotAlert('low'), dependabotAlert('medium'), { number: 3 }],
            codeScanning: [codeScanningAlert('medium')],
        })
        expect(result.summary.moderate).toBe(3)
        expect(result.summary.low).toBe(1)
        expect(result.failures).toHaveLength(1)
        expect(result.failures[0].code).toBe('unknown-severity')
    })

    it('dismissed critical 阻断（不得以 dismiss 代替修复）', () => {
        const result = evaluateAlerts({ dependabot: [{ ...dependabotAlert('critical'), state: 'dismissed' }] })
        expect(result.failures[0].code).toBe('critical-dismissed')
    })

    it('dismissed high 需登记 false-positive 台账（未登记 / 错类别均阻断）', () => {
        const dismissed = { ...dependabotAlert('high', exemption.id), state: 'dismissed' }
        const falsePositive = { ...exemption, category: 'false-positive' }
        expect(evaluateAlerts({ dependabot: [dismissed] }).failures[0].code).toBe('high-dismissed-unregistered')
        expect(evaluateAlerts({ dependabot: [dismissed], exemptions: [exemption] }).failures[0].code).toBe('high-dismissed-unregistered')
        expect(evaluateAlerts({ dependabot: [dismissed], exemptions: [falsePositive] }).failures).toEqual([])
    })

    it('没有对应 open 告警的台账条目 → stale warning（不阻断）', () => {
        const result = evaluateAlerts({ dependabot: [], exemptions: [exemption] })
        expect(result.failures).toEqual([])
        expect(result.warnings[0]).toMatchObject({ code: 'stale-exemption' })
    })

    it('豁免键大小写不敏感', () => {
        expect(exemptionKey('dependabot', ' ghsa-aaaa-bbbb-cccc ')).toBe('dependabot:GHSA-AAAA-BBBB-CCCC')
    })
})

describe('输出组装', () => {
    it('PASS / FAIL 行与注解', () => {
        const passed = formatLines({ repo: 'o/r', result: { failures: [], warnings: [], summary: { critical: 0, high: 0, moderate: 0, low: 0, unknown: 0, exempted: 0 } } })
        expect(passed.at(-1)).toContain('PASS')

        const result = evaluateAlerts({ dependabot: [dependabotAlert('critical')] })
        const annotated = formatLines({ repo: 'o/r', result, annotate: true })
        expect(annotated[1]).toContain('::error::')
        expect(annotated.at(-1)).toContain('FAIL')
        expect(annotated.join('\n')).toContain('critical 告警必须修复')
    })

    it('dismissed 失败文案可区分', () => {
        const result = evaluateAlerts({
            dependabot: [{ ...dependabotAlert('critical'), state: 'dismissed' }, { ...dependabotAlert('high', 'GHSA-x'), state: 'dismissed' }],
        })
        const lines = formatLines({ repo: 'o/r', result }).join('\n')
        expect(lines).toContain('被 dismiss，不得以 dismiss 代替修复')
        expect(lines).toContain('被 dismiss 但未在豁免台账登记')
    })

    it('annotate 覆盖未登记 high 与未知级别', () => {
        const unexempted = evaluateAlerts({ dependabot: [dependabotAlert('high')] })
        expect(formatLines({ repo: 'o/r', result: unexempted, annotate: true }).join('\n')).toContain('::error::')
        const unknown = evaluateAlerts({ dependabot: [{ ...dependabotAlert('high'), security_advisory: { severity: undefined } }] })
        expect(formatLines({ repo: 'o/r', result: unknown, annotate: true }).join('\n')).toContain('无法判定告警级别')
    })

    it('stale 豁免输出 warning 注解', () => {
        const result = evaluateAlerts({ exemptions: [JSON.parse(validExemptionText).exemptions[0]] })
        const lines = formatLines({ repo: 'o/r', result, annotate: true })
        expect(lines.some((line) => line.startsWith('::warning::'))).toBe(true)
    })
})

describe('分页与 API 错误', () => {
    it('跟随 Link rel=next 拉取多页并合并', async () => {
        const pages = {
            'https://api.test/p1': jsonResponse([dependabotAlert('high', 'A')], { link: '<https://api.test/p2>; rel="next"' }),
            'https://api.test/p2': jsonResponse([dependabotAlert('low', 'B')]),
        }
        const fetchImpl = vi.fn(async (url) => pages[url])
        const items = await fetchAllPages('https://api.test/p1', { token: 't', fetchImpl })
        expect(items).toHaveLength(2)
        expect(fetchImpl).toHaveBeenCalledTimes(2)
    })

    it('非 2xx 抛错（fail-closed），响应非数组同样抛错', async () => {
        await expect(fetchAllPages('https://api.test/p1', { token: 't', fetchImpl: async () => jsonResponse({ message: 'Resource not accessible' }, { status: 403 }) })).rejects.toThrow('HTTP 403')
        await expect(fetchAllPages('https://api.test/p1', { token: 't', fetchImpl: async () => jsonResponse({}) })).rejects.toThrow('不是数组')
    })

    it('4xx 不重试；429 / 5xx 退避重试后成功', async () => {
        const forbidden = vi.fn(async () => jsonResponse({}, { status: 403 }))
        await expect(fetchAllPages('https://api.test/p1', { token: 't', fetchImpl: forbidden, sleep: async () => {} })).rejects.toThrow('HTTP 403')
        expect(forbidden).toHaveBeenCalledTimes(1)

        let calls = 0
        const flaky = vi.fn(async () => {
            calls += 1
            return calls === 1 ? jsonResponse({}, { status: 503 }) : jsonResponse([])
        })
        await expect(fetchAllPages('https://api.test/p1', { token: 't', fetchImpl: flaky, sleep: async () => {} })).resolves.toEqual([])
        expect(flaky).toHaveBeenCalledTimes(2)
    })

    it('分页超过上限时终止（拒绝静默截断）', async () => {
        const selfLink = jsonResponse([], { link: '<https://api.test/p1>; rel="next"' })
        await expect(
            fetchAllPages('https://api.test/p1', { token: 't', fetchImpl: async () => selfLink, sleep: async () => {} }),
        ).rejects.toThrow('分页超过上限')
    })

    it('网络异常重试耗尽后抛错（含 readErrorBody 兜底）', async () => {
        const sleeps = []
        const fetchImpl = vi.fn(async () => {
            throw new Error('socket hang up')
        })
        await expect(fetchAllPages('https://api.test/x', { token: 't', fetchImpl, sleep: (ms) => sleeps.push(ms) }))
            .rejects.toThrow('socket hang up')
        expect(fetchImpl).toHaveBeenCalledTimes(3)
        expect(sleeps).toEqual([200, 400])

        const textThrows = vi.fn(async () => stubResponse({
            ok: false,
            status: 500,
            statusText: 'boom',
            text: () => {
                throw new Error('no body')
            },
        }))
        await expect(fetchAllPages('https://api.test/y', { token: 't', fetchImpl: textThrows, sleep: () => {} }))
            .rejects.toThrow(/HTTP 500/)
    })

    it('默认 sleep 生效（5xx 退避后成功）', async () => {
        let calls = 0
        const fetchImpl = vi.fn(async () => {
            calls += 1
            return calls === 1 ? stubResponse({ ok: false, status: 503 }) : stubResponse({ body: [] })
        })
        await expect(fetchAllPages('https://api.test/z', { token: 't', fetchImpl })).resolves.toEqual([])
        expect(calls).toBe(2)
    })

    it('parseNextLink 只认 rel=next', () => {
        expect(parseNextLink(null)).toBeNull()
        expect(parseNextLink('<https://x/2>; rel="last"')).toBeNull()
        expect(parseNextLink('<https://x/1>; rel="prev", <https://x/3>; rel="next"')).toBe('https://x/3')
    })
})

describe('仓库与 token 解析', () => {
    it('支持 https / ssh / 裸 slug，拒绝非法值', () => {
        expect(parseRepoSlug('https://github.com/CaoMeiYouRen/dependfix.git')).toBe('CaoMeiYouRen/dependfix')
        expect(parseRepoSlug('git@github.com:CaoMeiYouRen/dependfix.git')).toBe('CaoMeiYouRen/dependfix')
        expect(parseRepoSlug('ssh://git@github.com/o/r.git')).toBe('o/r')
        expect(parseRepoSlug('o/r')).toBe('o/r')
        expect(parseRepoSlug('not a slug')).toBeNull()
        expect(parseRepoSlug('')).toBeNull()
    })

    it('优先级：--repo / GITHUB_REPOSITORY > git remote', () => {
        const execImpl = vi.fn(() => 'git@github.com:from/git.git\n')
        expect(resolveRepoSlug({ argValue: 'a/b', env: {}, execImpl })).toBe('a/b')
        expect(resolveRepoSlug({ env: { GITHUB_REPOSITORY: 'c/d' }, execImpl })).toBe('c/d')
        expect(resolveRepoSlug({ env: {}, execImpl })).toBe('from/git')
        expect(resolveRepoSlug({ env: {}, execImpl: () => failWith('no remote') })).toBeNull()
    })

    it('token 按告警源分别解析（Actions 下 Code Scanning 优先 GITHUB_TOKEN）', () => {
        expect(resolveToken({ SECURITY_ALERTS_TOKEN: 'a', GH_PAT: 'b', GH_TOKEN: 'c', GITHUB_TOKEN: 'd' })).toBe('a')
        expect(resolveToken({ GH_PAT: 'b', GITHUB_TOKEN: 'd' })).toBe('b')
        expect(resolveToken({ GH_TOKEN: 'c' })).toBe('c')
        expect(resolveToken({})).toBe('')

        const actions = resolveTokens({ GITHUB_ACTIONS: 'true', GITHUB_TOKEN: 'actions', GH_PAT: 'pat' })
        expect(actions.dependabot).toBe('pat')
        expect(actions.codeScanning).toBe('actions')

        const local = resolveTokens({ GH_PAT: 'pat' })
        expect(local.codeScanning).toBe('pat')
        expect(resolveTokens({})).toEqual({ dependabot: '', codeScanning: '' })
    })
})

describe('CLI 参数解析', () => {
    it('支持等号与空格形式、--help', () => {
        expect(parseCli(['--repo=o/r', '--exemptions=x.json'])).toEqual({ repo: 'o/r', exemptions: 'x.json', help: false })
        expect(parseCli(['--repo', 'o/r'])).toEqual({ repo: 'o/r', exemptions: null, help: false })
        expect(parseCli(['-h'])).toMatchObject({ help: true })
    })

    it('跳过 `--` 分隔符', () => {
        expect(parseCli(['--', '--repo=o/r'])).toEqual({ repo: 'o/r', exemptions: null, help: false })
    })

    it('未知参数 / 缺值 / 空值 → UsageError（退出码 2 语义）', () => {
        expect(() => parseCli(['--repo'])).toThrow(UsageError)
        expect(() => parseCli(['other/repo'])).toThrow(UsageError)
        expect(() => parseCli(['--repo='])).toThrow(UsageError)
        expect(() => parseCli(['--unknown=1'])).toThrow(UsageError)
    })
})

describe('permissionHint', () => {
    it('按 401/403 与 404 给出可操作提示，其余为空', () => {
        expect(permissionHint('HTTP 403 Forbidden')).toContain('GITHUB_TOKEN 恒 403')
        expect(permissionHint('HTTP 401 unauthorized')).toContain('security_events')
        expect(permissionHint('HTTP 404 Not Found')).toContain('未启用此告警源')
        expect(permissionHint('其它错误')).toBe('')
    })
})

describe('main / printUsage', () => {
    it('--help 打印用法并返回 0', async () => {
        const log = vi.fn()
        expect(await main({ argv: ['--help'], log, error: vi.fn() })).toBe(0)
        expect(log.mock.calls[0]?.[0]).toContain('用法：')
    })

    it('参数错误返回 2 并输出用法', async () => {
        const error = vi.fn()
        const log = vi.fn()
        expect(await main({ argv: ['--repo'], log, error })).toBe(2)
        expect(error).toHaveBeenCalledWith(expect.stringContaining('参数错误'))
        expect(log).toHaveBeenCalled()
    })

    it('通过 runCheck 注入返回其退出码并逐行输出', async () => {
        const log = vi.fn()
        const runCheckImpl = vi.fn(async () => ({ exitCode: 0, lines: ['line-a', 'line-b'] }))
        expect(await main({ argv: ['--repo=o/r'], env: {}, tokens: { dependabot: 'a', codeScanning: 'b' }, runCheckImpl, log, error: vi.fn() })).toBe(0)
        expect(runCheckImpl).toHaveBeenCalledWith(expect.objectContaining({ repo: 'o/r', exemptionsPath: EXEMPTIONS_REL }))
        expect(log.mock.calls.map(([line]) => line)).toEqual(['line-a', 'line-b'])
    })

    it('runCheck 抛错时向上抛出（由入口守卫转 exitCode 1）', async () => {
        const runCheckImpl = async () => {
            throw new Error('boom')
        }
        await expect(main({ argv: ['--repo=o/r'], env: {}, runCheckImpl, log: vi.fn(), error: vi.fn() }))
            .rejects.toThrow('boom')
    })

    it('printUsage 可注入日志通道，缺省走 console.log', () => {
        const log = vi.fn()
        printUsage(log)
        expect(log).toHaveBeenCalledTimes(1)
        expect(log.mock.calls[0]?.[0]).toContain('退出码：0 通过')

        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
        try {
            printUsage()
            expect(consoleSpy).toHaveBeenCalledTimes(1)
        } finally {
            consoleSpy.mockRestore()
        }
    })

    it('main 缺省 log / error 走 console', async () => {
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
        try {
            expect(await main({ argv: ['--help'] })).toBe(0)
            expect(consoleSpy).toHaveBeenCalled()

            expect(await main({ argv: ['--repo'] })).toBe(2)
            expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('参数错误'))
        } finally {
            consoleSpy.mockRestore()
            errorSpy.mockRestore()
        }
    })
})

describe('runCheck', () => {
    const readFile = () => validExemptionText
    const fetchImpl = async (url) => {
        if (url.includes('state=dismissed')) {
            return jsonResponse([])
        }
        return url.includes('/dependabot/') ? jsonResponse([dependabotAlert('high', 'GHSA-86w9-cpqp-85rv')]) : jsonResponse([])
    }

    it('通过场景：high 已在台账登记', async () => {
        const result = await runCheck({ repo: 'o/r', token: 't', readFile, fetchImpl, apiBase: 'https://api.test' })
        expect(result.exitCode).toBe(0)
        expect(result.lines.at(-1)).toContain('PASS')
    })

    it('阻断场景：高等级未豁免', async () => {
        const result = await runCheck({
            repo: 'o/r',
            token: 't',
            readFile,
            apiBase: 'https://api.test',
            fetchImpl: async (url) => {
                if (url.includes('state=dismissed')) {
                    return jsonResponse([])
                }
                return url.includes('/dependabot/') ? jsonResponse([dependabotAlert('critical')]) : jsonResponse([])
            },
        })
        expect(result.exitCode).toBe(1)
        expect(result.lines.at(-1)).toContain('FAIL')
    })

    it('缺少 token / 仓库 / 台账不可读 / API 403 均 fail-closed', async () => {
        expect((await runCheck({ repo: 'o/r', token: '', readFile, fetchImpl })).exitCode).toBe(1)
        expect((await runCheck({ repo: null, token: 't', readFile, fetchImpl })).exitCode).toBe(2)
        expect((await runCheck({ repo: 'o/r', token: 't', readFile: () => failWith('ENOENT'), fetchImpl })).exitCode).toBe(1)

        const forbidden = await runCheck({
            repo: 'o/r',
            token: 't',
            readFile,
            apiBase: 'https://api.test',
            fetchImpl: async () => jsonResponse({ message: 'Resource not accessible by integration' }, { status: 403 }),
        })
        expect(forbidden.exitCode).toBe(1)
        expect(forbidden.lines.join('\n')).toContain('security_events')
    })

    it('按来源使用不同 token（Dependabot 用 GH_PAT，Code Scanning 用 GITHUB_TOKEN）', async () => {
        const seen = []
        const fetchImpl = async (url, options) => {
            seen.push([url, options.headers.authorization])
            return jsonResponse([])
        }
        await runCheck({
            repo: 'o/r',
            dependabotToken: 'dep-token',
            codeScanningToken: 'cs-token',
            readFile,
            apiBase: 'https://api.test',
            fetchImpl,
        })
        const bySource = Object.fromEntries(seen.map(([url, auth]) => [url.includes('/dependabot/') ? 'dependabot' : 'code-scanning', auth]))
        expect(bySource.dependabot).toBe('Bearer dep-token')
        expect(bySource['code-scanning']).toBe('Bearer cs-token')
    })

    it('台账不合法时不下发请求', async () => {
        const fetchSpy = vi.fn()
        const result = await runCheck({ repo: 'o/r', token: 't', readFile: () => '{"exemptions":[{"severity":"critical"}]}', fetchImpl: fetchSpy })
        expect(result.exitCode).toBe(1)
        expect(fetchSpy).not.toHaveBeenCalled()
    })
})

describe('采集时点', () => {
    const readFile = () => validExemptionText
    const FIXED = () => new Date('2026-11-26T10:00:00Z')
    const TIME_LINE_RE = /^\[release-security\] 采集时点 \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
    const okFetch = async () => jsonResponse([])

    it('格式固定为单行 UTC ISO，且可注入时钟', () => {
        expect(formatCollectionTime(FIXED())).toBe('[release-security] 采集时点 2026-11-26T10:00:00.000Z')
        expect(formatCollectionTime()).toMatch(TIME_LINE_RE)
    })

    it('PASS / FAIL / token 缺失 / 仓库未定 / 台账不可读 / 台账非法 / 拉取异常的首行均为采集时点', async () => {
        const pass = await runCheck({ repo: 'o/r', token: 't', readFile, fetchImpl: okFetch, apiBase: 'https://api.test', now: FIXED })
        expect(pass.exitCode).toBe(0)
        expect(pass.lines[0]).toBe('[release-security] 采集时点 2026-11-26T10:00:00.000Z')

        const failed = await runCheck({
            repo: 'o/r',
            token: 't',
            readFile,
            apiBase: 'https://api.test',
            now: FIXED,
            fetchImpl: async (url) => {
                if (url.includes('state=dismissed')) {
                    return jsonResponse([])
                }
                return url.includes('/dependabot/') ? jsonResponse([dependabotAlert('critical')]) : jsonResponse([])
            },
        })
        expect(failed.exitCode).toBe(1)
        expect(failed.lines[0]).toBe('[release-security] 采集时点 2026-11-26T10:00:00.000Z')

        const cases = [
            await runCheck({ repo: 'o/r', token: '', readFile, fetchImpl: okFetch, now: FIXED }),
            await runCheck({ repo: null, token: 't', readFile, fetchImpl: okFetch, now: FIXED }),
            await runCheck({ repo: 'o/r', token: 't', readFile: () => failWith('ENOENT'), fetchImpl: okFetch, now: FIXED }),
            await runCheck({ repo: 'o/r', token: 't', readFile: () => '{"exemptions":[{"severity":"critical"}]}', fetchImpl: okFetch, now: FIXED }),
            await runCheck({
                repo: 'o/r',
                token: 't',
                readFile,
                apiBase: 'https://api.test',
                now: FIXED,
                fetchImpl: async () => jsonResponse({ message: 'boom' }, { status: 403 }),
            }),
        ]
        for (const result of cases) {
            expect(result.lines[0]).toBe('[release-security] 采集时点 2026-11-26T10:00:00.000Z')
        }
    })

    it('参数错误路径也在首行输出采集时点（stderr）', async () => {
        const error = vi.fn()
        const log = vi.fn()
        expect(await main({ argv: ['--repo'], error, log })).toBe(2)
        expect(error.mock.calls[0][0]).toMatch(TIME_LINE_RE)
        expect(error.mock.calls[1][0]).toContain('参数错误')
    })
})

describe('仓库内实际台账', () => {
    it('可解析且不含 critical 条目（事实源自洽）', () => {
        const { exemptions, errors } = loadExemptions(readFileSync(join(REPO_ROOT, EXEMPTIONS_REL), 'utf8'))
        expect(errors).toEqual([])
        expect(exemptions.every((entry) => entry.severity === 'high')).toBe(true)
    })
})
