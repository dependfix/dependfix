import { existsSync, readFileSync, writeFileSync, readdirSync, rmSync, mkdirSync } from 'node:fs'

/**
 * Linux cgroup v2 资源限制模块（执行期宿主侧防护：恶意脚本触发资源炸弹时的硬性 OOM/CPU 上限）。
 *
 * 设计要点（见 docs/design/governance/executor-sandbox.md §7 与 todo.md 决策会议结论）：
 * - **跨平台 fallback**：仅在 Linux + cgroup v2 上生效；v1、macOS、Windows 静默 no-op（caller 据
 *   `applied=false` 决定是否依赖 Node 自身 `--max-old-space-size` 等软限制）
 * - **强一致性双层防护**：sandbox 容器（--memory/--cpus）已是第一层；本模块作用于宿主进程
 *   （CLI/MCP/Action 场景调起的 Node.js 进程或子进程），是双层加固中的第二层
 * - **Node 20+ 自适应**：libuv 自动读 cgroup v2 memory.max 调 V8 堆（[nodejs/node#52478](https://github.com/nodejs/node/issues/52478) 实证），
 *   本模块写 memory.max 后 Node 进程内分配内存也会受 cgroup 限制；非 V8 路径（native addon / Buffer / async）
 *   由 kernel OOM killer 兜底
 * - **进程迁移**：通过写 cgroup.procs 把指定 PID 移入子 cgroup；调用方控制迁移时机
 *   （如 fork 后立刻迁，再 exec 替换）
 *
 * 安全边界：本模块仅做 syscall + 文件写入，不解析 / 校验 / 网络交互。slice 名必须调用方
 * 白名单校验（本模块只保证 slice 不含 `..` 与绝对路径前缀）。
 */

/** cgroup v2 挂载点（Linux 标准；WLS2 / Docker 默认） */
export const CGROUP_ROOT = '/sys/fs/cgroup'

/** cgroup v2 标志文件（v1 不存在）—— see Red Hat cgroup v2 docs */
export const CGROUP_V2_MARKER = 'cgroup.controllers'

/** 限额选项（与 sandbox-executor 的 sandboxLimits 字段对齐：仓库级覆盖 → 沙箱级 → SANDBOX_DEFAULTS） */
export interface CgroupLimits {
    /** 内存上限 MB（v2 写 memory.max 字节数；缺省 = 不设置） */
    memoryMb?: number
    /** CPU quota（v2 写 cpu.max `$quota $period`；quota/100ms 比例，1.0 = 100ms/100ms） */
    cpu?: number
}

/** 限额应用结果 */
export interface CgroupHandle {
    /** 子 cgroup 切片名（相对 CGROUP_ROOT，如 `dependfix/run-abc123`） */
    slice: string
    /** 子 cgroup 绝对路径 */
    path: string
    /** 是否实际生效（cgroup v2 + 写入成功 → true；v1/macOS/Windows 或权限不足 → false） */
    applied: boolean
    /** 不生效原因（仅 applied=false 时存在；caller 据此决定是否启用软限制 fallback） */
    reason?: string
}

/** 进程迁移结果 */
export interface MoveResult {
    moved: boolean
    reason?: string
}

/** OOM 事件（cgroup v2 memory.events 计数器变化时产出） */
export interface OomEvent {
    /** 发生 OOM 时的内核时间戳（ISO 字符串） */
    triggeredAt: string
    /** 当前 oom_kill 计数器（用于与历史值比对——本模块只产出"有过 OOM"的单事件） */
    oomCount: number
}

/** 注入的 fs 依赖类型（测试时 mock；生产用 node:fs） */
export interface FsAdapter {
    existsSync(path: string): boolean
    mkdirSync(path: string, opts?: { recursive?: boolean }): string | undefined
    writeFileSync(path: string, data: string): void
    readFileSync(path: string, encoding: 'utf-8'): string
    readdirSync(path: string): string[]
    rmSync(path: string, opts?: { recursive?: boolean, force?: boolean }): void
}

/** 默认 fs 适配器（绑定到 node:fs 模块） */
const defaultFs: FsAdapter = {
    existsSync,
    mkdirSync,
    writeFileSync,
    readFileSync,
    readdirSync,
    rmSync,
}

/** cgroup v2 CPU 配额基准周期（100ms——与 systemd / kubelet 默认对齐） */
const CPU_PERIOD_US = 100_000

/**
 * 探测宿主是否为 cgroup v2（v1 或非 Linux 视为非 v2）。
 * 检测依据：`/sys/fs/cgroup/cgroup.controllers` 文件存在（v2 唯一标识，v1 无此文件）。
 *
 * @param root - 可选，测试用注入（默认 `/sys/fs/cgroup`）
 * @param fs - 可选，测试用 fs 适配器
 */
export function isCgroupV2(root: string = CGROUP_ROOT, fs: FsAdapter = defaultFs): boolean {
    if (process.platform !== 'linux') {
        return false
    }
    try {
        return fs.existsSync(`${root}/${CGROUP_V2_MARKER}`)
    } catch {
        return false
    }
}

/**
 * 校验 slice 名称白名单（防御性：拒绝路径分隔符与父目录引用）。
 * 与 sandbox-executor 的 runId 白名单同形态（[A-Za-z0-9_-]+，允许 / 分层）。
 */
const SLICE_PATTERN = /^[A-Za-z0-9_/-]+$/

function validateSlice(slice: string): void {
    if (!slice || !SLICE_PATTERN.test(slice)) {
        throw new Error(`非法的 cgroup slice 名称: ${slice}（仅允许字母数字、下划线、连字符、斜杠）`)
    }
    if (slice.startsWith('/') || slice.endsWith('/')) {
        throw new Error(`非法的 cgroup slice 名称: ${slice}（不允许首尾斜杠）`)
    }
    if (slice.includes('..')) {
        throw new Error(`非法的 cgroup slice 名称: ${slice}（不允许 ..）`)
    }
}

/**
 * 应用限额到子 cgroup：创建子目录 + 写 memory.max + cpu.max。
 *
 * 不负责进程迁移——调用方决定迁移哪个 PID 到此 slice（典型场景：fork 后立刻
 * moveProcessToCgroup，再 exec 替换）。
 *
 * 失败语义：
 * - 平台非 Linux / 非 v2 → `{ applied: false, reason: 'not_cgroup_v2' }`
 * - 文件写入失败（EACCES / EPERM）→ `{ applied: false, reason: 'permission_denied' }`
 * - 子目录创建失败（EROFS / ENOSPC 等）→ `{ applied: false, reason: 'create_failed' }`
 *
 * @param opts.slice - 子 cgroup 切片名（相对 CGROUP_ROOT）
 * @param opts.limits - 限额配置
 * @param opts.root - 可选，测试用注入
 * @param opts.fs - 可选，测试用 fs 适配器
 */
export function applyCgroupLimits(opts: {
    slice: string
    limits: CgroupLimits
    root?: string
    fs?: FsAdapter
}): CgroupHandle {
    const root = opts.root ?? CGROUP_ROOT
    const fs = opts.fs ?? defaultFs
    validateSlice(opts.slice)

    if (!isCgroupV2(root, fs)) {
        return { slice: opts.slice, path: `${root}/${opts.slice}`, applied: false, reason: 'not_cgroup_v2' }
    }

    const cgroupPath = `${root}/${opts.slice}`

    // 创建子 cgroup 目录（mkdirSync recursive 自动忽略 EEXIST）
    try {
        fs.mkdirSync(cgroupPath, { recursive: true })
    } catch (error) {
        return {
            slice: opts.slice,
            path: cgroupPath,
            applied: false,
            reason: classifyFsError(error, 'create_failed'),
        }
    }

    // 写 memory.max（v2 格式：字节数；`max` 表示不限）
    if (opts.limits.memoryMb !== undefined && opts.limits.memoryMb > 0) {
        const bytes = opts.limits.memoryMb * 1024 * 1024
        try {
            fs.writeFileSync(`${cgroupPath}/memory.max`, String(bytes))
        } catch (error) {
            return {
                slice: opts.slice,
                path: cgroupPath,
                applied: false,
                reason: classifyFsError(error, 'memory_write_failed'),
            }
        }
    }

    // 写 cpu.max（v2 格式：`$quota $period`；quota === max → 写 `max $period`）
    if (opts.limits.cpu !== undefined && opts.limits.cpu > 0) {
        const quota = Math.floor(opts.limits.cpu * CPU_PERIOD_US)
        try {
            fs.writeFileSync(`${cgroupPath}/cpu.max`, `${quota} ${CPU_PERIOD_US}`)
        } catch (error) {
            return {
                slice: opts.slice,
                path: cgroupPath,
                applied: false,
                reason: classifyFsError(error, 'cpu_write_failed'),
            }
        }
    }

    return { slice: opts.slice, path: cgroupPath, applied: true }
}

/**
 * 把指定 PID 移入子 cgroup（写 cgroup.procs 文件）。
 * 注意：v2 cgroup.procs 接受 PID（线程组 ID）；写单 PID 即把整个线程组迁入。
 *
 * @param opts.pid - 目标 PID（必须正整数）
 * @param opts.slice - 目标 slice（必须先通过 applyCgroupLimits 创建）
 * @param opts.root - 可选，测试用注入
 * @param opts.fs - 可选，测试用 fs 适配器
 */
export function moveProcessToCgroup(opts: {
    pid: number
    slice: string
    root?: string
    fs?: FsAdapter
}): MoveResult {
    const root = opts.root ?? CGROUP_ROOT
    const fs = opts.fs ?? defaultFs
    validateSlice(opts.slice)

    if (!isCgroupV2(root, fs)) {
        return { moved: false, reason: 'not_cgroup_v2' }
    }
    if (!Number.isInteger(opts.pid) || opts.pid <= 0) {
        return { moved: false, reason: 'invalid_pid' }
    }

    const cgroupPath = `${root}/${opts.slice}/cgroup.procs`
    try {
        fs.writeFileSync(cgroupPath, String(opts.pid))
        return { moved: true }
    } catch (error) {
        return { moved: false, reason: classifyFsError(error, 'write_failed') }
    }
}

/**
 * 清理子 cgroup：递归删除目录（cgroup v2 要求子节点为空才能 rmdir，
 * 但已迁出的进程不会持有引用，子进程退出后自动变空）。
 *
 * 失败静默——清理失败不影响调用方主流程（best-effort，与 sandbox-executor 的
 * rm(workDir) 对齐）。
 *
 * @param opts.slice - 目标 slice
 * @param opts.root - 可选，测试用注入
 * @param opts.fs - 可选，测试用 fs 适配器
 */
export function cleanupCgroup(opts: {
    slice: string
    root?: string
    fs?: FsAdapter
}): { removed: boolean, reason?: string } {
    const root = opts.root ?? CGROUP_ROOT
    const fs = opts.fs ?? defaultFs
    validateSlice(opts.slice)

    if (!isCgroupV2(root, fs)) {
        return { removed: false, reason: 'not_cgroup_v2' }
    }

    const cgroupPath = `${root}/${opts.slice}`
    try {
        if (!fs.existsSync(cgroupPath)) {
            return { removed: false, reason: 'not_found' }
        }
        fs.rmSync(cgroupPath, { recursive: true, force: true })
        return { removed: true }
    } catch (error) {
        return { removed: false, reason: classifyFsError(error, 'remove_failed') }
    }
}

/**
 * 轮询观察子 cgroup 的 OOM 事件（cgroup v2 memory.events 中 oom_kill 计数变化时产出）。
 *
 * 实现简化：用定时轮询（默认 200ms）读取 memory.events，解析 oom_kill 字段；
 * 计数增加时产出一次事件。Linux cgroup v2 内核不主动 push OOM 事件给用户态
 * （fanotify/epoll 路径复杂且权限要求高），轮询足够覆盖 Node.js 进程场景
 * （Node 进程被 OOM kill 后必然留下计数痕迹）。
 *
 * @param opts.slice - 目标 slice
 * @param opts.signal - 可选 AbortSignal（中断轮询）
 * @param opts.pollIntervalMs - 轮询间隔（默认 200ms）
 * @param opts.root - 可选，测试用注入
 * @param opts.fs - 可选，测试用 fs 适配器
 */
export async function* observeOom(opts: {
    slice: string
    signal?: AbortSignal
    pollIntervalMs?: number
    root?: string
    fs?: FsAdapter
}): AsyncGenerator<OomEvent, void, void> {
    const root = opts.root ?? CGROUP_ROOT
    const fs = opts.fs ?? defaultFs
    const interval = opts.pollIntervalMs ?? 200
    validateSlice(opts.slice)

    if (!isCgroupV2(root, fs)) {
        return // 非 v2 环境静默退出（与 applyCgroupLimits 一致）
    }

    const eventsPath = `${root}/${opts.slice}/memory.events`
    let lastCount = 0
    try {
        const initial = fs.readFileSync(eventsPath, 'utf-8')
        lastCount = parseOomCount(initial)
    } catch {
        return // memory.events 不存在（slice 未创建）→ 静默退出
    }

    while (!opts.signal?.aborted) {
        await new Promise<void>((resolve) => setTimeout(resolve, interval))
        if (opts.signal?.aborted) {
            return
        }
        try {
            const current = fs.readFileSync(eventsPath, 'utf-8')
            const count = parseOomCount(current)
            if (count > lastCount) {
                lastCount = count
                yield { triggeredAt: new Date().toISOString(), oomCount: count }
            }
        } catch {
            // slice 被 cleanup 后文件消失 → 停止观察
            return
        }
    }
}

/** 解析 memory.events 文件中的 oom 计数器（cgroup v2 标准格式：`oom_kill N`） */
function parseOomCount(content: string): number {
    for (const line of content.split('\n')) {
        const trimmed = line.trim()
        if (trimmed.startsWith('oom_kill ')) {
            const value = Number.parseInt(trimmed.slice('oom_kill '.length), 10)
            return Number.isFinite(value) ? value : 0
        }
    }
    return 0
}

/** 文件系统错误分类（NodeJS.ErrnoException → 简短原因） */
function classifyFsError(error: unknown, fallback: string): string {
    const code = (error as NodeJS.ErrnoException | undefined)?.code
    if (code === 'EACCES' || code === 'EPERM') {
        return 'permission_denied'
    }
    if (code === 'ENOENT') {
        return 'not_found'
    }
    if (code === 'EROFS') {
        return 'read_only_fs'
    }
    if (code === 'ENOSPC') {
        return 'no_space'
    }
    return fallback
}
