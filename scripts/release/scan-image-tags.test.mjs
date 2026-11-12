import { describe, expect, it } from 'vitest'
import {
    evaluateTag,
    formatMarkdownReport,
    imageTagForVersion,
    main,
    parseArchitectures,
    parseScanArgs,
    resolveCandidateTags,
} from './scan-image-tags.mjs'

const manifest = (architectures) =>
    JSON.stringify({
        manifests: [
            ...architectures.map((architecture) => ({ platform: { os: 'linux', architecture } })),
            { platform: { os: 'unknown', architecture: 'unknown' } },
        ],
    })

describe('imageTagForVersion / resolveCandidateTags', () => {
    it('版本映射为 platform-x.y.z', () => {
        expect(imageTagForVersion('1.0.0')).toBe('platform-1.0.0')
    })

    it('只取平台发布 tag 并按窗口截断', () => {
        const lines = [
            '@dependfix/platform@1.0.0',
            'v1.0.0',
            '@dependfix/platform@0.7.0',
            '@dependfix/platform@0.6.0',
            '',
        ]
        expect(resolveCandidateTags(lines, 2)).toEqual(['platform-1.0.0', 'platform-0.7.0'])
        expect(resolveCandidateTags(lines, 10)).toHaveLength(3)
    })

    it('窗口非法时 fail-closed', () => {
        expect(() => resolveCandidateTags([], 0)).toThrow(/1-100/)
        expect(() => resolveCandidateTags([], 101)).toThrow(/1-100/)
        expect(() => resolveCandidateTags([], 1.5)).toThrow(/1-100/)
    })
})

describe('parseArchitectures', () => {
    it('解析 linux 架构并去重排序', () => {
        expect(parseArchitectures(manifest(['amd64', 'arm64', 'amd64']))).toEqual(['amd64', 'arm64'])
    })

    it('非 linux / 无 manifests / 非法 JSON 返回 null', () => {
        expect(
            parseArchitectures(JSON.stringify({ manifests: [{ platform: { os: 'windows', architecture: 'amd64' } }] })),
        ).toEqual([])
        expect(parseArchitectures(JSON.stringify({ schemaVersion: 2 }))).toBeNull()
        expect(parseArchitectures('not-json')).toBeNull()
    })
})

describe('evaluateTag（fail-open：只写未证实）', () => {
    it('双架构可解析 → verified', () => {
        const row = evaluateTag('platform-1.0.0', () => manifest(['amd64', 'arm64']), 'ghcr.io/o/r')
        expect(row).toMatchObject({ status: 'verified', tag: 'platform-1.0.0' })
        expect(row.reason).toContain('amd64')
    })

    it('缺 arm64 → unverified 并写原因', () => {
        const row = evaluateTag('platform-1.0.0', () => manifest(['amd64']), 'ghcr.io/o/r')
        expect(row.status).toBe('unverified')
        expect(row.reason).toContain('arm64')
    })

    it('manifest 查询失败（缺凭证 / 网络 / 缺镜像）→ unverified', () => {
        const row = evaluateTag(
            'platform-1.0.0',
            () => {
                throw new Error('denied: requested access to the resource is denied')
            },
            'ghcr.io/o/r',
        )
        expect(row.status).toBe('unverified')
        expect(row.reason).toContain('denied')
    })

    it('输出不可解析 → unverified（不当作单架构通过）', () => {
        expect(evaluateTag('platform-1.0.0', () => 'oops', 'ghcr.io/o/r').status).toBe('unverified')
        expect(evaluateTag('platform-1.0.0', () => JSON.stringify({}), 'ghcr.io/o/r').status).toBe('unverified')
    })
})

describe('formatMarkdownReport', () => {
    it('输出固定表头与逐 tag 结论', () => {
        const text = formatMarkdownReport(
            [
                { tag: 'platform-1.0.0', status: 'verified', reason: '双架构 manifest（amd64 / arm64）' },
                { tag: 'platform-0.7.0', status: 'unverified', reason: 'manifest 查询失败：denied' },
            ],
            { image: 'ghcr.io/o/r' },
        )
        expect(text).toContain('| 镜像 tag | 结论 | 依据 |')
        expect(text).toContain('platform-1.0.0')
        expect(text).toContain('unverified')
        expect(text).toContain('不构成运行通过')
    })

    it('无候选 tag 时明确写未发现，不写通过', () => {
        const text = formatMarkdownReport([], { image: 'ghcr.io/o/r' })
        expect(text).toContain('未发现候选 tag')
        expect(text).not.toContain('verified |')
    })
})

describe('parseScanArgs / main 参数面', () => {
    it('默认 window=10，解析 tags / json / window', () => {
        expect(parseScanArgs([])).toMatchObject({ window: 10, json: false })
        expect(parseScanArgs(['--window=5', '--tags=a,b', '--json'])).toMatchObject({
            window: 5,
            tags: 'a,b',
            json: true,
        })
    })

    it('等号与空格两种取值形态都接受（工作流同形 argv）', () => {
        expect(parseScanArgs(['--window=10', '--image', 'ghcr.io/dependfix/dependfix'])).toMatchObject({
            window: 10,
            image: 'ghcr.io/dependfix/dependfix',
        })
        expect(() => parseScanArgs(['--image'])).toThrow(/缺少取值/)
        expect(() => parseScanArgs(['--image', '--json'])).toThrow(/缺少取值/)
    })

    it('非法 window / 未知参数 fail-closed', () => {
        expect(() => parseScanArgs(['--window=0'])).toThrow(/1-100/)
        expect(() => parseScanArgs(['--window=abc'])).toThrow(/正整数/)
        expect(() => parseScanArgs(['--bogus'])).toThrow(/未知参数/)
    })

    it('main 参数错误返回 2（不触发任何 registry 查询）', () => {
        const errors = []
        expect(main({ argv: ['--bogus'], error: (line) => errors.push(line) })).toBe(2)
        expect(main({ argv: ['--window=500'], error: (line) => errors.push(line) })).toBe(2)
        expect(errors.join('\n')).toContain('scan-image-tags')
    })

    it('main 全 unverified 仍 fail-open 返回 0（进程边界契约）', () => {
        const logs = []
        const errors = []
        const code = main({
            argv: ['--tags=platform-1.0.0,platform-0.7.0', '--image=ghcr.io/o/r'],
            log: (line) => logs.push(line),
            error: (line) => errors.push(line),
            deps: {
                inspect: () => {
                    throw new Error('401 Unauthorized')
                },
            },
        })
        expect(code).toBe(0)
        expect(errors).toHaveLength(0)
        const text = logs.join('\n')
        expect(text).toContain('unverified')
        expect(text).toContain('401 Unauthorized')
    })

    it('main --json 输出机读结构', () => {
        const logs = []
        const code = main({
            argv: ['--tags=platform-1.0.0', '--image=ghcr.io/o/r', '--json'],
            log: (line) => logs.push(line),
            deps: { inspect: () => manifest(['amd64', 'arm64']) },
        })
        expect(code).toBe(0)
        const parsed = JSON.parse(logs.join('\n'))
        expect(parsed.image).toBe('ghcr.io/o/r')
        expect(parsed.tags[0]).toMatchObject({ tag: 'platform-1.0.0', status: 'verified' })
    })

    it('main 无候选 tag 时输出「未发现」（不写通过）', () => {
        const logs = []
        const code = main({
            argv: ['--image=ghcr.io/o/r'],
            log: (line) => logs.push(line),
            deps: { listTags: () => [] },
        })
        expect(code).toBe(0)
        expect(logs.join('\n')).toContain('未发现候选 tag')
    })
})
