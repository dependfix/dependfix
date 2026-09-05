import { describe, expect, it } from 'vitest'
import {
    upsertRegressionWindowContent,
    toPosixRelativePath,
    resolveRegressionWindowPath,
} from './regression-window.mjs'

describe('upsertRegressionWindowContent', () => {
    const entry = { id: 'test-1', title: '2026-09-05 测试标题', body: '测试内容' }

    it('空内容时追加记录块', () => {
        const result = upsertRegressionWindowContent('', entry)
        expect(result).toContain('<!-- regression-window:start:test-1 -->')
        expect(result).toContain('## 2026-09-05 测试标题')
        expect(result).toContain('测试内容')
        expect(result).toContain('<!-- regression-window:end:test-1 -->')
    })

    it('仅有空白内容时追加记录块', () => {
        const result = upsertRegressionWindowContent('   \n  ', entry)
        expect(result).toContain('<!-- regression-window:start:test-1 -->')
        expect(result).toContain('## 2026-09-05 测试标题')
    })

    it('已有记录时替换同 ID 记录', () => {
        const initial = [
            '# 回归日志',
            '',
            '<!-- regression-window:start:test-1 -->',
            '## 旧标题',
            '',
            '旧内容',
            '',
            '<!-- regression-window:end:test-1 -->',
            '',
        ].join('\n')
        const updatedEntry = { id: 'test-1', title: '2026-09-05 新标题', body: '新内容' }
        const result = upsertRegressionWindowContent(initial, updatedEntry)
        expect(result).toContain('## 2026-09-05 新标题')
        expect(result).toContain('新内容')
        expect(result).not.toContain('旧标题')
        expect(result).not.toContain('旧内容')
    })

    it('在已有记录前插入新记录', () => {
        const existing = [
            '# 回归日志',
            '',
            '## 2026-09-01 旧记录',
            '',
            '旧内容',
            '',
        ].join('\n')
        const result = upsertRegressionWindowContent(existing, entry)
        expect(result).toContain('<!-- regression-window:start:test-1 -->')
        expect(result).toContain('## 2026-09-05 测试标题')
        const newIndex = result.indexOf('## 2026-09-05 测试标题')
        const oldIndex = result.indexOf('## 2026-09-01 旧记录')
        expect(newIndex).toBeLessThan(oldIndex)
    })

    it('多个已有记录时在第一条前插入', () => {
        const existing = [
            '# 回归日志',
            '',
            '## 2026-09-01 第一条',
            '',
            '内容1',
            '',
            '## 2026-09-02 第二条',
            '',
            '内容2',
            '',
        ].join('\n')
        const result = upsertRegressionWindowContent(existing, entry)
        const newIndex = result.indexOf('## 2026-09-05 测试标题')
        const firstIndex = result.indexOf('## 2026-09-01 第一条')
        expect(newIndex).toBeLessThan(firstIndex)
    })

    it('尾部多余空白被清理', () => {
        const result = upsertRegressionWindowContent('some content   \n\n\n', entry)
        expect(result.endsWith('\n')).toBe(true)
    })

    it('替换后清理尾部空白', () => {
        const initial = [
            '<!-- regression-window:start:test-1 -->',
            '## 旧标题',
            '',
            '旧内容',
            '<!-- regression-window:end:test-1 -->',
            '',
        ].join('\n')
        const result = upsertRegressionWindowContent(initial, entry)
        expect(result.endsWith('\n')).toBe(true)
    })

    it('保留正文内容周围的空行', () => {
        const entryWithBody = { id: 'b1', title: 'Title', body: '第一行\n第二行' }
        const result = upsertRegressionWindowContent('', entryWithBody)
        expect(result).toContain('第一行\n第二行')
    })

    it('正文尾部空白被 trim', () => {
        const entryWithTrailing = { id: 'b2', title: 'Title', body: '内容  \n\n  ' }
        const result = upsertRegressionWindowContent('', entryWithTrailing)
        expect(result).toContain('内容')
        expect(result).not.toMatch(/内容\s{3,}/)
    })
})

describe('toPosixRelativePath', () => {
    it('将路径分隔符转换为 POSIX 格式', () => {
        const result = toPosixRelativePath('/a/b/c.txt', '/a/b/d.txt')
        expect(result).toBe('d.txt')
        expect(result).not.toContain('\\')
    })

    it('计算相对路径', () => {
        const result = toPosixRelativePath('/a/b/c.txt', '/a/d/e.txt')
        expect(result).toBe('../d/e.txt')
    })

    it('同目录文件', () => {
        const result = toPosixRelativePath('/x/y/a.ts', '/x/y/b.ts')
        expect(result).toBe('b.ts')
    })

    it('跨多级目录', () => {
        const result = toPosixRelativePath('/root/project/src/file.ts', '/root/project/docs/guide.md')
        expect(result).toBe('../docs/guide.md')
    })
})

describe('resolveRegressionWindowPath', () => {
    it('返回包含 regression/current.md 的路径', () => {
        const result = resolveRegressionWindowPath('/project')
        expect(result).toContain('regression')
        expect(result).toContain('current.md')
    })

    it('使用绝对路径', () => {
        const result = resolveRegressionWindowPath('/project')
        expect(result.startsWith('/')).toBe(true)
    })

    it('默认使用 cwd', () => {
        const result = resolveRegressionWindowPath()
        expect(result).toContain('current.md')
    })
})
