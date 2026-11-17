// use-run-oom.test.ts — 运行详情 OOM 分层展示状态（命令级 vs 运行级）。
import { ref } from 'vue'
import { describe, expect, it } from 'vitest'
import { useRunOom, type RunOomView } from './use-run-oom'

const makeDetail = (overrides: Partial<RunOomView> = {}): RunOomView => ({
    status: 'completed',
    oomKilled: null,
    summary: { alertsFound: 1 },
    resource: null,
    ...overrides,
})

describe('useRunOom', () => {
    it('completed + 命令级已归因：显示命令级，抑制运行级（cgroup 计数可由命令解释）', () => {
        const detail = ref<RunOomView | null>(makeDetail({
            oomKilled: true,
            summary: { alertsFound: 1, commandOomKills: 2, commandOomCommands: ['pnpm test'] },
        }))
        const view = useRunOom(detail)

        expect(view.commandOomCount.value).toBe(2)
        expect(view.commandOomText.value).toBe('pnpm test')
        expect(view.commandOomVisible.value).toBe(true)
        expect(view.runLevelOomVisible.value).toBe(false)
    })

    it('failed + 命令级：两类并列（不掩盖另有进程被 OOM 杀）', () => {
        const detail = ref<RunOomView | null>(makeDetail({
            status: 'failed',
            oomKilled: true,
            summary: { alertsFound: 1, commandOomKills: 1 },
        }))
        const view = useRunOom(detail)

        expect(view.commandOomVisible.value).toBe(true)
        expect(view.runLevelOomVisible.value).toBe(true)
    })

    it('结果缺失（execution_timeout）时命令级行不可见 → 不得抑制运行级行（至少一行可见）', () => {
        const detail = ref<RunOomView | null>(makeDetail({
            status: 'completed',
            oomKilled: true,
            error: { code: 'execution_timeout' },
            summary: { alertsFound: 1, commandOomKills: 1, commandOomCommands: ['pnpm test'] },
        }))
        const view = useRunOom(detail)

        expect(view.commandOomVisible.value).toBe(false)
        expect(view.runLevelOomVisible.value).toBe(true)
    })

    it('无命令级 OOM：按运行级三态显示，字段缺失不渲染', () => {
        const runLevel = ref<RunOomView | null>(makeDetail({ oomKilled: false }))
        expect(useRunOom(runLevel).runLevelOomVisible.value).toBe(true)

        const missing = ref<RunOomView | null>(makeDetail({ oomKilled: undefined }))
        expect(useRunOom(missing).runLevelOomVisible.value).toBe(false)

        const empty = ref<RunOomView | null>(null)
        expect(useRunOom(empty).runLevelOomVisible.value).toBe(false)
    })
})
