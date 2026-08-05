// ---------------------------------------------------------------------------
// Code Scanning 规则分层（A/B/C）
//
// A = auto-fixable：自动修复白名单（低风险、可模板化、无破坏性）
// B = suggested：建议修复（高风险 / 需人工判断，T304 输出建议）
// C = report-only：仅报告（默认，未列入 A/B 的规则）
//
// 规则集当前为常量表；M4+ 计划支持配置文件覆盖（保留扩展点，见 TODO）。
// ---------------------------------------------------------------------------

import type { AlertClass } from '@dependfix/core'

export type { AlertClass }

/**
 * A 类自动修复白名单：仅收录"删除/改动后不影响程序行为"且**已有修复模板**的规则。
 *
 * 选择标准（实现时评审确认）：
 * - 可模板化：修复动作可机械描述（删行 / 对齐 / 移除空白）
 * - 无破坏性：不改变运行时行为，不删除可能含副作用的代码
 * - 因此 `no-unused-vars`（删除变量可能有副作用）不入选，归 B 类建议
 * - **白名单与模板注册表必须保持一致**（templates.ts TEMPLATES）：白名单成员
 *   若缺少模板，A 类修复会产生"无法处理"动作——`jsdoc/check-alignment`（模板未实现）
 *   与 `no-trailing-spaces`（模板字符串词法歧义无法保证不改变运行时值，3 轮
 *   Review Gate 后移除，详见 templates.ts 历史决策）均不列入
 *
 * 注意：Code Scanning 的 ESLint 分析通常仅启用安全相关规则，
 * 纯格式规则（eol-last 等）实际出现频率低；此处先建立机制，
 * 规则命中与否不影响分层正确性。
 */
export const AUTO_FIXABLE_RULES = new Set<string>([
    'eol-last', // 文件末尾换行（纯格式，无行为影响）
])

/**
 * B 类建议修复列表：高风险 / 需人工判断的规则。
 *
 * 收录原则：
 * - 安全敏感（注入 / XSS / 路径穿越 / 密码学等），修复需结合业务语义
 * - 或"看似可自动修但存在破坏性"（如删除未使用变量）
 *
 * 采用显式列表而非启发式匹配：可审计、可配置（M4+ 支持配置覆盖）。
 * CodeQL 规则 id 格式通常为 `语言/规则名`（如 js/sql-injection）。
 *
 * ⚠️ 覆盖声明：当前收录 js/py/java 精选集（安全类 + no-unused-vars），
 * 其余语言（go/ruby/csharp/cpp 等）与未收录变体（如 js/reflected-xss）落 C 类兜底；
 * 真实仓库 API 样本核对（rule id 格式与变体分布）登记为 M3 演进项。
 */
export const SUGGESTED_RULES = new Set<string>([
    // ESLint 类（无前缀）
    'no-unused-vars',
    // CodeQL JavaScript/TypeScript 安全类
    'js/sql-injection',
    'js/xss',
    'js/path-injection',
    'js/command-line-injection',
    'js/insecure-randomness',
    'js/weak-cryptographic-algorithm',
    'js/missing-rate-limiting',
    'js/clear-text-storage-of-sensitive-data',
    'js/clear-text-transmission-of-sensitive-data',
    'js/hardcoded-credentials',
    // CodeQL Python 安全类
    'py/sql-injection',
    'py/path-injection',
    'py/command-line-injection',
    'py/insecure-default-file-permissions',
    // CodeQL Java 安全类
    'java/sql-injection',
    'java/path-injection',
    'java/command-line-injection',
])

/**
 * 规则分类：
 * - A 类白名单 → `'auto-fixable'`
 * - B 类建议列表 → `'suggested'`
 * - 其余（含空字符串）→ `'report-only'`（C 类，默认，不静默丢弃）
 */
export function classifyRule(ruleId: string | null | undefined): AlertClass {
    const id = ruleId?.trim() ?? ''
    if (AUTO_FIXABLE_RULES.has(id)) {
        return 'auto-fixable'
    }
    if (SUGGESTED_RULES.has(id)) {
        return 'suggested'
    }
    return 'report-only'
}

/**
 * B 类建议规则的人工修复方向（T304，报告/PR body 建议区块展示）。
 * 收录 SUGGESTED_RULES 的修复指引；未收录规则返回通用建议（C 类兜底，不静默）。
 */
const SUGGESTION_MAP: ReadonlyMap<string, string> = new Map([
    ['no-unused-vars', '删除未使用的变量/导入；注意导出引用与副作用（import 副作用场景），确认后手动删除'],
    ['js/sql-injection', '使用参数化查询（PreparedStatement / query builder），禁止字符串拼接 SQL'],
    ['js/xss', '输出前 HTML 转义；innerHTML / document.write 场景用 DOMPurify 等清洗库'],
    ['js/path-injection', '校验用户输入路径在预期目录内（path.resolve + 前缀校验），禁止直接拼接文件路径'],
    ['js/command-line-injection', '避免 shell 字符串拼接，使用参数数组（child_process.spawn(args)）'],
    ['js/insecure-randomness', '安全随机数使用 crypto.randomBytes / Web Crypto，禁止 Math.random'],
    ['js/weak-cryptographic-algorithm', '升级为强算法（AES-256-GCM / Argon2 / SHA-256+），安全场景禁用 MD5/SHA-1'],
    ['js/missing-rate-limiting', '为认证/敏感接口添加限流（如 express-rate-limit）'],
    ['js/clear-text-storage-of-sensitive-data', '敏感数据加密存储（AES-256-GCM），禁止明文落盘'],
    ['js/clear-text-transmission-of-sensitive-data', '启用 TLS（HTTPS/WSS），禁止明文传输敏感数据'],
    ['js/hardcoded-credentials', '凭证移入环境变量/密钥管理服务（GitHub Secrets / Vault），禁止硬编码'],
    ['py/sql-injection', '使用参数化查询（sqlite3 占位符 / SQLAlchemy 参数绑定），禁止字符串拼接 SQL'],
    ['py/path-injection', '校验并规范化用户输入路径（os.path.realpath + 目录前缀校验）'],
    ['py/command-line-injection', '使用参数数组（subprocess.run(args)），禁止 shell=True 字符串拼接'],
    ['py/insecure-default-file-permissions', '创建文件时显式设置权限（os.open mode / umask）'],
    ['java/sql-injection', '使用 PreparedStatement 参数绑定，禁止字符串拼接 SQL'],
    ['java/path-injection', '校验用户输入路径（Path.normalize() + startsWith 检查），禁止直接拼接'],
    ['java/command-line-injection', '使用 ProcessBuilder 参数列表，禁止 shell 字符串拼接'],
])

/** 生成修复建议方向文本；未知规则返回通用建议（C 类兜底）。 */
export function suggestionFor(ruleId: string | null | undefined): string {
    const id = ruleId?.trim() ?? ''
    return SUGGESTION_MAP.get(id)
        ?? '人工审查该 Code Scanning 告警：结合业务语义评估修复方案（参考 CodeQL 规则文档）'
}
