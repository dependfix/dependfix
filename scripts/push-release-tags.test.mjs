import { describe, expect, it } from 'vitest'
import { pushAndVerifyTags, sanitizeError } from './push-release-tags.mjs'

// 模拟 git 调用（key = 命令片段，value = 输出；未注册的命令抛错）
function createGitMock(recorded) {
    return (args) => {
        const out = recorded[args]
        if (out === undefined) {
            throw new Error(`未注册的 git 调用: ${args}`)
        }
        return out
    }
}

const baseRecorded = {
    'push "https://x-access-token:ghs_abcdef1234567890abcdef1234567890abcdef@github.com/dependfix/dependfix.git" --tags': '',
    'fetch "https://x-access-token:ghs_abcdef1234567890abcdef1234567890abcdef@github.com/dependfix/dependfix.git" --tags': '',
    tag: 'dependfix@0.2.0\n@dependfix/core@0.2.0\nv0.2.0',
    'ls-remote "https://x-access-token:ghs_abcdef1234567890abcdef1234567890abcdef@github.com/dependfix/dependfix.git" --tags':
        'abc1234\trefs/tags/dependfix@0.2.0\ndef5678\trefs/tags/@dependfix/core@0.2.0\nfff0000\trefs/tags/v0.2.0',
}

describe('pushAndVerifyTags', () => {
    it('pushes with explicit token URL and returns synced tags', () => {
        const git = createGitMock(baseRecorded)
        const tags = pushAndVerifyTags({ git, token: 'ghs_abcdef1234567890abcdef1234567890abcdef', repository: 'dependfix/dependfix' })
        expect(tags).toEqual(['dependfix@0.2.0', '@dependfix/core@0.2.0', 'v0.2.0'])
    })

    it('throws when a local tag is missing on remote', () => {
        const recorded = {
            ...baseRecorded,
            'ls-remote "https://x-access-token:ghs_abcdef1234567890abcdef1234567890abcdef@github.com/dependfix/dependfix.git" --tags':
                'abc1234\trefs/tags/dependfix@0.2.0',
        }
        const git = createGitMock(recorded)
        expect(() => pushAndVerifyTags({ git, token: 'ghs_abcdef1234567890abcdef1234567890abcdef', repository: 'dependfix/dependfix' })).toThrow(
            /@dependfix\/core@0\.2\.0.*v0\.2\.0/,
        )
    })

    it('passes when there are no local tags', () => {
        const recorded = {
            ...baseRecorded,
            tag: '',
            'ls-remote "https://x-access-token:ghs_abcdef1234567890abcdef1234567890abcdef@github.com/dependfix/dependfix.git" --tags': '',
        }
        const git = createGitMock(recorded)
        expect(pushAndVerifyTags({ git, token: 'ghs_abcdef1234567890abcdef1234567890abcdef', repository: 'dependfix/dependfix' })).toEqual([])
    })
})

describe('sanitizeError', () => {
    it('prefers stderr (git output already masks credentials)', () => {
        const err = Object.assign(
            new Error('Command failed: git push "https://x-access-token:ghs_abcdef1234567890abcdef1234567890abcdef@github.com/dependfix/dependfix.git" --tags'),
            { stderr: 'remote: fatal: Authentication failed' },
        )
        expect(sanitizeError(err, 'ghs_abcdef1234567890abcdef1234567890abcdef')).toBe('remote: fatal: Authentication failed')
    })

    it('masks token in message when stderr is absent (execSync failure path)', () => {
        const err = new Error('Command failed: git push "https://x-access-token:ghs_abcdef1234567890abcdef1234567890abcdef@github.com/dependfix/dependfix.git" --tags')
        const out = sanitizeError(err, 'ghs_abcdef1234567890abcdef1234567890abcdef')
        expect(out).not.toContain('ghs_abcdef1234567890abcdef1234567890abcdef')
        expect(out).toContain('x-access-token:***@github.com')
    })
})
