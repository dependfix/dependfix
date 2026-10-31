import { readFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applyAnchorRewrites, planAnchorRewrites } from './migrate-anchors.mjs'

let root

beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'migrate-anchors-test-'))
})

afterEach(() => {
    rmSync(root, { recursive: true, force: true })
})

const write = (rel, content) => {
    const file = join(root, rel)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, content)
}

const read = (rel) => readFileSync(join(root, rel), 'utf8')

describe('planAnchorRewrites', () => {
    it('把 GitHub 口径锚点改写为产物 id（保留路径与链接文本）', () => {
        write('target.md', '## 3.1 新需求默认走"评估 → backlog"原则（hard requirement）\n')
        write('a.md', '[规划规范 §3.1](./target.md#31-新需求默认走评估--backlog原则hard-requirement)\n')
        const plan = planAnchorRewrites(root)
        expect(plan.unmatched).toEqual([])
        expect(plan.ambiguous).toEqual([])
        expect(plan.rewrites).toHaveLength(1)
        expect(plan.rewrites[0]).toMatchObject({
            file: 'a.md',
            path: './target.md',
            from: '31-新需求默认走评估--backlog原则hard-requirement',
            to: '_3-1-新需求默认走-评估-→-backlog-原则-hard-requirement',
            kind: 'rewrite',
        })
    })

    it('已是产物 id：不产生改写（幂等）', () => {
        write('target.md', '## 5.6 交付闸门\n')
        write('a.md', '[闸门](target.md#_5-6-交付闸门)\n')
        expect(planAnchorRewrites(root).rewrites).toEqual([])
    })

    it('同一标题重复时按 id 精确认定（不判为歧义）', () => {
        write('target.md', ['## 待迁移经验（候选）', '## 待迁移经验（候选）'].join('\n'))
        write('a.md', '[一](target.md#待迁移经验-候选-1)\n')
        const plan = planAnchorRewrites(root)
        expect(plan.ambiguous).toEqual([])
        expect(plan.rewrites).toEqual([])
    })

    it('宽松多命中且非精确 id：记为 ambiguous 不改写', () => {
        write('target.md', ['## 待迁移经验（候选）', '## 待迁移经验（候选）'].join('\n'))
        write('a.md', '[一](target.md#待迁移经验候选)\n')
        const plan = planAnchorRewrites(root)
        expect(plan.rewrites).toEqual([])
        expect(plan.ambiguous).toHaveLength(1)
    })

    it('历史截断锚点按唯一前缀匹配改写并标记 prefix', () => {
        write('target.md', '## 五十六、M24.1 PR Check 状态监测（2026-09-03，commits `abc / def`）\n')
        write('a.md', '[一](target.md#五十六m241-pr-check-状态监测2026-09-03commits)\n')
        const plan = planAnchorRewrites(root)
        expect(plan.rewrites).toHaveLength(1)
        expect(plan.rewrites[0].kind).toBe('prefix')
        expect(plan.rewrites[0].to).toBe('五十六、m24-1-pr-check-状态监测-2026-09-03-commits-abc-def')
    })

    it('file-dead 目标跳过（归档既有豁免）', () => {
        write('a.md', '[一](missing.md#whatever)\n')
        const plan = planAnchorRewrites(root)
        expect(plan.rewrites).toEqual([])
        expect(plan.unmatched).toEqual([])
    })

    it('fenced code block 与行内代码里的链接不参与', () => {
        write('target.md', '## 5.6 交付闸门\n')
        write('a.md', ['```md', '[一](target.md#56-交付闸门)', '```', '`[一](target.md#56-交付闸门)`'].join('\n'))
        expect(planAnchorRewrites(root).rewrites).toEqual([])
    })

    it('资源类目标（非 .md）的锚点不进清单', () => {
        write('a.md', '[图](x.png#frag)\n')
        const plan = planAnchorRewrites(root)
        expect(plan.rewrites).toEqual([])
        expect(plan.unmatched).toEqual([])
    })
})

describe('applyAnchorRewrites', () => {
    it('只替换锚点段：路径前缀、收尾括号与行内后续文本逐字保留', () => {
        write('docs/standards/planning.md', '## 3.1 新需求默认走"评估 → backlog"原则（hard requirement）\n')
        write('a.md', '见 [规划规范 §3.1](./docs/standards/planning.md#31-新需求默认走评估--backlog原则hard-requirement)。\n')
        const plan = planAnchorRewrites(root)
        const written = applyAnchorRewrites(root, plan.rewrites)
        expect(written).toEqual({ files: 1, rewrites: 1 })
        expect(read('a.md')).toBe(
            '见 [规划规范 §3.1](./docs/standards/planning.md#_3-1-新需求默认走-评估-→-backlog-原则-hard-requirement)。\n',
        )
    })

    it('同一行多个链接各自改写，互不串位', () => {
        write('target.md', ['## 5.1 工程实践规则', '## 5.2 交付闸门'].join('\n'))
        write('a.md', '[甲](target.md#51-工程实践规则) + [乙](target.md#52-交付闸门) 末\n')
        applyAnchorRewrites(root, planAnchorRewrites(root).rewrites)
        expect(read('a.md')).toBe('[甲](target.md#_5-1-工程实践规则) + [乙](target.md#_5-2-交付闸门) 末\n')
    })

    it('代码块内的同形链接不被改写（plan / apply 同口径）', () => {
        write('target.md', '## 5.6 交付闸门\n')
        write('a.md', ['[正文](target.md#56-交付闸门)', '```md', '[示例](target.md#56-交付闸门)', '```'].join('\n'))
        const plan = planAnchorRewrites(root)
        expect(plan.rewrites).toHaveLength(1)
        applyAnchorRewrites(root, plan.rewrites)
        expect(read('a.md')).toBe(['[正文](target.md#_5-6-交付闸门)', '```md', '[示例](target.md#56-交付闸门)', '```'].join('\n'))
    })

    it('CRLF 文件保持 CRLF', () => {
        write('target.md', '## 5.6 交付闸门\r\n')
        write('a.md', '[一](target.md#56-交付闸门)\r\n')
        applyAnchorRewrites(root, planAnchorRewrites(root).rewrites)
        expect(read('a.md')).toBe('[一](target.md#_5-6-交付闸门)\r\n')
    })

    it('改写后再次规划为空（幂等）', () => {
        write('target.md', '## 5.6 交付闸门\n')
        write('a.md', '[一](target.md#56-交付闸门)\n')
        applyAnchorRewrites(root, planAnchorRewrites(root).rewrites)
        expect(planAnchorRewrites(root).rewrites).toEqual([])
    })
})
