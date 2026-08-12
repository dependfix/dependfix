import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { syncSkills } from './sync-skills.mjs'

let root

beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'sync-skills-test-'))
})

afterEach(() => {
    rmSync(root, { recursive: true, force: true })
})

const src = () => join(root, 'src')
const dist = () => join(root, 'dist')

describe('syncSkills', () => {
    it('mirrors files and subdirectories from source to target', () => {
        mkdirSync(join(src(), 'sub'), { recursive: true })
        writeFileSync(join(src(), 'SKILL.md'), '# 技能')
        writeFileSync(join(src(), 'sub', 'references.md'), '引用')

        const count = syncSkills(src(), dist())

        expect(count).toBe(2)
        expect(readFileSync(join(dist(), 'SKILL.md'), 'utf8')).toBe('# 技能')
        expect(readFileSync(join(dist(), 'sub', 'references.md'), 'utf8')).toBe('引用')
    })

    it('removes target entries that no longer exist in source', () => {
        mkdirSync(src())
        writeFileSync(join(src(), 'keep.md'), '保留')
        // 预置目标：一个保留文件 + 两个应被删除的条目（文件 + 目录）
        mkdirSync(join(dist(), 'stale-dir'), { recursive: true })
        writeFileSync(join(dist(), 'keep.md'), '旧内容')
        writeFileSync(join(dist(), 'stale.md'), '陈旧')
        writeFileSync(join(dist(), 'stale-dir', 'inner.md'), '内层')

        syncSkills(src(), dist())

        const distEntries = readdirSync(dist())
        expect(distEntries).toContain('keep.md')
        expect(distEntries).not.toContain('stale.md')
        expect(distEntries).not.toContain('stale-dir')
        // 文件覆盖
        expect(readFileSync(join(dist(), 'keep.md'), 'utf8')).toBe('保留')
    })

    it('is idempotent when run twice', () => {
        mkdirSync(join(src(), 'sub'), { recursive: true })
        writeFileSync(join(src(), 'SKILL.md'), '# 技能')
        writeFileSync(join(src(), 'sub', 'references.md'), '引用')

        syncSkills(src(), dist())
        syncSkills(src(), dist())

        // readdirSync 返回顺序不保证（Linux ext4 按目录项顺序），排序后断言
        expect(readdirSync(dist()).sort()).toEqual(['SKILL.md', 'sub'])
        expect(readFileSync(join(dist(), 'sub', 'references.md'), 'utf8')).toBe('引用')
    })

    it('throws when source directory does not exist', () => {
        expect(() => syncSkills(src(), dist())).toThrow(/权威源目录不存在/)
    })

    it('throws when source directory is empty', () => {
        mkdirSync(src())
        expect(() => syncSkills(src(), dist())).toThrow(/权威源目录为空，拒绝同步/)
    })

    it('returns the number of source entries', () => {
        mkdirSync(join(src(), 'sub'), { recursive: true })
        writeFileSync(join(src(), 'a.md'), 'a')
        writeFileSync(join(src(), 'b.md'), 'b')
        writeFileSync(join(src(), 'sub', 'c.md'), 'c')

        expect(syncSkills(src(), dist())).toBe(3)
    })
})
