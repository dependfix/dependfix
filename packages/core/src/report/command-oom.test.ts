// command-oom.test.ts — 报告 `## Command OOM` 段（命令级 OOM，与运行级 cgroup OOM 分层）。
import { describe, expect, it } from 'vitest'
import { EMPTY_RUN_RESULT } from './report.test-helpers'
import { generateMarkdownReport } from './index'

describe('generateMarkdownReport — Command OOM', () => {
    it('按命令列出 OOM 动作（仓库 + 命令）', () => {
        const result = {
            ...EMPTY_RUN_RESULT,
            summary: {
                ...EMPTY_RUN_RESULT.summary,
                commandOomKills: 2,
                commandOomCommands: ['pnpm test', 'pnpm build'],
            },
            actions: [
                {
                    type: 'verification',
                    repository: 'foo/bar',
                    target: 'pnpm test',
                    success: false,
                    oomKilled: true,
                },
                {
                    type: 'verification',
                    repository: 'foo/bar',
                    target: 'pnpm build',
                    success: false,
                    oomKilled: true,
                },
            ],
        }

        const md = generateMarkdownReport(result)

        expect(md).toContain('## Command OOM')
        expect(md).toContain('| `foo/bar` | `pnpm test` |')
        expect(md).toContain('| `foo/bar` | `pnpm build` |')
        // 段内不得出现运行级口径（本段只承载命令级事实）
        expect(md).not.toContain('运行级 OOM')
    })

    it('无命令级 OOM 时不渲染该段', () => {
        const md = generateMarkdownReport(EMPTY_RUN_RESULT)
        expect(md).not.toContain('## Command OOM')
    })
})
