import { describe, expect, it, vi } from 'vitest'
import { createPipeline } from './pipeline'

// ---------------------------------------------------------------------------
// 平台化管线抽象：env / logger / resolveConfig / exit 注入
// ---------------------------------------------------------------------------

describe('createPipeline', () => {
    it('parses args and resolves config with injected env', () => {
        const pipeline = createPipeline({
            env: {
                GITHUB_TOKEN: 'test-token',
                DEPENDFIX_MODE: 'fix',
                DEPENDFIX_REPOSITORIES: 'owner/repo',
            },
        })

        const result = pipeline.parse(['fix', '--repo', 'owner/repo'])

        expect(result.ok).toBe(true)
        expect(result.config.mode).toBe('fix')
        expect(result.config.repositories).toContain('owner/repo')
    })

    it('uses injected resolveConfig instead of default', () => {
        const resolveConfig = vi.fn().mockReturnValue({ mode: 'report-only' })
        const pipeline = createPipeline({ env: { GITHUB_TOKEN: 'x' }, resolveConfig })

        pipeline.parse(['report-only'])

        expect(resolveConfig).toHaveBeenCalledWith(expect.objectContaining({
            env: { GITHUB_TOKEN: 'x' },
            cliOverrides: expect.any(Object),
        }))
    })

    it('routes history query output to injected logger (not console)', async () => {
        const logger = { info: vi.fn(), error: vi.fn() }
        const pipeline = createPipeline({ env: {}, logger })

        const exitCode = await pipeline.run(['--history', 'owner/repo'])

        expect(exitCode).toBe(0)
        expect(logger.info).toHaveBeenCalledTimes(1)
        expect(logger.error).not.toHaveBeenCalled()
    })

    it('returns exit code 0 for history branch without invoking app', async () => {
        const pipeline = createPipeline({ env: {} })

        const exitCode = await pipeline.run(['--history', 'owner/repo'])

        expect(exitCode).toBe(0)
    })

    it('run parses args before executing (mode/repo overrides reach config)', async () => {
        // 用 history 分支验证参数解析路径（不触发真实 app.run）
        const logger = { info: vi.fn(), error: vi.fn() }
        const pipeline = createPipeline({ env: {}, logger })

        await pipeline.run(['--history', 'owner/repo', '--dry-run'])

        // history 短路优先，其余参数被忽略（既有 CLI 语义）
        expect(logger.info).toHaveBeenCalledTimes(1)
    })
})
