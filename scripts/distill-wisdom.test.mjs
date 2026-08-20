import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { classifySection, inferType, main, parseWisdom } from './distill-wisdom.mjs'

vi.mock('node:fs/promises', () => ({
    readFile: vi.fn(),
}))

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SCRIPT_PATH = path.join(__dirname, 'distill-wisdom.mjs')
const SCRIPT_URL = pathToFileURL(SCRIPT_PATH).href

// 关键：distill-wisdom.mjs 在模块顶层用 process.argv[1] 守卫触发 main()，
// 测试环境用 VITEST=1 sentinel 阻断顶层触发（vitest 自动设置 VITEST env），
// 测试体内显式 await main() 控制单次执行。
process.env.VITEST = '1'

describe('inferType', () => {
    it('infers env from Windows/行尾/环境关键词', () => {
        expect(inferType('Windows 行尾与 CRLF 陷阱')).toBe('env')
        expect(inferType('工具链版本固定')).toBe('env')
    })

    it('infers test from 测试/Review/门禁/验证/覆盖关键词', () => {
        expect(inferType('测试断言要精确到链路身份')).toBe('test')
        expect(inferType('Review Gate 双轮教训')).toBe('test')
        expect(inferType('覆盖率口径修正')).toBe('test')
    })

    it('infers pattern from 模式/纪律/惯例/机制关键词', () => {
        expect(inferType('任务粒度分批提交模式')).toBe('pattern')
        expect(inferType('幂等机制设计')).toBe('pattern')
    })

    it('infers decision from 决策/方案/演进/语义关键词', () => {
        expect(inferType('决策：双模调度方案')).toBe('decision')
        expect(inferType('语义演进方向')).toBe('decision')
    })

    it('infers bug from 修复/教训/陷阱/回归关键词', () => {
        expect(inferType('修复 jobId 冒号限制')).toBe('bug')
        expect(inferType('e2e 根因修复与教训')).toBe('bug')
    })

    it('infers baseline from 数据基线关键词', () => {
        // 注意：'规模演进' 含 '演进'（decision 关键词）且 decision 优先级更高，会推断为 decision
        expect(inferType('数据基线')).toBe('baseline')
    })

    it('returns unknown for unmatched titles', () => {
        expect(inferType('完全无关的标题内容')).toBe('unknown')
    })
})

describe('classifySection', () => {
    it('classifies active sections', () => {
        expect(classifySection('当前条目 (Active)')).toBe('active')
        expect(classifySection('当前条目')).toBe('active')
    })

    it('classifies historical sections', () => {
        expect(classifySection('已蒸馏条目 (Historical)')).toBe('historical')
        expect(classifySection('已蒸馏条目')).toBe('historical')
    })

    it('returns null for date group headings and other titles', () => {
        expect(classifySection('2026-08-12')).toBeNull()
        expect(classifySection('无关标题')).toBeNull()
    })
})

describe('parseWisdom', () => {
    it('parses the current format with entries, content lines and flush', () => {
        // 内容行（- **字段**）仅在存在 ## YYYY-MM-DD 日期分组时可收集
        // （parseWisdom 无日期分组时有意过滤非 ### / 非摘要行，见脚本注释）
        const content = [
            '## 当前条目 (Active)',
            '',
            '## 2026-08-12',
            '',
            '### 1. 测试断言要精确到链路身份',
            '- **场景**: 集成测试',
            '- **教训**: 不笼统断言"未调用"',
            '',
            '---',
            '',
            '### 2. 修复 jobId 冒号限制',
            '- **场景**: BullMQ',
            '',
        ].join('\n')
        const entries = parseWisdom(content)
        expect(entries).toHaveLength(2)
        expect(entries[0]).toMatchObject({
            title: '测试断言要精确到链路身份',
            isDistilled: false,
            lines: ['- **场景**: 集成测试', '- **教训**: 不笼统断言"未调用"'],
            type: 'test',
        })
        expect(entries[1]).toMatchObject({
            title: '修复 jobId 冒号限制',
            isDistilled: false,
            type: 'bug',
            lines: ['- **场景**: BullMQ'],
        })
    })

    it('parses distilled summary lines with migration target', () => {
        const content = [
            '## 当前条目 (Active)',
            '',
            '- [2026-08-10] [bug] 修复 jobId 冒号限制 → 详见 docs/design/governance/experience-archive.md',
            '',
            '## 已蒸馏条目 (Historical)',
            '',
            '- [2026-08-09] [pattern] 任务粒度分批提交 → 已迁移至 docs/standards/planning.md',
            '',
        ].join('\n')
        const entries = parseWisdom(content)
        expect(entries).toHaveLength(2)
        // Active 区的摘要行仍属活跃（已摘要化）；title 含尾随空格（正则非贪婪停在 → 前空格，真实行为）
        expect(entries[0]).toMatchObject({
            date: '2026-08-10',
            type: 'bug',
            title: '修复 jobId 冒号限制 ',
            target: 'docs/design/governance/experience-archive.md',
            isDistilled: false,
        })
        // Historical 区摘要行标记为已蒸馏
        expect(entries[1]).toMatchObject({
            date: '2026-08-09',
            type: 'pattern',
            title: '任务粒度分批提交 ',
            target: 'docs/standards/planning.md',
            isDistilled: true,
        })
    })

    it('supports old-format date group headings without section titles', () => {
        const content = [
            '## 2026-08-12',
            '',
            '### 3. 覆盖率口径修正',
            '- **内容**: include 扩展',
            '',
        ].join('\n')
        const entries = parseWisdom(content)
        expect(entries).toHaveLength(1)
        expect(entries[0]).toMatchObject({ date: '2026-08-12', title: '覆盖率口径修正', isDistilled: false })
    })

    it('defaults to active section when no section heading exists', () => {
        const content = [
            '### 1. Windows 行尾纪律',
            '- **内容**: CRLF',
            '',
        ].join('\n')
        const entries = parseWisdom(content)
        expect(entries).toHaveLength(1)
        expect(entries[0]).toMatchObject({ title: 'Windows 行尾纪律', isDistilled: false, type: 'env' })
    })

    it('ignores non-entry lines outside entries', () => {
        const content = [
            '## 当前条目 (Active)',
            '',
            '这是文件开头的说明文字，不应被解析为条目内容',
            '',
            '### 1. 有标题的条目',
            '',
        ].join('\n')
        const entries = parseWisdom(content)
        expect(entries).toHaveLength(1)
        expect(entries[0].title).toBe('有标题的条目')
        expect(entries[0].lines).toEqual([])
    })

    it('handles empty content', () => {
        expect(parseWisdom('')).toEqual([])
    })

    it('parses raw lines of a distilling entry before heading', () => {
        // 内容行收集需要日期分组上下文（同 current format 用例）
        const content = [
            '## 当前条目 (Active)',
            '',
            '## 2026-08-12',
            '',
            '### 1. 幂等机制设计',
            '- **字段**: 说明一',
            '普通文本行不收集',
            '- **字段**: 说明二',
            '',
            '### 2. 第二个条目',
            '',
        ].join('\n')
        const entries = parseWisdom(content)
        expect(entries).toHaveLength(2)
        expect(entries[0].lines).toEqual(['- **字段**: 说明一', '- **字段**: 说明二'])
    })

    it('inferType fills null types for distilled summary lines without type', () => {
        // 蒸馏行格式强制带 type，此用例验证非蒸馏条目的类型推断已在前面覆盖；
        // 这里验证 type 推断只对 null 生效（已蒸馏行的显式 type 不被覆盖）
        const content = [
            '## 已蒸馏条目 (Historical)',
            '',
            '- [2026-08-01] [decision] 方案选择 → 已迁移至 docs/design/',
            '',
        ].join('\n')
        const entries = parseWisdom(content)
        expect(entries[0].type).toBe('decision')
    })
})

/**
 * main() 集成测试：通过 vi.mock('node:fs/promises') 控制 readFile 返回，
 * 验证 CLI 参数解析（--check / --threshold=N）、错误处理（ENOENT）、
 * 报告生成各分支（typeCounts / hasKnownType / entry 输出 / distilled 输出）。
 *
 * 关键：distill-wisdom.mjs 在模块顶层用 process.argv[1] 守卫触发 main()，
 * 测试用 vi.resetModules + 动态 import 在每个测试体内设置 argv 后重新加载，
 * 避免顶层 main() 用上一次 argv 提前运行污染测试。
 */
describe('main()', () => {
    const originalArgv = process.argv

    /** 设置 argv + readFile mock，返回准备就绪的 main()（顶层守卫已被 VITEST 阻断） */
    const setupCall = (argv, readFileResult) => {
        process.argv = ['node', SCRIPT_URL, ...argv]
        if (readFileResult.ok) {
            vi.mocked(readFile).mockResolvedValueOnce(readFileResult.value)
        } else {
            const err = new Error(`mock-${readFileResult.value}`)
            err.code = readFileResult.value
            vi.mocked(readFile).mockRejectedValueOnce(err)
        }
    }

    let logSpy
    let errorSpy
    let exitSpy

    beforeEach(() => {
        // 每个测试独立建 spy（避免跨测试状态污染）
        logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
        errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
        exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined)
        vi.mocked(readFile).mockReset()
    })

    afterEach(() => {
        process.argv = originalArgv
        exitSpy?.mockRestore()
        logSpy?.mockRestore()
        errorSpy?.mockRestore()
    })

    it('--check mode: under threshold → WISDOM_OK', async () => {
        setupCall(['--check'], {
            ok: true,
            value: '## 当前条目 (Active)\n\n- [2026-08-10] [bug] 测试条目 → 详见 x.md\n',
        })
        await main()
        expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('WISDOM_OK'))
        expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('1 active entries'))
    })

    it('--check mode: at/over threshold → WISDOM_NEEDS_DISTILL', async () => {
        const lines = ['## 当前条目 (Active)']
        for (let i = 0; i < 20; i++) {
            lines.push(`- [2026-08-${(i + 1).toString().padStart(2, '0')}] [bug] 条目 ${i} → 详见 x.md`)
        }
        setupCall(['--check'], { ok: true, value: lines.join('\n') })
        await main()
        expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('WISDOM_NEEDS_DISTILL'))
    })

    it('--threshold=N custom value overrides default', async () => {
        const lines = ['## 当前条目 (Active)']
        for (let i = 0; i < 4; i++) {
            lines.push(`- [2026-08-${(i + 1).toString().padStart(2, '0')}] [bug] 条目 ${i} → 详见 x.md`)
        }
        setupCall(['--check', '--threshold=3'], { ok: true, value: lines.join('\n') })
        await main()
        expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('WISDOM_NEEDS_DISTILL'))
        expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('threshold=3'))
    })

    it('--threshold with invalid value falls back to default 20', async () => {
        setupCall(['--check', '--threshold=invalid'], {
            ok: true, value: '## 当前条目 (Active)\n',
        })
        await main()
        expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('threshold=20'))
    })

    it('ENOENT on readFile → exits 0 with skip message', async () => {
        process.argv = ['node', SCRIPT_URL]
        const mockErr = new Error('mock-ENOENT')
        mockErr.code = 'ENOENT'
        vi.mocked(readFile).mockRejectedValueOnce(mockErr)
        await main()
        expect(exitSpy).toHaveBeenCalledWith(0)
        expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('wisdom.md 不存在'))
    })

    it('non-ENOENT readFile error → re-thrown', async () => {
        vi.mocked(readFile).mockRejectedValueOnce(new Error('disk read failed'))
        await expect(main()).rejects.toThrow('disk read failed')
    })

    it('generates full report with all sections (active + historical + type counts)', async () => {
        const content = [
            '## 当前条目 (Active)',
            '',
            '## 2026-08-10',
            '',
            '### 1. 测试断言要精确到链路身份',
            '- **场景**: 集成测试',
            '',
            '---',
            '',
            '## 已蒸馏条目 (Historical)',
            '',
            '- [2026-08-09] [pattern] 任务粒度分批提交 → 已迁移至 docs/standards/planning.md',
            '',
        ].join('\n')
        setupCall([], { ok: true, value: content })
        await main()

        const report = logSpy.mock.calls.map((c) => String(c[0])).join('\n')
        expect(report).toContain('# Session Wisdom 蒸馏分析报告')
        expect(report).toContain('## 统计')
        expect(report).toContain('总条目:')
        expect(report).toContain('活跃条目')
        expect(report).toContain('已蒸馏条目')
        expect(report).toContain('日期跨度:')
        expect(report).toContain('## 按类型分布')
        // 注意：active 区只有 test 类型（来自 "测试"），pattern 来自 historical 区
        expect(report).toContain('**test**')
        expect(report).toContain('## 活跃条目详情')
        expect(report).toContain('## 已蒸馏条目')
        expect(report).toContain('## 阈值提示')
        expect(report).toContain('距离下次蒸馏阈值还有')
    })

    it('reports unknown type section when entries have no inferred type', async () => {
        const content = [
            '## 当前条目 (Active)',
            '',
            '### 1. 完全无关的标题内容',
            '- **内容**: x',
            '',
        ].join('\n')
        setupCall([], { ok: true, value: content })
        await main()

        const report = logSpy.mock.calls.map((c) => String(c[0])).join('\n')
        expect(report).toContain('**unknown**')
        expect(report).toContain('人工判断')
    })

    it('reports _无活跃条目_ when no active entries', async () => {
        const content = [
            '## 当前条目 (Active)',
            '',
            '## 已蒸馏条目 (Historical)',
            '',
            '- [2026-08-09] [bug] 仅已蒸馏 → 已迁移至 docs/x.md',
            '',
        ].join('\n')
        setupCall([], { ok: true, value: content })
        await main()

        const report = logSpy.mock.calls.map((c) => String(c[0])).join('\n')
        const noActiveCount = (report.match(/_无活跃条目_/g) ?? []).length
        expect(noActiveCount).toBeGreaterThanOrEqual(2)
    })
})
