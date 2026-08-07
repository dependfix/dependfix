// ---------------------------------------------------------------------------
// dependfix skills 子命令（install / doctor）
// ---------------------------------------------------------------------------
// 定位：npx skills 生态的离线兜底安装器。
// 不依赖 npx skills；不复刻 add/list/update/remove 完整命令矩阵。
// 主通道（npx skills add dependfix/dependfix -s dependfix-remediator）见 README。

import { homedir } from 'node:os'
import { defineCommand, renderUsage } from 'citty'
import { AGENTS } from './agents'
import { runDoctor, type DoctorFinding } from './doctor'
import { installSkillToDir, type InstallResult } from './installer'
import { resolveProductSkillSourceDir } from './source'

// ---------------------------------------------------------------------------
// install
// ---------------------------------------------------------------------------

interface InstallCliArgs {
    project?: boolean
    force?: boolean
    'dry-run'?: boolean
}

async function runInstall(args: InstallCliArgs): Promise<void> {
    const home = homedir()
    const projectRoot = process.cwd()

    let sourceDir: string
    try {
        sourceDir = resolveProductSkillSourceDir()
    } catch (error: unknown) {
        console.error(`无法定位产品 skill 内容（@dependfix/skills 未安装？）: ${error instanceof Error ? error.message : String(error)}`)
        process.exitCode = 1
        return
    }

    const detected = AGENTS.filter((agent) => agent.detectInstalled(home))
    if (detected.length === 0) {
        console.info('未检测到已安装的 agent 工具（Claude Code / OpenCode / Cursor / Copilot）。')
        console.info('主通道安装（推荐）: npx skills add dependfix/dependfix -s dependfix-remediator -g')
        return
    }

    console.info(`检测到 ${detected.length} 个 agent 工具，目标模式: ${args.project ? '项目级' : '全局'}\n`)

    const results: { agent: string, result: InstallResult }[] = []
    for (const agent of detected) {
        const agentDir = args.project ? agent.projectSkillDir(projectRoot) : agent.globalSkillDir(home)
        if (!agentDir) {
            console.info(`- ${agent.displayName}: 不支持 ${args.project ? '项目级' : ''}安装，跳过`)
            continue
        }
        const result = await installSkillToDir({
            sourceDir,
            targetDir: agentDir,
            force: args.force,
            dryRun: args['dry-run'],
            confirmOverwrite: (existingDir) => confirmOverwritePrompt(agent.displayName, existingDir),
        })
        results.push({ agent: agent.displayName, result })
    }

    console.info('\n安装清单:')
    const installIcons: Record<InstallResult['status'], string> = {
        installed: '✓',
        'up-to-date': '=',
        'skipped-conflict': '!',
        failed: '✗',
    }
    for (const { agent, result } of results) {
        const icon = installIcons[result.status]
        console.info(`  ${icon} ${agent}: ${result.status}${result.detail ? ` — ${result.detail}` : ''}`)
    }

    const failed = results.filter((r) => r.result.status === 'failed')
    if (failed.length > 0) {
        process.exitCode = 1
    }
}

/** 交互式覆盖确认；非 TTY 返回 false（不静默覆盖） */
async function confirmOverwritePrompt(agentName: string, existingDir: string): Promise<boolean> {
    if (!process.stdin.isTTY) {
        console.warn(`  ${agentName}: 目标已存在内容不一致的 dependfix-remediator，非交互环境跳过（使用 --force 覆盖）`)
        return false
    }
    const readline = (await import('node:readline')).createInterface({
        input: process.stdin,
        output: process.stdout,
    })
    return new Promise<boolean>((resolve) => {
        readline.question(`  覆盖 ${existingDir} 中的旧版本？[y/N] `, (answer) => {
            readline.close()
            resolve(answer.trim().toLowerCase() === 'y' || answer.trim().toLowerCase() === 'yes')
        })
    })
}

// ---------------------------------------------------------------------------
// doctor
// ---------------------------------------------------------------------------

async function runDoctorCli(): Promise<void> {
    const findings = runDoctor({ homeDir: homedir(), projectRoot: process.cwd() })
    const doctorIcons: Record<DoctorFinding['level'], string> = { ok: '✓', warn: '!', error: '✗' }
    let warnCount = 0
    let errorCount = 0
    for (const finding of findings) {
        const icon = doctorIcons[finding.level]
        console.info(`  ${icon} [${finding.level}] ${finding.message}`)
        if (finding.level === 'warn') {
            warnCount++
        } else if (finding.level === 'error') {
            errorCount++
        }
    }
    console.info(`\ndoctor 完成: ${findings.length} 项检查，${warnCount} warning, ${errorCount} error`)
    if (errorCount > 0) {
        process.exitCode = 1
    }
}

// ---------------------------------------------------------------------------
// citty command
// ---------------------------------------------------------------------------

export const skillsCommand = defineCommand({
    meta: {
        name: 'skills',
        description: '产品 skill 管理（npx skills 生态的离线兜底安装器）',
    },
    subCommands: {
        install: defineCommand({
            meta: {
                name: 'install',
                description: '检测本机已装 agent 工具并安装 dependfix-remediator 产品 skill',
            },
            args: {
                project: {
                    type: 'boolean',
                    description: '安装到当前项目目录（默认用户全局）',
                    negativeDescription: '安装到用户全局（默认）',
                },
                force: {
                    type: 'boolean',
                    description: '覆盖已存在的内容不一致同名 skill（跳过确认）',
                    negativeDescription: '内容不一致时需确认（默认）',
                },
                'dry-run': {
                    type: 'boolean',
                    description: '只输出将要执行的操作，不写文件',
                    negativeDescription: '实际执行安装',
                },
            },
            async run({ args }) {
                await runInstall(args as InstallCliArgs)
            },
        }),
        doctor: defineCommand({
            meta: {
                name: 'doctor',
                description: '检查 agent 目录约定、产品 skill 安装状态与内部 skill internal 标记完整性',
            },
            async run() {
                await runDoctorCli()
            },
        }),
    },
    async run({ cmd, rawArgs }) {
        // citty 0.2.2 在路由子命令后仍会执行父 run：子命令已执行时直接返回，避免重复输出 usage
        const sub = rawArgs[0]
        if (sub === 'install' || sub === 'doctor') {
            return
        }
        console.info(await renderUsage(cmd))
    },
})
