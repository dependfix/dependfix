import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
    detectSigkill,
    readCgroupMemoryState,
    startResourceMonitor,
    unavailableResourceUsage,
    buildSandboxResourceUsage,
} from './resource-usage'

const dirs: string[] = []

const makeDir = (): string => {
    const dir = mkdtempSync(join(tmpdir(), 'dependfix-resource-'))
    dirs.push(dir)
    return dir
}

const write = (dir: string, relativePath: string, value: string): void => {
    const path = join(dir, relativePath)
    mkdirSync(join(path, '..'), { recursive: true })
    writeFileSync(path, value)
}

afterEach(() => {
    for (const dir of dirs.splice(0)) {
        rmSync(dir, { recursive: true, force: true })
    }
})

describe('readCgroupMemoryState', () => {
    it('reads cgroup v2 limit / current / oom_kill', () => {
        const dir = makeDir()
        write(dir, 'memory.max', '8589934592\n')
        write(dir, 'memory.current', '1073741824\n')
        write(dir, 'memory.events', 'low 0\nhigh 0\nmax 0\noom 0\noom_kill 2\n')

        expect(readCgroupMemoryState(dir)).toMatchObject({
            source: 'cgroup-v2',
            memoryMaxBytes: 8589934592,
            currentBytes: 1073741824,
            oomKillCount: 2,
        })
    })

    it('falls back to cgroup v1 files', () => {
        const dir = makeDir()
        write(dir, 'memory/memory.limit_in_bytes', '4294967296\n')
        write(dir, 'memory/memory.usage_in_bytes', '536870912\n')
        write(dir, 'memory/memory.oom_control', 'oom_kill_disable 0\nunder_oom 0\noom_kill 1\n')

        expect(readCgroupMemoryState(dir)).toMatchObject({
            source: 'cgroup-v1',
            memoryMaxBytes: 4294967296,
            currentBytes: 536870912,
            oomKillCount: 1,
        })
    })

    it('normalizes unlimited / sentinel limits to null with a reason', () => {
        const dir = makeDir()
        write(dir, 'memory.max', 'max\n')
        write(dir, 'memory.current', '1024\n')
        write(dir, 'memory.events', 'oom_kill 0\n')

        expect(readCgroupMemoryState(dir)).toMatchObject({
            source: 'cgroup-v2',
            memoryMaxBytes: null,
            limitReason: 'unlimited',
        })
    })

    it('returns source none when cgroup files are absent', () => {
        const dir = makeDir()
        expect(readCgroupMemoryState(dir)).toMatchObject({
            source: 'none',
            memoryMaxBytes: null,
            currentBytes: null,
            oomKillCount: null,
        })
    })
})

describe('startResourceMonitor', () => {
    it('tracks peak current and detects an oom_kill delta', () => {
        const dir = makeDir()
        write(dir, 'memory.max', '8589934592\n')
        write(dir, 'memory.current', '1073741824\n')
        write(dir, 'memory.events', 'oom_kill 0\n')
        const monitor = startResourceMonitor({ cgroupRoot: dir, intervalMs: 0, platform: 'linux' })

        write(dir, 'memory.current', '4294967296\n')
        write(dir, 'memory.events', 'oom_kill 1\n')
        const usage = monitor.stop()

        expect(usage).toMatchObject({
            source: 'cgroup-v2',
            memoryMaxBytes: 8589934592,
            peakRssBytes: 4294967296,
            oomKilled: true,
            samples: 2,
        })
        // stop 幂等：重复调用返回同一快照
        expect(monitor.stop()).toBe(usage)
    })

    it('keeps oomKilled null when the oom counter is unavailable', () => {
        const dir = makeDir()
        write(dir, 'memory.max', '8589934592\n')
        write(dir, 'memory.current', '1073741824\n')
        const monitor = startResourceMonitor({ cgroupRoot: dir, intervalMs: 0, platform: 'linux' })

        const usage = monitor.stop()
        expect(usage).toMatchObject({
            peakRssBytes: 1073741824,
            oomKilled: null,
        })
        expect(usage.degradedReason).toContain('oom_kill')
    })

    it('degrades without sampling on non-Linux platforms', () => {
        const usage = startResourceMonitor({ platform: 'win32' }).stop()
        expect(usage).toMatchObject({
            source: 'none',
            memoryMaxBytes: null,
            peakRssBytes: null,
            oomKilled: null,
        })
        expect(usage.degradedReason).toContain('unsupported platform')
    })

    it('degrades to null (not 0) when cgroup files are missing', () => {
        const dir = makeDir()
        const usage = startResourceMonitor({ cgroupRoot: dir, intervalMs: 0, platform: 'linux' }).stop()
        expect(usage).toMatchObject({
            source: 'none',
            memoryMaxBytes: null,
            peakRssBytes: null,
            oomKilled: null,
        })
        expect(usage.degradedReason).toContain('cgroup')
    })
})

describe('resource helpers', () => {
    it('detects SIGKILL in engine error messages', () => {
        expect(detectSigkill(['install failed: <signal SIGKILL>'])).toBe(true)
        expect(detectSigkill(['timeout after 300000ms'])).toBe(false)
        expect(detectSigkill([undefined, null])).toBe(false)
    })

    it('builds an explicit unavailable snapshot', () => {
        expect(unavailableResourceUsage('executor-unsupported')).toMatchObject({
            memoryMaxBytes: null,
            peakRssBytes: null,
            oomKilled: null,
            source: 'none',
            degradedReason: 'executor-unsupported',
        })
    })

    it('maps sandbox cgroup readings and keeps unlimited limits explicit', () => {
        expect(buildSandboxResourceUsage({
            memoryMaxBytes: null,
            peakRssBytes: 42 * 1024 * 1024,
            oomKilled: false,
            samples: 12,
            source: 'cgroup-v2',
            limitReason: 'unlimited',
        })).toMatchObject({
            memoryMaxBytes: null,
            peakRssBytes: 42 * 1024 * 1024,
            oomKilled: false,
            samples: 12,
            source: 'cgroup-v2',
            limitReason: 'unlimited',
        })
        expect(buildSandboxResourceUsage({
            memoryMaxBytes: 2 * 1024 ** 3,
            peakRssBytes: 1024,
            oomKilled: null,
            samples: 3,
            source: 'cgroup-v1',
        })).toMatchObject({ memoryMaxBytes: 2 * 1024 ** 3, oomKilled: null, source: 'cgroup-v1' })
    })

    it('marks missing / unreadable sandbox readings as unavailable instead of zero', () => {
        const missing = buildSandboxResourceUsage(null)
        expect(missing).toMatchObject({ memoryMaxBytes: null, peakRssBytes: null, oomKilled: null, source: 'none' })
        expect(missing.degradedReason).toContain('cgroup')

        const empty = buildSandboxResourceUsage({ samples: 0, source: 'cgroup-v2' })
        expect(empty.samples).toBe(0)
        expect(empty.degradedReason).toContain('采样')
    })
})
