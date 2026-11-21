import { describe, expect, it } from 'vitest'
import { EMPTY_RUN_RESULT } from './report.test-helpers'
import { generateMarkdownReport } from './index'

describe('generateMarkdownReport — Environment Hardening', () => {
    it('renders counts only (never key names)', () => {
        const result = {
            ...EMPTY_RUN_RESULT,
            envHardening: { filteredKeys: 4, filteredCommands: 12 },
        }

        const md = generateMarkdownReport(result)

        expect(md).toContain('## Environment Hardening')
        expect(md).toContain('12 条受管命令')
        expect(md).toContain('4 个平台密钥类变量')
        // 只记计数：报告属可外发物，不得出现任何键名
        for (const key of ['NUXT_', 'AUTH_SECRET', 'DATABASE_URL', 'SMTP_PASS']) {
            expect(md).not.toContain(key)
        }
    })

    it('omits the section when nothing was filtered', () => {
        expect(generateMarkdownReport(EMPTY_RUN_RESULT)).not.toContain('## Environment Hardening')
        expect(generateMarkdownReport({
            ...EMPTY_RUN_RESULT,
            envHardening: { filteredKeys: 0, filteredCommands: 0 },
        })).not.toContain('## Environment Hardening')
    })
})
