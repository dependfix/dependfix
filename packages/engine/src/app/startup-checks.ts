// startup-checks.ts — 运行启动期的安全自检（本地执行告警 + token 权限范围）。
//
// 从 app/index.ts 迁出以控制单文件规模；行为与提示文案保持不变。
import type { Logger } from '@dependfix/core'
import type { RuntimeConfig } from '../config'
import { checkTokenPermissions } from '../github'
import { createConfiguredGitHubClient } from './github-client'

export interface StartupSecurityCheckInput {
    config: RuntimeConfig
    logger: Logger
    /** `local` / `container`（容器内属设计内沙箱，不触发本地模式风险告警） */
    executionEnvironment: string
}

/** 启动安全自检（best-effort：失败不抛错、不阻断运行）。 */
export async function runStartupSecurityChecks(input: StartupSecurityCheckInput): Promise<void> {
    const { config, logger } = input
    const isLocalFix = input.executionEnvironment === 'local'
        && !config.dryRun
        && (config.mode === 'fix' || config.mode === 'fix-and-pr')
    if (isLocalFix && process.env.DEPENDFIX_SUPPRESS_LOCAL_EXECUTION_WARNING !== '1') {
        logger.warn(
            '[local-exec] 本地模式将直接执行目标仓库的依赖安装/验证脚本（install/lint/build/typecheck/test 钩子，属不可信代码）'
            + '——若仓库或依赖被恶意控制，脚本可读取本机环境变量（含 GITHUB_TOKEN）。'
            + '建议：使用专用低权限 token，并在专用环境（容器/VM/CI runner）运行；'
            + '已确认风险可设置 DEPENDFIX_SUPPRESS_LOCAL_EXECUTION_WARNING=1 抑制本提示'
            + '（详见 quick-start 安全注意事项）。',
        )
    }

    if (config.alertSource === 'github-dependabot' && config.githubToken) {
        const result = await checkTokenPermissions(createConfiguredGitHubClient(config), {
            codeScanningEnabled: config.codeScanningEnabled,
        })
        if (result.ok && result.warnings.length > 0) {
            for (const warning of result.warnings) {
                logger.warn(`[token-scope] ${warning.message}`)
            }
        }
    }
}
