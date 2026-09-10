import { describe, expect, it } from 'vitest'
import plugin from './no-filler-phrases.mjs'

const rule = plugin.rules['no-filler-phrases']

const parse = (subject, body) => ({
    header: subject,
    body: body || null,
    footer: null,
    type: subject.split(':')[0].split('(')[0].trim(),
    scope: null,
    subject,
})

describe('commitlint plugin: no-filler-phrases', () => {
    it('合规 commit 应通过', async () => {
        const parsed = parse(
            'docs(plan): M27 阶段归档（5 原子条目 11 commits 已闭环）',
            'todo.md 主窗口清理：删除 M27 完整段\n关联 todo：M27 归档批次',
        )
        const [valid, message] = await rule(parsed, 'always')
        expect(valid).toBe(true)
        expect(message).toBe('')
    })

    it('正文含 "确切路径需源码进一步实证" 应被拦截', async () => {
        const parsed = parse(
            'chore(deps): 更新',
            '某个函数位置：确切路径需源码进一步实证',
        )
        const [valid, message] = await rule(parsed, 'always')
        expect(valid).toBe(false)
        expect(message).toContain('确切路径需源码进一步实证')
    })

    it('正文含 "建议下次 neat-freak 批次" 应被拦截', async () => {
        const parsed = parse(
            'docs(plan): 归档',
            'A 阶段审计：建议下次 neat-freak 批次考虑',
        )
        const [valid, message] = await rule(parsed, 'always')
        expect(valid).toBe(false)
        expect(message).toContain('建议下次 neat-freak 批次')
    })

    it('正文含 "未来可作 CI 强制门禁" 应被拦截', async () => {
        const parsed = parse(
            'chore(ci): lint:css:check',
            'lint:css:check 未来可作 CI 强制门禁',
        )
        const [valid, message] = await rule(parsed, 'always')
        expect(valid).toBe(false)
        expect(message).toContain('未来可作')
    })

    it('正文含 "留 M27+ 评估" 应被拦截', async () => {
        const parsed = parse(
            'docs(plan): 归档',
            'audit suggest 留 M27+ 评估',
        )
        const [valid, message] = await rule(parsed, 'always')
        expect(valid).toBe(false)
        expect(message).toContain('留 M27+')
    })

    it('正文含 "建议下批" 应被拦截', async () => {
        const parsed = parse(
            'docs(plan): 归档',
            '建议下批 neat-freak 治理 ahead commits',
        )
        const [valid, message] = await rule(parsed, 'always')
        expect(valid).toBe(false)
        expect(message).toContain('建议下批')
    })

    it('when=never 时插件不生效', async () => {
        const parsed = parse(
            'chore(deps): 含废话但禁用规则',
            '确切路径需源码进一步实证',
        )
        const [valid, message] = await rule(parsed, 'never')
        expect(valid).toBe(true)
        expect(message).toBe('')
    })
})
