#!/usr/bin/env node
/**
 * packages/engine/src/code-scanning/scripts/sample-collector.mjs
 *
 * 真实 GitHub Code Scanning 仓库 API 样本采集脚本（M28.3 / C15）。
 *
 * 用途：在已实现 A/B/C 分层基础上做真实仓库样本核对（B 类规则 id 格式与变体分布）。
 *
 * 用法：
 *   # 采集模式（需 GITHUB_TOKEN 环境变量）
 *   GITHUB_TOKEN=ghp_xxx node scripts/sample-collector.mjs \
 *     --output real-samples.json
 *
 *   # 离线分析模式（从已有 fixture 读取，输出 Markdown 报告）
 *   node scripts/sample-collector.mjs \
 *     --input real-samples.json \
 *     --output b-class-samples-report.md
 *
 *   # fixture 模板生成（无 token，输出空 fixture 结构）
 *   node scripts/sample-collector.mjs --init-template \
 *     --output real-samples.template.json
 *
 * 种子仓库列表：32 个仓库跨 js/ts / py / java / go / ruby 5 语言（每语言 ≥ 6）。
 * 选择标准：流行 + Code Scanning 默认启用（GitHub CodeQL 自动扫描）。
 *
 * 速率限制：5000/h authenticated；分批采集（每个仓库 1 次 listAlertsForRepo）+ rate limit 重试。
 *
 * 关联：M28.3 / C15 / rule-classifier.ts SUGGESTED_RULES 注释"真实仓库 API 样本核对"。
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { argv, env, exit, stderr, stdout } from 'node:process'
import { Octokit } from '@octokit/rest'

// ---------------------------------------------------------------------------
// 种子仓库列表（32 仓库跨 5 语言 / 每语言 ≥ 6）
// ---------------------------------------------------------------------------

const SEED_REPOS = [
    // JavaScript / TypeScript (8)
    { owner: 'facebook', repo: 'react', language: 'js' },
    { owner: 'vuejs', repo: 'core', language: 'js' },
    { owner: 'microsoft', repo: 'vscode', language: 'ts' },
    { owner: 'angular', repo: 'angular.js', language: 'js' },
    { owner: 'nodejs', repo: 'node', language: 'js' },
    { owner: 'expressjs', repo: 'express', language: 'js' },
    { owner: 'webpack', repo: 'webpack', language: 'js' },
    { owner: 'mrdoob', repo: 'three.js', language: 'js' },

    // Python (6)
    { owner: 'django', repo: 'django', language: 'py' },
    { owner: 'pallets', repo: 'flask', language: 'py' },
    { owner: 'psf', repo: 'requests', language: 'py' },
    { owner: 'pallets', repo: 'click', language: 'py' },
    { owner: 'python', repo: 'cpython', language: 'py' },
    { owner: 'pydantic', repo: 'pydantic', language: 'py' },

    // Java (6)
    { owner: 'spring-projects', repo: 'spring-framework', language: 'java' },
    { owner: 'apache', repo: 'kafka', language: 'java' },
    { owner: 'elastic', repo: 'elasticsearch', language: 'java' },
    { owner: 'google', repo: 'guava', language: 'java' },
    { owner: 'square', repo: 'okhttp', language: 'java' },
    { owner: 'ReactiveX', repo: 'RxJava', language: 'java' },

    // Go (6)
    { owner: 'gin-gonic', repo: 'gin', language: 'go' },
    { owner: 'gorilla', repo: 'mux', language: 'go' },
    { owner: 'spf13', repo: 'cobra', language: 'go' },
    { owner: 'gohugoio', repo: 'hugo', language: 'go' },
    { owner: 'prometheus', repo: 'prometheus', language: 'go' },
    { owner: 'caddyserver', repo: 'caddy', language: 'go' },

    // Ruby (6)
    { owner: 'rails', repo: 'rails', language: 'ruby' },
    { owner: 'jekyll', repo: 'jekyll', language: 'ruby' },
    { owner: 'discourse', repo: 'discourse', language: 'ruby' },
    { owner: 'fastlane', repo: 'fastlane', language: 'ruby' },
    { owner: 'rubocop', repo: 'rubocop', language: 'ruby' },
    { owner: 'sidekiq', repo: 'sidekiq', language: 'ruby' },
]

const LANGUAGES = ['js', 'ts', 'py', 'java', 'go', 'ruby']

// ---------------------------------------------------------------------------
// CLI 解析
// ---------------------------------------------------------------------------

function parseArgs(argv) {
    const args = argv.slice(2)
    const opts = {
        input: null,
        output: 'real-samples.json',
        reportOutput: 'docs/research/code-scanning-b-class-samples.md',
        initTemplate: false,
        rateLimitRetries: 3,
    }
    for (const arg of args) {
        if (arg.startsWith('--input=')) {
            opts.input = arg.slice(8)
        } else if (arg.startsWith('--output=')) {
            opts.output = arg.slice(9)
        } else if (arg.startsWith('--report-output=')) {
            opts.reportOutput = arg.slice(16)
        } else if (arg === '--init-template') {
            opts.initTemplate = true
        } else if (arg.startsWith('--retries=')) {
            opts.rateLimitRetries = Number(arg.slice(10))
        } else if (arg === '--help' || arg === '-h') {
            printHelp()
            process.exit(0)
        }
    }
    return opts
}

function printHelp() {
    stdout.write(`Usage: node sample-collector.mjs [options]

Options:
  --input=<path>          从已有 fixture 读取（离线分析模式）
  --output=<path>         采集模式输出路径（默认 real-samples.json）
  --report-output=<path>  分析模式输出 Markdown 报告路径（默认 docs/research/code-scanning-b-class-samples.md）
  --init-template         输出空 fixture 模板（用于离线分析准备）
  --retries=<n>           GitHub API 速率限制重试次数（默认 3）
  --help, -h              显示帮助

环境变量：
  GITHUB_TOKEN           GitHub Personal Access Token（必需于采集模式）

Examples:
  GITHUB_TOKEN=ghp_xxx node sample-collector.mjs --output real-samples.json
  node sample-collector.mjs --input real-samples.json
  node sample-collector.mjs --init-template --output template.json
`)
}

// ---------------------------------------------------------------------------
// GitHub API 速率限制重试辅助
// ---------------------------------------------------------------------------

async function withRateLimitRetry(fn, retries = 3, baseDelayMs = 1000) {
    let lastError
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            return await fn()
        } catch (error) {
            const isRateLimit = error.status === 403
                && (error.message?.includes('rate limit')
                    || error.response?.headers?.['x-ratelimit-remaining'] === '0')
            if (!isRateLimit || attempt === retries) {
                lastError = error
                break
            }
            // exponential backoff with secondary rate limit respect
            const retryAfterMs = Number(error.response?.headers?.['retry-after']) * 1000 || 0
            const delayMs = Math.max(retryAfterMs, baseDelayMs * 2 ** attempt)
            stderr.write(`Rate limited; retrying after ${delayMs}ms (attempt ${attempt + 1}/${retries})\n`)
            await new Promise((resolve) => setTimeout(resolve, delayMs))
        }
    }
    throw lastError
}

// ---------------------------------------------------------------------------
// 采集模式：调用 GitHub Code Scanning API
// ---------------------------------------------------------------------------

async function fetchRepoAlerts(octokit, owner, repo) {
    try {
        const data = await withRateLimitRetry(async () => {
            const response = await octokit.paginate(
                octokit.rest.codeScanning.listAlertsForRepo,
                { owner, repo, state: 'open', per_page: 100 },
            )
            return response
        })
        return data
    } catch (error) {
        if (error.status === 404) {
            // 仓库无 Code Scanning alerts 或不存在
            return null
        }
        if (error.status === 403 && error.message?.includes('rate limit')) {
            stderr.write(`secondary rate limit hit: ${owner}/${repo}, skipping\n`)
            return null
        }
        throw error
    }
}

async function collectSamples(token, seedRepos) {
    const octokit = new Octokit({ auth: token })
    const samples = []
    for (const { owner, repo, language } of seedRepos) {
        const alerts = await fetchRepoAlerts(octokit, owner, repo)
        if (alerts === null) {
            samples.push({
                owner, repo, language,
                has_code_scanning: false,
                alerts: [],
                note: 'no Code Scanning alerts (404 or rate-limited)',
            })
            continue
        }
        const ruleIds = [...new Set(alerts.map((a) => a.rule?.id).filter(Boolean))]
        const severityBreakdown = alerts.reduce((acc, a) => {
            const sev = a.rule?.severity || 'unknown'
            acc[sev] = (acc[sev] || 0) + 1
            return acc
        }, {})
        samples.push({
            owner, repo, language,
            has_code_scanning: true,
            alert_count: alerts.length,
            unique_rule_count: ruleIds.length,
            rule_ids: ruleIds,
            severity_breakdown: severityBreakdown,
        })
    }
    return samples
}

// ---------------------------------------------------------------------------
// 分析模式：从 fixture 统计 rule_id 变体分布
// ---------------------------------------------------------------------------

function analyzeSamples(samples) {
    const byLanguage = {}
    for (const lang of LANGUAGES) {
        byLanguage[lang] = {
            total_repos: 0,
            repos_with_alerts: 0,
            total_alerts: 0,
            unique_rule_ids: new Set(),
            rule_id_frequency: new Map(),
        }
    }
    let totalRepos = 0
    let reposWithAlerts = 0
    const allRuleIds = new Set()
    const ruleIdFrequency = new Map()
    for (const sample of samples) {
        totalRepos++
        const lang = sample.language
        if (!byLanguage[lang]) {
            byLanguage[lang] = createLangGroup()
        }
        const group = byLanguage[lang]
        group.total_repos++
        if (sample.has_code_scanning) {
            reposWithAlerts++
            group.repos_with_alerts++
            const ids = sample.rule_ids || []
            group.total_alerts += sample.alert_count || 0
            for (const ruleId of ids) {
                group.unique_rule_ids.add(ruleId)
                group.rule_id_frequency.set(ruleId, (group.rule_id_frequency.get(ruleId) || 0) + 1)
                allRuleIds.add(ruleId)
                ruleIdFrequency.set(ruleId, (ruleIdFrequency.get(ruleId) || 0) + 1)
            }
        }
    }
    return {
        totalRepos,
        reposWithAlerts,
        totalAlerts: samples.reduce((acc, s) => acc + (s.alert_count || 0), 0),
        uniqueRuleIdsCount: allRuleIds.size,
        ruleIdFrequency,
        byLanguage,
    }
}

function createLangGroup() {
    return {
        total_repos: 0,
        repos_with_alerts: 0,
        total_alerts: 0,
        unique_rule_ids: new Set(),
        rule_id_frequency: new Map(),
    }
}

// ---------------------------------------------------------------------------
// Markdown 报告生成
// ---------------------------------------------------------------------------

function generateMarkdownReport(analysis, samples) {
    const lines = []
    lines.push('# GitHub Code Scanning B 类规则样本报告')
    lines.push('')
    lines.push(`> **任务**：M28.3 / C15（[todo.md §M28.3](../../docs/plan/todo.md)）—— 在已实现 A/B/C 分层基础上做真实仓库样本核对（B 类规则 id 格式与变体分布 + 误判率）`)
    lines.push(`> **采集脚本**：[packages/engine/src/code-scanning/scripts/sample-collector.mjs](../../packages/engine/src/code-scanning/scripts/sample-collector.mjs)`)
    lines.push(`> **种子仓库**：32 个跨 js/ts / py / java / go / ruby 5 语言`)
    lines.push('')
    lines.push('## TL;DR')
    lines.push('')
    lines.push(`- 总仓库数：${analysis.totalRepos}`)
    lines.push(`- 含 Code Scanning alerts 的仓库数：${analysis.reposWithAlerts}`)
    lines.push(`- 总告警数：${analysis.totalAlerts}`)
    lines.push(`- 唯一 B/C 类规则 id 数：${analysis.uniqueRuleIdsCount}`)
    lines.push('')
    lines.push('## 按语言分组统计')
    lines.push('')
    lines.push('| 语言 | 仓库数 | 含 alerts 仓库 | 唯一 rule_id |')
    lines.push('|------|--------|---------------|--------------|')
    for (const lang of LANGUAGES) {
        const g = analysis.byLanguage[lang]
        if (!g || g.total_repos === 0) {
            continue
        }
        lines.push(`| ${lang} | ${g.total_repos} | ${g.repos_with_alerts} | ${g.unique_rule_ids.size} |`)
    }
    lines.push('')
    lines.push('## 全局 Top 20 高频 rule_id')
    lines.push('')
    const sortedRules = [...analysis.ruleIdFrequency.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
    lines.push('| rule_id | 出现仓库数 |')
    lines.push('|---------|------------|')
    for (const [ruleId, count] of sortedRules) {
        lines.push(`| \`${ruleId}\` | ${count} |`)
    }
    lines.push('')
    lines.push('## 按语言 Top 10 高频 rule_id')
    lines.push('')
    for (const lang of LANGUAGES) {
        const g = analysis.byLanguage[lang]
        if (!g || g.unique_rule_ids.size === 0) {
            continue
        }
        lines.push(`### ${lang}`)
        lines.push('')
        const sorted = [...g.rule_id_frequency.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
        lines.push('| rule_id | 出现仓库数 |')
        lines.push('|---------|------------|')
        for (const [ruleId, count] of sorted) {
            lines.push(`| \`${ruleId}\` | ${count} |`)
        }
        lines.push('')
    }
    lines.push('## B 类规则分级核对')
    lines.push('')
    lines.push('基于样本统计，识别 SUGGESTED_RULES（rule-config.ts B 类默认）未覆盖的高频 rule_id：')
    lines.push('')
    lines.push('### SUGGESTED_RULES 当前覆盖范围')
    lines.push('')
    lines.push('- `no-unused-vars`')
    lines.push('- `js/sql-injection` / `js/xss` / `js/path-injection` / `js/command-line-injection` / `js/insecure-randomness` / `js/weak-cryptographic-algorithm` / `js/missing-rate-limiting` / `js/clear-text-storage-of-sensitive-data` / `js/clear-text-transmission-of-sensitive-data` / `js/hardcoded-credentials`')
    lines.push('- `py/sql-injection` / `py/path-injection` / `py/command-line-injection` / `py/insecure-default-file-permissions`')
    lines.push('- `java/sql-injection` / `java/path-injection` / `java/command-line-injection`')
    lines.push('')
    lines.push('### 未覆盖语言 / 规则')
    lines.push('')
    lines.push('- `go/*`：SUGGESTED_RULES 未覆盖（rule-config.ts 注释明确"其余语言 Go/Ruby/csharp/cpp 落 C 类兜底"）')
    lines.push('- `ruby/*`：SUGGESTED_RULES 未覆盖')
    lines.push('- `csharp/*` / `cpp/*`：未列入种子仓库')
    lines.push('')
    lines.push('### 待对齐建议')
    lines.push('')
    lines.push('基于样本统计后给出（按需）：')
    lines.push('- `go/sql-injection` / `go/command-line-injection` / `go/path-injection` 等加入 SUGGESTED_RULES')
    lines.push('- `ruby/sql-injection` / `ruby/command-line-injection` 等加入 SUGGESTED_RULES')
    lines.push('- `js/*` 变体（如 `js/regex-injection` / `js/unsafe-deserialization` 等）按需')
    lines.push('')
    lines.push('## 数据明细')
    lines.push('')
    lines.push(`共 ${samples.length} 条样本，每条结构：`)
    lines.push('')
    lines.push('```json')
    lines.push('{')
    lines.push('  "owner": "facebook",')
    lines.push('  "repo": "react",')
    lines.push('  "language": "js",')
    lines.push('  "has_code_scanning": true,')
    lines.push('  "alert_count": 42,')
    lines.push('  "unique_rule_count": 15,')
    lines.push('  "rule_ids": ["js/...", "..."],')
    lines.push('  "severity_breakdown": { "warning": 30, "error": 12 }')
    lines.push('}')
    lines.push('```')
    lines.push('')
    lines.push('## 关联文档')
    lines.push('')
    lines.push('- [packages/engine/src/code-scanning/rule-config.ts](../../packages/engine/src/code-scanning/rule-config.ts)')
    lines.push('- [packages/engine/src/code-scanning/rule-classifier.ts](../../packages/engine/src/code-scanning/rule-classifier.ts)')
    lines.push('- [packages/engine/src/github/code-scanning-fetcher.ts](../../packages/engine/src/github/code-scanning-fetcher.ts)')
    lines.push('')
    return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Fixture 模板生成
// ---------------------------------------------------------------------------

function generateTemplate() {
    return {
        _meta: {
            description: 'Code Scanning 样本 fixture 模板（M28.3 / C15）',
            generated_at: new Date().toISOString(),
            seed_repos_count: SEED_REPOS.length,
            languages: LANGUAGES,
        },
        samples: SEED_REPOS.map((r) => ({
            owner: r.owner,
            repo: r.repo,
            language: r.language,
            has_code_scanning: false,
            alert_count: 0,
            unique_rule_count: 0,
            rule_ids: [],
            severity_breakdown: {},
        })),
    }
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

async function main() {
    const opts = parseArgs(argv)

    if (opts.initTemplate) {
        const template = generateTemplate()
        writeFileSync(opts.output, JSON.stringify(template, null, 2))
        stdout.write(`Wrote fixture template: ${opts.output}\n`)
        return
    }

    if (opts.input) {
        const fixtureContent = readFileSync(opts.input, 'utf-8')
        const data = JSON.parse(fixtureContent)
        const samples = data.samples || data
        const analysis = analyzeSamples(samples)
        const report = generateMarkdownReport(analysis, samples)
        writeFileSync(opts.reportOutput, report)
        stdout.write(`Analyzed ${samples.length} samples; wrote report: ${opts.reportOutput}\n`)
        return
    }

    const token = env.GITHUB_TOKEN
    if (!token) {
        stderr.write('错误: GITHUB_TOKEN 环境变量未设置（采集模式需要）\n')
        stderr.write('提示: 使用 --init-template 生成空 fixture 模板，或 --input 加载已有 fixture\n')
        exit(1)
    }
    stderr.write(`Collecting ${SEED_REPOS.length} samples...\n`)
    const samples = await collectSamples(token, SEED_REPOS)
    writeFileSync(opts.output, JSON.stringify({ samples, _meta: { collected_at: new Date().toISOString() } }, null, 2))
    stdout.write(`Collected ${samples.length} samples; wrote: ${opts.output}\n`)
}

main().catch((error) => {
    stderr.write(`错误: ${error.message}\n`)
    if (error.stack) {
        stderr.write(`${error.stack}\n`)
    }
    exit(1)
})
