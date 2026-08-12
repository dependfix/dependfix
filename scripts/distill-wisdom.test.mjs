import { describe, expect, it } from 'vitest'
import { classifySection, inferType, parseWisdom } from './distill-wisdom.mjs'

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
