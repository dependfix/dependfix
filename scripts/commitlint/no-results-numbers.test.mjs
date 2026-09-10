import { describe, expect, it } from 'vitest'
import plugin from './no-results-numbers.mjs'

const rule = plugin.rules['no-results-numbers']

const parse = (subject, body) => ({
    header: subject,
    body: body || null,
    footer: null,
    type: subject.split(':')[0].split('(')[0].trim(),
    scope: null,
    subject,
})

describe('commitlint plugin: no-results-numbers', () => {
    it('合规 commit 应通过', async () => {
        const parsed = parse(
            'docs(plan): M27 阶段归档（5 原子条目 11 commits 已闭环）',
            'todo.md 主窗口清理：删除 M27 完整段\n关联 todo：M27 归档批次',
        )
        const [valid, message] = await rule(parsed, 'always')
        expect(valid).toBe(true)
        expect(message).toBe('')
    })

    it('正文含 `0 error` 应被拦截', async () => {
        const parsed = parse(
            'chore(ci): husky hook',
            'pnpm run lint:md 0 error 全部通过',
        )
        const [valid, message] = await rule(parsed, 'always')
        expect(valid).toBe(false)
        expect(message).toContain('0 error')
    })

    it('正文含 `EXIT=0` 应被拦截', async () => {
        const parsed = parse(
            'chore(ci): husky hook',
            '运行测试后 EXIT=0',
        )
        const [valid, message] = await rule(parsed, 'always')
        expect(valid).toBe(false)
        expect(message).toContain('EXIT=0')
    })

    it('正文含 `0 blocker / 3 warning / 2 suggest` 应被拦截', async () => {
        const parsed = parse(
            'docs(plan): audit 结论',
            'A 阶段审计：code-auditor quick depth Pass（0 blocker / 3 warning / 2 suggest）',
        )
        const [valid, message] = await rule(parsed, 'always')
        expect(valid).toBe(false)
        expect(message).toContain('执行结果数字')
    })

    it('正文含 `80%` 应被拦截（coverage 数字）', async () => {
        const parsed = parse(
            'test(platform): 补测',
            '全量 coverage Branches 80% 恢复阈值',
        )
        const [valid, message] = await rule(parsed, 'always')
        expect(valid).toBe(false)
        expect(message).toContain('80%')
    })

    it('正文含 `1199 passed` 应被拦截', async () => {
        const parsed = parse(
            'test(platform): 补测',
            'test 1199 passed / 7 skipped 验证',
        )
        const [valid, message] = await rule(parsed, 'always')
        expect(valid).toBe(false)
        expect(message).toContain('1199 passed')
    })

    it('主题含 commit hash 短引用不应被拦截', async () => {
        // 注：本插件只检查 body + footer，不检查 header，所以主题中的 commit hash 不会被拦截
        const parsed = parse('docs(plan): M27 归档批次闭环 `357f6ec`')
        const [valid, message] = await rule(parsed, 'always')
        expect(valid).toBe(true)
        expect(message).toBe('')
    })

    it('正文含 commit hash 引用（如 `关联 commit：357f6ec`）不应被拦截', async () => {
        // commit hash 是 hex 字符串，正则不会匹配（除非数字上下文）
        const parsed = parse(
            'docs(plan): M27 归档',
            '关联 commit：357f6ec docs(plan) M27 归档',
        )
        const [valid, message] = await rule(parsed, 'always')
        expect(valid).toBe(true)
        expect(message).toBe('')
    })

    it('when=never 时插件不生效', async () => {
        const parsed = parse(
            'chore(ci): 含 0 error 但禁用规则',
            '0 error 全部通过',
        )
        const [valid, message] = await rule(parsed, 'never')
        expect(valid).toBe(true)
        expect(message).toBe('')
    })
})
