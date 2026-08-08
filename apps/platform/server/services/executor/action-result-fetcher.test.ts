import { afterEach, describe, expect, it } from 'vitest'
import nock from 'nock'
import { ActionResultFetcher } from './action-result-fetcher'

const API = 'https://api.github.com'

// 最小 zip 结构（含单个 JSON 文件）——unzip 需要真实 zip；用不含 zip 的探针测试验证前置步骤
const mockRun = (status: string, conclusion?: string) => ({
    id: 101,
    name: 'CI',
    status,
    conclusion: conclusion ?? null,
    html_url: 'https://github.com/o/r/actions/runs/101',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
})

afterEach(() => {
    nock.cleanAll()
})

describe('ActionResultFetcher', () => {
    it('polls run to completion then throws when no artifact found', async () => {
        // run 直接 completed + success
        nock(API)
            .get('/repos/o/r/actions/runs/101')
            .reply(200, mockRun('completed', 'success'))
        // artifacts 列表为空（按 run 过滤）
        nock(API)
            .get('/repos/o/r/actions/runs/101/artifacts')
            .query(true)
            .reply(200, { artifacts: [] })

        const fetcher = new ActionResultFetcher('ghp_test', { pollDelayMs: 0 })
        await expect(fetcher.fetch('o', 'r', 101)).rejects.toThrow('未找到报告 artifact')
    })

    it('returns null when run conclusion is failure', async () => {
        nock(API)
            .get('/repos/o/r/actions/runs/101')
            .reply(200, mockRun('completed', 'failure'))

        const fetcher = new ActionResultFetcher('ghp_test', { pollDelayMs: 0 })
        const result = await fetcher.fetch('o', 'r', 101)
        expect(result).toBeNull()
    })

    it('throws on timeout when run never completes', async () => {
        // pollDelayMs=0 + runTimeoutMs=1000：CI（Linux）1 秒窗口内请求数可能超过原 times(100)，
        // 放大到 1000 次避免 nock "No match" flaky（本地 Windows 事件循环较慢恰好未触发）
        nock(API)
            .get('/repos/o/r/actions/runs/101')
            .times(1000)
            .reply(200, mockRun('in_progress'))

        const fetcher = new ActionResultFetcher('ghp_test', { pollDelayMs: 0, runTimeoutMs: 1000 })
        await expect(fetcher.fetch('o', 'r', 101)).rejects.toThrow('等待 action run 101 完成超时')
    })
})
