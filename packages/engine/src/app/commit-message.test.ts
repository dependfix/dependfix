// commit-message.test.ts — buildCommitMessage / buildPrTitle（PR 文案生成）。
// 拆分自 app/helpers.test.ts（原 1031 行超 max-lines 1000）。
import { describe, expect, it } from 'vitest'
import { type FixAction } from '@dependfix/core'
import { buildCommitMessage, buildPrTitle } from './helpers'

describe('buildCommitMessage', () => {
    const upgrade = (overrides: Partial<FixAction>): FixAction => ({
        type: 'dependency-upgrade',
        repository: 'foo/bar',
        target: 'vite',
        success: true,
        ...overrides,
    })

    it('returns title only when there are no successful upgrades', () => {
        expect(buildCommitMessage([])).toBe('fix(deps): automated dependfix security repair')
        expect(buildCommitMessage([{
            type: 'verification',
            repository: 'foo/bar',
            target: 'pnpm lint',
            success: true,
        }])).toBe('fix(deps): automated dependfix security repair')
    })

    it('excludes PR-record actions from details', () => {
        const msg = buildCommitMessage([
            upgrade({ target: 'PR #42 (existing)', toVersion: 'https://github.com/foo/bar/pull/42' }),
            upgrade({ target: 'js-yaml', fromVersion: 'unknown', toVersion: '^4.3.0' }),
        ])
        expect(msg).not.toContain('PR #42')
        expect(msg).toContain('- js-yaml: ^4.3.0')
        expect(msg).toContain('bump js-yaml')
    })

    it('uses single-package bump title with from → to (Dependabot style)', () => {
        const msg = buildCommitMessage([
            upgrade({ target: 'flatted', fromVersion: '3.3.3', toVersion: '3.4.2', strategy: 'override' }),
        ])
        expect(msg).toBe([
            'fix(deps): bump flatted from 3.3.3 to 3.4.2',
            '',
            '- flatted: 3.3.3 → 3.4.2 (pnpm overrides)',
        ].join('\n'))
    })

    it('omits from-version in title when unknown', () => {
        const msg = buildCommitMessage([
            upgrade({ target: 'fast-uri', fromVersion: 'unknown', toVersion: '^3.1.5' }),
        ])
        expect(msg).toContain('fix(deps): bump fast-uri to ^3.1.5')
    })

    it('lists all packages in title when under header limit', () => {
        const msg = buildCommitMessage([
            upgrade({ target: 'vite', fromVersion: '^8.2.0', toVersion: '^6.4.3' }),
            upgrade({ target: 'lodash', fromVersion: 'unknown', toVersion: '^4.18.0' }),
        ])
        expect(msg).toBe([
            'fix(deps): bump vite, lodash',
            '',
            '- vite: ^8.2.0 → ^6.4.3',
            '- lodash: ^4.18.0',
        ].join('\n'))
    })

    it('truncates title with "and N more" when package list exceeds header limit', () => {
        const names = Array.from({ length: 12 }, (_, i) => `package-name-${i + 1}`)
        const msg = buildCommitMessage(names.map((n) => upgrade({ target: n, toVersion: '^1.0.0' })))
        const [title] = msg.split('\n')
        expect(title).toMatch(/^fix\(deps\): bump .+ and \d+ more$/)
        expect(title.length).toBeLessThanOrEqual(140)
        // 明细仍然完整列出所有包
        expect(msg).toContain('- package-name-12: ^1.0.0')
    })

    it('marks pnpm overrides strategy in the detail line', () => {
        const msg = buildCommitMessage([
            upgrade({ target: 'fast-uri', fromVersion: 'unknown', toVersion: '^3.1.5', strategy: 'override' }),
        ])
        expect(msg).toContain('- fast-uri: ^3.1.5 (pnpm overrides)')
    })

    it('ignores failed upgrades', () => {
        const msg = buildCommitMessage([
            upgrade({ success: false, toVersion: '^9.0.0', error: 'peer conflict' }),
            upgrade({ target: 'js-yaml', fromVersion: 'unknown', toVersion: '^4.3.0' }),
        ])
        expect(msg).not.toContain('peer conflict')
        expect(msg).toContain('- js-yaml: ^4.3.0')
    })
})

// ---------------------------------------------------------------------------
// buildPrTitle（收尾审查遗留：cs-only 修复不再误标 N upgrades）
// ---------------------------------------------------------------------------

describe('buildPrTitle', () => {
    it('labels upgrade-only runs as upgrades', () => {
        expect(buildPrTitle({ alertsFixed: 3 }, [
            { type: 'dependency-upgrade', repository: 'a/b', target: 'lodash', success: true },
        ])).toBe('fix(deps): automated security fix — 3 upgrades')
    })

    it('labels code-scanning-only runs as code fixes (not upgrades)', () => {
        expect(buildPrTitle({ alertsFixed: 2 }, [
            { type: 'code-scanning-fix', repository: 'a/b', target: 'eol-last', success: true },
            { type: 'code-scanning-fix', repository: 'a/b', target: 'eol-last', success: true },
        ])).toBe('fix(deps): automated security fix — 2 code fixes')
    })

    it('combines upgrades and code fixes', () => {
        expect(buildPrTitle({ alertsFixed: 3 }, [
            { type: 'dependency-upgrade', repository: 'a/b', target: 'lodash', success: true },
            { type: 'code-scanning-fix', repository: 'a/b', target: 'eol-last', success: true },
            { type: 'code-scanning-fix', repository: 'a/b', target: 'eol-last', success: true },
        ])).toBe('fix(deps): automated security fix — 1 upgrade, 2 code fixes')
    })

    it('uses neutral title when nothing was fixed (lockfile-only runs)', () => {
        expect(buildPrTitle({ alertsFixed: 0 }, [])).toBe('fix(deps): automated security fix')
    })

    it('excludes noOp code-scanning actions from the fix count', () => {
        expect(buildPrTitle({ alertsFixed: 0 }, [
            { type: 'code-scanning-fix', repository: 'a/b', target: 'eol-last', success: true, noOp: true },
        ])).toBe('fix(deps): automated security fix')
    })
})
