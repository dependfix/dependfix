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
