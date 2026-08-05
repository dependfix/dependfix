import type { NormalizedSecurityAlert } from '@dependfix/core'

// ---------------------------------------------------------------------------
// Code Scanning 可模板化修复（T303）
//
// 每个模板对应 A 类白名单中的一条规则（rule-classifier.AUTO_FIXABLE_RULES）。
// 安全底线：模板只做"删除/改动后不影响程序行为"的格式类修改；
// 无法安全处理时返回 null（交由上层回退建议模式），绝不猜测性改写。
//
// 历史决策（2026-08-05）：no-trailing-spaces 模板因模板字符串词法歧义
// （嵌套模板收尾 / markdown 围栏 / 插值内反引号）无法在不引入词法解析器
// 的情况下保证"不改变运行时字符串值"红线，经 3 轮 Review Gate 后移除；
// 未来 M4+ 引入真正词法扫描后再评估恢复。白名单同步只保留 eol-last。
// ---------------------------------------------------------------------------

export interface TemplateApplyResult {
    /** 修改后的文件内容 */
    content: string
    /** 是否实际产生修改（false = 文件已合规，无需改动） */
    changed: boolean
}

export interface CodeScanningFixTemplate {
    /** 对应规则 id（A 类白名单成员） */
    ruleId: string
    /**
     * 应用修复补丁。
     * 返回 null 表示该告警实例无法安全修复（模板不适用）；
     * 上层按"回退建议模式"处理（不静默、可审计，不计 failed）。
     */
    apply(filePath: string, content: string, alert: NormalizedSecurityAlert): TemplateApplyResult | null
    /** 修复动作的人类可读描述（FixAction.diff，报告/PR 展示） */
    describe(filePath: string, changed: boolean, alert: NormalizedSecurityAlert): string
}

// ---------------------------------------------------------------------------
// eol-last：文件末尾缺失换行时补齐
// ---------------------------------------------------------------------------

const EOL_LAST_TEMPLATE: CodeScanningFixTemplate = {
    ruleId: 'eol-last',
    apply(_filePath, content, _alert) {
        if (content.length === 0) {
            return null // 空文件：无末尾换行语义
        }
        if (content.endsWith('\n')) {
            return { content, changed: false } // 已合规
        }
        // CRLF 文件补齐 CRLF，否则补 LF（保持行尾风格一致）
        const eol = content.includes('\r\n') ? '\r\n' : '\n'
        return { content: content + eol, changed: true }
    },
    describe(filePath, changed, _alert) {
        return changed ? `appended trailing newline to ${filePath}` : `no-op: ${filePath} already ends with newline`
    },
}

// ---------------------------------------------------------------------------
// 模板注册表（ruleId → 模板）
// ---------------------------------------------------------------------------

const TEMPLATES: ReadonlyMap<string, CodeScanningFixTemplate> = new Map(
    [EOL_LAST_TEMPLATE].map((t) => [t.ruleId, t]),
)

/** 获取规则对应的修复模板；无模板返回 undefined（调用方回退建议模式）。 */
export function getCodeScanningFixTemplate(ruleId: string): CodeScanningFixTemplate | undefined {
    return TEMPLATES.get(ruleId)
}
