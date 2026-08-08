import { z } from 'zod'

/** `fetch_alerts` 输入：拉取指定仓库 Dependabot 安全告警 */
export const fetchAlertsSchema = z.object({
    repo: z.string().describe('目标仓库，格式 owner/repo'),
    severity: z.enum(['critical', 'high', 'medium', 'all']).default('high').describe('严重级别过滤'),
})

/** `get_last_report` 输入：读取最近一次 JSON 报告 */
export const getLastReportSchema = z.object({})

/** `run_scan` 输入：对目标仓库执行 dependfix 扫描并修复 */
export const runScanSchema = z.object({
    repo: z.string().describe('目标仓库，格式 owner/repo'),
    mode: z.enum(['report-only', 'fix', 'fix-and-pr']).default('report-only').describe('执行模式（默认仅报告）'),
    severity: z.enum(['critical', 'high', 'medium', 'all']).default('high').describe('严重级别阈值'),
})

/** `fix_dependency` 输入：修复单个依赖 */
export const fixDependencySchema = z.object({
    /** 本地仓库路径（已 clone 的目录，含 package.json/pnpm-lock.yaml） */
    workDir: z.string().describe('本地仓库工作目录（已 clone，包含 package.json 与 pnpm-lock.yaml）'),
    packageName: z.string().describe('依赖包名（必须为间接依赖）'),
    targetVersion: z.string().describe('目标精确版本（如 4.17.21）'),
})
