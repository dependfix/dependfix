// skills/agents 目录约定与检测测试
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AGENTS } from './agents'

let tempHome: string

beforeEach(() => {
    tempHome = mkdtempSync(join(tmpdir(), 'dfx-agents-'))
})

afterEach(() => {
    rmSync(tempHome, { recursive: true, force: true })
})

describe('agents 目录约定', () => {
    it('覆盖 4 个主流 agent 且全局目录映射正确', () => {
        expect(AGENTS.map((a) => a.id).sort()).toEqual(['claude-code', 'copilot', 'cursor', 'opencode'])
        expect(AGENTS.find((a) => a.id === 'claude-code')?.globalSkillDir(tempHome)).toBe(join(tempHome, '.claude', 'skills'))
        expect(AGENTS.find((a) => a.id === 'opencode')?.globalSkillDir(tempHome)).toBe(join(tempHome, '.config', 'opencode', 'skills'))
        expect(AGENTS.find((a) => a.id === 'cursor')?.globalSkillDir(tempHome)).toBe(join(tempHome, '.cursor', 'skills'))
        expect(AGENTS.find((a) => a.id === 'copilot')?.globalSkillDir(tempHome)).toBe(join(tempHome, '.copilot', 'skills'))
    })

    it('项目级目录映射正确（opencode 用生态约定 .agents/skills）', () => {
        const root = join(tempHome, 'proj')
        expect(AGENTS.find((a) => a.id === 'claude-code')?.projectSkillDir(root)).toBe(join(root, '.claude', 'skills'))
        expect(AGENTS.find((a) => a.id === 'opencode')?.projectSkillDir(root)).toBe(join(root, '.agents', 'skills'))
        expect(AGENTS.find((a) => a.id === 'cursor')?.projectSkillDir(root)).toBe(join(root, '.cursor', 'skills'))
        expect(AGENTS.find((a) => a.id === 'copilot')?.projectSkillDir(root)).toBeUndefined()
    })

    it('detectInstalled 按主目录存在性判断', () => {
        // 未创建任何目录：全部未检测到
        for (const agent of AGENTS) {
            expect(agent.detectInstalled(tempHome)).toBe(false)
        }
        // 创建 Claude Code 主目录
        mkdirSync(join(tempHome, '.claude'), { recursive: true })
        expect(AGENTS.find((a) => a.id === 'claude-code')?.detectInstalled(tempHome)).toBe(true)
        expect(AGENTS.find((a) => a.id === 'opencode')?.detectInstalled(tempHome)).toBe(false)
        // 创建 OpenCode 主目录
        mkdirSync(join(tempHome, '.config', 'opencode'), { recursive: true })
        expect(AGENTS.find((a) => a.id === 'opencode')?.detectInstalled(tempHome)).toBe(true)
        // 递归创建子路径时主目录必然存在：.cursor/skills 存在即意味着 .cursor 存在（detectInstalled=true）
        mkdirSync(join(tempHome, '.cursor', 'skills'), { recursive: true })
        expect(AGENTS.find((a) => a.id === 'cursor')?.detectInstalled(tempHome)).toBe(true)
        // Copilot 未创建任何目录：false
        expect(AGENTS.find((a) => a.id === 'copilot')?.detectInstalled(tempHome)).toBe(false)
    })
})
