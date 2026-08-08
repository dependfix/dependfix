import { z } from 'zod'
import { RUNTIME_MODES, SEVERITY_THRESHOLDS } from 'dependfix'

// run_scan 的 mode 子集：排除 cleanup-branches（由独立 cleanup_branches tool 承担；
// DependfixApp 的该 mode 走交互确认，MCP stdio 不可用——见 mcp-server.md §8.3）。
// 从 cli RUNTIME_MODES 派生（filter 跟随 cli 演进），非独立硬编码。
// as unknown 桥接：filter 返回数组类型，z.enum 需要 readonly 元组。
const RUN_SCAN_MODES = RUNTIME_MODES.filter((m) => m !== 'cleanup-branches') as unknown as readonly ['report-only', 'fix', 'fix-and-pr']

/** `fetch_alerts` 输入：拉取指定仓库的安全告警（Dependabot + 可选 Code Scanning） */
export const fetchAlertsSchema = z.object({
    repo: z.string().describe('目标仓库，格式 owner/repo'),
    severity: z.enum(SEVERITY_THRESHOLDS).default('high').describe('严重级别阈值（high 保留 critical + high，与 CLI 一致）'),
    code_scanning: z.boolean().optional().describe('同时拉取 Code Scanning 告警（与 Dependabot 并行；需要 token 具备 security-events: read）'),
})

/** `get_last_report` 输入：读取最近一次 JSON 报告 */
export const getLastReportSchema = z.object({})

/** `run_scan` 输入：对目标仓库执行 dependfix 扫描并修复 */
export const runScanSchema = z.object({
    repo: z.string().describe('目标仓库，格式 owner/repo'),
    mode: z.enum(RUN_SCAN_MODES).default('report-only').describe('执行模式（默认仅报告）'),
    severity: z.enum(SEVERITY_THRESHOLDS).default('high').describe('严重级别阈值'),
    code_scanning: z.boolean().optional().describe('同时拉取 Code Scanning 告警（默认 false）'),
    max_alerts: z.number().int().min(1).max(1000).optional().describe('每仓库最多处理的告警数（默认 20）'),
    max_concurrency: z.number().int().min(1).max(16).optional().describe('多仓库并发窗口（默认 1 保守串行）'),
    dry_run: z.boolean().optional().describe('试运行不实际写入；缺省按 mode 推断（report-only 为 true）。与 mode=fix/fix-and-pr 互斥（会返回配置校验错误）'),
    allow_major_upgrade: z.boolean().optional().describe('跨线 major 升级显式授权（默认 false；仅根直接依赖 + lockfile 单版本，强制完整验证）'),
    ai_enabled: z.boolean().optional().describe('开启 AI breaking change 研判（默认 false；apiKey 从 DEPENDFIX_AI_API_KEY env 读取，禁止经 tool 参数传入）'),
    ai_provider: z.enum(['openai-compatible', 'anthropic']).optional().describe('AI 提供商（默认 openai-compatible）'),
    ai_model: z.string().optional().describe('AI 模型名（默认 deepseek-v4-flash）'),
    ai_trigger: z.enum(['failure', 'major', 'both']).optional().describe('AI 触发范围（默认 both）'),
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

/** `discover_repos` 输入：按 owner / org 自动发现仓库 */
export const discoverReposSchema = z.object({
    owner: z.array(z.string()).min(1).describe('owner / org 列表（分别发现后合并）'),
    topics: z.array(z.string()).optional().describe('topic 白名单（AND 语义：必须包含全部指定 topics）'),
    include: z.array(z.string()).optional().describe('仓库白名单 glob（如 owner/*、owner/pkg-*）'),
    exclude: z.array(z.string()).optional().describe('仓库黑名单 glob（与 include 冲突时胜出）'),
    probe_dependabot: z.boolean().optional().describe('探测 .github/dependabot.yml 存在性（默认 true；会额外触达 contents API）'),
})

/** `cleanup_branches` 输入：清理已合并/已关闭的 dependfix 分支 */
export const cleanupBranchesSchema = z.object({
    repo: z.string().describe('目标仓库，格式 owner/repo'),
    dry_run: z.boolean().optional().describe('仅列出待清理分支，不执行删除（默认 false）'),
})

/** `history` 输入：查询仓库历史运行摘要 */
export const historySchema = z.object({
    repo: z.string().describe('目标仓库，格式 owner/repo'),
})
