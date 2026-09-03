import {
    describe,
    expect,
    it,
} from 'vitest'
import {
    isFailureConclusion,
    TARGET_PR_AUTHOR_LOGINS,
} from './types'
import {
    extractErrorMessage,
    isTargetAuthor,
    mapGitHubConclusion,
} from './polling-source'

describe('monitor/types', () => {
    describe('isFailureConclusion', () => {
        it('failure / timed_out / action_required 触发 firing', () => {
            expect(isFailureConclusion('failure')).toBe(true)
            expect(isFailureConclusion('timed_out')).toBe(true)
            expect(isFailureConclusion('action_required')).toBe(true)
        })

        it('success / pending / skipped 等不触发 firing', () => {
            expect(isFailureConclusion('success')).toBe(false)
            expect(isFailureConclusion('pending')).toBe(false)
            expect(isFailureConclusion('skipped')).toBe(false)
            expect(isFailureConclusion('cancelled')).toBe(false)
            expect(isFailureConclusion('neutral')).toBe(false)
            expect(isFailureConclusion('stale')).toBe(false)
        })
    })

    describe('TARGET_PR_AUTHOR_LOGINS', () => {
        it('默认含 dependfix[bot] + dependabot[bot]', () => {
            expect(TARGET_PR_AUTHOR_LOGINS).toContain('dependfix[bot]')
            expect(TARGET_PR_AUTHOR_LOGINS).toContain('dependabot[bot]')
        })
    })
})

describe('monitor/polling-source 工具函数', () => {
    describe('isTargetAuthor', () => {
        it('匹配 dependabot[bot]', () => {
            expect(isTargetAuthor('dependabot[bot]')).toBe(true)
        })

        it('匹配 dependfix[bot] 大小写不敏感', () => {
            expect(isTargetAuthor('DependFix[bot]')).toBe(true)
            expect(isTargetAuthor('dependfix[bot]')).toBe(true)
        })

        it('匹配 GitHub App 动态生成的 bot 名（依赖 [bot] + dependfix 子串）', () => {
            expect(isTargetAuthor('12345+dependfix[bot]')).toBe(true)
            expect(isTargetAuthor('9876+DependFix[bot]')).toBe(true)
        })

        it('不匹配普通用户或无关 bot', () => {
            expect(isTargetAuthor('alice')).toBe(false)
            expect(isTargetAuthor('renovate[bot]')).toBe(false)
            expect(isTargetAuthor('')).toBe(false)
        })
    })

    describe('mapGitHubConclusion', () => {
        it('status=completed + conclusion=success → success', () => {
            expect(mapGitHubConclusion('success', 'completed')).toBe('success')
        })

        it('status=completed + conclusion=failure → failure', () => {
            expect(mapGitHubConclusion('failure', 'completed')).toBe('failure')
        })

        it('status=completed + conclusion=null → skipped（check 完成无结论）', () => {
            expect(mapGitHubConclusion(null, 'completed')).toBe('skipped')
        })

        it('status=in_progress / pending / queued → pending（未完成）', () => {
            expect(mapGitHubConclusion(null, 'in_progress')).toBe('pending')
            expect(mapGitHubConclusion(null, 'pending')).toBe('pending')
            expect(mapGitHubConclusion(null, 'queued')).toBe('pending')
            expect(mapGitHubConclusion(null, 'waiting')).toBe('pending')
            expect(mapGitHubConclusion(null, 'requested')).toBe('pending')
        })

        it('stale 是合法完成态结论（GitHub commit status 聚合降级显示）', () => {
            expect(mapGitHubConclusion('stale', 'completed')).toBe('stale')
        })
    })

    describe('extractErrorMessage', () => {
        it('null / undefined 返回 null', () => {
            expect(extractErrorMessage(null)).toBe(null)
            expect(extractErrorMessage(undefined)).toBe(null)
        })

        it('短文本原样返回', () => {
            expect(extractErrorMessage('error: foo')).toBe('error: foo')
        })

        it('> 1000 字符截断 + 省略号', () => {
            const long = 'x'.repeat(2000)
            const result = extractErrorMessage(long)
            expect(result?.length).toBe(1000 + 3)
            expect(result?.endsWith('...')).toBe(true)
        })
    })
})
