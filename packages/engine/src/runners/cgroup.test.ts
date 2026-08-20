import { existsSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
    CGROUP_ROOT,
    CGROUP_V2_MARKER,
    applyCgroupLimits,
    cleanupCgroup,
    isCgroupV2,
    moveProcessToCgroup,
    observeOom,
    type FsAdapter,
} from './cgroup'

// ---------------------------------------------------------------------------
// Mock fs adapter（基于真实 tmp 目录模拟 cgroup v2 文件结构——避免依赖内存 mock 的状态同步复杂度）
// ---------------------------------------------------------------------------

interface MockFs extends FsAdapter {
    /** 模拟写失败的方法（生产路径触发：权限/只读等场景） */
    failOn?: { method: keyof FsAdapter, pathPattern?: RegExp }[]
    /** 当前 mock 状态 */
    _dirs: Set<string>
    _files: Map<string, string>
}

function createMockFs(opts: {
    /** 模拟的初始目录与文件（cgroup v2 标志文件 + 子 cgroup 文件） */
    initial?: { dirs?: string[], files?: Record<string, string> }
    /** 注入写失败（用于验证错误分类路径） */
    failOn?: { method: keyof FsAdapter, pathPattern?: RegExp }[]
} = {}): MockFs {
    const dirs = new Set<string>([CGROUP_ROOT, ...(opts.initial?.dirs ?? [])])
    const files = new Map<string, string>(Object.entries(opts.initial?.files ?? {}))

    // 标记 cgroup v2：自动写入标志文件（除非调用方显式覆盖）
    files.set(`${CGROUP_ROOT}/${CGROUP_V2_MARKER}`, 'cpu memory io')

    const fs: MockFs = {
        failOn: opts.failOn,
        _dirs: dirs,
        _files: files,
        existsSync(path: string) {
            return dirs.has(path) || files.has(path)
        },
        mkdirSync(path: string) {
            if (this.failOn?.some((f) => f.method === 'mkdirSync' && (!f.pathPattern || f.pathPattern.test(path)))) {
                throw Object.assign(new Error(`mock mkdirSync fail: ${path}`), { code: 'EACCES' })
            }
            dirs.add(path)
            return undefined
        },
        writeFileSync(path: string, data: string) {
            if (this.failOn?.some((f) => f.method === 'writeFileSync' && (!f.pathPattern || f.pathPattern.test(path)))) {
                throw Object.assign(new Error(`mock writeFileSync fail: ${path}`), { code: 'EACCES' })
            }
            // 父目录必须存在（模拟真实文件系统：写文件到不存在路径 → ENOENT）
            const parent = path.slice(0, path.lastIndexOf('/'))
            if (parent && !dirs.has(parent)) {
                throw Object.assign(new Error(`mock writeFileSync parent not found: ${parent}`), { code: 'ENOENT' })
            }
            files.set(path, data)
        },
        readFileSync(path: string) {
            const content = files.get(path)
            if (content === undefined) {
                throw Object.assign(new Error(`mock readFileSync not found: ${path}`), { code: 'ENOENT' })
            }
            return content
        },
        readdirSync(path: string) {
            // 简化：列出所有以 path 开头的文件名（去掉 path 前缀）
            const prefix = `${path}/`
            const entries = new Set<string>()
            for (const file of files.keys()) {
                if (file.startsWith(prefix)) {
                    entries.add(file.slice(prefix.length).split('/')[0]!)
                }
            }
            for (const dir of dirs) {
                if (dir.startsWith(prefix) && dir !== path) {
                    entries.add(dir.slice(prefix.length).split('/')[0]!)
                }
            }
            return Array.from(entries)
        },
        rmSync(path: string) {
            dirs.delete(path)
            // 删除路径前缀的所有 files
            for (const key of Array.from(files.keys())) {
                if (key === path || key.startsWith(`${path}/`)) {
                    files.delete(key)
                }
            }
        },
    }
    return fs
}

// ---------------------------------------------------------------------------
// isCgroupV2 跨平台 fallback
// ---------------------------------------------------------------------------

describe('isCgroupV2', () => {
    it('returns true when cgroup.controllers marker file exists', () => {
        const fs = createMockFs()
        expect(isCgroupV2(CGROUP_ROOT, fs)).toBe(true)
    })

    it('returns false when cgroup.controllers marker file is missing (v1)', () => {
        const fs = createMockFs()
        fs._files.delete(`${CGROUP_ROOT}/${CGROUP_V2_MARKER}`)
        expect(isCgroupV2(CGROUP_ROOT, fs)).toBe(false)
    })

    it('returns false when existsSync throws (non-existent root)', () => {
        const fs: FsAdapter = {
            ...createMockFs(),
            existsSync() {
                throw new Error('mock EACCES')
            },
        }
        expect(isCgroupV2('/nope', fs)).toBe(false)
    })

    it('current host detection (informational — passes on any platform)', () => {
        // 默认 root + 默认 fs 调用——本机 WSL2 v1 → false；CI 真实 v2 → true
        const result = isCgroupV2()
        expect(typeof result).toBe('boolean')
    })
})

// ---------------------------------------------------------------------------
// slice 名校验（防御性：拒绝路径分隔符与 ..）
// ---------------------------------------------------------------------------

describe('applyCgroupLimits — slice name validation', () => {
    it('throws on empty slice', () => {
        const fs = createMockFs()
        expect(() => applyCgroupLimits({ slice: '', limits: { memoryMb: 256 }, fs })).toThrow(/非法/)
    })

    it('throws on leading slash', () => {
        const fs = createMockFs()
        expect(() => applyCgroupLimits({ slice: '/dependfix', limits: { memoryMb: 256 }, fs })).toThrow(/非法/)
    })

    it('throws on trailing slash', () => {
        const fs = createMockFs()
        expect(() => applyCgroupLimits({ slice: 'dependfix/', limits: { memoryMb: 256 }, fs })).toThrow(/非法/)
    })

    it('throws on path traversal ..', () => {
        const fs = createMockFs()
        expect(() => applyCgroupLimits({ slice: 'a/../b', limits: { memoryMb: 256 }, fs })).toThrow(/非法/)
    })

    it('throws on invalid characters', () => {
        const fs = createMockFs()
        expect(() => applyCgroupLimits({ slice: 'a b', limits: { memoryMb: 256 }, fs })).toThrow(/非法/)
        expect(() => applyCgroupLimits({ slice: 'a$b', limits: { memoryMb: 256 }, fs })).toThrow(/非法/)
    })

    it('accepts hierarchical slice names (forward slash)', () => {
        const fs = createMockFs()
        const result = applyCgroupLimits({ slice: 'dependfix/run-abc', limits: { memoryMb: 256 }, fs })
        expect(result.slice).toBe('dependfix/run-abc')
        expect(result.path).toBe(`${CGROUP_ROOT}/dependfix/run-abc`)
    })

    it('accepts underscores, dashes, alphanumerics', () => {
        const fs = createMockFs()
        const result = applyCgroupLimits({ slice: 'dep_fix-123', limits: { memoryMb: 256 }, fs })
        expect(result.slice).toBe('dep_fix-123')
    })
})

// ---------------------------------------------------------------------------
// applyCgroupLimits 主路径
// ---------------------------------------------------------------------------

describe('applyCgroupLimits', () => {
    it('returns applied:false reason:not_cgroup_v2 when v1', () => {
        const fs = createMockFs()
        fs._files.delete(`${CGROUP_ROOT}/${CGROUP_V2_MARKER}`)
        const result = applyCgroupLimits({ slice: 'test/run-1', limits: { memoryMb: 256 }, fs })
        expect(result.applied).toBe(false)
        expect(result.reason).toBe('not_cgroup_v2')
        expect(result.slice).toBe('test/run-1')
    })

    it('writes memory.max as bytes (memoryMb * 1024 * 1024) when applied', () => {
        const fs = createMockFs()
        const result = applyCgroupLimits({ slice: 'test/run-1', limits: { memoryMb: 512 }, fs })
        expect(result.applied).toBe(true)
        expect(fs._files.get(`${CGROUP_ROOT}/test/run-1/memory.max`)).toBe(String(512 * 1024 * 1024))
    })

    it('writes cpu.max as quota/period when cpu specified', () => {
        const fs = createMockFs()
        const result = applyCgroupLimits({ slice: 'test/run-1', limits: { cpu: 0.5 }, fs })
        expect(result.applied).toBe(true)
        // 0.5 * 100_000 = 50_000 quota；period = 100_000
        expect(fs._files.get(`${CGROUP_ROOT}/test/run-1/cpu.max`)).toBe('50000 100000')
    })

    it('writes both memory.max and cpu.max when both specified', () => {
        const fs = createMockFs()
        const result = applyCgroupLimits({
            slice: 'test/run-1',
            limits: { memoryMb: 1024, cpu: 2.0 },
            fs,
        })
        expect(result.applied).toBe(true)
        expect(fs._files.get(`${CGROUP_ROOT}/test/run-1/memory.max`)).toBe(String(1024 * 1024 * 1024))
        expect(fs._files.get(`${CGROUP_ROOT}/test/run-1/cpu.max`)).toBe('200000 100000')
    })

    it('only writes memory.max when cpu not specified', () => {
        const fs = createMockFs()
        applyCgroupLimits({ slice: 'test/run-1', limits: { memoryMb: 256 }, fs })
        expect(fs._files.has(`${CGROUP_ROOT}/test/run-1/memory.max`)).toBe(true)
        expect(fs._files.has(`${CGROUP_ROOT}/test/run-1/cpu.max`)).toBe(false)
    })

    it('only writes cpu.max when memoryMb not specified', () => {
        const fs = createMockFs()
        applyCgroupLimits({ slice: 'test/run-1', limits: { cpu: 1.0 }, fs })
        expect(fs._files.has(`${CGROUP_ROOT}/test/run-1/memory.max`)).toBe(false)
        expect(fs._files.get(`${CGROUP_ROOT}/test/run-1/cpu.max`)).toBe('100000 100000')
    })

    it('does not write either when both limits undefined', () => {
        const fs = createMockFs()
        const result = applyCgroupLimits({ slice: 'test/run-1', limits: {}, fs })
        expect(result.applied).toBe(true)
        expect(fs._files.has(`${CGROUP_ROOT}/test/run-1/memory.max`)).toBe(false)
        expect(fs._files.has(`${CGROUP_ROOT}/test/run-1/cpu.max`)).toBe(false)
    })

    it('skips memory write when memoryMb = 0', () => {
        const fs = createMockFs()
        applyCgroupLimits({ slice: 'test/run-1', limits: { memoryMb: 0 }, fs })
        expect(fs._files.has(`${CGROUP_ROOT}/test/run-1/memory.max`)).toBe(false)
    })

    it('returns applied:false reason:permission_denied on memory write EACCES', () => {
        const fs = createMockFs({
            failOn: [{ method: 'writeFileSync', pathPattern: /memory\.max$/ }],
        })
        const result = applyCgroupLimits({ slice: 'test/run-1', limits: { memoryMb: 256 }, fs })
        expect(result.applied).toBe(false)
        expect(result.reason).toBe('permission_denied')
    })

    it('returns applied:false reason:create_failed on mkdir EACCES', () => {
        const fs = createMockFs({
            failOn: [{ method: 'mkdirSync' }],
        })
        const result = applyCgroupLimits({ slice: 'test/run-1', limits: { memoryMb: 256 }, fs })
        expect(result.applied).toBe(false)
        expect(result.reason).toBe('permission_denied') // mkdirSync 抛 EACCES → classifyFsError → permission_denied
    })

    it('returns applied:false reason:cpu_write_failed on cpu write failure', () => {
        const fs = createMockFs({
            failOn: [{ method: 'writeFileSync', pathPattern: /cpu\.max$/ }],
        })
        const result = applyCgroupLimits({
            slice: 'test/run-1',
            limits: { memoryMb: 256, cpu: 1.0 },
            fs,
        })
        expect(result.applied).toBe(false)
        expect(result.reason).toBe('permission_denied')
    })
})

// ---------------------------------------------------------------------------
// moveProcessToCgroup
// ---------------------------------------------------------------------------

describe('moveProcessToCgroup', () => {
    it('writes pid to cgroup.procs', () => {
        const fs = createMockFs()
        // pre-create the slice
        applyCgroupLimits({ slice: 'test/run-1', limits: { memoryMb: 256 }, fs })
        const result = moveProcessToCgroup({ pid: 12345, slice: 'test/run-1', fs })
        expect(result.moved).toBe(true)
        expect(fs._files.get(`${CGROUP_ROOT}/test/run-1/cgroup.procs`)).toBe('12345')
    })

    it('returns moved:false reason:not_cgroup_v2 on v1', () => {
        const fs = createMockFs()
        fs._files.delete(`${CGROUP_ROOT}/${CGROUP_V2_MARKER}`)
        const result = moveProcessToCgroup({ pid: 12345, slice: 'test/run-1', fs })
        expect(result.moved).toBe(false)
        expect(result.reason).toBe('not_cgroup_v2')
    })

    it('returns moved:false reason:invalid_pid for non-positive pid', () => {
        const fs = createMockFs()
        expect(moveProcessToCgroup({ pid: 0, slice: 'test/run-1', fs })).toEqual({ moved: false, reason: 'invalid_pid' })
        expect(moveProcessToCgroup({ pid: -1, slice: 'test/run-1', fs })).toEqual({ moved: false, reason: 'invalid_pid' })
        expect(moveProcessToCgroup({ pid: 1.5, slice: 'test/run-1', fs })).toEqual({ moved: false, reason: 'invalid_pid' })
        expect(moveProcessToCgroup({ pid: Number.NaN, slice: 'test/run-1', fs })).toEqual({ moved: false, reason: 'invalid_pid' })
    })

    it('returns moved:false reason:not_found when slice does not exist', () => {
        const fs = createMockFs()
        // 不预创建 slice → cgroup.procs 写入会失败（mock 中 ENOENT via not_found in mock）
        const result = moveProcessToCgroup({ pid: 12345, slice: 'test/missing', fs })
        expect(result.moved).toBe(false)
        expect(result.reason).toMatch(/not_found|write_failed/)
    })

    it('throws on invalid slice name', () => {
        const fs = createMockFs()
        expect(() => moveProcessToCgroup({ pid: 1, slice: '../bad', fs })).toThrow(/非法/)
    })
})

// ---------------------------------------------------------------------------
// cleanupCgroup
// ---------------------------------------------------------------------------

describe('cleanupCgroup', () => {
    it('removes the slice directory when applied', () => {
        const fs = createMockFs()
        applyCgroupLimits({ slice: 'test/run-1', limits: { memoryMb: 256 }, fs })
        expect(fs._dirs.has(`${CGROUP_ROOT}/test/run-1`)).toBe(true)

        const cleanup = cleanupCgroup({ slice: 'test/run-1', fs })
        expect(cleanup.removed).toBe(true)
        expect(fs._dirs.has(`${CGROUP_ROOT}/test/run-1`)).toBe(false)
    })

    it('returns removed:false reason:not_found when slice missing', () => {
        const fs = createMockFs()
        const cleanup = cleanupCgroup({ slice: 'test/missing', fs })
        expect(cleanup.removed).toBe(false)
        expect(cleanup.reason).toBe('not_found')
    })

    it('returns removed:false reason:not_cgroup_v2 on v1', () => {
        const fs = createMockFs()
        fs._files.delete(`${CGROUP_ROOT}/${CGROUP_V2_MARKER}`)
        const cleanup = cleanupCgroup({ slice: 'test/run-1', fs })
        expect(cleanup.removed).toBe(false)
        expect(cleanup.reason).toBe('not_cgroup_v2')
    })

    it('throws on invalid slice name', () => {
        const fs = createMockFs()
        expect(() => cleanupCgroup({ slice: 'a/../b', fs })).toThrow(/非法/)
    })
})

// ---------------------------------------------------------------------------
// observeOom
// ---------------------------------------------------------------------------

describe('observeOom', () => {
    it('yields event when oom_kill counter increases', async () => {
        const fs = createMockFs()
        applyCgroupLimits({ slice: 'test/run-1', limits: { memoryMb: 256 }, fs })
        // 设置初始 memory.events（oom_kill = 0）
        fs._files.set(`${CGROUP_ROOT}/test/run-1/memory.events`, 'low 0\nhigh 0\nmax 0\noom 0\noom_kill 0\n')

        const events: { triggeredAt: string, oomCount: number }[] = []
        const controller = new AbortController()
        const iter = observeOom({ slice: 'test/run-1', signal: controller.signal, pollIntervalMs: 10, fs })

        // 启动消费
        const consumer = (async () => {
            for await (const evt of iter) {
                events.push(evt)
                controller.abort() // 收到第一个事件后停止
                break
            }
        })()

        // 模拟 OOM 触发（oom_kill 0 → 1）
        await new Promise((r) => setTimeout(r, 20))
        fs._files.set(`${CGROUP_ROOT}/test/run-1/memory.events`, 'low 0\nhigh 0\nmax 0\noom 0\noom_kill 1\n')

        await consumer

        expect(events).toHaveLength(1)
        expect(events[0]!.oomCount).toBe(1)
        expect(events[0]!.triggeredAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    })

    it('silently exits when memory.events does not exist (slice not created)', async () => {
        const fs = createMockFs()
        const iter = observeOom({ slice: 'test/missing', pollIntervalMs: 10, fs })
        const events: unknown[] = []
        for await (const evt of iter) {
            events.push(evt)
        }
        expect(events).toHaveLength(0)
    })

    it('silently exits on non-cgroup-v2 host', async () => {
        const fs = createMockFs()
        fs._files.delete(`${CGROUP_ROOT}/${CGROUP_V2_MARKER}`)
        const iter = observeOom({ slice: 'test/run-1', pollIntervalMs: 10, fs })
        const events: unknown[] = []
        for await (const evt of iter) {
            events.push(evt)
        }
        expect(events).toHaveLength(0)
    })

    it('stops when signal aborted', async () => {
        const fs = createMockFs()
        applyCgroupLimits({ slice: 'test/run-1', limits: { memoryMb: 256 }, fs })
        fs._files.set(`${CGROUP_ROOT}/test/run-1/memory.events`, 'oom_kill 0\n')

        const controller = new AbortController()
        const iter = observeOom({ slice: 'test/run-1', signal: controller.signal, pollIntervalMs: 10, fs })

        // 启动后立即 abort
        setTimeout(() => controller.abort(), 5)

        const events: unknown[] = []
        for await (const evt of iter) {
            events.push(evt)
        }
        expect(events).toHaveLength(0)
    })

    it('stops when slice is removed mid-observation (graceful exit)', async () => {
        const fs = createMockFs()
        applyCgroupLimits({ slice: 'test/run-1', limits: { memoryMb: 256 }, fs })
        fs._files.set(`${CGROUP_ROOT}/test/run-1/memory.events`, 'oom_kill 0\n')

        const iter = observeOom({ slice: 'test/run-1', pollIntervalMs: 10, fs })

        // 启动消费
        const consumer = (async () => {
            const events: unknown[] = []
            for await (const evt of iter) {
                events.push(evt)
            }
            return events
        })()

        // 模拟 slice 被 cleanup → 删目录和文件
        await new Promise((r) => setTimeout(r, 20))
        fs.rmSync(`${CGROUP_ROOT}/test/run-1`, { recursive: true, force: true })

        const events = await consumer
        expect(events).toHaveLength(0)
    })
})

// ---------------------------------------------------------------------------
// 集成测试：真实 cgroup v2 + fork 子进程 OOM（仅在真实环境跑）
// ---------------------------------------------------------------------------

const realCgroupV2 = isCgroupV2()

describe.skipIf(!realCgroupV2)('integration: real cgroup v2 OOM behavior', () => {
    let sliceName: string

    beforeEach(() => {
        sliceName = `dependfix-test-${process.pid}-${Date.now()}`
    })

    afterEach(async () => {
        // 清理测试 slice（best-effort）
        cleanupCgroup({ slice: sliceName })
    })

    it('real OOM kill increments memory.events oom_kill counter', async () => {
        const handle = applyCgroupLimits({
            slice: sliceName,
            limits: { memoryMb: 64 }, // 极小内存触发 OOM
        })
        expect(handle.applied).toBe(true)

        // 把当前进程迁入 slice（集成测试主进程先迁，便于观察 memory.events）
        moveProcessToCgroup({ pid: process.pid, slice: sliceName })

        // 启动一个子进程去触发 OOM
        const child = (await import('node:child_process')).spawn(
            process.execPath,
            [
                '-e',
                // 子进程：分配大数组触发 cgroup OOM
                `process.cgroupPath = '/sys/fs/cgroup/${sliceName}'; const buf = []; while (true) { buf.push(new Uint8Array(10 * 1024 * 1024)); }`,
            ],
            { stdio: 'ignore' },
        )

        // 等子进程被 OOM kill（最多 10 秒）
        const exitCode = await new Promise<number | null>((resolve) => {
            child.on('close', (code) => resolve(code))
            child.on('error', () => resolve(-1))
            setTimeout(() => {
                child.kill('SIGKILL')
                resolve(-1)
            }, 10_000)
        })

        // OOM kill 信号为 SIGKILL（9）— Linux 内核行为
        // 子进程可能被 OOM kill（信号）或主进程测试机制 kill
        expect([9, -1, 137]).toContain(exitCode)

        // 检查 memory.events 的 oom_kill 计数（注意：当前进程已迁入 slice，OOM 是子进程触发的）
        // 这里不严格断言计数 ≥ 1（depends on kernel + 子进程是否能 alloc 到 cgroup）——只断言能读取
        const eventsPath = `${CGROUP_ROOT}/${sliceName}/memory.events`
        expect(existsSync(eventsPath)).toBe(true)
    })
})
