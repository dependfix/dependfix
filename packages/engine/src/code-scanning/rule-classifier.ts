// ---------------------------------------------------------------------------
// Code Scanning 规则分层（A/B/C）
//
// A = auto-fixable：自动修复白名单（低风险、可模板化、无破坏性）
// B = suggested：建议修复（高风险 / 需人工判断，输出建议）
// C = report-only：仅报告（默认，未列入 A/B 的规则）
//
// 规则集当前由 rule-config 模块管理：默认 = DEFAULT_RULES_CONFIG（编译后
// 常量表，向后兼容），可通过 env `CODE_SCANNING_RULES_CONFIG_PATH` 指向
// JSON 配置文件覆盖（详见 rule-config.ts）。运行时通过 setActiveRulesConfig
// 替换为自定义配置；测试可用 resetActiveRulesConfig 恢复默认。
//
// classifyRule / suggestionFor 均从 `getActiveRulesConfig()` 读取状态。
// ---------------------------------------------------------------------------

import type { AlertClass } from '@dependfix/core'
import { DEFAULT_RULES_CONFIG, getActiveRulesConfig } from './rule-config'

export type { AlertClass }

/**
 * A 类自动修复白名单默认集合（默认值常量；测试 disjointness 不变量用）。
 *
 * **与 active config 的关系**：本导出为默认常量（向后兼容历史测试与外部引用），
 * 运行时 classifyRule 实际从 `getActiveRulesConfig().autoFixable` 读取。
 * 若配置已被 setActiveRulesConfig 替换，本常量与运行时分类可能不一致（设计意图）。
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
export const AUTO_FIXABLE_RULES = DEFAULT_RULES_CONFIG.autoFixable

/**
 * B 类建议规则默认列表（默认值常量；测试 disjointness 不变量用）。
 *
 * 收录原则：
 * - 安全敏感（注入 / XSS / 路径穿越 / 密码学等），修复需结合业务语义
 * - 或"看似可自动修但存在破坏性"（如删除未使用变量）
 *
 * 采用显式列表而非启发式匹配：可审计、可配置（支持配置覆盖）。
 * CodeQL 规则 id 格式通常为 `语言/规则名`（如 js/sql-injection）。
 *
 * ⚠️ 覆盖声明：当前收录 js/py/java 精选集（安全类 + no-unused-vars），
 * 其余语言（go/ruby/csharp/cpp 等）与未收录变体（如 js/reflected-xss）落 C 类兜底；
 * 真实仓库 API 样本核对（rule id 格式与变体分布）登记为演进项。
 */
export const SUGGESTED_RULES = new Set<string>(DEFAULT_RULES_CONFIG.suggested.keys())

/**
 * 规则分类：
 * - A 类白名单 → `'auto-fixable'`
 * - B 类建议列表 → `'suggested'`
 * - 其余（含空字符串）→ `'report-only'`（C 类，默认，不静默丢弃）
 *
 * 读取自当前生效配置（`getActiveRulesConfig()`）；首次调用前需通过
 * `setActiveRulesConfig` 替换或保持默认。
 */
export function classifyRule(ruleId: string | null | undefined): AlertClass {
    const id = ruleId?.trim() ?? ''
    const config = getActiveRulesConfig()
    if (config.autoFixable.has(id)) {
        return 'auto-fixable'
    }
    if (config.suggested.has(id)) {
        return 'suggested'
    }
    return 'report-only'
}

/**
 * B 类建议规则的人工修复方向（报告/PR body 建议区块展示）。
 * 读取自当前生效配置（`getActiveRulesConfig().suggested`）；未收录规则返回通用建议（C 类兜底，不静默）。
 */
export function suggestionFor(ruleId: string | null | undefined): string {
    const id = ruleId?.trim() ?? ''
    return getActiveRulesConfig().suggested.get(id)
        ?? '人工审查该 Code Scanning 告警：结合业务语义评估修复方案（参考 CodeQL 规则文档）'
}
