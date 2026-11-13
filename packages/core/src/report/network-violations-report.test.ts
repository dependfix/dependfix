import { describe, expect, it } from 'vitest'
import { EMPTY_RUN_RESULT } from './report.test-helpers'
import { generateMarkdownReport } from './index'

describe('generateMarkdownReport — Network Violations', () => {
    it('renders blocked outbound targets with redacted hosts', () => {
        const result = {
            ...EMPTY_RUN_RESULT,
            networkViolations: [{
                time: '2026-11-13T00:00:00.000Z',
                source: 'proxy' as const,
                method: 'CONNECT',
                target: 'https://evil.example.com/exfil?token=secret',
                violation: true,
            }],
        }

        const md = generateMarkdownReport(result)

        expect(md).toContain('## Network Violations')
        expect(md).toContain('evil.example.com')
        expect(md).not.toContain('token=secret')
        expect(md).toContain('不得因此判定为「验证通过」')
    })

    it('strips URL userinfo credentials from the rendered target', () => {
        const result = {
            ...EMPTY_RUN_RESULT,
            networkViolations: [{
                time: '2026-11-13T00:00:00.000Z',
                source: 'proxy' as const,
                method: 'CONNECT',
                target: 'https://user:pass@evil.example.com/x?token=1',
                violation: true,
            }],
        }
        const md = generateMarkdownReport(result)
        expect(md).toContain('evil.example.com')
        expect(md).not.toContain('user:pass')
        expect(md).not.toContain('token=1')
    })

    it('omits the section when no violation was recorded', () => {
        expect(generateMarkdownReport(EMPTY_RUN_RESULT)).not.toContain('## Network Violations')
    })
})
