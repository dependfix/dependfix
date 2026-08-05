import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { NormalizedSecurityAlert } from '@dependfix/core'
import { getCodeScanningFixTemplate } from './templates'
import {
    applyCodeScanningFix,
    restoreSourceFile,
    resolveWithinWorkDir,
    snapshotSourceFile,
} from './index'

let workDir: string

function writeSourceFile(relativePath: string, content: string): void {
    const dir = join(workDir, relativePath.split('/').slice(0, -1).join('/'))
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(workDir, relativePath), content)
}

beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), 'dependfix-cs-'))
})

afterEach(() => {
    rmSync(workDir, { recursive: true, force: true })
})

function makeAlert(overrides: Partial<NormalizedSecurityAlert> = {}): NormalizedSecurityAlert {
    return {
        id: 1,
        source: 'code-scanning',
        repository: 'foo/bar',
        defaultBranch: 'main',
        severity: 'low',
        packageEcosystem: 'code-scanning',
        packageName: 'End of line',
        manifestPath: 'src/foo.ts',
        ruleId: 'eol-last',
        summary: 'File does not end with a newline',
        htmlUrl: 'https://github.com/foo/bar/security/code-scanning/1',
        fixable: false,
        fixStrategy: null,
        recommendedVersion: '',
        alertClass: 'auto-fixable',
        ...overrides,
    }
}

describe('applyCodeScanningFix', () => {
    it('returns null for non-code-scanning sources', () => {
        expect(applyCodeScanningFix({
            workDir,
            alert: makeAlert({ source: 'dependabot', packageName: 'lodash', ruleId: 'GHSA-xxx' }),
        })).toBeNull()
    })

    it('returns null for non-auto-fixable alerts (B/C classes)', () => {
        expect(applyCodeScanningFix({
            workDir,
            alert: makeAlert({ ruleId: 'js/sql-injection', alertClass: 'suggested' }),
        })).toBeNull()
    })

    it('skips (noOp) when no template exists for the rule — no permanent failure semantics', () => {
        const action = applyCodeScanningFix({
            workDir,
            alert: makeAlert({ ruleId: 'jsdoc/check-alignment' }), // 不在白名单（无模板）——防御路径
        })

        expect(action).not.toBeNull()
        expect(action?.type).toBe('code-scanning-fix')
        expect(action?.success).toBe(true)
        expect(action?.noOp).toBe(true)
        expect(action?.error).toContain('no fix template')
    })

    it('skips (noOp) when manifestPath is empty', () => {
        const action = applyCodeScanningFix({
            workDir,
            alert: makeAlert({ manifestPath: '' }),
        })

        expect(action?.success).toBe(true)
        expect(action?.noOp).toBe(true)
        expect(action?.error).toContain('manifestPath is empty')
    })

    it('skips (noOp) paths escaping the work dir (path traversal protection)', () => {
        const action = applyCodeScanningFix({
            workDir,
            alert: makeAlert({ manifestPath: '../outside.ts' }),
        })

        expect(action?.success).toBe(true)
        expect(action?.noOp).toBe(true)
        expect(action?.error).toContain('outside work dir')

        const absolute = applyCodeScanningFix({
            workDir,
            alert: makeAlert({ manifestPath: 'C:\\outside.ts' }),
        })

        expect(absolute?.success).toBe(true)
        expect(absolute?.noOp).toBe(true)
    })

    it('skips (noOp) when the referenced file does not exist (stale alert)', () => {
        const action = applyCodeScanningFix({
            workDir,
            alert: makeAlert({ manifestPath: 'missing/file.ts' }),
        })

        expect(action?.success).toBe(true)
        expect(action?.noOp).toBe(true)
        expect(action?.error).toContain('cannot read')
    })

    it('applies eol-last: appends trailing newline to file missing it', () => {
        writeSourceFile('src/foo.ts', 'const a = 1')

        const action = applyCodeScanningFix({
            workDir,
            alert: makeAlert({ ruleId: 'eol-last' }),
        })

        expect(action?.success).toBe(true)
        expect(action?.noOp).toBeUndefined()
        expect(action?.diff).toContain('appended trailing newline')
        expect(readFileSync(join(workDir, 'src/foo.ts'), 'utf-8')).toBe('const a = 1\n')
    })

    it('eol-last: preserves CRLF style when file uses CRLF', () => {
        writeSourceFile('src/foo.ts', 'const a = 1\r\nconst b = 2')

        const action = applyCodeScanningFix({
            workDir,
            alert: makeAlert({ ruleId: 'eol-last' }),
        })

        expect(action?.success).toBe(true)
        expect(readFileSync(join(workDir, 'src/foo.ts'), 'utf-8')).toBe('const a = 1\r\nconst b = 2\r\n')
    })

    it('eol-last: no-op when file already ends with newline (success, not failure)', () => {
        writeSourceFile('src/foo.ts', 'const a = 1\n')

        const action = applyCodeScanningFix({
            workDir,
            alert: makeAlert({ ruleId: 'eol-last' }),
        })

        expect(action?.success).toBe(true)
        expect(action?.noOp).toBe(true)
        expect(action?.diff).toContain('no-op')
    })

    it('eol-last: skips (noOp) empty files (template not applicable)', () => {
        writeSourceFile('src/empty.ts', '')

        const action = applyCodeScanningFix({
            workDir,
            alert: makeAlert({ ruleId: 'eol-last', manifestPath: 'src/empty.ts' }),
        })

        expect(action?.success).toBe(true)
        expect(action?.noOp).toBe(true)
        expect(action?.error).toContain('not applicable')
    })

    it('dry-run: reports success without writing the file', () => {
        writeSourceFile('src/foo.ts', 'const a = 1')

        const action = applyCodeScanningFix({
            workDir,
            alert: makeAlert({ ruleId: 'eol-last' }),
            dryRun: true,
        })

        expect(action?.success).toBe(true)
        expect(readFileSync(join(workDir, 'src/foo.ts'), 'utf-8')).toBe('const a = 1')
    })
})

describe('getCodeScanningFixTemplate', () => {
    it('resolves registered templates by rule id', () => {
        expect(getCodeScanningFixTemplate('eol-last')).toBeDefined()
    })

    it('returns undefined for unregistered rules (incl. no-trailing-spaces removed in T303 review)', () => {
        expect(getCodeScanningFixTemplate('no-trailing-spaces')).toBeUndefined()
        expect(getCodeScanningFixTemplate('jsdoc/check-alignment')).toBeUndefined()
        expect(getCodeScanningFixTemplate('unknown-rule')).toBeUndefined()
    })
})

describe('snapshotSourceFile / restoreSourceFile', () => {
    it('restores modified file content to the snapshot state', () => {
        writeSourceFile('src/foo.ts', 'const a = 1\n')

        const snapshot = snapshotSourceFile(workDir, 'src/foo.ts')
        expect(snapshot).not.toBeNull()
        expect(snapshot?.existed).toBe(true)
        expect(snapshot?.content).toBe('const a = 1\n')

        // 模拟修复 + 验证失败后回滚
        writeSourceFile('src/foo.ts', 'const a = 1\nconst b = 2\n')
        expect(restoreSourceFile(workDir, snapshot!)).toBe(true)

        expect(readFileSync(join(workDir, 'src/foo.ts'), 'utf-8')).toBe('const a = 1\n')
    })

    it('removes a file created during fix when it did not exist at snapshot time', () => {
        const snapshot = snapshotSourceFile(workDir, 'src/created.ts')
        expect(snapshot?.existed).toBe(false)

        writeSourceFile('src/created.ts', '// created by fix\n')
        expect(restoreSourceFile(workDir, snapshot!)).toBe(true)

        expect(existsSync(join(workDir, 'src/created.ts'))).toBe(false)
    })

    it('returns null snapshot for paths escaping work dir', () => {
        expect(snapshotSourceFile(workDir, '../escape.ts')).toBeNull()
    })

    it('resolveWithinWorkDir allows in-dir paths and rejects escapes', () => {
        expect(resolveWithinWorkDir(workDir, 'src/foo.ts')).toBe(join(workDir, 'src/foo.ts'))
        expect(resolveWithinWorkDir(workDir, '../escape.ts')).toBeNull()
        expect(resolveWithinWorkDir(workDir, '')).toBeNull()
    })
})
