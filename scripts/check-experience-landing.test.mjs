/**
 * check-experience-landing 测试：落点字段非空校验（含占位符判空与两种落点形态）。
 */
import { describe, expect, it } from 'vitest'
import { checkShardText, PLACEHOLDER_RE } from './check-experience-landing.mjs'

describe('checkShardText', () => {
    it('显式 `落点：` 非空 → 通过', () => {
        const md = '## 一、主题\n- **结论**：x\n- **落点**：platform.md §6.2；code-auditor 必查项\n'
        expect(checkShardText(md)).toEqual([])
    })

    it('占位符落点 → 判为空（防假通过）', () => {
        const md = '## 一、主题\n- **落点**：（见对应规范条款）\n'
        expect(checkShardText(md)).toHaveLength(1)
        expect(checkShardText(md)[0]).toMatchObject({ heading: '一、主题', reason: '落点为空或缺失' })
    })

    it('`### 挂接治理检查点` 段内有内容 → 通过', () => {
        const md = '## 一、主题\n### 挂接治理检查点\n1. `docs/standards/git.md` §3.7\n'
        expect(checkShardText(md)).toEqual([])
    })

    it('`### 沉淀` 段内为空 → 不通过', () => {
        const md = '## 一、主题\n### 沉淀\n\n## 二、主题\n- **落点**：x.md\n'
        expect(checkShardText(md).map((m) => m.heading)).toEqual(['一、主题'])
    })

    it('挂接段内为占位符 → 判为空（与显式落点口径对称）', () => {
        const md = '## 一、主题\n### 挂接治理检查点\n（见对应规范条款）\n'
        expect(checkShardText(md)).toHaveLength(1)
    })

    it('完全无落点 → 命中并给出行号', () => {
        const md = '## 一、主题\n- **结论**：x\n'
        const [m] = checkShardText(md)
        expect(m).toMatchObject({ heading: '一、主题', line: 1 })
    })

    it('多条目混合场景逐条判定', () => {
        const md = [
            '## 一、A',
            '- **落点**：a.md',
            '## 二、B',
            '- **结论**：无落点',
            '## 三、C',
            '### 挂接治理检查点',
            '- `.github/agents/code-auditor.agent.md` 必查项',
        ].join('\n')
        expect(checkShardText(md).map((m) => m.heading)).toEqual(['二、B'])
    })
})

describe('PLACEHOLDER_RE', () => {
    it('识别常见占位与空值', () => {
        expect(PLACEHOLDER_RE.test('（见对应规范条款）')).toBe(true)
        expect(PLACEHOLDER_RE.test('(见对应规范条款)')).toBe(true)
        expect(PLACEHOLDER_RE.test('-')).toBe(true)
        expect(PLACEHOLDER_RE.test('platform.md §6.2')).toBe(false)
    })
})
