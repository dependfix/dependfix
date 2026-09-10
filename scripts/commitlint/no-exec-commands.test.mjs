import { describe, expect, it } from 'vitest'
import plugin from './no-exec-commands.mjs'

const rule = plugin.rules['no-exec-commands']

/**
 * 构造 commitlint 解析后的 parsed 对象（模拟 commitlint --edit 行为）
 */
const parse = (subject, body) => ({
    header: subject,
    body: body || null,
    footer: null,
    type: subject.split(':')[0].split('(')[0].trim(),
    scope: null,
    subject,
})

describe('commitlint plugin: no-exec-commands', () => {
    it('合规 commit 应通过', async () => {
        const parsed = parse(
            'docs(plan): M27 阶段归档（5 原子条目 11 commits 已闭环）',
            'todo.md 主窗口清理：删除 M27 完整段 + 顶部 banner 改为已闭环\n关联 todo：M27 归档批次',
        )
        const [valid, message] = await rule(parsed, 'always')
        expect(valid).toBe(true)
        expect(message).toBe('')
    })

    it('主题含 pnpm run 应被拦截', async () => {
        const parsed = parse(
            'chore(ci): 修复 husky hook（pnpm run lint:md 失败）',
        )
        const [valid, message] = await rule(parsed, 'always')
        expect(valid).toBe(false)
        expect(message).toContain('pnpm run')
    })

    it('正文含 git rev-list 应被拦截', async () => {
        const parsed = parse(
            'docs(plan): ahead commits 实证',
            '通过 git rev-list HEAD ^origin/master --count 验证 ahead=11',
        )
        const [valid, message] = await rule(parsed, 'always')
        expect(valid).toBe(false)
        expect(message).toContain('git rev-list')
    })

    it('正文含 node scripts 应被拦截', async () => {
        const parsed = parse(
            'chore(scripts): 修复脚本',
            '通过 node scripts/check-docs.mjs 验证',
        )
        const [valid, message] = await rule(parsed, 'always')
        expect(valid).toBe(false)
        expect(message).toContain('node scripts/')
    })

    it('正文含 npx commitlint 应被拦截', async () => {
        const parsed = parse(
            'chore(husky): commit-msg hook',
            '通过 npx commitlint --edit "$1" 校验',
        )
        const [valid, message] = await rule(parsed, 'always')
        expect(valid).toBe(false)
        expect(message).toContain('npx commitlint')
    })

    it('正文含 $ pnpm 应被拦截（shell 形式）', async () => {
        const parsed = parse(
            'docs(plan): ahead 实证',
            '通过 $ pnpm run check:docs 验证',
        )
        const [valid, message] = await rule(parsed, 'always')
        expect(valid).toBe(false)
        expect(message).toContain('$ pnpm')
    })

    it('when=never 时插件不生效', async () => {
        const parsed = parse(
            'chore(ci): 含 pnpm run 但禁用规则',
            '通过 pnpm run check:docs 验证',
        )
        const [valid, message] = await rule(parsed, 'never')
        expect(valid).toBe(true)
        expect(message).toBe('')
    })

    it('空 body 应通过', async () => {
        const parsed = parse('feat(core): 新增模块')
        const [valid, message] = await rule(parsed, 'always')
        expect(valid).toBe(true)
        expect(message).toBe('')
    })
})
