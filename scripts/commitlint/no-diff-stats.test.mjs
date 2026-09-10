import { describe, expect, it } from 'vitest'
import plugin from './no-diff-stats.mjs'

const rule = plugin.rules['no-diff-stats']

const parse = (subject, body) => ({
    header: subject,
    body: body || null,
    footer: null,
    type: subject.split(':')[0].split('(')[0].trim(),
    scope: null,
    subject,
})

describe('commitlint plugin: no-diff-stats', () => {
    it('合规 commit 应通过', async () => {
        const parsed = parse(
            'docs(plan): M27 阶段归档（5 原子条目 11 commits 已闭环）',
            'todo.md 主窗口清理：删除 M27 完整段\n关联 todo：M27 归档批次',
        )
        const [valid, message] = await rule(parsed, 'always')
        expect(valid).toBe(true)
        expect(message).toBe('')
    })

    it('正文含 `+189/-3` 应被拦截', async () => {
        const parsed = parse(
            'feat(platform): 修复 bug',
            '本次改动 +189/-3',
        )
        const [valid, message] = await rule(parsed, 'always')
        expect(valid).toBe(false)
        expect(message).toContain('+189/-3')
    })

    it('正文含 `~3240 行净增` 应被拦截', async () => {
        const parsed = parse(
            'docs(plan): M26 归档',
            'M26 段 ~3240 行净增',
        )
        const [valid, message] = await rule(parsed, 'always')
        expect(valid).toBe(false)
        expect(message).toContain('3240')
    })

    it('正文含 `4 files changed` 应被拦截', async () => {
        const parsed = parse(
            'feat(platform): 改动',
            '本次改动：4 files changed',
        )
        const [valid, message] = await rule(parsed, 'always')
        expect(valid).toBe(false)
        expect(message).toContain('4 files changed')
    })

    it('正文含 `36 commits` 应被拦截', async () => {
        const parsed = parse(
            'docs(plan): M26 归档',
            'M26 全部 36 commits 已 ahead=0 推 origin/master',
        )
        const [valid, message] = await rule(parsed, 'always')
        expect(valid).toBe(false)
        expect(message).toContain('36 commits')
    })

    it('主题含 commit hash 短引用不应被拦截', async () => {
        const parsed = parse('docs(plan): M27 归档 `357f6ec`')
        const [valid, message] = await rule(parsed, 'always')
        expect(valid).toBe(true)
        expect(message).toBe('')
    })

    it('when=never 时插件不生效', async () => {
        const parsed = parse(
            'chore(ci): 含 +N/-M 但禁用规则',
            '本次改动 +100/-50',
        )
        const [valid, message] = await rule(parsed, 'never')
        expect(valid).toBe(true)
        expect(message).toBe('')
    })
})
