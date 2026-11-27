import { describe, expect, it, vi } from 'vitest'
import {
    compareTag,
    ensureTagSets,
    inspectWithBuildx,
    isTransientError,
    main,
    parseArgs,
    signatureFromIndex,
    tagNames,
} from './verify-cross-registry-digests.mjs'

const index = (entries) => JSON.stringify({ manifests: entries })
const linux = (arch, digest) => ({ platform: { os: 'linux', architecture: arch }, digest })

const SAME = index([linux('amd64', 'sha256:aaa'), linux('arm64', 'sha256:bbb')])

describe('verify-cross-registry-digests', () => {
    it('提取 tag 名：去重、排序、忽略空行', () => {
        expect(tagNames('caomeiyouren/dependfix:latest\nghcr.io/dependfix/dependfix:latest\nregistry/x:sha-abc\n')).toEqual([
            'latest',
            'sha-abc',
        ])
        expect(tagNames('')).toEqual([])
        expect(tagNames('a/b:2026-11-27 a/b:2026-11-27')).toEqual(['2026-11-27'])
    })

    it('index 签名只认 linux 平台并排序', () => {
        expect(signatureFromIndex(SAME)).toBe('amd64=sha256:aaa arm64=sha256:bbb ')
        // 非 linux（attestation）条目被忽略
        expect(signatureFromIndex(index([linux('arm64', 'sha256:bbb'), { platform: { os: 'unknown', architecture: 'unknown' }, digest: 'sha256:x' }]))).toBe(
            'arm64=sha256:bbb ',
        )
        expect(() => signatureFromIndex(index([]))).toThrow('没有 linux 平台')
        expect(() => signatureFromIndex('not-json')).toThrow()
    })

    it('tag 集合必须三向相等且非空', () => {
        expect(ensureTagSets('platform', [['latest', 'sha-a'], ['latest', 'sha-a'], ['latest', 'sha-a']])).toEqual([
            'latest',
            'sha-a',
        ])
        expect(() => ensureTagSets('platform', [[], ['latest'], ['latest']])).toThrow('空 tag 列表')
        expect(() => ensureTagSets('sandbox', [['latest'], ['latest', 'extra'], ['latest']])).toThrow('集合不一致')
    })

    it('compareTag：一致通过；不一致在重试后失败并点名 registry', async () => {
        const inspectSame = () => SAME
        await expect(
            compareTag({ label: 'platform', tag: 'latest', repos: ['a/x', 'b/x', 'c/x'], inspect: inspectSame, sleep: async () => {} }),
        ).resolves.toMatchObject({
            label: 'platform',
            tag: 'latest',
            signatures: ['amd64=sha256:aaa arm64=sha256:bbb ', 'amd64=sha256:aaa arm64=sha256:bbb ', 'amd64=sha256:aaa arm64=sha256:bbb '],
        })

        let calls = 0
        const inspectDrift = (ref) => {
            calls += 1
            return ref.startsWith('b/')
                ? index([linux('amd64', 'sha256:other'), linux('arm64', 'sha256:bbb')])
                : SAME
        }
        const sleep = vi.fn(async () => {})
        await expect(
            compareTag({ label: 'platform', tag: 'latest', repos: ['a/x', 'b/x', 'c/x'], inspect: inspectDrift, sleep }),
        ).rejects.toThrow('跨 registry digest 不一致')
        expect(sleep).toHaveBeenCalledTimes(1)
        expect(calls).toBe(6) // 2 次尝试 × 3 registry
    })

    it('compareTag：单次读取的网络抖动按 3 次退避重试，不误判为 digest 不一致', async () => {
        let remainingFailures = 2
        const inspectFlaky = (ref) => {
            if (ref.startsWith('c/') && remainingFailures > 0) {
                remainingFailures -= 1
                throw new Error('read: connection reset by peer')
            }
            return SAME
        }
        const sleep = vi.fn(async () => {})
        await expect(
            compareTag({
                label: 'platform',
                tag: 'latest',
                repos: ['a/x', 'b/x', 'c/x'],
                inspect: inspectFlaky,
                sleep,
                log: { warn: () => {} },
            }),
        ).resolves.toMatchObject({
            signatures: [
                'amd64=sha256:aaa arm64=sha256:bbb ',
                'amd64=sha256:aaa arm64=sha256:bbb ',
                'amd64=sha256:aaa arm64=sha256:bbb ',
            ],
        })
        expect(sleep).toHaveBeenCalledTimes(2) // 2 次抖动 × 退避
        expect(sleep).toHaveBeenNthCalledWith(1, 3_000)
        expect(sleep).toHaveBeenNthCalledWith(2, 6_000)
        expect(remainingFailures).toBe(0)
    })

    it('compareTag：读取持续失败时 3 次后 fail-closed 并点名 ref', async () => {
        let calls = 0
        const inspectDown = () => {
            calls += 1
            throw new Error('failed to fetch oauth token: read tcp: connection reset by peer')
        }
        const sleep = vi.fn(async () => {})
        await expect(
            compareTag({ label: 'platform', tag: 'latest', repos: ['a/x'], inspect: inspectDown, sleep, log: { warn: () => {} } }),
        ).rejects.toThrow('a/x:latest 读取失败：failed to fetch oauth token: read tcp: connection reset by peer')
        expect(calls).toBe(3)
        expect(sleep).toHaveBeenCalledTimes(2)
    })

    it('compareTag：确定性失败（401/403、非 JSON）不重试，立即 fail-closed', async () => {
        let calls = 0
        const forbidden = () => {
            calls += 1
            throw new Error('unexpected status from HEAD request to https://ghcr.io/v2/x: 403 Forbidden')
        }
        const sleep = vi.fn(async () => {})
        const warn = vi.fn()
        await expect(
            compareTag({ label: 'platform', tag: 'latest', repos: ['a/x'], inspect: forbidden, sleep, log: { warn } }),
        ).rejects.toThrow('a/x:latest 读取失败：unexpected status from HEAD request to https://ghcr.io/v2/x: 403 Forbidden')
        expect(calls).toBe(1)
        expect(sleep).not.toHaveBeenCalled()
        expect(warn).not.toHaveBeenCalled() // 确定性失败不打「传输层抖动」warn

        let notJsonCalls = 0
        const notJson = () => {
            notJsonCalls += 1
            return 'not-json'
        }
        await expect(
            compareTag({ label: 'platform', tag: 'latest', repos: ['a/x'], inspect: notJson, sleep, log: { warn } }),
        ).rejects.toThrow('a/x:latest 读取失败')
        expect(notJsonCalls).toBe(1)
        expect(sleep).not.toHaveBeenCalled()
    })

    it('isTransientError：按报文分类（ACR reset / 5xx / 超时 重试；403 / 非 JSON / 证书过期 不重试）', () => {
        const transient = [
            // 2026-11-27 Publish Docker Image 实际报文
            'failed to authorize: failed to fetch oauth token: Post "https://dockerauth.cn-hangzhou.aliyuncs.com/auth": '
            + 'read tcp 10.0.142.222:45708->120.55.35.34:443: read: connection reset by peer',
            'unexpected status from HEAD request: 503 Service Unavailable',
            'dial tcp 1.2.3.4:443: i/o timeout',
            'net/http: TLS handshake timeout',
        ]
        const deterministic = [
            'unexpected status from HEAD request to https://ghcr.io/v2/x: 403 Forbidden',
            '401 Unauthorized',
            'Unexpected token \'o\', "not-json" is not valid JSON',
            'index 中没有 linux 平台的 manifest 条目（形态变化或权限不足？）',
            'x509: certificate has expired or is not yet valid',
        ]
        for (const message of transient) {
            expect(isTransientError(new Error(message)), message).toBe(true)
        }
        for (const message of deterministic) {
            expect(isTransientError(new Error(message)), message).toBe(false)
        }
        expect(isTransientError('raw string 500 Internal Server Error')).toBe(true)
    })

    it('参数解析支持 = 与空格两种形态', () => {
        expect(parseArgs(['--summary=a.md', '--label', 'platform', '--repos=a/x,b/x,c/x', '--tags=latest,sha-a'])).toMatchObject({
            summary: 'a.md',
            label: 'platform',
            repos: ['a/x', 'b/x', 'c/x'],
            tags: ['latest', 'sha-a'],
        })
    })

    it('main：TAGS_* 一致 exit 0；不一致 exit 1；空集合 exit 1；本地复算模式可用', async () => {
        const env = {
            TAGS_DOCKERHUB: 'caomeiyouren/dependfix:latest',
            TAGS_GHCR: 'ghcr.io/dependfix/dependfix:latest',
            TAGS_ACR: 'registry/x/dependfix:latest',
            TAGS_SANDBOX_DOCKERHUB: 'caomeiyouren/dependfix-sandbox:latest',
            TAGS_SANDBOX_GHCR: 'ghcr.io/dependfix/dependfix-sandbox:latest',
            TAGS_SANDBOX_ACR: 'registry/x/dependfix-sandbox:latest',
            TAGS_SANDBOX_FULL_DOCKERHUB: 'caomeiyouren/dependfix-sandbox-full:latest',
            TAGS_SANDBOX_FULL_GHCR: 'ghcr.io/dependfix/dependfix-sandbox-full:latest',
            TAGS_SANDBOX_FULL_ACR: 'registry/x/dependfix-sandbox-full:latest',
        }
        const summary = []
        const log = { log: vi.fn(), error: vi.fn() }
        const base = { env, log, sleep: async () => {}, appendSummary: (text) => summary.push(text) }

        await expect(main([], { ...base, inspect: () => SAME })).resolves.toBe(0)
        expect(summary.join('\n')).toContain('dh/gh/acr 一致')

        await expect(
            main([], {
                ...base,
                // 按完整 ref 精确匹配模拟单 registry drift（不用 host 子串判定，避免 CodeQL alert #31 的 URL 子串告警口径）
                inspect: (ref) => (ref === env.TAGS_GHCR ? index([linux('amd64', 'sha256:zzz')]) : SAME),
            }),
        ).resolves.toBe(1)
        expect(log.error).toHaveBeenCalledWith(expect.stringContaining('跨 registry digest 不一致'))

        await expect(main([], { ...base, env: {}, inspect: () => SAME })).resolves.toBe(1)
        expect(log.error).toHaveBeenCalledWith(expect.stringContaining('空 tag 列表'))

        // 本地复算模式：显式 label / repos / tags，不读环境变量
        await expect(
            main(['--label', 'platform', '--repos', 'a/x,b/x,c/x', '--tags', 'latest'], { ...base, env: {}, inspect: () => SAME }),
        ).resolves.toBe(0)
    })

    it('inspectWithBuildx 以 docker buildx imagetools inspect --raw 读取（注入 exec 断言 argv）', () => {
        const exec = vi.fn(() => SAME)
        inspectWithBuildx('caomeiyouren/dependfix:latest', { exec })
        expect(exec).toHaveBeenCalledWith(
            'docker',
            ['buildx', 'imagetools', 'inspect', 'caomeiyouren/dependfix:latest', '--raw'],
            expect.objectContaining({ encoding: 'utf-8' }),
        )
    })
})
