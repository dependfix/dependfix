import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
    upsertRegressionWindowContent,
    upsertRegressionWindowEntry,
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

    it('已有受管块时新记录插入到其 start 标记之前（不嵌套进上一条记录）', () => {
        const existing = [
            '# 周期性回归日志窗口',
            '',
            '<!-- regression-window:start:periodic-regression:weekly:2026-11-09 -->',
            '## 2026-11-09 周级周期性回归（自动回填）',
            '',
            '旧内容',
            '',
            '<!-- regression-window:end:periodic-regression:weekly:2026-11-09 -->',
        ].join('\n')
        const nextEntry = { id: 'periodic-regression:weekly:2026-11-10', title: '2026-11-10 周级周期性回归（自动回填）', body: '新内容' }

        const result = upsertRegressionWindowContent(existing, nextEntry)

        // 新块整体位于旧块 start 标记之前 → 顶层，旧块标记成对且内容零改动
        const newBlockEnd = result.indexOf('<!-- regression-window:end:periodic-regression:weekly:2026-11-10 -->')
        const oldBlockStart = result.indexOf('<!-- regression-window:start:periodic-regression:weekly:2026-11-09 -->')
        expect(newBlockEnd).toBeGreaterThan(-1)
        expect(newBlockEnd).toBeLessThan(oldBlockStart)
        // 每个 start 标记在其 end 标记之前，且两两不交叉
        const starts = [...result.matchAll(/<!-- regression-window:start:([^ ]+) -->/gu)].map((m) => m[1])
        const ends = [...result.matchAll(/<!-- regression-window:end:([^ ]+) -->/gu)].map((m) => m[1])
        expect(starts).toEqual(['periodic-regression:weekly:2026-11-10', 'periodic-regression:weekly:2026-11-09'])
        expect(ends).toEqual(starts)
        expect(result).toContain('旧内容')
        expect(result.indexOf('旧内容')).toBeGreaterThan(oldBlockStart)
    })

    it('连续写入两个新记录 → 后者为顶层且内容位于前一条之前', () => {
        const first = upsertRegressionWindowContent('# 周期性回归日志窗口\n', {
            id: 'periodic-regression:weekly:2026-11-09',
            title: '2026-11-09 周级周期性回归（自动回填）',
            body: '第一条',
        })
        const second = upsertRegressionWindowContent(first, {
            id: 'periodic-regression:weekly:2026-11-10',
            title: '2026-11-10 周级周期性回归（自动回填）',
            body: '第二条',
        })
        // 新记录在文件顶部（仅位于全局标题之后），旧记录完整保留在下方
        expect(second.indexOf('第二条')).toBeLessThan(second.indexOf('第一条'))
        expect(second.match(/^## /gmu)).toHaveLength(2)
        // 受管块不交叉：第二条的 end 在第一条的 start 之前
        expect(second.indexOf('<!-- regression-window:end:periodic-regression:weekly:2026-11-10 -->'))
            .toBeLessThan(second.indexOf('<!-- regression-window:start:periodic-regression:weekly:2026-11-09 -->'))
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
    it('指向 artifacts/regression/current.md（不再写入 docs/）', () => {
        const result = resolveRegressionWindowPath('/project')
        expect(result).toBe('/project/artifacts/regression/current.md')
        expect(result).not.toContain('docs/reports')
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

describe('upsertRegressionWindowEntry', () => {
    it('目录与文件缺失时自动创建并写入记录', async () => {
        const projectRoot = await mkdtemp(path.join(tmpdir(), 'dependfix-regression-window-'))
        try {
            const entry = { id: 'auto-1', title: '2026-10-27 自动初始化', body: 'body' }
            const { regressionWindowPath } = await upsertRegressionWindowEntry(entry, { projectRoot })
            expect(regressionWindowPath).toBe(resolveRegressionWindowPath(projectRoot))
            const content = await readFile(regressionWindowPath, 'utf8')
            expect(content).toContain('<!-- regression-window:start:auto-1 -->')
            expect(content).toContain('2026-10-27 自动初始化')
        } finally {
            await rm(projectRoot, { recursive: true, force: true })
        }
    })
})
