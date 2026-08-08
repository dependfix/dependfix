import { z } from 'zod'

/** `fetch_alerts` 输入：拉取指定仓库的安全告警（Dependabot + 可选 Code Scanning） */
export const fetchAlertsSchema = z.object({
    repo: z.string().describe('目标仓库，格式 owner/repo'),
    severity: z.enum(['critical', 'high', 'medium', 'all']).default('high').describe('严重级别阈值（high 保留 critical + high，与 CLI 一致）'),
    code_scanning: z.boolean().optional().describe('同时拉取 Code Scanning 告警（与 Dependabot 并行；需要 token 具备 security-events: read）'),
})

/** `get_last_report` 输入：读取最近一次 JSON 报告 */
export const getLastReportSchema = z.object({})

/** `run_scan` 输入：对目标仓库执行 dependfix 扫描并修复 */
export const runScanSchema = z.object({
    repo: z.string().describe('目标仓库，格式 owner/repo'),
    mode: z.enum(['report-only', 'fix', 'fix-and-pr']).default('report-only').describe('执行模式（默认仅报告）'),
    severity: z.enum(['critical', 'high', 'medium', 'all']).default('high').describe('严重级别阈值'),
    code_scanning: z.boolean().optional().describe('同时拉取 Code Scanning 告警（默认 false）'),
    max_alerts: z.number().int().min(1).max(1000).optional().describe('每仓库最多处理的告警数（默认 20）'),
    max_concurrency: z.number().int().min(1).max(16).optional().describe('多仓库并发窗口（默认 1 保守串行）'),
    dry_run: z.boolean().optional().describe('试运行不实际写入；缺省按 mode 推断（report-only 为 true）。与 mode=fix/fix-and-pr 互斥（会返回配置校验错误）'),
    allow_major_upgrade: z.boolean().optional().describe('跨线 major 升级显式授权（默认 false；仅根直接依赖 + lockfile 单版本，强制完整验证）'),
})

/** `fix_dependency` 输入：修复单个依赖（多修复类型） */
export const fixDependencySchema = z.object({
    /** 本地仓库路径（已 clone 的目录，含 package.json/pnpm-lock.yaml） */
    workDir: z.string().describe('本地仓库工作目录（已 clone，包含 package.json 与 pnpm-lock.yaml）'),
    /** 修复类型：override（间接依赖 overrides）/ direct（直接依赖升级）/ lockfile（frozen-lockfile 漂移修复） */
    fix_type: z.enum(['override', 'direct', 'lockfile']).default('override').describe('修复类型（默认 override）'),
    /** override / direct 必填 */
    packageName: z.string().optional().describe('依赖包名（fix_type=override/direct 必填）'),
    /** override / direct 必填 */
    targetVersion: z.string().optional().describe('目标精确版本，如 4.17.21（fix_type=override/direct 必填）'),
})
