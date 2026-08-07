// ---------------------------------------------------------------------------
// Agent 目录约定与检测
// ---------------------------------------------------------------------------
// 目录约定与 npx skills 生态对齐（vercel-labs/skills agents 定义）：
// - claude-code: 项目 .claude/skills，全局 ~/.claude/skills
// - opencode:    项目 .agents/skills，全局 ~/.config/opencode/skills
// - cursor:      项目 .cursor/skills，全局 ~/.cursor/skills
// - copilot:     全局 ~/.copilot/skills（GitHub Copilot 无通用项目级目录约定）
// 检测 = 对应主目录存在（存在即视为已安装该工具）。
// homedir / projectRoot 均由调用方注入，便于测试。

import { existsSync } from 'node:fs'
import { join } from 'node:path'

export interface AgentDefinition {
    id: string
    displayName: string
    /** 项目级 skills 目录（相对项目根）；不支持返回 undefined */
    projectSkillDir(projectRoot: string): string | undefined
    /** 用户级 skills 目录（绝对路径） */
    globalSkillDir(homeDir: string): string
    /** 检测是否已安装（对应主目录是否存在） */
    detectInstalled(homeDir: string): boolean
}

export const AGENTS: AgentDefinition[] = [
    {
        id: 'claude-code',
        displayName: 'Claude Code',
        projectSkillDir: (root) => join(root, '.claude', 'skills'),
        globalSkillDir: (home) => join(home, '.claude', 'skills'),
        detectInstalled: (home) => existsSync(join(home, '.claude')),
    },
    {
        id: 'opencode',
        displayName: 'OpenCode',
        projectSkillDir: (root) => join(root, '.agents', 'skills'),
        globalSkillDir: (home) => join(home, '.config', 'opencode', 'skills'),
        detectInstalled: (home) => existsSync(join(home, '.config', 'opencode')),
    },
    {
        id: 'cursor',
        displayName: 'Cursor',
        projectSkillDir: (root) => join(root, '.cursor', 'skills'),
        globalSkillDir: (home) => join(home, '.cursor', 'skills'),
        detectInstalled: (home) => existsSync(join(home, '.cursor')),
    },
    {
        id: 'copilot',
        displayName: 'GitHub Copilot',
        projectSkillDir: () => undefined,
        globalSkillDir: (home) => join(home, '.copilot', 'skills'),
        detectInstalled: (home) => existsSync(join(home, '.copilot')),
    },
]
