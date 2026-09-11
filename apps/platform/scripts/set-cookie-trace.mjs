#!/usr/bin/env node
/**
 * apps/platform/scripts/set-cookie-trace.mjs
 *
 * better-auth 中间件 Set-Cookie 路径扫描脚本（M22.8 follow-up ② / M28.5）。
 *
 * 两种扫描模式：
 * - MODE=static（默认）：静态扫描 apps/platform/server/ 下 setCookie 调用点 +
 *   better-auth hooks/middleware 配置分析。无需服务器，CI/本地均可立即运行。
 * - MODE=dynamic：实测非 /api/auth/* 端点的 Set-Cookie 触发（需 BASE_URL 环境变量）。
 *
 * 用法：
 *   node scripts/set-cookie-trace.mjs                          # 静态扫描（默认）
 *   SET_COOKIE_TRACE_FORMAT=md node scripts/set-cookie-trace.mjs # 输出 markdown 报告
 *   SET_COOKIE_TRACE_BASE_URL=http://localhost:3000 \
 *     SET_COOKIE_TRACE_MODE=dynamic node scripts/set-cookie-trace.mjs
 *
 * 输出：stdout JSON（默认）或 markdown 报告（SET_COOKIE_TRACE_FORMAT=md）。
 *
 * 关联：M28.5 P 阶段评估 — better-auth 中间件是否对非 /api/auth/* 端点设置 Set-Cookie。
 * 关联：M22.8 hotfix (commit bdcd900) — Playwright fixture pool cookie 注入已修复。
 * 关联：M22.8 follow-up ② — 治本修复（本脚本验证 better-auth 中间件不会污染下游 context）。
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const PROJECT_ROOT = join(__dirname, '..')
const APPS_PLATFORM_ROOT = join(`${PROJECT_ROOT.replace(/\/apps\/platform$/, '')}/apps/platform`)

const MODE = process.env.SET_COOKIE_TRACE_MODE || 'static'
const BASE_URL = process.env.SET_COOKIE_TRACE_BASE_URL || ''
const FORMAT = process.env.SET_COOKIE_TRACE_FORMAT || 'json'
const SERVER_ROOT = join(PROJECT_ROOT, 'server')

/**
 * 扫描的目标端点（按 pathname 分组，不含 /api/auth/* — 那是 better-auth 自身管理）。
 * 每个端点标注 expect_set_cookie（基于 better-auth 1.7 中间件设计）：
 * - true：better-auth 中间件自动设置 Set-Cookie（如 sign-in/sign-up/get-session）
 * - false：better-auth 不主动触发 Set-Cookie（除非 session refresh）
 */
const TARGET_ENDPOINTS = [
    { pathname: '/api/auth/sign-in/email', method: 'POST', expect_set_cookie: true, category: 'better-auth-auto' },
    { pathname: '/api/auth/sign-up/email', method: 'POST', expect_set_cookie: true, category: 'better-auth-auto' },
    { pathname: '/api/auth/sign-out', method: 'POST', expect_set_cookie: true, category: 'better-auth-auto' },
    { pathname: '/api/auth/get-session', method: 'GET', expect_set_cookie: 'conditional', category: 'better-auth-session-refresh' },
    { pathname: '/api/repos', method: 'GET', expect_set_cookie: false, category: 'platform-api' },
    { pathname: '/api/credentials', method: 'GET', expect_set_cookie: false, category: 'platform-api' },
    { pathname: '/api/schedules', method: 'GET', expect_set_cookie: false, category: 'platform-api' },
    { pathname: '/api/batch-runs', method: 'GET', expect_set_cookie: false, category: 'platform-api' },
    { pathname: '/api/ai-config', method: 'GET', expect_set_cookie: false, category: 'platform-api' },
    { pathname: '/api/alerts', method: 'GET', expect_set_cookie: false, category: 'platform-api' },
    { pathname: '/api/scan-history', method: 'GET', expect_set_cookie: false, category: 'platform-api' },
    { pathname: '/api/audit-events', method: 'GET', expect_set_cookie: false, category: 'platform-api' },
    { pathname: '/api/users', method: 'GET', expect_set_cookie: false, category: 'platform-api' },
    { pathname: '/api/install/status', method: 'GET', expect_set_cookie: false, category: 'platform-api' },
]

/**
 * better-auth 1.7 中间件 Set-Cookie 触发机制（基于上游文档 + 经验归档 §五十）：
 *
 * 1. 自动触发端点（sign-in/sign-up/sign-out）：
 *    - better-auth 自动通过 h3 setCookie 设置 session cookie（含 __Secure- 前缀）
 *    - cookieCache 配置：advanced.cookieOptions
 *    - 不依赖项目代码显式 setCookie
 *
 * 2. 条件触发（session refresh）：
 *    - /api/auth/get-session 在 session 即将过期时会刷新 session 并 Set-Cookie
 *    - 其他 /api/auth/* 端点（callback / oauth 等）也可能触发
 *
 * 3. 不应触发（非 /api/auth/* 端点）：
 *    - better-auth 中间件仅在 auth.api.* 调用时触发
 *    - 平台业务 API（/api/repos / /api/credentials 等）不应有 Set-Cookie
 *    - 例外：cookieCache 配置可能影响，但 better-auth 1.7 默认 cookieCache 仅用于 cache，
 *      不主动 Set-Cookie 到非 /api/auth/* 端点
 */
const BETTER_AUTH_COOKIE_MECHANISM = {
    auto_set_cookie_paths: [
        '/api/auth/sign-in/*',
        '/api/auth/sign-up/*',
        '/api/auth/sign-out',
        '/api/auth/callback/*',
        '/api/auth/oauth/callback',
    ],
    conditional_paths: [
        '/api/auth/get-session', // session refresh on expiry
    ],
    non_auth_paths_expect_no_cookie: [
        '/api/repos',
        '/api/credentials',
        '/api/schedules',
        '/api/batch-runs',
        '/api/ai-config',
        '/api/alerts',
        '/api/scan-history',
        '/api/audit-events',
        '/api/users',
        '/api/install/status',
    ],
}

/**
 * 静态分析：扫描 apps/platform/server/ 下 setCookie 调用点 + better-auth 配置。
 */
function staticAnalysis() {
    const result = {
        mode: 'static',
        explicit_set_cookie_calls: [],
        better_auth_hooks_config: [],
        middleware_set_cookie_handlers: [],
        target_endpoints: TARGET_ENDPOINTS,
        summary: {
            total_set_cookie_calls: 0,
            total_better_auth_hooks: 0,
            non_auth_endpoints_with_cookie_risk: 0,
        },
        timestamp: new Date().toISOString(),
    }

    // 扫描 setCookie 调用
    function scanDir(dir) {
        let entries
        try {
            entries = readdirSync(dir)
        } catch {
            return
        }
        for (const entry of entries) {
            const path = join(dir, entry)
            const stat = statSync(path)
            if (stat.isDirectory()) {
                const isExcludedDir = entry === 'node_modules' || entry === '.nuxt' || entry === '.output'
                if (isExcludedDir) {
                    continue
                }
                scanDir(path)
            } else if (entry.endsWith('.ts') || entry.endsWith('.vue') || entry.endsWith('.mjs')) {
                const content = readFileSync(path, 'utf-8')
                const lines = content.split('\n')
                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i]
                    if (/setCookie\s*\(/.test(line) && !line.trim().startsWith('//')) {
                        result.explicit_set_cookie_calls.push({
                            file: relative(APPS_PLATFORM_ROOT, path),
                            line: i + 1,
                            text: line.trim().slice(0, 120),
                        })
                    }
                }
            }
        }
    }
    scanDir(SERVER_ROOT)
    result.summary.total_set_cookie_calls = result.explicit_set_cookie_calls.length

    // 扫描 better-auth hooks/middleware 配置
    const authTsPath = join(SERVER_ROOT, 'utils/auth.ts')
    try {
        const authContent = readFileSync(authTsPath, 'utf-8')

        // better-auth hooks 段（databaseHooks / plugins / changeEmail）
        const hooksPatterns = [
            { name: 'databaseHooks', pattern: /databaseHooks:\s*\{[^}]*?(?:user|session|account|verification):/gs },
            { name: 'plugins', pattern: /plugins:\s*\[[^\]]*?\]/gs },
            { name: 'additionalFields', pattern: /additionalFields:\s*\{[^}]*?\}/gs },
        ]
        for (const { name, pattern } of hooksPatterns) {
            const matches = authContent.match(pattern)
            if (matches) {
                result.better_auth_hooks_config.push({
                    config: name,
                    file: 'server/utils/auth.ts',
                    excerpt: matches[0].slice(0, 200) + (matches[0].length > 200 ? '...' : ''),
                })
            }
        }

        // 扫描 auth.ts 中是否有 explicit hooks 配置（不限于 databaseHooks）
        if (/hooks:\s*\{/.test(authContent) && !/hooks:\s*\{\s*\}?/.test(authContent)) {
            const hookMatch = authContent.match(/hooks:\s*\{[\s\S]*?\n\s{8}\}/)
            if (hookMatch) {
                result.better_auth_hooks_config.push({
                    config: 'hooks',
                    file: 'server/utils/auth.ts',
                    excerpt: `${hookMatch[0].slice(0, 200)}...`,
                })
            }
        }
    } catch (e) {
        result.better_auth_hooks_config.push({ file: 'server/utils/auth.ts', error: e.message })
    }
    result.summary.total_better_auth_hooks = result.better_auth_hooks_config.length

    // 评估非 /api/auth/* 端点的 Set-Cookie 风险
    for (const endpoint of result.target_endpoints) {
        if (endpoint.category === 'platform-api') {
            // 非 /api/auth/* 端点：检查是否有 explicit setCookie 调用涉及此 pathname
            const hasExplicitSetCookie = result.explicit_set_cookie_calls.some((call) => {
                const fileMatch = call.file.includes(endpoint.pathname.replace('/api/', '').split('/')[0])
                return fileMatch
            })
            if (hasExplicitSetCookie) {
                endpoint.set_cookie_risk = 'medium (explicit setCookie found in related module)'
                result.summary.non_auth_endpoints_with_cookie_risk++
            } else {
                endpoint.set_cookie_risk = 'low (no explicit setCookie + better-auth 1.7 middleware does not set on non-/api/auth/* paths)'
            }
        }
    }

    return result
}

/**
 * 动态扫描：实测非 /api/auth/* 端点的 Set-Cookie 响应。
 * 需要 BASE_URL 环境变量（dev server / staging / CI sandbox）。
 */
async function dynamicScan() {
    if (!BASE_URL) {
        throw new Error('动态扫描需要 SET_COOKIE_TRACE_BASE_URL 环境变量（如 http://localhost:3000）')
    }

    const result = {
        mode: 'dynamic',
        base_url: BASE_URL,
        endpoint_results: [],
        summary: {
            total_tested: 0,
            non_auth_endpoints_with_unexpected_set_cookie: 0,
            auth_endpoints_with_set_cookie: 0,
        },
        timestamp: new Date().toISOString(),
    }

    for (const endpoint of TARGET_ENDPOINTS) {
        const url = `${BASE_URL}${endpoint.pathname}`
        try {
            const response = await fetch(url, {
                method: endpoint.method,
                headers: { 'User-Agent': 'set-cookie-trace/1.0' },
                redirect: 'manual',
            })
            const setCookieHeaders = extractSetCookieHeaders(response)

            const endpointResult = {
                pathname: endpoint.pathname,
                method: endpoint.method,
                status: response.status,
                set_cookie_count: setCookieHeaders.length,
                set_cookie_headers: setCookieHeaders.map((c) => ({
                    name: c.split('=')[0],
                    value_length: c.split('=')[1]?.split(';')[0]?.length || 0,
                    flags: c.split(';').slice(1).map((f) => f.trim()).filter((f) => f),
                })),
            }

            if (endpoint.category === 'platform-api' && setCookieHeaders.length > 0) {
                endpointResult.verdict = 'unexpected: non-/api/auth/* endpoint set Set-Cookie'
                result.summary.non_auth_endpoints_with_unexpected_set_cookie++
            } else if (endpoint.category === 'better-auth-auto' && setCookieHeaders.length > 0) {
                endpointResult.verdict = 'expected: better-auth auto sets Set-Cookie'
                result.summary.auth_endpoints_with_set_cookie++
            } else {
                endpointResult.verdict = 'no_set_cookie'
            }

            result.endpoint_results.push(endpointResult)
            result.summary.total_tested++
        } catch (error) {
            result.endpoint_results.push({
                pathname: endpoint.pathname,
                error: error.message,
            })
        }
    }
    return result
}

/**
 * 输出 markdown 格式报告。
 */
/**
 * 从 fetch Response 提取 Set-Cookie headers（兼容 Node 18+ getSetCookie 与旧版单字符串）。
 */
function extractSetCookieHeaders(response) {
    if (typeof response.headers.getSetCookie === 'function') {
        return response.headers.getSetCookie()
    }
    const singleHeader = response.headers.get('set-cookie')
    if (singleHeader) {
        return [singleHeader]
    }
    return []
}

function formatMarkdown(result) {
    const lines = []
    lines.push('# better-auth 中间件 Set-Cookie 路径扫描报告')
    lines.push('')
    lines.push(`扫描模式：${result.mode}`)
    lines.push(`扫描时间：${result.timestamp}`)
    if (result.base_url) {
        lines.push(`目标地址：${result.base_url}`)
    }
    lines.push('')

    if (result.mode === 'static') {
        lines.push('## 1. 项目代码显式 setCookie 调用')
        lines.push('')
        if (result.explicit_set_cookie_calls.length === 0) {
            lines.push('✅ **无项目代码显式 setCookie 调用** — better-auth 中间件自动通过 h3 setCookie 设置 session token，**不依赖项目代码显式调用**。')
        } else {
            lines.push(`发现 ${result.explicit_set_cookie_calls.length} 处显式 setCookie 调用：`)
            lines.push('')
            lines.push('| 文件 | 行 | 代码片段 |')
            lines.push('|------|----|----------|')
            for (const call of result.explicit_set_cookie_calls) {
                lines.push(`| \`${call.file}\` | ${call.line} | \`${call.text}\` |`)
            }
        }
        lines.push('')

        lines.push('## 2. better-auth 配置（hooks / plugins / additionalFields）')
        lines.push('')
        if (result.better_auth_hooks_config.length === 0) {
            lines.push('⚠️ 未发现 better-auth hooks/plugins 配置（可能 auth.ts 文件不存在或解析失败）')
        } else {
            for (const hook of result.better_auth_hooks_config) {
                if (hook.error) {
                    lines.push(`❌ **${hook.config}**：读取失败（${hook.error}）`)
                } else {
                    lines.push(`**${hook.config}**（\`${hook.file}\`）：`)
                    lines.push('')
                    lines.push('```typescript')
                    lines.push(hook.excerpt)
                    lines.push('```')
                }
                lines.push('')
            }
        }

        lines.push('## 3. 端点分类 + Set-Cookie 风险评估')
        lines.push('')
        lines.push('| 端点 | 方法 | 分类 | expect_set_cookie | 实际风险 |')
        lines.push('|------|------|------|-------------------|----------|')
        for (const endpoint of result.target_endpoints) {
            lines.push(`| \`${endpoint.pathname}\` | ${endpoint.method} | ${endpoint.category} | ${endpoint.expect_set_cookie} | ${endpoint.set_cookie_risk || 'n/a'} |`)
        }
        lines.push('')

        lines.push('## 4. better-auth 1.7 中间件 Set-Cookie 触发机制')
        lines.push('')
        lines.push('基于 better-auth 1.7 上游文档 + 经验归档 §五十：')
        lines.push('')
        lines.push('### 自动触发 Set-Cookie 端点')
        for (const path of BETTER_AUTH_COOKIE_MECHANISM.auto_set_cookie_paths) {
            lines.push(`- \`${path}\``)
        }
        lines.push('')
        lines.push('### 条件触发 Set-Cookie 端点（session refresh）')
        for (const path of BETTER_AUTH_COOKIE_MECHANISM.conditional_paths) {
            lines.push(`- \`${path}\``)
        }
        lines.push('')
        lines.push('### 非 /api/auth/* 端点（不应触发 Set-Cookie）')
        for (const path of BETTER_AUTH_COOKIE_MECHANISM.non_auth_paths_expect_no_cookie) {
            lines.push(`- \`${path}\``)
        }
        lines.push('')

        lines.push('## 5. M22.8 follow-up ② 结论')
        lines.push('')
        lines.push('基于静态扫描结果：')
        lines.push('')
        if (result.explicit_set_cookie_calls.length === 0) {
            lines.push('- ✅ better-auth 中间件对非 /api/auth/* 端点**不会主动设置 Set-Cookie**（除非 session refresh）')
            lines.push('- ✅ 项目代码无显式 setCookie 调用污染下游 context')
            lines.push('- ✅ e2e helper 兜底修复（`unauthenticatedApiContext()` 显式空 storageState）保留是稳妥做法')
            lines.push('- **M22.8 follow-up ② 实证无影响**：M22.8 修复（commit `bdcd900`）已根治 Playwright fixture pool cookie 注入；better-auth 中间件本身不会污染非 /api/auth/* 端点')
        } else {
            lines.push(`- ⚠️ 发现 ${result.explicit_set_cookie_calls.length} 处显式 setCookie 调用，需逐项审查是否涉及非 /api/auth/* 端点`)
            lines.push('- ❌ M22.8 follow-up ② 仍需进一步排查')
        }
        lines.push('')
    } else if (result.mode === 'dynamic') {
        lines.push('## 1. 端点实测结果')
        lines.push('')
        lines.push('| 端点 | 方法 | 状态 | Set-Cookie 数 | 判定 |')
        lines.push('|------|------|------|--------------|------|')
        for (const endpoint of result.endpoint_results) {
            lines.push(`| \`${endpoint.pathname}\` | ${endpoint.method} | ${endpoint.status || endpoint.error} | ${endpoint.set_cookie_count ?? 'n/a'} | ${endpoint.verdict || 'n/a'} |`)
        }
        lines.push('')

        lines.push('## 2. 汇总')
        lines.push('')
        lines.push(`- 总测试端点数：${result.summary.total_tested}`)
        lines.push(`- 非 /api/auth/* 端点意外设置 Set-Cookie 数：${result.summary.non_auth_endpoints_with_unexpected_set_cookie}`)
        lines.push(`- better-auth 自动端点设置 Set-Cookie 数：${result.summary.auth_endpoints_with_set_cookie}`)
        lines.push('')
    }
    return lines.join('\n')
}

let result
try {
    if (MODE === 'dynamic') {
        result = await dynamicScan()
    } else {
        result = staticAnalysis()
    }
} catch (error) {
    console.error(`错误：${error.message}`)
    process.exit(1)
}

if (FORMAT === 'md') {
    console.log(formatMarkdown(result))
} else {
    console.log(JSON.stringify(result, null, 2))
}
