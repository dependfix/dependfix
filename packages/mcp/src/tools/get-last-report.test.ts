import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { getLastReport } from './get-last-report'

describe('getLastReport', () => {
    it('returns latest JSON report sorted by filename', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'dependfix-mcp-report-'))
        writeFileSync(join(dir, 'dependfix-report-20260808-010000-run-older.json'), JSON.stringify({ runId: 'older' }))
        writeFileSync(join(dir, 'dependfix-report-20260808-020000-run-newer.json'), JSON.stringify({ runId: 'newer' }))

        const original = process.env.DEPENDFIX_MCP_REPORT_DIR
        process.env.DEPENDFIX_MCP_REPORT_DIR = dir
        try {
            const result = await getLastReport()
            expect(result.ok).toBe(true)
            const report = (result as { report: { runId: string } }).report
            expect(report.runId).toBe('newer')
        } finally {
            if (original === undefined) {
                delete process.env.DEPENDFIX_MCP_REPORT_DIR
            } else {
                process.env.DEPENDFIX_MCP_REPORT_DIR = original
            }
        }
    })

    it('returns error when report dir is empty', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'dependfix-mcp-empty-'))
        const original = process.env.DEPENDFIX_MCP_REPORT_DIR
        process.env.DEPENDFIX_MCP_REPORT_DIR = dir
        try {
            const result = await getLastReport()
            expect(result.ok).toBe(false)
            expect((result as { error: string }).error).toContain('为空')
        } finally {
            if (original === undefined) {
                delete process.env.DEPENDFIX_MCP_REPORT_DIR
            } else {
                process.env.DEPENDFIX_MCP_REPORT_DIR = original
            }
        }
    })
})
