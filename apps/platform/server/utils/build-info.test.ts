import { describe, expect, it } from 'vitest'
import { formatBuildInfoLine, resolveBuildInfo, resolveStartedAt } from './build-info'

/**
 * 部署产物版本戳工具单测（任务登记见 docs/plan/todo.md §M40.1）：
 * 覆盖注入值透传、缺省 / 空串 / 非字符串回退 unknown、启动时间反推与日志行格式。
 */
describe('build-info', () => {
    describe('resolveBuildInfo', () => {
        it('注入值透传（去除首尾空白）', () => {
            expect(resolveBuildInfo({ buildVersion: ' 1.2.3 ', buildCommit: 'abcdef0' }))
                .toEqual({ version: '1.2.3', commit: 'abcdef0' })
        })

        it('缺省 / 空串 / 仅空白回退 unknown', () => {
            expect(resolveBuildInfo({})).toEqual({ version: 'unknown', commit: 'unknown' })
            expect(resolveBuildInfo({ buildVersion: '', buildCommit: '   ' }))
                .toEqual({ version: 'unknown', commit: 'unknown' })
        })

        it('非字符串值回退 unknown（防 runtimeConfig 类型漂移）', () => {
            expect(resolveBuildInfo({ buildVersion: 123, buildCommit: null }))
                .toEqual({ version: 'unknown', commit: 'unknown' })
        })
    })

    describe('resolveStartedAt', () => {
        it('由 uptime 反推进程启动时刻', () => {
            expect(resolveStartedAt(1_700_000_000_000, 90))
                .toBe(new Date(1_700_000_000_000 - 90_000).toISOString())
        })

        it('uptime 为 0 时等于当前时刻', () => {
            expect(resolveStartedAt(1_700_000_000_000, 0)).toBe('2023-11-14T22:13:20.000Z')
        })
    })

    describe('formatBuildInfoLine', () => {
        it('输出可读的启动日志行', () => {
            expect(formatBuildInfoLine({ version: '1.2.3', commit: 'abc' }, '2026-01-01T00:00:00.000Z'))
                .toBe('[build] version=1.2.3 commit=abc startedAt=2026-01-01T00:00:00.000Z')
        })
    })
})
