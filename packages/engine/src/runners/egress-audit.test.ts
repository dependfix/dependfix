// egress-audit.test.ts — 运行级外联审计（安装链 / 验证链共用的代理与记录）。
import { request } from 'node:http'
import { describe, expect, it, afterEach, vi } from 'vitest'
import {
    addEgressEntries,
    getEgressProxyEnv,
    getEgressProxyUrl,
    getRunEgressSnapshot,
    hasActiveEgressAudit,
    resetRunEgressAuditStateForTest,
    startRunEgressAudit,
    stopRunEgressAudit,
} from './egress-audit'
import { runTrackedCommand } from './process-control'
import { runVerification } from './verification-runner'

/** 经代理请求一个非白名单目标，返回状态码。 */
function requestViaProxy(proxyUrl: string, target: string): Promise<number> {
    return new Promise((resolve, reject) => {
        const req = request({
            host: '127.0.0.1',
            port: Number(new URL(proxyUrl).port),
            path: target,
            method: 'GET',
            headers: { host: new URL(target).host },
        }, (res) => {
            res.resume()
            resolve(res.statusCode ?? 0)
        })
        req.on('error', reject)
        req.end()
    })
}

afterEach(async () => {
    vi.unstubAllEnvs()
    await stopRunEgressAudit()
    resetRunEgressAuditStateForTest()
})

describe('startRunEgressAudit', () => {
    it('injects proxy env and records deny-by-default violations', async () => {
        vi.stubEnv('HTTP_PROXY', '')
        vi.stubEnv('HTTPS_PROXY', '')
        vi.stubEnv('ALL_PROXY', '')
        await startRunEgressAudit()

        expect(hasActiveEgressAudit()).toBe(true)
        const proxyUrl = getEgressProxyUrl()
        expect(proxyUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)
        expect(getEgressProxyEnv()).toMatchObject({ HTTPS_PROXY: proxyUrl, NO_PROXY: expect.stringContaining('127.0.0.1') })

        const status = await requestViaProxy(proxyUrl!, 'http://blocked.invalid/path')
        expect(status).toBe(502)

        const snapshot = getRunEgressSnapshot()
        expect(snapshot?.violations.some((entry) => entry.target.includes('blocked.invalid'))).toBe(true)
    })

    it('does not override an existing user proxy but still collects command-output entries', async () => {
        vi.stubEnv('HTTPS_PROXY', 'http://user-proxy:3128')
        await startRunEgressAudit()

        expect(getEgressProxyUrl()).toBeUndefined()
        expect(getEgressProxyEnv()).toBeUndefined()
        addEgressEntries([{
            time: new Date().toISOString(),
            source: 'command-output',
            method: 'GET',
            target: 'https://example.com/x',
        }])
        expect(getRunEgressSnapshot()?.entries).toHaveLength(1)
    })

    it('is disabled by DEPENDFIX_NETWORK_AUDIT=false', async () => {
        vi.stubEnv('DEPENDFIX_NETWORK_AUDIT', 'false')
        await startRunEgressAudit()
        expect(hasActiveEgressAudit()).toBe(false)
        expect(await stopRunEgressAudit()).toBeUndefined()
    })
})

describe('process-control proxy injection', () => {
    it('passes the audit proxy env to managed commands', async () => {
        vi.stubEnv('HTTP_PROXY', '')
        vi.stubEnv('HTTPS_PROXY', '')
        vi.stubEnv('ALL_PROXY', '')
        await startRunEgressAudit()
        const proxyUrl = getEgressProxyUrl()

        const outcome = await runTrackedCommand({
            binary: process.execPath,
            args: ['-e', 'console.log(process.env.HTTPS_PROXY ?? "")'],
            cwd: process.cwd(),
            timeoutMs: 10_000,
        })

        expect(outcome.stdout.trim()).toBe(proxyUrl)
    })
})

describe('verification chain reuse', () => {
    it('reuses the run-level proxy and does not stop it', async () => {
        vi.stubEnv('HTTP_PROXY', '')
        vi.stubEnv('HTTPS_PROXY', '')
        vi.stubEnv('ALL_PROXY', '')
        await startRunEgressAudit()

        const result = await runVerification({
            workDir: process.cwd(),
            commands: [`${process.execPath} -e "console.log('ok')"`],
            stopOnFailure: true,
        })

        expect(result.success).toBe(true)
        // 运行级审计仍在活动：验证链不得把共用代理关掉
        expect(hasActiveEgressAudit()).toBe(true)
        const snapshot = await stopRunEgressAudit()
        expect(snapshot).toBeDefined()
    })
})
