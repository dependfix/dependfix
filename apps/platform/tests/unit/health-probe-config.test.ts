import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * 健康探针配置门禁（源码文本断言）：
 * - 容器 `HEALTHCHECK` 只探 liveness（`/api/health`），参数固定；
 * - liveness 视图不得依赖数据库模块（DB 只在 readiness 侧）；
 * - readiness 使用单一总超时常量。
 * 行为断言见 `server/api/health/ready.get.test.ts` / `server/services/view/readiness.test.ts`。
 */
const platformRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

const read = (file: string): string => fs.readFileSync(path.join(platformRoot, file), 'utf8')

describe('健康探针配置门禁', () => {
    it('Dockerfile HEALTHCHECK 只探 liveness 且参数固定', () => {
        const dockerfile = read('Dockerfile')
        expect(dockerfile).toMatch(/HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3/)
        expect(dockerfile).toMatch(/fetch\('http:\/\/127\.0\.0\.1:'/)
        expect(dockerfile).toMatch(/\/api\/health'\)/)
        // HEALTHCHECK 的 CMD 行只允许 liveness（注释里可以提到 readiness）
        const cmdLine = dockerfile.split('\n').find((line) => line.trimStart().startsWith('CMD node -e')) ?? ''
        expect(cmdLine).not.toBe('')
        expect(cmdLine).not.toContain('/api/health/ready')
    })

    it('liveness 视图不依赖数据库模块', () => {
        const source = read('server/services/view/health.ts')
        // schema 枚举来自 schema-drift（纯状态，不建连）；禁止直接依赖数据库引导 / 查询模块
        expect(source).not.toMatch(/from '#server\/database'/)
        expect(source).not.toContain('ensureDatabaseInitialized')
        expect(source).not.toContain('getDataSource')
    })

    it('readiness 使用单一总超时（不逐阶段累加）', () => {
        const source = read('server/services/view/readiness.ts')
        expect(source).toMatch(/READINESS_QUERY_TIMEOUT_MS = 2000/)
        expect(source).toContain('const deadline = Date.now() + timeoutMs')
    })
})
