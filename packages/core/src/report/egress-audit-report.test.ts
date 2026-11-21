import { describe, expect, it } from 'vitest'
import { EMPTY_RUN_RESULT } from './report.test-helpers'
import { generateMarkdownReport } from './index'

describe('generateMarkdownReport — Egress Audit 注入状态', () => {
    it('披露既有代理导致注入未生效', () => {
        const md = generateMarkdownReport({
            ...EMPTY_RUN_RESULT,
            networkAuditInjection: { status: 'existing-proxy' },
        })
        expect(md).toContain('## Egress Audit')
        expect(md).toContain('existing-proxy')
        expect(md).toContain('deny-by-default 未生效')
    })

    it('关闭 / 不可用状态同样披露', () => {
        const disabled = generateMarkdownReport({
            ...EMPTY_RUN_RESULT,
            networkAuditInjection: { status: 'disabled' },
        })
        expect(disabled).toContain('## Egress Audit')
        expect(disabled).toContain('DEPENDFIX_NETWORK_AUDIT=false')

        const unavailable = generateMarkdownReport({
            ...EMPTY_RUN_RESULT,
            networkAuditInjection: { status: 'unavailable' },
        })
        expect(unavailable).toContain('## Egress Audit')
    })

    it('注入生效时不渲染该小节', () => {
        expect(generateMarkdownReport({
            ...EMPTY_RUN_RESULT,
            networkAuditInjection: { status: 'injected' },
        })).not.toContain('## Egress Audit')
        expect(generateMarkdownReport(EMPTY_RUN_RESULT)).not.toContain('## Egress Audit')
    })
})
