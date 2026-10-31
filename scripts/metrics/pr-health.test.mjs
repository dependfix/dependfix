import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
    classifyCi,
    CliUsageError,
    fetchCheckRuns,
    computePrHealth,
    fetchSnapshot,
    isBotActor,
    isFalseClose,
    hasHumanIntervention,
    loadSnapshot,
    main,
    normalizePull,
    parseCli,
    parseNextLink,
    requestJson,
} from './pr-health.mjs'

const FIXTURE = path.join(import.meta.dirname, '__fixtures__', 'pr-health.sample.json')
const NOW = new Date('2026-10-31T00:00:00.000Z')

const tempDirs = []

const makeTempDir = () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'pr-health-'))
    tempDirs.push(dir)
    return dir
}

afterEach(() => {
    while (tempDirs.length > 0) {
        rmSync(tempDirs.pop(), { recursive: true, force: true })
    }
    vi.unstubAllEnvs()
})

const readFixture = () => JSON.parse(readFileSync(FIXTURE, 'utf8'))

const jsonResponse = (data, { status = 200, headers = {} } = {}) => ({
    ok: status >= 200 && status < 300,
    status,
    statusText: `status ${status}`,
    headers: { get: (name) => headers[name.toLowerCase()] ?? null },
    json: async () => data,
})

describe('computePrHealth（固定夹具）', () => {
    it('三指标按写死口径给出确定值', () => {
        const report = computePrHealth(readFixture(), { now: NOW })

        expect(report.schemaVersion).toBe(1)
        expect(report.repo).toBe('dependfix/dependfix')
        expect(report.window).toMatchObject({
            days: 30,
            limit: 30,
            since: '2026-10-01T00:00:00.000Z',
            until: '2026-10-31T00:00:00.000Z',
            prCount: 7,
            available: 7,
            truncated: false,
        })

        // 绿：101 / 103 / 104 / 105 / 107；红：102；未完成：106
        expect(report.metrics.ciGreen).toMatchObject({ numerator: 5, denominator: 7, rate: 0.7143 })
        expect(report.metrics.ciGreen.breakdown).toEqual({ green: 5, red: 1, pending: 1, neutral: 0, none: 0 })

        // 人工介入：102（人工 commit）/ 106（人工 review）
        expect(report.metrics.humanIntervention).toMatchObject({ numerator: 2, denominator: 7, rate: 0.2857, humanAuthored: 0 })

        // 误关：103（重开）/ 104（同分支新 PR 再落地）
        expect(report.metrics.falseClose).toMatchObject({
            numerator: 2,
            denominator: 7,
            rate: 0.2857,
            closedUnmerged: 2,
            closureRate: 1,
            reopened: 1,
            relanded: 1,
        })
        expect(report.pulls.map((pull) => pull.number)).toEqual([101, 102, 103, 104, 105, 106, 107])
        expect(report.pulls.find((pull) => pull.number === 104)).toMatchObject({ falseClose: true, ci: 'green' })
    })

    it('limit 截断后分母同步收缩并置 truncated', () => {
        const report = computePrHealth(readFixture(), { now: NOW, limit: 3 })

        expect(report.window).toMatchObject({ prCount: 3, available: 7, truncated: true })
        expect(report.pulls.map((pull) => pull.number)).toEqual([101, 102, 103])
        expect(report.metrics.ciGreen).toMatchObject({ numerator: 2, denominator: 3 })
    })

    it('窗口按 days 过滤（超出窗口的 PR 不计入分子分母）', () => {
        const report = computePrHealth(readFixture(), { now: NOW, windowDays: 5 })

        expect(report.window.prCount).toBe(5)
        expect(report.pulls.map((pull) => pull.number)).toEqual([101, 102, 103, 104, 105])
    })

    it('快照缺 pulls 时抛错而不是返回空读数', () => {
        expect(() => computePrHealth({}, { now: NOW })).toThrow(/缺少 pulls 数组/)
        expect(() => computePrHealth({ pulls: [] }, { now: NOW })).not.toThrow()
        expect(computePrHealth({ pulls: [] }, { now: NOW }).metrics.ciGreen.rate).toBeNull()
    })

    it('--now 非法时按参数错误处理', () => {
        expect(() => computePrHealth(readFixture(), { now: 'not-a-date' })).toThrow(CliUsageError)
    })
})

describe('classifyCi', () => {
    it('区分绿 / 红 / 未完成 / 中性 / 无 check', () => {
        expect(classifyCi([])).toBe('none')
        expect(classifyCi([{ conclusion: 'success' }, { conclusion: 'neutral' }])).toBe('green')
        expect(classifyCi([{ conclusion: 'success' }, { conclusion: 'pending' }])).toBe('pending')
        expect(classifyCi([{ conclusion: 'neutral' }, { conclusion: 'skipped' }])).toBe('neutral')
        expect(classifyCi([{ conclusion: 'failure' }])).toBe('red')
        expect(classifyCi([{ conclusion: 'startup_failure' }])).toBe('red')
        // 未知结论按未完成处理：不得静默当作绿
        expect(classifyCi([{ conclusion: 'some-new-conclusion' }])).toBe('pending')
        expect(classifyCi([{ conclusion: null }])).toBe('pending')
    })
})

describe('actor 与误关判定', () => {
    it('机器人识别覆盖 type / [bot] 后缀 / 名单', () => {
        expect(isBotActor({ login: 'dependfix[bot]' })).toBe(true)
        expect(isBotActor({ login: 'renovate', type: 'User' })).toBe(true)
        expect(isBotActor({ login: 'someone', type: 'Bot' })).toBe(true)
        expect(isBotActor({ login: 'CaoMeiYouRen', type: 'User' })).toBe(false)
        expect(isBotActor(null)).toBe(false)
    })

    it('人工介入只看 actor 类型，不看 PR 创建者', () => {
        const botCommit = { author: { login: 'dependfix[bot]', type: 'Bot' } }
        const humanCommit = { author: { login: 'caomei', type: 'User' } }
        expect(hasHumanIntervention({ commits: [botCommit], reviews: [] })).toBe(false)
        expect(hasHumanIntervention({ commits: [botCommit], reviews: [{ author: { login: 'caomei', type: 'User' } }] })).toBe(true)
        expect(hasHumanIntervention({ commits: [humanCommit], reviews: [] })).toBe(true)
    })

    it('误关只统计关闭未合并，并由重开或后续再落地认定', () => {
        const base = { number: 1, state: 'closed', merged: false, headRef: 'fix/x', closedAt: '2026-10-02T00:00:00.000Z' }
        expect(isFalseClose({ ...base, merged: true }, [])).toBe(false)
        expect(isFalseClose({ ...base, state: 'open' }, [])).toBe(false)
        expect(isFalseClose({ ...base, reopened: true }, [])).toBe(true)
        expect(isFalseClose(base, [
            { number: 2, merged: true, headRef: 'fix/x', mergedAt: '2026-10-03T00:00:00.000Z' },
        ])).toBe(true)
        // 同名分支的合入早于关闭 → 不是「关闭后再落地」
        expect(isFalseClose(base, [
            { number: 2, merged: true, headRef: 'fix/x', mergedAt: '2026-10-01T00:00:00.000Z' },
        ])).toBe(false)
        expect(isFalseClose(base, [
            { number: 2, merged: true, headRef: 'fix/y', mergedAt: '2026-10-03T00:00:00.000Z' },
        ])).toBe(false)
        // 重开后的两种真实形态：仍 open / 随后合入，都属于「当初关错了」
        expect(isFalseClose({ ...base, state: 'open', reopened: true }, [])).toBe(true)
        expect(isFalseClose({ ...base, merged: true, reopened: true }, [])).toBe(true)
        // 缺关闭时间时不拿「任意同名分支的更早合入」凑数
        expect(isFalseClose({ ...base, closedAt: null, createdAt: '2026-10-02T00:00:00.000Z' }, [
            { number: 2, merged: true, headRef: 'fix/x', mergedAt: '2026-01-01T00:00:00.000Z' },
        ])).toBe(false)
        // 同名分支合入其它 base → 不是同一次修复再落地
        expect(isFalseClose({ ...base, baseRef: 'master' }, [
            { number: 2, merged: true, headRef: 'fix/x', baseRef: 'release/1', mergedAt: '2026-10-03T00:00:00.000Z' },
        ])).toBe(false)
    })

    it('closureRate 不会超过 100%（分子是「曾关闭未合并」的子集）', () => {
        const pull = (number, extra) => ({
            number,
            state: 'closed',
            merged: false,
            createdAt: '2026-10-20T00:00:00.000Z',
            closedAt: '2026-10-21T00:00:00.000Z',
            commits: [{ author: { login: 'dependfix[bot]', type: 'Bot' } }],
            reviews: [],
            checks: [{ name: 'Test', conclusion: 'success' }],
            ...extra,
        })
        const report = computePrHealth({
            pulls: [
                pull(1, { merged: true, mergedAt: '2026-10-22T00:00:00.000Z', reopened: true }),
                pull(2, { merged: true, mergedAt: '2026-10-22T00:00:00.000Z', reopened: true }),
                pull(3, {}),
            ],
        }, { now: NOW })

        expect(report.metrics.falseClose.numerator).toBe(2)
        expect(report.metrics.falseClose.closedUnmerged).toBe(3)
        expect(report.metrics.falseClose.closureRate).toBe(0.6667)
        expect(report.metrics.falseClose.closureRate).toBeLessThanOrEqual(1)
    })

    it('重开但当前仍 open 的 PR 计入误关与「关闭未合并」', () => {
        const report = computePrHealth({
            repo: 'dependfix/dependfix',
            pulls: [{
                number: 7,
                state: 'open',
                merged: false,
                reopened: true,
                createdAt: '2026-10-20T00:00:00.000Z',
                commits: [{ author: { login: 'dependfix[bot]', type: 'Bot' } }],
                reviews: [],
                checks: [{ name: 'Test', conclusion: 'success' }],
            }],
        }, { now: NOW })

        expect(report.metrics.falseClose).toMatchObject({ numerator: 1, denominator: 1, reopened: 1, relanded: 0, closedUnmerged: 1, closureRate: 1 })
    })
})

describe('parseCli / loadSnapshot', () => {
    it('默认值：api 源 / 30 天 / 30 个', () => {
        expect(parseCli(['--repo=dependfix/dependfix'])).toMatchObject({
            repo: 'dependfix/dependfix',
            days: 30,
            limit: 30,
            source: 'api',
            json: false,
        })
    })

    it('拒绝未知参数 / 非法值 / 非正整数', () => {
        expect(() => parseCli(['--nope=1'])).toThrow(/Unsupported argument/)
        expect(() => parseCli(['--source=git'])).toThrow(/Unsupported value/)
        expect(() => parseCli(['--days=0'])).toThrow(CliUsageError)
        expect(() => parseCli(['--limit=1.5'])).toThrow(CliUsageError)
    })

    it('file 源缺 input / 非法 JSON / 缺 pulls 都是参数错误', () => {
        expect(() => loadSnapshot(null)).toThrow(/需要 --input/)
        const dir = makeTempDir()
        const broken = path.join(dir, 'broken.json')
        writeFileSync(broken, '{not json')
        expect(() => loadSnapshot(broken)).toThrow(/无法读取快照/)
        const noPulls = path.join(dir, 'no-pulls.json')
        writeFileSync(noPulls, JSON.stringify({ repo: 'a/b' }))
        expect(() => loadSnapshot(noPulls)).toThrow(/缺少 pulls 数组/)
    })

    it('快照条目缺关键字段时 fail-closed（不静默读成 0 读数 / 假误关）', () => {
        const dir = makeTempDir()
        const write = (name, pulls) => {
            const file = path.join(dir, name)
            writeFileSync(file, JSON.stringify({ pulls }))
            return file
        }

        // 报告 JSON 降维行回灌：没有 createdAt → 直接报错（否则分母静默变 0）
        expect(() => loadSnapshot(write('report.json', [{ number: 1, state: 'closed', merged: true, ci: 'green' }])))
            .toThrow(/createdAt 缺失或非法/)

        // 已关闭但既无 merged 布尔也无 mergedAt → 报错（否则「已合入」被读成「关闭未合并」）
        expect(() => loadSnapshot(write('no-merged.json', [{ number: 2, state: 'closed', createdAt: '2026-10-20T00:00:00.000Z' }])))
            .toThrow(/缺 merged 布尔/)

        // 缺 number
        expect(() => loadSnapshot(write('no-number.json', [{ state: 'open', createdAt: '2026-10-20T00:00:00.000Z' }])))
            .toThrow(/缺 number/)

        // 缺 state（否则关闭未合并会被归一成 open，误关率静默归零）
        expect(() => loadSnapshot(write('no-state.json', [{ number: 4, merged: false, createdAt: '2026-10-20T00:00:00.000Z' }])))
            .toThrow(/state 必须为 open \/ closed/)

        // 只给 mergedAt 也能推断已合入
        const inferred = loadSnapshot(write('merged-at.json', [{
            number: 3,
            state: 'closed',
            createdAt: '2026-10-20T00:00:00.000Z',
            mergedAt: '2026-10-21T00:00:00.000Z',
        }]))
        expect(inferred.pulls[0].merged).toBe(true)
    })

    it('对自身归一化输出幂等（夹具读两遍全等）', () => {
        const first = loadSnapshot(FIXTURE)
        const second = loadSnapshot(FIXTURE)
        expect(second).toEqual(first)
        expect(computePrHealth(first, { now: NOW })).toEqual(computePrHealth(second, { now: NOW }))
    })
})

describe('main（取数两条路径）', () => {
    it('file 源：输出 JSON 与 Markdown，退出码 0', async () => {
        const logs = []
        const code = await main(
            ['--source=file', `--input=${FIXTURE}`, '--now=2026-10-31T00:00:00.000Z', '--json'],
            { log: (line) => logs.push(line), error: () => {}, now: NOW },
        )

        expect(code).toBe(0)
        const report = JSON.parse(logs.join('\n'))
        expect(report.metrics.ciGreen.numerator).toBe(5)
        expect(report.metrics.falseClose.numerator).toBe(2)
    })

    it('file 源 + --out-dir 写出 md / json 两份', async () => {
        const dir = makeTempDir()
        const logs = []
        const code = await main(
            ['--source=file', `--input=${FIXTURE}`, `--out-dir=${dir}`, '--now=2026-10-31T00:00:00.000Z'],
            { log: (line) => logs.push(line), error: () => {}, now: NOW },
        )

        expect(code).toBe(0)
        const markdown = readFileSync(path.join(dir, 'pr-health-20261031.md'), 'utf8')
        expect(markdown).toContain('| CI 绿率 | 5 | 7 | 71.4% |')
        expect(markdown).toContain('| 人工介入率 | 2 | 7 | 28.6% |')
        expect(markdown).toContain('| 误关率 | 2 | 7 | 28.6% |')
        expect(markdown).toContain('| #104 | closed | green | no | yes |')
        const report = JSON.parse(readFileSync(path.join(dir, 'pr-health-20261031.json'), 'utf8'))
        expect(report.pulls).toHaveLength(7)
    })

    it('api 源缺 token：明确失败（退出码 1），不返回 0 值读数', async () => {
        const errors = []
        const code = await main(['--repo=dependfix/dependfix'], {
            env: {},
            log: () => {},
            error: (line) => errors.push(line),
            fetchImpl: () => {
                throw new Error('不应发起请求')
            },
            now: NOW,
        })

        expect(code).toBe(1)
        expect(errors.join('\n')).toContain('缺少 GitHub token')
    })

    it('窗口内 0 个 PR 默认失败（退出码 1），--allow-empty 显式放行', async () => {
        const dir = makeTempDir()
        const empty = path.join(dir, 'empty.json')
        writeFileSync(empty, JSON.stringify({ pulls: [] }))

        const errors = []
        expect(await main(['--source=file', `--input=${empty}`, '--now=2026-10-31T00:00:00.000Z'], {
            log: () => {}, error: (line) => errors.push(line), now: NOW,
        })).toBe(1)
        expect(errors.join('\n')).toContain('窗口内没有 PR')

        const logs = []
        expect(await main(['--source=file', `--input=${empty}`, '--now=2026-10-31T00:00:00.000Z', '--allow-empty'], {
            log: (line) => logs.push(line), error: () => {}, now: NOW,
        })).toBe(0)
        expect(logs.join('\n')).toContain('分母：计入分母的 PR 数 = 0')
    })

    it('--out-dir 落盘的快照可原样回灌（离线复算成立）', async () => {
        const dir = makeTempDir()
        const code = await main(
            ['--source=file', `--input=${FIXTURE}`, `--out-dir=${dir}`, '--now=2026-10-31T00:00:00.000Z'],
            { log: () => {}, error: () => {}, now: NOW },
        )
        expect(code).toBe(0)

        const snapshotPath = path.join(dir, 'pr-health-20261031.snapshot.json')
        const replayed = []
        expect(await main(['--source=file', `--input=${snapshotPath}`, '--now=2026-10-31T00:00:00.000Z', '--json'], {
            log: (line) => replayed.push(line), error: () => {}, now: NOW,
        })).toBe(0)
        const report = JSON.parse(replayed.join('\n'))
        expect(report.metrics).toMatchObject({
            ciGreen: { numerator: 5, denominator: 7 },
            humanIntervention: { numerator: 2, denominator: 7 },
            falseClose: { numerator: 2, denominator: 7 },
        })
    })

    it('--limit 超上界按参数错误处理（退出码 2）', async () => {
        expect(await main(['--repo=a/b', '--limit=1001'], { log: () => {}, error: () => {} })).toBe(2)
    })

    it('参数错误退出码 2', async () => {
        const errors = []
        expect(await main(['--nope'], { log: () => {}, error: (line) => errors.push(line) })).toBe(2)
        expect(errors.join('\n')).toContain('Unsupported argument')
    })
})

describe('GitHub API 取数', () => {
    it('翻页解析 Link 头', () => {
        expect(parseNextLink('<https://api.github.com/x?page=2>; rel="next", <https://api.github.com/x?page=5>; rel="last"'))
            .toBe('https://api.github.com/x?page=2')
        expect(parseNextLink(null)).toBeNull()
        expect(parseNextLink('<https://api.github.com/x?page=1>; rel="prev"')).toBeNull()
    })

    it('5xx 重试后成功；401 直接把状态码抛出', async () => {
        let attempts = 0
        const data = await requestJson('https://api.github.com/x', {
            token: 't',
            sleep: async () => {},
            fetchImpl: async () => {
                attempts += 1
                return attempts === 1 ? jsonResponse({}, { status: 500 }) : jsonResponse([{ id: 1 }])
            },
        })
        expect(attempts).toBe(2)
        expect(data.data).toEqual([{ id: 1 }])

        await expect(requestJson('https://api.github.com/x', {
            token: 't',
            sleep: async () => {},
            fetchImpl: async () => jsonResponse({ message: 'Bad credentials' }, { status: 401 }),
        })).rejects.toThrow(/401.*token 无效/s)
    })

    it('按窗口与 limit 采集，并归一化 commits / reviews / checks / events', async () => {
        const requested = []
        const fetchImpl = async (url) => {
            requested.push(url)
            if (url.includes('/pulls?')) {
                return jsonResponse([
                    { number: 2, state: 'closed', created_at: '2026-10-30T00:00:00.000Z', closed_at: '2026-10-30T01:00:00.000Z', merged_at: '2026-10-30T01:00:00.000Z', head: { sha: 'sha2', ref: 'fix/b' }, base: { ref: 'master' }, user: { login: 'dependfix[bot]', type: 'Bot' } },
                    { number: 1, state: 'closed', created_at: '2026-08-01T00:00:00.000Z', closed_at: null, merged_at: null, head: { sha: 'sha1', ref: 'fix/a' }, base: { ref: 'master' }, user: { login: 'dependfix[bot]', type: 'Bot' } },
                ])
            }
            if (url.includes('/commits?')) {
                return jsonResponse([{ sha: 'c1', commit: { author: { date: '2026-10-30T00:05:00.000Z' } }, author: { login: 'dependfix[bot]', type: 'Bot' } }])
            }
            if (url.includes('/reviews?')) {
                return jsonResponse([{ state: 'COMMENTED', submitted_at: '2026-10-30T00:30:00.000Z', user: { login: 'caomei', type: 'User' } }])
            }
            if (url.includes('/check-runs?')) {
                return jsonResponse({ total_count: 1, check_runs: [{ name: 'Test', conclusion: 'success' }] })
            }
            if (url.includes('/events?')) {
                return jsonResponse([{ event: 'reopened' }])
            }
            throw new Error(`未预期的请求：${url}`)
        }

        const snapshot = await fetchSnapshot({
            repo: 'dependfix/dependfix',
            token: 't',
            now: NOW,
            fetchImpl,
            sleep: async () => {},
        })

        expect(snapshot.pulls).toHaveLength(1)
        expect(snapshot.pulls[0]).toMatchObject({
            number: 2,
            merged: true,
            headRef: 'fix/b',
            reopened: true,
        })
        expect(snapshot.pulls[0].commits[0]).toMatchObject({ sha: 'c1', author: { login: 'dependfix[bot]', type: 'Bot' } })
        expect(snapshot.pulls[0].reviews[0].state).toBe('COMMENTED')
        expect(snapshot.pulls[0].checks).toEqual([{ name: 'Test', conclusion: 'success' }])
        // 超出窗口的 PR 不应触发逐 PR 请求
        expect(requested.some((url) => url.includes('/pulls/1/'))).toBe(false)

        const report = computePrHealth(snapshot, { now: NOW, windowDays: 30, limit: 30 })
        expect(report.window.prCount).toBe(1)
        expect(report.metrics.ciGreen.rate).toBe(1)
        expect(report.metrics.humanIntervention.rate).toBe(1)
    })

    it('check-runs 端点形状异常（非 check_runs 对象）时直接失败', async () => {
        await expect(fetchCheckRuns('https://api.github.com/repos/a/b/commits/sha/check-runs', {
            token: 't',
            sleep: async () => {},
            fetchImpl: async () => jsonResponse([{ name: 'Test' }]),
        })).rejects.toThrow(/check-runs 响应形状异常/)
    })

    it('normalizePull 缺字段时给出空占位而不是 undefined 崩溃', () => {
        const pull = normalizePull({ pull: { number: 9, state: 'open' } })
        expect(pull).toMatchObject({ number: 9, merged: false, headRef: null, author: null, commits: [], reviews: [], checks: [] })
    })
})
