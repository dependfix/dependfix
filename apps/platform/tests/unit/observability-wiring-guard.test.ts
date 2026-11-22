import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * 可观测性转发点门禁（源码文本断言）。
 *
 * 生命周期事件只有 7 处，删掉任一处时本用例失败——补足「采集层单测无法发现转发点被删」的缺口。
 * 行为断言见 `server/utils/observability.test.ts` / `server/plugins/observability.test.ts`。
 */
const platformRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

const read = (file: string): string => fs.readFileSync(path.join(platformRoot, file), 'utf8')

describe('可观测性转发点', () => {
    it('启动：logger 插件上报 platform_started', () => {
        const source = read('server/plugins/logger.ts')
        expect(source).toMatch(/captureLifecycleEvent\('platform_started'/)
    })

    it('API 5xx：observability 插件上报异常（route / method / statusCode）', () => {
        const source = read('server/plugins/observability.ts')
        expect(source).toContain('captureLifecycleError(error')
        expect(source).toMatch(/source: 'http'/)
        expect(source).toContain('statusCode')
    })

    it('worker 异常：scan-worker 上报', () => {
        expect(read('server/services/queue/scan-worker.ts')).toMatch(/source: 'queue_worker'/)
    })

    it('执行失败与编排异常：scan-orchestrator 各一处', () => {
        const source = read('server/services/scan-orchestrator.service.ts')
        expect(source).toMatch(/captureLifecycleEvent\('scan_run_failed', 'warning'/)
        expect(source).toMatch(/source: 'scan_orchestration'/)
    })

    it('通知失败与周报异常：notification / weekly-digest 各一处', () => {
        expect(read('server/services/notification/index.ts')).toMatch(/source: 'notification'/)
        expect(read('server/plugins/weekly-digest.ts')).toMatch(/source: 'weekly_digest'/)
    })

    it('业务代码不得直接 import Sentry 采集（统一走 observability 入口）', () => {
        const serverDir = path.join(platformRoot, 'server')
        const offenders: string[] = []
        const walk = (dir: string): void => {
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                const full = path.join(dir, entry.name)
                if (entry.isDirectory()) {
                    walk(full)
                    continue
                }
                if (!entry.name.endsWith('.ts') || entry.name.endsWith('.test.ts')) {
                    continue
                }
                const source = fs.readFileSync(full, 'utf8')
                if (/from ['"]@sentry\//.test(source)) {
                    offenders.push(path.relative(platformRoot, full))
                }
            }
        }
        walk(serverDir)
        expect(offenders).toEqual([])
    })
})
