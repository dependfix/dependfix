// token-hints.test.ts — 错误归因提示（PR 创建 / Dependabot / Code Scanning alerts token 提示）。
// 拆分自 app/helpers.test.ts（原 1031 行超 max-lines 1000）。
import { describe, expect, it } from 'vitest'
import { AppError } from '@dependfix/core'
import {
    codeQualityAlertsTokenHint,
    codeScanningAlertsTokenHint,
    dependabotAlertsTokenHint,
    pullRequestCreationHint,
} from './helpers'

describe('pullRequestCreationHint', () => {
    it('returns guidance for GITHUB_TOKEN PR creation 403', () => {
        const hint = pullRequestCreationHint(new AppError(
            'PERMISSION_DENIED',
            'GitHub Actions is not permitted to create or approve pull requests. - https://docs.github.com/rest/pulls/pulls#create-a-pull-request',
        ))
        expect(hint).toContain('Allow GitHub Actions to create and approve pull requests')
        expect(hint).toContain('pull-requests: write')
    })

    it('returns null for other errors', () => {
        expect(pullRequestCreationHint(new AppError('PERMISSION_DENIED', 'Resource not accessible by integration'))).toBeNull()
        expect(pullRequestCreationHint(new AppError('REPO_NOT_FOUND', 'not found'))).toBeNull()
        expect(pullRequestCreationHint(new Error('boom'))).toBeNull()
    })
})

describe('dependabotAlertsTokenHint', () => {
    it('returns a hint for PERMISSION_DENIED (GITHUB_TOKEN cannot read Dependabot alerts)', () => {
        const hint = dependabotAlertsTokenHint(new AppError(
            'PERMISSION_DENIED',
            'fetch dependabot alerts for foo/bar: Resource not accessible by integration',
        ))
        expect(hint).toContain('security_events')
        expect(hint).toContain('Dependabot alerts: read')
        expect(hint).toContain('GITHUB_TOKEN')
        expect(hint).toContain('GitHub App')
    })

    it('returns a hint for AUTHENTICATION_FAILED', () => {
        const hint = dependabotAlertsTokenHint(new AppError(
            'AUTHENTICATION_FAILED',
            'fetch dependabot alerts for foo/bar: Bad credentials',
        ))
        expect(hint).toContain('token 无效或已过期')
    })

    it('returns null for other AppError codes', () => {
        expect(dependabotAlertsTokenHint(new AppError('RATE_LIMITED', 'fetch dependabot alerts for foo/bar: rate limited'))).toBeNull()
        expect(dependabotAlertsTokenHint(new AppError('REPO_NOT_FOUND', 'fetch dependabot alerts for foo/bar: not found'))).toBeNull()
        expect(dependabotAlertsTokenHint(new AppError('NETWORK_ERROR', 'fetch dependabot alerts for foo/bar: network'))).toBeNull()
    })

    it('returns null for non-AppError values', () => {
        expect(dependabotAlertsTokenHint(new Error('boom'))).toBeNull()
        expect(dependabotAlertsTokenHint('string error')).toBeNull()
    })

    it('returns null for code scanning fetch errors (context-based routing)', () => {
        const hint = dependabotAlertsTokenHint(new AppError(
            'PERMISSION_DENIED',
            'fetch code scanning alerts for foo/bar: Resource not accessible by integration',
        ))
        expect(hint).toBeNull()
    })
})

describe('codeScanningAlertsTokenHint', () => {
    it('returns a hint for PERMISSION_DENIED (token needs security-events: read)', () => {
        const hint = codeScanningAlertsTokenHint(new AppError(
            'PERMISSION_DENIED',
            'fetch code scanning alerts for foo/bar: Resource not accessible by integration',
        ))
        expect(hint).toContain('security-events: read')
        expect(hint).toContain('Code scanning alerts: read')
    })

    it('returns a hint for AUTHENTICATION_FAILED', () => {
        const hint = codeScanningAlertsTokenHint(new AppError(
            'AUTHENTICATION_FAILED',
            'fetch code scanning alerts for foo/bar: Bad credentials',
        ))
        expect(hint).toContain('token 无效或已过期')
    })

    it('returns hint even when repository name contains "dependabot" (context-based routing)', () => {
        // 回归：仓库名含对方关键字时不得误判（dependabot/dependabot-core 场景）
        const hint = codeScanningAlertsTokenHint(new AppError(
            'PERMISSION_DENIED',
            'fetch code scanning alerts for dependabot/dependabot-core: Resource not accessible by integration',
        ))
        expect(hint).toContain('security-events: read')
    })

    it('returns null for dependabot fetch errors (context-based routing)', () => {
        const hint = codeScanningAlertsTokenHint(new AppError(
            'PERMISSION_DENIED',
            'fetch dependabot alerts for dependabot/dependabot-core: Resource not accessible by integration',
        ))
        expect(hint).toBeNull()
    })

    it('returns null for other AppError codes and non-AppError values', () => {
        expect(codeScanningAlertsTokenHint(new AppError('REPO_NOT_FOUND', 'fetch code scanning alerts for foo/bar: not found'))).toBeNull()
        expect(codeScanningAlertsTokenHint(new Error('boom'))).toBeNull()
        expect(codeScanningAlertsTokenHint('string error')).toBeNull()
    })
})

describe('codeQualityAlertsTokenHint', () => {
    it('returns a hint for PERMISSION_DENIED (Code quality: read missing)', () => {
        const hint = codeQualityAlertsTokenHint(new AppError(
            'PERMISSION_DENIED',
            'fetch code quality findings for foo/bar: Resource not accessible by integration',
        ))
        expect(hint).toContain('Code quality')
        expect(hint).toContain('fine-grained PAT')
    })

    it('returns a hint for AUTHENTICATION_FAILED', () => {
        const hint = codeQualityAlertsTokenHint(new AppError(
            'AUTHENTICATION_FAILED',
            'fetch code quality findings for foo/bar: Bad credentials',
        ))
        expect(hint).toContain('token 无效')
    })

    it('returns null for RATE_LIMITED (other AppError codes)', () => {
        // RATE_LIMITED 等不在 PERMISSION_DENIED / AUTHENTICATION_FAILED 分支内 → 兜底 null
        const hint = codeQualityAlertsTokenHint(new AppError(
            'RATE_LIMITED',
            'fetch code quality findings for foo/bar: API rate limit exceeded',
        ))
        expect(hint).toBeNull()
    })

    it('returns null for non-Code-Quality fetch errors (context-based routing)', () => {
        // 仓库名含 'code' 时不得误判：仅 `fetch code quality findings for` 前缀才命中
        const hint = codeQualityAlertsTokenHint(new AppError(
            'PERMISSION_DENIED',
            'fetch code scanning alerts for code-quality/foo: Resource not accessible by integration',
        ))
        expect(hint).toBeNull()
    })

    it('returns null for non-AppError values', () => {
        expect(codeQualityAlertsTokenHint(new Error('boom'))).toBeNull()
        expect(codeQualityAlertsTokenHint('string error')).toBeNull()
    })
})
