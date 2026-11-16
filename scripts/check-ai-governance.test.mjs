/**
 * check-ai-governance 测试：6 条规则的通过与失败形态 + 边界（空目录 / 无 references / 软链缺失仅 warning）。
 */
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
    checkAgents,
    checkAiGovernance,
    checkAssetLinks,
    checkPlatformCopies,
    checkSkills,
    parseFrontmatter,
    RULE_COUNT,
} from './check-ai-governance.mjs'

const roots = []

function makeRoot() {
    const root = mkdtempSync(join(tmpdir(), 'ai-governance-'))
    roots.push(root)
    return root
}

function write(root, path, content) {
    const file = join(root, path)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, content)
}

function writeSkill(root, name, { internal = true, frontmatterName = name, description = '测试技能描述' } = {}) {
    const lines = ['---', `name: ${frontmatterName}`, `description: ${description}`]
    if (internal) {
        lines.push('metadata:', '  internal: true')
    }
    lines.push('---', '', '# 技能')
    write(root, `.github/skills/${name}/SKILL.md`, `${lines.join('\n')}\n`)
}

function writeAgent(root, name, { frontmatterName = '测试 Agent', description = '测试 agent 描述' } = {}) {
    write(
        root,
        `.github/agents/${name}.agent.md`,
        `---\nname: ${frontmatterName}\ndescription: ${description}\n---\n\n# Agent\n`,
    )
}

function linkPlatformCopies(root) {
    for (const platform of ['.claude', '.agents', '.opencode']) {
        mkdirSync(join(root, platform), { recursive: true })
        for (const kind of ['agents', 'skills']) {
            symlinkSync(join('..', '.github', kind), join(root, platform, kind), 'junction')
        }
    }
}

afterEach(() => {
    while (roots.length > 0) {
        rmSync(roots.pop(), { recursive: true, force: true })
    }
})

describe('parseFrontmatter', () => {
    it('解析顶层标量与一层 metadata', () => {
        const parsed = parseFrontmatter('---\nname: x\ndescription: "y"\nmetadata:\n  internal: true\n---\n正文\n')
        expect(parsed?.data).toEqual({ name: 'x', description: 'y', metadata: { internal: 'true' } })
        expect(parsed?.endLine).toBe(6)
    })

    it('无 frontmatter 返回 null', () => {
        expect(parseFrontmatter('# 标题\n')).toBeNull()
    })
})

describe('checkSkills', () => {
    it('命名、description、metadata 齐备 → 通过', () => {
        const root = makeRoot()
        writeSkill(root, 'demo-skill')
        expect(checkSkills(root).errors).toEqual([])
    })

    it('name 与目录不一致 → 报错', () => {
        const root = makeRoot()
        writeSkill(root, 'demo-skill', { frontmatterName: 'other-skill' })
        expect(checkSkills(root).errors.map((e) => e.message)).toContain(
            'frontmatter name (other-skill) 与目录名不一致',
        )
    })

    it('缺少 metadata.internal → 报错', () => {
        const root = makeRoot()
        writeSkill(root, 'demo-skill', { internal: false })
        expect(checkSkills(root).errors.map((e) => e.message)).toContain('缺少 metadata.internal: true')
    })

    it('description 为空 → 报错', () => {
        const root = makeRoot()
        writeSkill(root, 'demo-skill', { description: '' })
        expect(checkSkills(root).errors.map((e) => e.message)).toContain('frontmatter description 为空')
    })

    it('目录名不是 kebab-case → 报错', () => {
        const root = makeRoot()
        writeSkill(root, 'Demo_Skill')
        expect(checkSkills(root).errors.some((e) => e.message.includes('不是 kebab-case'))).toBe(true)
    })

    it('references 文件未被 SKILL.md 引用 → 报错；无 references 目录 → 通过', () => {
        const root = makeRoot()
        writeSkill(root, 'demo-skill')
        write(root, '.github/skills/demo-skill/references/orphan.md', '# 孤儿\n')
        expect(checkSkills(root).errors.map((e) => e.message)).toContain('references 文件未被引用: references/orphan.md')

        const root2 = makeRoot()
        writeSkill(root2, 'demo-skill')
        expect(checkSkills(root2).errors).toEqual([])
    })

    it('references 被文件名引用即通过', () => {
        const root = makeRoot()
        writeSkill(root, 'demo-skill')
        write(root, '.github/skills/demo-skill/references/list.md', '# 清单\n')
        write(root, '.github/skills/demo-skill/SKILL.md', '---\nname: demo-skill\ndescription: d\nmetadata:\n  internal: true\n---\n\n见 list.md\n')
        expect(checkSkills(root).errors).toEqual([])
    })

    it('references 内索引文档引用即通过', () => {
        const root = makeRoot()
        writeSkill(root, 'demo-skill')
        write(root, '.github/skills/demo-skill/references/README.md', '见 [清单](list.md)\n')
        write(root, '.github/skills/demo-skill/references/list.md', '# 清单\n')
        write(
            root,
            '.github/skills/demo-skill/SKILL.md',
            '---\nname: demo-skill\ndescription: d\nmetadata:\n  internal: true\n---\n\n见 references/README.md\n',
        )
        expect(checkSkills(root).errors).toEqual([])
    })

    it('裸子串不互相顶替（security-checklist.md 不能替 checklist.md 过审）', () => {
        const root = makeRoot()
        writeSkill(root, 'demo-skill')
        write(root, '.github/skills/demo-skill/references/checklist.md', '# 清单\n')
        write(
            root,
            '.github/skills/demo-skill/SKILL.md',
            '---\nname: demo-skill\ndescription: d\nmetadata:\n  internal: true\n---\n\n见 security-checklist.md\n',
        )
        expect(checkSkills(root).errors.map((e) => e.message)).toContain('references 文件未被引用: references/checklist.md')
    })

    it('不同子目录同名 references 不互相顶替', () => {
        const root = makeRoot()
        writeSkill(root, 'demo-skill')
        write(root, '.github/skills/demo-skill/references/a/x.md', '# A\n')
        write(root, '.github/skills/demo-skill/references/b/x.md', '# B\n')
        write(
            root,
            '.github/skills/demo-skill/SKILL.md',
            '---\nname: demo-skill\ndescription: d\nmetadata:\n  internal: true\n---\n\n见 references/a/x.md\n',
        )
        expect(checkSkills(root).errors.map((e) => e.message)).toContain('references 文件未被引用: references/b/x.md')
    })

    it('带锚点 / 全角括号 / 逗号的引用写法可识别', () => {
        const root = makeRoot()
        writeSkill(root, 'demo-skill')
        write(root, '.github/skills/demo-skill/references/a.md', '# A\n')
        write(root, '.github/skills/demo-skill/references/b.md', '# B\n')
        write(root, '.github/skills/demo-skill/references/c.md', '# C\n')
        write(
            root,
            '.github/skills/demo-skill/SKILL.md',
            '---\nname: demo-skill\ndescription: d\nmetadata:\n  internal: true\n---\n\n[a](./references/a.md#段)\n\n（references/b.md）\n\n见 references/c.md,\n',
        )
        expect(checkSkills(root).errors).toEqual([])
    })

    it('references 互引孤岛不算已引用', () => {
        const root = makeRoot()
        writeSkill(root, 'demo-skill')
        write(root, '.github/skills/demo-skill/references/a.md', '[b](b.md)\n')
        write(root, '.github/skills/demo-skill/references/b.md', '[a](a.md)\n')
        const messages = checkSkills(root).errors.map((e) => e.message)
        expect(messages).toContain('references 文件未被引用: references/a.md')
        expect(messages).toContain('references 文件未被引用: references/b.md')
    })

    it('空目录 / 缺少 SKILL.md → 空目录通过、缺文件报错', () => {
        const root = makeRoot()
        expect(checkSkills(root).errors).toEqual([])
        mkdirSync(join(root, '.github/skills/empty-skill'), { recursive: true })
        expect(checkSkills(root).errors.map((e) => e.message)).toContain('缺少 SKILL.md')
    })
})

describe('checkAgents', () => {
    it('kebab-case 文件名 + name/description 非空 → 通过', () => {
        const root = makeRoot()
        writeAgent(root, 'demo-agent')
        expect(checkAgents(root).errors).toEqual([])
    })

    it('文件名非 kebab-case 与 description 为空 → 报错', () => {
        const root = makeRoot()
        writeAgent(root, 'Demo_Agent', { description: '' })
        const messages = checkAgents(root).errors.map((e) => e.message)
        expect(messages.some((m) => m.includes('文件名不是 kebab-case'))).toBe(true)
        expect(messages).toContain('frontmatter description 为空')
    })

    it('缺少 frontmatter → 报错', () => {
        const root = makeRoot()
        write(root, '.github/agents/demo-agent.agent.md', '# 无 frontmatter\n')
        expect(checkAgents(root).errors.map((e) => e.message)).toContain('缺少 YAML frontmatter')
    })
})

describe('checkAssetLinks', () => {
    it('skill 文档死链 → 报错并给出行号', () => {
        const root = makeRoot()
        writeSkill(root, 'demo-skill')
        write(root, '.github/skills/demo-skill/SKILL.md', '---\nname: demo-skill\ndescription: d\nmetadata:\n  internal: true\n---\n\n[断链](./references/missing.md)\n')
        const { errors } = checkAssetLinks(root)
        expect(errors).toHaveLength(1)
        expect(errors[0].line).toBe(8)
        expect(errors[0].message).toBe('链接目标不存在: ./references/missing.md')
    })

    it('合法相对链接 / 外链 / 纯锚点 → 不报错', () => {
        const root = makeRoot()
        writeSkill(root, 'demo-skill')
        write(root, '.github/skills/demo-skill/references/target.md', '# 目标\n')
        write(
            root,
            '.github/skills/demo-skill/SKILL.md',
            '---\nname: demo-skill\ndescription: d\nmetadata:\n  internal: true\n---\n\n[目标](./references/target.md) [外链](https://example.com) [锚点](#技能)\n',
        )
        expect(checkAssetLinks(root).errors).toEqual([])
    })
    it('fenced code 与行内代码内的链接不参与检查', () => {
        const root = makeRoot()
        writeSkill(root, 'demo-skill')
        write(
            root,
            '.github/skills/demo-skill/SKILL.md',
            '---\nname: demo-skill\ndescription: d\nmetadata:\n  internal: true\n---\n\n`[行内](./dead-inline.md)`\n\n```md\n[围栏](./dead-fence.md)\n```\n',
        )
        expect(checkAssetLinks(root).errors).toEqual([])
    })
})

describe('checkPlatformCopies', () => {
    it('符号链接齐备 → 无 warning', () => {
        const root = makeRoot()
        mkdirSync(join(root, '.github/agents'), { recursive: true })
        mkdirSync(join(root, '.github/skills'), { recursive: true })
        linkPlatformCopies(root)
        expect(checkPlatformCopies(root).warnings).toEqual([])
    })

    it('缺失只给 warning，不是 error', () => {
        const root = makeRoot()
        const { warnings } = checkPlatformCopies(root)
        expect(warnings.length).toBe(6)
        expect(checkAiGovernance(root).errors).toEqual([])
    })

    it('普通目录而非符号链接 → warning', () => {
        const root = makeRoot()
        mkdirSync(join(root, '.github/agents'), { recursive: true })
        mkdirSync(join(root, '.github/skills'), { recursive: true })
        linkPlatformCopies(root)
        rmSync(join(root, '.claude/skills'))
        mkdirSync(join(root, '.claude/skills'))
        expect(checkPlatformCopies(root).warnings.map((w) => w.message)).toContain(
            '平台副本不是符号链接（规范 §2.2 要求 junction）',
        )
    })

    it('副本指向他处 → warning，不抛错', () => {
        const root = makeRoot()
        mkdirSync(join(root, '.github/agents'), { recursive: true })
        mkdirSync(join(root, '.github/skills'), { recursive: true })
        mkdirSync(join(root, 'elsewhere/skills'), { recursive: true })
        linkPlatformCopies(root)
        rmSync(join(root, '.claude/skills'))
        symlinkSync(join('..', 'elsewhere', 'skills'), join(root, '.claude/skills'), 'junction')
        expect(checkPlatformCopies(root).warnings.map((w) => w.message)).toContain('平台副本未指向 .github/skills')
    })

    it('悬空符号链接 → warning，不抛错', () => {
        const root = makeRoot()
        mkdirSync(join(root, '.github/agents'), { recursive: true })
        mkdirSync(join(root, '.github/skills'), { recursive: true })
        linkPlatformCopies(root)
        rmSync(join(root, '.claude/skills'))
        symlinkSync(join('..', 'missing-target'), join(root, '.claude/skills'), 'junction')
        expect(checkPlatformCopies(root).warnings.map((w) => w.message)).toContain('平台副本符号链接无法解析')
    })

    it('源目录缺失时不抛错，降级为 warning', () => {
        const root = makeRoot()
        mkdirSync(join(root, '.github/skills'), { recursive: true })
        mkdirSync(join(root, 'other-agents'), { recursive: true })
        mkdirSync(join(root, '.claude'), { recursive: true })
        symlinkSync(join('..', 'other-agents'), join(root, '.claude/agents'), 'junction')
        expect(() => checkPlatformCopies(root)).not.toThrow()
        expect(checkPlatformCopies(root).warnings.map((w) => w.message)).toContain('源目录 .github/agents 缺失，无法核对副本指向')
    })
})

describe('checkAiGovernance', () => {
    it('规则数与计数随扫描面返回', () => {
        const root = makeRoot()
        writeSkill(root, 'demo-skill')
        writeAgent(root, 'demo-agent')
        const result = checkAiGovernance(root)
        expect(RULE_COUNT).toBe(6)
        expect(result).toMatchObject({ skills: 1, agents: 1, rules: 6 })
        expect(result.errors).toEqual([])
    })
})
