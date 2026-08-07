import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
    applyChanges,
    buildVersionLockOverride,
    buildWaitUpstreamNote,
    safeRelativePath,
} from './patch-applier'
import { parseAssessment, type AiAssessment } from './schema'

// ---------------------------------------------------------------------------
// 修复方案生成器：结构化 patch 应用 + 版本锁定 + 等待上游说明
// ---------------------------------------------------------------------------

describe('applyChanges', () => {
    let workDir: string

    beforeEach(() => {
        workDir = mkdtempSync(join(tmpdir(), 'dependfix-patch-'))
    })

    afterEach(() => {
        rmSync(workDir, { recursive: true, force: true })
    })

    function writeFile(rel: string, content: string): void {
        const absolute = join(workDir, rel)
        mkdirSync(join(absolute, '..'), { recursive: true })
        writeFileSync(absolute, content, 'utf-8')
    }

    it('applies a single search/replace block', () => {
        writeFile('src/main.ts', 'const a = oldApi()\n')

        const result = applyChanges(workDir, [{
            filePath: 'src/main.ts',
            replace: [{ search: 'oldApi()', replace: 'newApi()' }],
        }])

        expect(result.success).toBe(true)
        expect(result.appliedFiles).toEqual(['src/main.ts'])
        expect(readFileSync(join(workDir, 'src/main.ts'), 'utf-8')).toBe('const a = newApi()\n')
        // 回滚恢复原内容
        result.rollback()
        expect(readFileSync(join(workDir, 'src/main.ts'), 'utf-8')).toBe('const a = oldApi()\n')
    })

    it('applies multiple blocks in one file (order independent, backward replacement)', () => {
        writeFile('src/a.ts', 'one\ntwo\nthree\n')

        const result = applyChanges(workDir, [{
            filePath: 'src/a.ts',
            replace: [
                { search: 'two', replace: 'TWO' },
                { search: 'one', replace: 'ONE' },
            ],
        }])

        expect(result.success).toBe(true)
        expect(readFileSync(join(workDir, 'src/a.ts'), 'utf-8')).toBe('ONE\nTWO\nthree\n')
    })

    it('fails when search not found and rolls back nothing applied', () => {
        writeFile('src/a.ts', 'content\n')

        const result = applyChanges(workDir, [{
            filePath: 'src/a.ts',
            replace: [{ search: 'missing-text', replace: 'x' }],
        }])

        expect(result.success).toBe(false)
        expect(result.error).toContain('not found')
        expect(readFileSync(join(workDir, 'src/a.ts'), 'utf-8')).toBe('content\n')
    })

    it('fails when search is not unique', () => {
        writeFile('src/a.ts', 'dup\ndup\n')

        const result = applyChanges(workDir, [{
            filePath: 'src/a.ts',
            replace: [{ search: 'dup', replace: 'x' }],
        }])

        expect(result.success).toBe(false)
        expect(result.error).toContain('not unique')
    })

    it('fails on empty search block for existing file', () => {
        writeFile('src/a.ts', 'content\n')

        const result = applyChanges(workDir, [{
            filePath: 'src/a.ts',
            replace: [{ search: '', replace: 'x' }],
        }])

        expect(result.success).toBe(false)
        expect(result.error).toContain('only allowed for new files')
    })

    it('creates a new file with empty-search single block', () => {
        const result = applyChanges(workDir, [{
            filePath: 'src/new.ts',
            replace: [{ search: '', replace: 'export const x = 1\n' }],
        }])

        expect(result.success).toBe(true)
        expect(readFileSync(join(workDir, 'src/new.ts'), 'utf-8')).toBe('export const x = 1\n')
        // 回滚删除新建文件
        result.rollback()
        expect(existsSync(join(workDir, 'src/new.ts'))).toBe(false)
    })

    it('rejects new file with multiple blocks or non-empty search', () => {
        const multiBlock = applyChanges(workDir, [{
            filePath: 'src/new.ts',
            replace: [
                { search: '', replace: 'a' },
                { search: '', replace: 'b' },
            ],
        }])
        expect(multiBlock.success).toBe(false)
        expect(multiBlock.error).toContain('single empty-search block')

        const nonEmptySearch = applyChanges(workDir, [{
            filePath: 'src/new2.ts',
            replace: [{ search: 'x', replace: 'y' }],
        }])
        expect(nonEmptySearch.success).toBe(false)
    })

    it('rolls back all files when later file fails mid-apply', () => {
        writeFile('src/ok.ts', 'keep me\n')

        const result = applyChanges(workDir, [
            { filePath: 'src/ok.ts', replace: [{ search: 'keep me', replace: 'changed' }] },
            { filePath: 'src/missing.ts', replace: [{ search: 'nope', replace: 'x' }] },
        ])

        // 预检失败：第一个文件未被修改
        expect(result.success).toBe(false)
        expect(readFileSync(join(workDir, 'src/ok.ts'), 'utf-8')).toBe('keep me\n')
    })

    it('rejects path traversal and absolute paths', () => {
        const escape = applyChanges(workDir, [{
            filePath: '../outside.txt',
            replace: [{ search: 'x', replace: 'y' }],
        }])
        expect(escape.success).toBe(false)
        expect(escape.error).toContain('escapes workspace')

        const absolute = applyChanges(workDir, [{
            filePath: '/etc/passwd',
            replace: [{ search: 'x', replace: 'y' }],
        }])
        expect(absolute.success).toBe(false)
        expect(absolute.error).toContain('escapes workspace')
    })

    it('rejects duplicate filePath entries (no silent overwrite)', () => {
        writeFile('src/a.ts', 'content\n')

        const result = applyChanges(workDir, [
            { filePath: 'src/a.ts', replace: [{ search: 'content', replace: 'x' }] },
            { filePath: 'src/a.ts', replace: [{ search: 'content', replace: 'y' }] },
        ])

        expect(result.success).toBe(false)
        expect(result.error).toContain('duplicate filePath')
        expect(readFileSync(join(workDir, 'src/a.ts'), 'utf-8')).toBe('content\n')
    })

    it('rejects overlapping search blocks ', () => {
        writeFile('src/a.ts', 'abcdef\n')

        const result = applyChanges(workDir, [{
            filePath: 'src/a.ts',
            replace: [
                { search: 'bc', replace: 'BC' },
                { search: 'cd', replace: 'CD' },
            ],
        }])

        expect(result.success).toBe(false)
        expect(result.error).toContain('overlapping')
        expect(readFileSync(join(workDir, 'src/a.ts'), 'utf-8')).toBe('abcdef\n')
    })

    it('rolls back applied files when a later write fails ', () => {
        writeFile('src/ok.ts', 'original content\n')
        // 文件充当目录块：src/block.txt/new.ts 的 mkdirSync 必然失败
        writeFile('src/block.txt', 'i am a file, not a dir')

        const result = applyChanges(workDir, [
            { filePath: 'src/ok.ts', replace: [{ search: 'original content', replace: 'MODIFIED' }] },
            { filePath: 'src/block.txt/new.ts', replace: [{ search: '', replace: 'x' }] },
        ])

        expect(result.success).toBe(false)
        expect(result.error).toContain('failed to write changes')
        // 第一个文件已回滚
        expect(readFileSync(join(workDir, 'src/ok.ts'), 'utf-8')).toBe('original content\n')
    })

    it('end-to-end: schema accepts empty-search new file, applier creates it ', () => {
        const parsed = parseAssessment(JSON.stringify({
            classification: 'code-change',
            summary: 'm',
            changes: [{ filePath: 'src/gen.ts', replace: [{ search: '', replace: '// generated\n' }] }],
            confidence: 0.9,
            rationale: '',
        }))

        expect(parsed.ok).toBe(true)
        if (parsed.ok) {
            const applied = applyChanges(workDir, parsed.value.changes)
            expect(applied.success).toBe(true)
            expect(readFileSync(join(workDir, 'src/gen.ts'), 'utf-8')).toBe('// generated\n')
        }
    })
})

describe('safeRelativePath', () => {
    it('normalizes windows separators', () => {
        expect(safeRelativePath('C:/base', 'packages\\web\\src\\a.ts')).toBe('packages/web/src/a.ts')
    })

    it('rejects traversal, absolute and empty paths', () => {
        expect(safeRelativePath('C:/base', '../x.ts')).toBeNull()
        expect(safeRelativePath('C:/base', 'a/../../x.ts')).toBeNull()
        expect(safeRelativePath('C:/base', '/abs/x.ts')).toBeNull()
        expect(safeRelativePath('C:/base', 'C:/other/x.ts')).toBeNull()
        expect(safeRelativePath('C:/base', '')).toBeNull()
    })

    it('accepts nested relative paths', () => {
        expect(safeRelativePath('C:/base', 'packages/web/src/a.ts')).toBe('packages/web/src/a.ts')
        expect(safeRelativePath('C:/base', 'a.ts')).toBe('a.ts')
    })
})

describe('buildVersionLockOverride', () => {
    it('builds versioned override for valid version', () => {
        expect(buildVersionLockOverride('vite', '5.4.14')).toEqual({ key: 'vite@5.4.14', value: '5.4.14' })
        expect(buildVersionLockOverride('@babel/traverse', '7.26.0'))
            .toEqual({ key: '@babel/traverse@7.26.0', value: '7.26.0' })
        expect(buildVersionLockOverride('vite', '5.4.14-beta.1'))
            .toEqual({ key: 'vite@5.4.14-beta.1', value: '5.4.14-beta.1' })
    })

    it('returns null for invalid versions', () => {
        expect(buildVersionLockOverride('vite', '')).toBeNull()
        expect(buildVersionLockOverride('vite', 'latest')).toBeNull()
        expect(buildVersionLockOverride('vite', '^5.4.0')).toBeNull()
        // 非锚定版本（YAML 注入面）
        expect(buildVersionLockOverride('vite', '5.4.14\nfoo: injected')).toBeNull()
        expect(buildVersionLockOverride('vite', '1.2.3.4')).toBeNull()
        // 非法包名
        expect(buildVersionLockOverride('../evil', '5.4.14')).toBeNull()
        expect(buildVersionLockOverride('a b', '5.4.14')).toBeNull()
    })
})

describe('buildWaitUpstreamNote', () => {
    it('includes summary and rationale', () => {
        const assessment: AiAssessment = {
            classification: 'wait-upstream',
            summary: '上游已修复但未发布',
            changes: [],
            confidence: 0.8,
            rationale: 'changelog 显示修复在下一个版本',
        }
        const note = buildWaitUpstreamNote(assessment)

        expect(note).toContain('### 等待上游修复')
        expect(note).toContain('上游已修复但未发布')
        expect(note).toContain('changelog 显示修复在下一个版本')
        expect(note).toContain('暂缓自动修复')
    })

    it('omits empty rationale section', () => {
        const assessment: AiAssessment = {
            classification: 'wait-upstream',
            summary: '等待',
            changes: [],
            confidence: 0.6,
            rationale: '',
        }
        const note = buildWaitUpstreamNote(assessment)

        expect(note).toContain('等待')
        expect(note).not.toContain('**依据**')
    })
})
