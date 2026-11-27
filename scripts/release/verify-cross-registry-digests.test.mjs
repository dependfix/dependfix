import { describe, expect, it, vi } from 'vitest'
import {
    compareTag,
    ensureTagSets,
    inspectWithBuildx,
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
                inspect: (ref) => (ref.includes('ghcr.io') ? index([linux('amd64', 'sha256:zzz')]) : SAME),
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
