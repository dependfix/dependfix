// ---------------------------------------------------------------------------
// dependfix skills doctor 核心逻辑
// ---------------------------------------------------------------------------
// 检查项：
// 1. 已检测 agent 的 skills 目录存在性（目录约定漂移提示：主目录在但 skills 目录缺失）
// 2. 产品 skill 安装状态（已检测 agent 的 skills 目录中 dependfix-remediator 是否存在、
//    内容与当前 CLI 携带版本是否一致）
// 3. 内部开发 skill internal 标记完整性（在 dependfix 仓库内运行时，扫描 .github/skills）
// 全部为只读检查，输出分级问题清单。

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { AGENTS } from './agents'
import { isContentSame } from './installer'
import { PRODUCT_SKILL_NAME, resolveProductSkillSourceDir } from './source'

export type DoctorLevel = 'ok' | 'warn' | 'error'

export interface DoctorFinding {
    level: DoctorLevel
    message: string
}

export interface DoctorOptions {
    homeDir: string
    /** 项目根（用于项目级目录检查与内部 skill 扫描）；缺省为当前工作目录 */
    projectRoot?: string
    /** 产品 skill 权威源目录（缺省从 @dependfix/skills 包解析；测试可注入） */
    productSourceDir?: string
}

export function runDoctor(options: DoctorOptions): DoctorFinding[] {
    const { homeDir, projectRoot = process.cwd() } = options
    const findings: DoctorFinding[] = []

    // 1. agent 目录约定检查
    for (const agent of AGENTS) {
        const installed = agent.detectInstalled(homeDir)
        if (!installed) {
            continue
        }
        const globalDir = agent.globalSkillDir(homeDir)
        if (!existsSync(globalDir)) {
            findings.push({
                level: 'warn',
                message: `${agent.displayName} 已检测到，但全局 skills 目录缺失（${globalDir}）——可能官方目录约定已变更，或尚未初始化`,
            })
        }
        const projectDir = agent.projectSkillDir(projectRoot)
        if (projectDir && !existsSync(projectDir)) {
            findings.push({
                level: 'ok',
                message: `${agent.displayName} 项目级 skills 目录不存在（${projectDir}）——非问题，按需创建`,
            })
        }
    }

    // 2. 产品 skill 安装状态
    const sourceDir = options.productSourceDir ?? safeResolveSourceDir()
    if (sourceDir) {
        for (const agent of AGENTS) {
            if (!agent.detectInstalled(homeDir)) {
                continue
            }
            const installedDir = join(agent.globalSkillDir(homeDir), PRODUCT_SKILL_NAME)
            if (!existsSync(installedDir)) {
                findings.push({
                    level: 'ok',
                    message: `${agent.displayName}: ${PRODUCT_SKILL_NAME} 未安装（运行 dependfix skills install）`,
                })
                continue
            }
            if (isContentSame(sourceDir, installedDir)) {
                findings.push({
                    level: 'ok',
                    message: `${agent.displayName}: ${PRODUCT_SKILL_NAME} 已安装且与当前版本一致`,
                })
            } else {
                findings.push({
                    level: 'warn',
                    message: `${agent.displayName}: ${PRODUCT_SKILL_NAME} 已安装但内容与当前版本不一致（建议重新 install）`,
                })
            }
        }
    }

    // 3. 内部开发 skill internal 标记完整性（仅 dependfix 仓库内）
    const internalSkillsRoot = join(projectRoot, '.github', 'skills')
    if (existsSync(internalSkillsRoot)) {
        const missing: string[] = []
        for (const entry of readdirSync(internalSkillsRoot, { withFileTypes: true })) {
            if (!entry.isDirectory()) {
                continue
            }
            const skillFile = join(internalSkillsRoot, entry.name, 'SKILL.md')
            if (!existsSync(skillFile)) {
                missing.push(`${entry.name}（缺 SKILL.md）`)
                continue
            }
            const content = readFileSync(skillFile, 'utf8')
            if (!/metadata:\s*\r?\n\s*internal:\s*true/.test(content)) {
                missing.push(entry.name)
            }
        }
        if (missing.length > 0) {
            findings.push({
                level: 'error',
                message: `内部 skill internal 标记缺失（生态可见泄漏风险）: ${missing.join(', ')}`,
            })
        } else {
            findings.push({
                level: 'ok',
                message: `内部 skill internal 标记完整性检查通过（.github/skills）`,
            })
        }
    }

    return findings
}

/** 解析产品 skill 源目录；失败返回 undefined（如 CLI 运行在无 @dependfix/skills 的调试环境） */
function safeResolveSourceDir(): string | undefined {
    try {
        return resolveProductSkillSourceDir()
    } catch {
        return undefined
    }
}
