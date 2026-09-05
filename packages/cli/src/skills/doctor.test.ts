// skills/doctor 检查逻辑测试
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { runDoctor } from './doctor'

let tempRoot: string

beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'dfx-doctor-'))
})

afterEach(() => {
    rmSync(tempRoot, { recursive: true, force: true })
})

function makeProductSource(): string {
    // 内容目录语义：直接含 SKILL.md（与 doctor 对比的 installedDir 同层）
    const src = join(tempRoot, 'product-src')
    mkdirSync(src, { recursive: true })
    writeFileSync(join(src, 'SKILL.md'), '---\nname: dependfix-remediator\n---\n# body')
    return src
}

describe('runDoctor', () => {
    it('无 agent 安装时无 warn 无 error', () => {
        const findings = runDoctor({ homeDir: join(tempRoot, 'home'), projectRoot: tempRoot, productSourceDir: makeProductSource() })
        expect(findings.filter((f) => f.level !== 'ok').length).toBe(0)
    })

    it('agent 已安装但 skills 目录缺失 → warn（目录约定漂移提示）', () => {
        const home = join(tempRoot, 'home')
        mkdirSync(join(home, '.claude'), { recursive: true }) // claude 主目录存在但无 skills 目录
        const findings = runDoctor({ homeDir: home, projectRoot: tempRoot, productSourceDir: makeProductSource() })
        expect(findings.some((f) => f.level === 'warn' && f.message.includes('Claude Code') && f.message.includes('skills 目录缺失'))).toBe(true)
    })

    it('产品 skill 未安装 → ok 提示可 install', () => {
        const home = join(tempRoot, 'home')
        mkdirSync(join(home, '.claude', 'skills'), { recursive: true })
        const findings = runDoctor({ homeDir: home, projectRoot: tempRoot, productSourceDir: makeProductSource() })
        expect(findings.some((f) => f.level === 'ok' && f.message.includes('未安装'))).toBe(true)
    })

    it('产品 skill 已安装且一致 → ok', () => {
        const home = join(tempRoot, 'home')
        mkdirSync(join(home, '.claude', 'skills', 'dependfix-remediator'), { recursive: true })
        const src = makeProductSource()
        writeFileSync(join(home, '.claude', 'skills', 'dependfix-remediator', 'SKILL.md'), '---\nname: dependfix-remediator\n---\n# body')
        const findings = runDoctor({ homeDir: home, projectRoot: tempRoot, productSourceDir: src })
        expect(findings.some((f) => f.level === 'ok' && f.message.includes('已安装且与当前版本一致'))).toBe(true)
    })

    it('产品 skill 已安装但内容不一致 → warn', () => {
        const home = join(tempRoot, 'home')
        mkdirSync(join(home, '.claude', 'skills', 'dependfix-remediator'), { recursive: true })
        const src = makeProductSource()
        writeFileSync(join(home, '.claude', 'skills', 'dependfix-remediator', 'SKILL.md'), '# stale')
        const findings = runDoctor({ homeDir: home, projectRoot: tempRoot, productSourceDir: src })
        expect(findings.some((f) => f.level === 'warn' && f.message.includes('内容与当前版本不一致'))).toBe(true)
    })

    it('内部 skill internal 标记缺失 → error 并列出缺失项', () => {
        const skillsRoot = join(tempRoot, '.github', 'skills')
        mkdirSync(join(skillsRoot, 'skill-a'), { recursive: true })
        writeFileSync(join(skillsRoot, 'skill-a', 'SKILL.md'), '---\nname: skill-a\n---\n# body') // 无 internal
        mkdirSync(join(skillsRoot, 'skill-b'), { recursive: true })
        writeFileSync(join(skillsRoot, 'skill-b', 'SKILL.md'), '---\nname: skill-b\nmetadata:\n    internal: true\n---\n# body')
        const findings = runDoctor({ homeDir: join(tempRoot, 'home'), projectRoot: tempRoot, productSourceDir: makeProductSource() })
        const error = findings.find((f) => f.level === 'error')
        expect(error).toBeDefined()
        expect(error?.message).toContain('skill-a')
        expect(error?.message).not.toContain('skill-b')
    })

    it('内部 skill 全部有标记 → ok', () => {
        const skillsRoot = join(tempRoot, '.github', 'skills')
        mkdirSync(join(skillsRoot, 'skill-a'), { recursive: true })
        writeFileSync(join(skillsRoot, 'skill-a', 'SKILL.md'), '---\nname: skill-a\nmetadata:\n    internal: true\n---\n# body')
        const findings = runDoctor({ homeDir: join(tempRoot, 'home'), projectRoot: tempRoot, productSourceDir: makeProductSource() })
        expect(findings.some((f) => f.level === 'ok' && f.message.includes('internal 标记完整性检查通过'))).toBe(true)
    })

    it('非 dependfix 仓库（无 .github/skills）不执行内部检查', () => {
        const findings = runDoctor({ homeDir: join(tempRoot, 'home'), projectRoot: join(tempRoot, 'other'), productSourceDir: makeProductSource() })
        expect(findings.some((f) => f.message.includes('internal 标记'))).toBe(false)
        expect(existsSync(join(tempRoot, 'other'))).toBe(false) // 项目根不存在也不应崩溃
    })

    it('内部 skill 目录含非目录条目时跳过', () => {
        const skillsRoot = join(tempRoot, '.github', 'skills')
        mkdirSync(skillsRoot, { recursive: true })
        // 创建一个文件（非目录）应该被跳过
        writeFileSync(join(skillsRoot, 'not-a-dir.txt'), 'some content')
        mkdirSync(join(skillsRoot, 'skill-a'), { recursive: true })
        writeFileSync(join(skillsRoot, 'skill-a', 'SKILL.md'), '---\nname: skill-a\nmetadata:\n    internal: true\n---\n# body')
        const findings = runDoctor({ homeDir: join(tempRoot, 'home'), projectRoot: tempRoot, productSourceDir: makeProductSource() })
        expect(findings.some((f) => f.level === 'ok' && f.message.includes('internal 标记完整性检查通过'))).toBe(true)
    })

    it('内部 skill 目录缺 SKILL.md 时报告缺失', () => {
        const skillsRoot = join(tempRoot, '.github', 'skills')
        mkdirSync(join(skillsRoot, 'skill-no-file'), { recursive: true })
        // 不创建 SKILL.md
        const findings = runDoctor({ homeDir: join(tempRoot, 'home'), projectRoot: tempRoot, productSourceDir: makeProductSource() })
        const error = findings.find((f) => f.level === 'error')
        expect(error).toBeDefined()
        expect(error?.message).toContain('skill-no-file')
        expect(error?.message).toContain('缺 SKILL.md')
    })

    it('未提供 productSourceDir 时安全回退（不崩溃）', () => {
        const findings = runDoctor({ homeDir: join(tempRoot, 'home'), projectRoot: tempRoot })
        // 不应崩溃，可能返回空或仅含 agent 检查结果
        expect(Array.isArray(findings)).toBe(true)
    })

    it('项目级 skills 目录不存在时报告 ok', () => {
        const home = join(tempRoot, 'home')
        mkdirSync(join(home, '.claude'), { recursive: true })
        const projectRoot = join(tempRoot, 'project')
        mkdirSync(projectRoot, { recursive: true })
        const findings = runDoctor({ homeDir: home, projectRoot, productSourceDir: makeProductSource() })
        expect(findings.some((f) => f.level === 'ok' && f.message.includes('项目级 skills 目录不存在'))).toBe(true)
    })
})
