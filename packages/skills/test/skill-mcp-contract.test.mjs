/**
 * MCP 双后端扩展点文档契约测试：
 * SKILL.md 与 REFERENCES.md 必须包含执行后端探测、4 个 MCP tool 映射、
 * 一致性断言清单与降级路径——保证未来发布 @dependfix/mcp 时 skill 无需改版即可双后端工作。
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const skillRoot = join(here, '..', 'dependfix-remediator')
const skillContent = readFileSync(join(skillRoot, 'SKILL.md'), 'utf8')
const referencesContent = readFileSync(join(skillRoot, 'REFERENCES.md'), 'utf8')

const MCP_TOOLS = ['fetch_alerts', 'run_scan', 'fix_dependency', 'get_last_report']

describe('SKILL.md MCP 双后端扩展点', () => {
    it('包含执行后端探测章节（探测 + 决策 + 降级）', () => {
        expect(skillContent).toContain('## 执行后端探测')
        expect(skillContent).toMatch(/MCP tool 优先/)
        expect(skillContent).toMatch(/CLI 后端/)
        expect(skillContent).toMatch(/降级 CLI/)
    })

    it('能力契约映射表覆盖全部 4 个 MCP tool', () => {
        for (const tool of MCP_TOOLS) {
            expect(skillContent).toContain(tool)
        }
    })

    it('无 MCP 依赖（不要求 MCP 可用即可工作）', () => {
        expect(skillContent).toContain('本 skill 当前不依赖 MCP')
        expect(skillContent).toContain('CLI 后端开箱即用')
    })
})

describe('REFERENCES.md MCP 一致性断言清单', () => {
    it('包含 MCP 双后端章节与一致性断言清单', () => {
        expect(referencesContent).toContain('## MCP 双后端衔接')
        expect(referencesContent).toContain('双后端一致性断言清单')
        expect(referencesContent).toContain('降级路径规则')
    })

    it('一致性断言清单覆盖全部 4 个 MCP tool 与 CLI 契约字段', () => {
        for (const tool of MCP_TOOLS) {
            expect(referencesContent).toContain(tool)
        }
        // 契约基准字段（与 @dependfix/core RunResult / ArchiveRunEntry 对齐）
        for (const field of ['summary.alertsFound', 'summary.alertsFixed', 'repoStats[]', 'runId']) {
            expect(referencesContent).toContain(field)
        }
    })

    it('MCP 与 CLI 语义一致（tool 输出须同源对齐）', () => {
        expect(referencesContent).toMatch(/同源一致/)
        expect(referencesContent).toMatch(/以 CLI 报告为准/)
    })
})
