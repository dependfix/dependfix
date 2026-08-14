import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { AppError, normalizeAuditSeverity, type NormalizedSecurityAlert } from '@dependfix/core'

/**
 * pnpm audit 本地回退数据源（无 GitHub token 场景）。
 *
 * 设计见 docs/design/pnpm-audit-fallback.md：
 * - 显式 `--alerts-source pnpm-audit` 触发（403 不自动降级，保持硬失败语义）
 * - 归一化口径对齐 security-alert-remediator 的 collect-security-alerts.mjs
 *   （severity 映射 / legacy + modern 双格式解析 / 按 packageName:advisoryId:severity 去重）
 * - repository 由调用方注入（显式 --repo → git remote → local 兜底）
 * - audit 自身失败（无 lockfile / pnpm 不可用 / JSON 解析失败）→ 硬失败，绝不静默空跑
 */

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface FetchPnpmAuditAlertsParams {
    /** 扫描工作目录（lockfile 所在目录） */
    workDir: string
    /** 注入的仓库标识（owner/repo 或 local 兜底） */
    repository: string
}

/**
 * 执行 `pnpm audit --json` 并将风险归一化为标准化告警。
 *
 * @throws AppError('AUDIT_FAILED') — pnpm 不可用 / 无 lockfile / JSON 解析失败
 */
export async function fetchPnpmAuditAlerts(
    params: FetchPnpmAuditAlertsParams,
): Promise<NormalizedSecurityAlert[]> {
    const { workDir, repository } = params
    const report = await runPnpmAudit(workDir)
    const risks = parseAuditReport(report)
    return risks.map((risk) => mapAuditRiskToAlert(risk, repository))
}

// ---------------------------------------------------------------------------
// pnpm audit 执行
// ---------------------------------------------------------------------------

/**
 * 运行 `pnpm audit --json` 并解析 JSON。
 *
 * ⚠️ 发现漏洞时 pnpm audit 返回非零退出码（exit 1）是**正常行为**——JSON 输出仍然有效，
 * 不能以 exit code 判断失败（参考 security-alert-remediator 的 loadAuditReport 同款语义）。
 * 仅在空输出或 JSON 解析失败时视为硬失败。
 */
function runPnpmAudit(workDir: string): Promise<unknown> {
    return new Promise((resolve, reject) => {
        const cp = spawn('pnpm audit --json', {
            cwd: workDir,
            shell: true,
            stdio: ['ignore', 'pipe', 'pipe'],
        })

        const stdoutChunks: string[] = []
        const stderrChunks: string[] = []

        cp.stdout.on('data', (data: Buffer) => {
            stdoutChunks.push(data.toString('utf-8'))
        })

        cp.stderr.on('data', (data: Buffer) => {
            stderrChunks.push(data.toString('utf-8'))
        })

        cp.on('error', (err) => {
            reject(new AppError('AUDIT_FAILED', `Failed to run pnpm audit: ${err.message}`, { cause: err }))
        })

        cp.on('close', (code) => {
            const stdout = stdoutChunks.join('').trim()
            if (!stdout) {
                const stderr = stderrChunks.join('').trim()
                reject(new AppError(
                    'AUDIT_FAILED',
                    `pnpm audit produced no JSON output (exit code ${code ?? -1}). Ensure the workspace has a lockfile.${stderr ? ` ${stderr}` : ''}`,
                ))
                return
            }

            try {
                resolve(JSON.parse(stdout))
            } catch (error) {
                reject(new AppError('AUDIT_FAILED', `Failed to parse pnpm audit JSON output: ${error instanceof Error ? error.message : String(error)}`))
            }
        })
    })
}

// ---------------------------------------------------------------------------
// 解析与归一化（移植自 collect-security-alerts.mjs，保持口径一致）
// ---------------------------------------------------------------------------

interface RiskRecord {
    advisoryId: string
    packageName: string
    severity: string
    title: string
    htmlUrl: string
    patchedVersion: string | null
}

/** pnpm audit 修复版本的空值哨兵（无可用修复） */
function normalizePatchedVersionValue(value: unknown): string | null {
    const normalized = String(value ?? '').trim().toLowerCase()
    if (!normalized || ['<0.0.0', 'manual review required', 'none', 'unavailable'].includes(normalized)) {
        return null
    }
    // legacy 格式 patched_versions 为 range（如 ">=0.2.4" / ">=1.2.3 <2"）：剥离前缀取首个裸版本，
    // 否则 compareSemver 对 ">=x.y.z" 解析退化为 [0,0,0]，当前版本被误判"已达标"而假跳过
    // （T801 容器实证暴露：minimist 0.0.8 被日志判定 "0.0.8 >= >=0.2.4" 而跳过修复）。
    // 已知边界（与旧行为等价，未变差）：两段版本（"1.2.x"→"1.2"）、">=0.0.0"（剥离为 0.0.0 后任何
    // 版本判已达标）、pre-release range（compareSemver 忽略 pre-release 段）仍可能假跳过——
    // 真实 npm advisory patched_versions 以 ">=x.y.z" / ">=x.y.z <x.y.z" 为主，残余面罕见，暂登记不处理
    const versionMatch = /(\d+\.\d+(?:\.\d+)?(?:-[0-9a-z.]+)?)/i.exec(normalized)
    if (versionMatch) {
        return versionMatch[1]
    }
    return String(value).trim()
}

/** 提取 advisory id：GitHub Advisory → CVE → URL → 原始 id（参考实现 resolveAdvisoryId） */
function resolveAdvisoryId(candidate: Record<string, unknown>): string {
    const githubAdvisoryId = candidate.github_advisory_id
    if (typeof githubAdvisoryId === 'string' && githubAdvisoryId) {
        return githubAdvisoryId
    }
    const cves = candidate.cves
    if (Array.isArray(cves) && typeof cves[0] === 'string' && cves[0]) {
        return cves[0]
    }
    if (typeof candidate.url === 'string' && candidate.url) {
        return candidate.url
    }
    if (candidate.id !== undefined && candidate.id !== null) {
        return String(candidate.id)
    }
    return 'unknown-advisory'
}

function toArray(value: unknown): unknown[] {
    return Array.isArray(value) ? value : []
}

/** legacy 格式（pnpm <= 7 的 `advisories`/`actions`）解析 */
function parseLegacyAuditReport(report: Record<string, unknown>): RiskRecord[] {
    const advisories = report.advisories
    if (!advisories || typeof advisories !== 'object') {
        return []
    }

    // actions 提供修复版本（action.target）
    const actionMap = new Map<string, string | undefined>()
    for (const action of toArray(report.actions)) {
        if (!action || typeof action !== 'object') {
            continue
        }
        const record = action as Record<string, unknown>
        const target = typeof record.target === 'string' && record.target ? record.target : undefined
        for (const resolves of toArray(record.resolves)) {
            if (resolves && typeof resolves === 'object' && (resolves as Record<string, unknown>).id !== undefined) {
                actionMap.set(String((resolves as Record<string, unknown>).id), target)
            }
        }
    }

    const risks: RiskRecord[] = []
    for (const [id, rawAdvisory] of Object.entries(advisories as Record<string, unknown>)) {
        if (!rawAdvisory || typeof rawAdvisory !== 'object') {
            continue
        }
        const advisory = rawAdvisory as Record<string, unknown>
        const patched = normalizePatchedVersionValue(
            actionMap.get(id) ?? (typeof advisory.patched_versions === 'string' ? advisory.patched_versions : undefined),
        )
        risks.push({
            advisoryId: resolveAdvisoryId(advisory),
            packageName: typeof advisory.module_name === 'string' ? advisory.module_name : 'unknown-package',
            severity: typeof advisory.severity === 'string' ? advisory.severity : 'medium',
            title: typeof advisory.title === 'string' ? advisory.title : 'Untitled advisory',
            htmlUrl: typeof advisory.url === 'string' ? advisory.url : '',
            patchedVersion: patched,
        })
    }
    return risks
}

/** modern 格式（pnpm >= 8 的 `vulnerabilities`/`via`）解析 */
function parseModernAuditReport(report: Record<string, unknown>): RiskRecord[] {
    const vulnerabilities = report.vulnerabilities
    if (!vulnerabilities || typeof vulnerabilities !== 'object') {
        return []
    }

    const risks: RiskRecord[] = []
    for (const rawVulnerability of Object.values(vulnerabilities as Record<string, unknown>)) {
        if (!rawVulnerability || typeof rawVulnerability !== 'object') {
            continue
        }
        const vulnerability = rawVulnerability as Record<string, unknown>
        const packageName = typeof vulnerability.name === 'string' ? vulnerability.name : 'unknown-package'
        const fixAvailable = vulnerability.fixAvailable
        const patchedFromFixAvailable = ((): string | null => {
            if (typeof fixAvailable === 'string' && fixAvailable) {
                return normalizePatchedVersionValue(fixAvailable)
            }
            if (fixAvailable && typeof fixAvailable === 'object') {
                const fix = fixAvailable as Record<string, unknown>
                if (typeof fix.version === 'string' && fix.version) {
                    return normalizePatchedVersionValue(fix.version)
                }
            }
            return null
        })()

        const viaItems = toArray(vulnerability.via).filter((item): item is Record<string, unknown> => item !== null && typeof item === 'object')

        if (viaItems.length === 0) {
            risks.push({
                advisoryId: resolveAdvisoryId(vulnerability),
                packageName,
                severity: typeof vulnerability.severity === 'string' ? vulnerability.severity : 'medium',
                title: typeof vulnerability.title === 'string' ? vulnerability.title : `${packageName} vulnerability`,
                htmlUrl: typeof vulnerability.url === 'string' ? vulnerability.url : '',
                patchedVersion: patchedFromFixAvailable,
            })
            continue
        }

        for (const advisory of viaItems) {
            let severity = typeof vulnerability.severity === 'string' ? vulnerability.severity : 'medium'
            if (typeof advisory.severity === 'string' && advisory.severity) {
                severity = advisory.severity
            }
            risks.push({
                advisoryId: resolveAdvisoryId(advisory),
                packageName: typeof advisory.name === 'string' && advisory.name ? advisory.name : packageName,
                severity,
                title: typeof advisory.title === 'string' ? advisory.title : `${packageName} vulnerability`,
                htmlUrl: typeof advisory.url === 'string' ? advisory.url : '',
                patchedVersion: patchedFromFixAvailable,
            })
        }
    }
    return risks
}

/**
 * 解析 pnpm audit 报告（legacy + modern 双格式），按
 * `packageName:advisoryId:severity` 去重（保留首个，advisoryId 优先补全）。
 */
export function parseAuditReport(report: unknown): RiskRecord[] {
    if (!report || typeof report !== 'object') {
        return []
    }
    const record = report as Record<string, unknown>
    const risks = [...parseLegacyAuditReport(record), ...parseModernAuditReport(record)]

    const deduped = new Map<string, RiskRecord>()
    for (const risk of risks) {
        const key = `${risk.packageName}:${risk.advisoryId}:${risk.severity}`
        const current = deduped.get(key)
        if (!current) {
            deduped.set(key, risk)
            continue
        }
        // 合并补全：同 key 的 advisoryId 必然相同（key 含 advisoryId），仅 htmlUrl/patchedVersion 可达。
        // advisoryId 恒为 'unknown-advisory' 的条目（理论兜底，实际 via/legacy 均恒有 url）
        // 会与同包同 severity 的其他无 id 条目合并——与参考实现同款行为，风险已接受。
        deduped.set(key, {
            advisoryId: current.advisoryId,
            packageName: current.packageName,
            severity: current.severity,
            title: current.title || risk.title,
            htmlUrl: current.htmlUrl || risk.htmlUrl,
            patchedVersion: current.patchedVersion ?? risk.patchedVersion,
        })
    }
    return [...deduped.values()]
}

// ---------------------------------------------------------------------------
// 归一化告警映射
// ---------------------------------------------------------------------------

/**
 * advisoryId 的稳定数字哈希（`NormalizedSecurityAlert.id` 为 number）。
 * 取 sha256 前 4 字节完整 uint32（非设计稿的 `% 2^31`：uint32 语义更自然，
 * 碰撞概率 ~2^-32/对，12 条告警场景生日界 ~1.6e-8，可忽略）。
 */
export function hashAdvisoryId(packageName: string, advisoryId: string): number {
    const digest = createHash('sha256').update(`${packageName}:${advisoryId}`).digest()
    return digest.readUInt32BE(0)
}

/** audit 风险 → 标准化告警（source='pnpm-audit'，repository 由调用方注入） */
function mapAuditRiskToAlert(risk: RiskRecord, repository: string): NormalizedSecurityAlert {
    const fixable = risk.patchedVersion !== null
    return {
        id: hashAdvisoryId(risk.packageName, risk.advisoryId),
        source: 'pnpm-audit',
        repository,
        defaultBranch: '',
        severity: normalizeAuditSeverity(risk.severity),
        packageEcosystem: 'npm',
        packageName: risk.packageName,
        manifestPath: '',
        ruleId: risk.advisoryId,
        summary: risk.title,
        htmlUrl: risk.htmlUrl,
        fixable,
        fixStrategy: fixable ? 'upgrade' : null,
        recommendedVersion: risk.patchedVersion ?? '',
        // audit 输出的依赖链路径无法可靠区分 direct/transitive，留空
        dependencyType: undefined,
    }
}
