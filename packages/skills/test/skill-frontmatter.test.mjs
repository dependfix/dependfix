/**
 * 产品 skill SKILL.md 规范校验测试：
 * 依据 Agent Skills 共享规范（Anthropic / vercel-labs/skills 生态一致）：
 * - YAML frontmatter 必填 name（小写字母/数字/连字符，≤64）与 description（非空、≤1024、无 XML 标签）
 * - SKILL.md 正文 < 500 行（渐进披露要求）
 * - 相对链接使用正斜杠（跨平台）
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const skillRoot = join(here, '..', 'dependfix-remediator')
const skillFile = join(skillRoot, 'SKILL.md')

function parseFrontmatter(content) {
    const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(content)
    if (!match) {
        throw new Error('SKILL.md 缺少 YAML frontmatter（须以 --- 开头并以 --- 结束）')
    }
    const metaLines = match[1].split(/\r?\n/)
    const meta = {}
    for (const line of metaLines) {
        // key: value 正则提取，value 允许含 ASCII 冒号（如 "Use when: ..."）不被截断
        const kv = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line)
        if (kv) {
            meta[kv[1]] = kv[2]
        }
    }
    return { meta, body: match[2] }
}

describe('dependfix-remediator SKILL.md 规范', () => {
    const content = readFileSync(skillFile, 'utf8')
    const { meta, body } = parseFrontmatter(content)

    it('frontmatter 必填 name 且格式合法（小写/数字/连字符，≤64）', () => {
        expect(meta.name).toBeDefined()
        expect(meta.name).toMatch(/^[a-z0-9-]+$/)
        expect(meta.name.length).toBeLessThanOrEqual(64)
    })

    it('frontmatter 必填 description：非空、≤1024、无 XML 标签', () => {
        expect(meta.description).toBeDefined()
        expect(meta.description.trim().length).toBeGreaterThan(0)
        expect(meta.description.length).toBeLessThanOrEqual(1024)
        expect(meta.description).not.toMatch(/[<>]/)
    })

    it('frontmatter 不含 internal 标记（产品 skill 应对外可见）', () => {
        expect(meta.internal).toBeUndefined()
    })

    it('SKILL.md 正文非空且 < 500 行', () => {
        const bodyLines = body.split(/\r?\n/).filter((line) => line.trim() !== '')
        expect(bodyLines.length).toBeGreaterThan(0)
        expect(bodyLines.length).toBeLessThan(500)
    })

    it('相对链接使用正斜杠路径（不用反斜杠）', () => {
        expect(content).not.toMatch(/\]\(([^)]*\\[^)]*)\)/)
    })
})
