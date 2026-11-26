// overrides-io.test.ts — 依赖升级链的安装失败取证（`describeInstallError`）与既有格式化口径。
// 覆盖 2026-10-16 生产复盘暴露的缺口：stderr 为空（超时 / 被信号杀死）时失败文本被清空，
// 日志与报告里只剩 `pnpm install failed: `，无法区分「超时 / 被杀 / 装不动」。
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { DEFAULT_INSTALL_TIMEOUT_MS, INSTALL_TIMEOUT_ENV } from '../install-timeouts'
import { classifyInstallFailure, describeInstallError, execPnpmInstall, formatInstallFailure, isInstallEnvironmentalFailure } from './overrides-io'

// 安装类调用已迁到受管异步执行（`runners/process-control.ts`）：本文件以替身接管该单一入口。
const { mockRunTrackedCommand } = vi.hoisted(() => ({
    mockRunTrackedCommand: vi.fn(),
}))

vi.mock('../../runners/process-control', () => ({
    runTrackedCommand: mockRunTrackedCommand,
}))

/** 构造受管执行结果（缺省成功）。 */
function outcome(overrides: Partial<import('../../runners/process-control').TrackedCommandResult> = {}) {
    return {
        started: true,
        exitCode: 0,
        signal: null,
        timedOut: false,
        aborted: false,
        errno: null,
        stdout: '',
        stderr: '',
        durationMs: 1,
        ...overrides,
    }
}

/** 构造 `execSync` / `execFileSync` 形态的错误（`stderr` 为 Buffer，与 Node 实际抛出一致）。 */
function makeExecError(options: {
    message?: string
    stderr?: string
    signal?: string
    status?: number
    code?: string
}): Error {
    return Object.assign(new Error(options.message ?? 'Command failed: pnpm install --no-frozen-lockfile'), {
        stderr: Buffer.from(options.stderr ?? '', 'utf-8'),
        ...(options.signal !== undefined ? { signal: options.signal } : {}),
        ...(options.status !== undefined ? { status: options.status } : {}),
        ...(options.code !== undefined ? { code: options.code } : {}),
    })
}

describe('describeInstallError', () => {
    it('keeps the process signal and err.message when stderr is empty (timeout)', () => {
        // 超时形态：Node 抛 `spawnSync … ETIMEDOUT` 且 stderr 为空（pnpm 进度写 stdout）
        const err = makeExecError({
            message: 'spawnSync /bin/sh ETIMEDOUT',
            signal: 'SIGTERM',
            code: 'ETIMEDOUT',
        })

        expect(describeInstallError(err)).toBe('signal SIGTERM, timed out: spawnSync /bin/sh ETIMEDOUT')
    })

    it('keeps the signal when the install is killed (SIGKILL)', () => {
        const err = makeExecError({
            message: 'Command failed: pnpm install --no-frozen-lockfile',
            signal: 'SIGKILL',
        })

        expect(describeInstallError(err)).toBe('signal SIGKILL: Command failed: pnpm install --no-frozen-lockfile')
    })

    it('prefers stderr as evidence when present', () => {
        const err = makeExecError({ stderr: 'ERR_PNPM_OUTDATED_LOCKFILE: lockfile out of sync', status: 1 })

        expect(describeInstallError(err)).toBe('exit code 1: ERR_PNPM_OUTDATED_LOCKFILE: lockfile out of sync')
    })

    it('renders spawn errno when the toolchain is missing', () => {
        const err = makeExecError({ message: 'spawn pnpm ENOENT', code: 'ENOENT' })

        expect(describeInstallError(err)).toBe('spawn error ENOENT: spawn pnpm ENOENT')
    })

    it('falls back to a placeholder instead of an empty detail', () => {
        // 消息与 stderr 均为空：不能把冒号后的内容留空（否则读者无法判断是「无诊断」还是被截断）
        expect(describeInstallError(new Error(''))).toBe('no error detail')
    })

    it('renders non-Error throwables', () => {
        expect(describeInstallError('boom')).toBe('boom')
    })

    it('composes with formatInstallFailure (log / report text carries the evidence)', () => {
        const err = makeExecError({
            message: 'spawnSync /bin/sh ETIMEDOUT',
            signal: 'SIGTERM',
            code: 'ETIMEDOUT',
        })

        expect(formatInstallFailure(describeInstallError(err)))
            .toBe('pnpm install failed: signal SIGTERM, timed out: spawnSync /bin/sh ETIMEDOUT')
    })

    it('keeps the minimumReleaseAge hint alongside the process signal', () => {
        const err = makeExecError({
            stderr: 'ERR_PNPM_NO_MATURE_MATCHING_VERSION: no mature version for undici',
            status: 1,
        })
        const described = describeInstallError(err)

        expect(described).toContain('exit code 1')
        expect(classifyInstallFailure(described)).toContain('minimumReleaseAge')
    })

    it('uses stdout evidence when pnpm writes install-script errors there', () => {
        const err = Object.assign(new Error('Command failed: pnpm install --no-frozen-lockfile'), {
            stdout: Buffer.from(
                'prebuild-install warn install Request timed out\n'
                + 'gyp ERR! find Python\ngyp ERR! not ok\n'
                + '[ELIFECYCLE] Command failed with exit code 1.',
                'utf-8',
            ),
            status: 1,
        })

        const described = describeInstallError(err)

        expect(described).toContain('gyp ERR! find Python')
        expect(described).not.toContain('no error detail')
    })

    it('classifies native build failures as an actionable hint', () => {
        const described = describeInstallError(Object.assign(new Error('Command failed: pnpm install'), {
            stdout: Buffer.from('prebuild-install warn install Request timed out\ngyp ERR! find Python', 'utf-8'),
            status: 1,
        }))

        expect(classifyInstallFailure(described)).toContain('native module build failed')
        expect(formatInstallFailure(described)).toContain('python3/make/g++')
        // 默认平台镜像已无编译链，提示必须指向可落地的 full 变体，而不是只让用户「装工具链」
        expect(formatInstallFailure(described)).toContain('PLATFORM_VARIANT=full')
    })

    it('classifies ignored dependency build scripts', () => {
        const described = describeInstallError(makeExecError({
            stderr: 'ERR_PNPM_IGNORED_BUILDS: Ignored build scripts: better-sqlite3@12.11.1',
            status: 1,
        }))

        expect(classifyInstallFailure(described)).toContain('allowBuilds')
    })

    it('does not hijack an unrelated failure that merely mentions Ignored build scripts', () => {
        const described = describeInstallError(makeExecError({
            stderr: 'ERR_PNPM_OUTDATED_LOCKFILE: lockfile out of sync\nIgnored build scripts: left-pad@1.0.0',
            status: 1,
        }))

        expect(classifyInstallFailure(described)).toBeNull()
    })
})

// ---------------------------------------------------------------------------
// execPnpmInstall（受管异步执行：超时口径接线 + 错误形态零漂移）
// ---------------------------------------------------------------------------

describe('execPnpmInstall', () => {
    const originalTimeout = process.env[INSTALL_TIMEOUT_ENV]

    beforeEach(() => {
        mockRunTrackedCommand.mockReset()
        mockRunTrackedCommand.mockResolvedValue(outcome())
    })

    afterEach(() => {
        if (originalTimeout === undefined) {
            delete process.env[INSTALL_TIMEOUT_ENV]
        } else {
            process.env[INSTALL_TIMEOUT_ENV] = originalTimeout
        }
    })

    it('uses the shared install timeout (default 300s) and never blocks the event loop entry', async () => {
        await execPnpmInstall('/tmp/work')

        expect(mockRunTrackedCommand).toHaveBeenCalledWith({
            binary: 'pnpm',
            args: ['install', '--no-frozen-lockfile'],
            cwd: '/tmp/work',
            timeoutMs: DEFAULT_INSTALL_TIMEOUT_MS,
        })
    })

    it('honours DEPENDFIX_INSTALL_TIMEOUT_MS override', async () => {
        process.env[INSTALL_TIMEOUT_ENV] = '45000'

        await execPnpmInstall('/tmp/work')

        expect(mockRunTrackedCommand).toHaveBeenCalledWith(
            expect.objectContaining({ timeoutMs: 45_000 }),
        )
    })

    it('keeps stderr evidence when the install exits non-zero', async () => {
        mockRunTrackedCommand.mockResolvedValue(outcome({
            exitCode: 1,
            stderr: 'ERR_PNPM_OUTDATED_LOCKFILE: lockfile out of sync',
        }))

        const err = await execPnpmInstall('/tmp/work').catch((error: unknown) => error)

        expect(err).toBeInstanceOf(Error)
        expect(describeInstallError(err)).toBe('exit code 1: ERR_PNPM_OUTDATED_LOCKFILE: lockfile out of sync')
    })

    it('keeps the process signal when the install is killed / timed out (empty stderr)', async () => {
        mockRunTrackedCommand.mockResolvedValue(outcome({
            exitCode: null,
            signal: 'SIGKILL',
            timedOut: true,
        }))

        const err = await execPnpmInstall('/tmp/work').catch((error: unknown) => error)
        const described = describeInstallError(err)

        expect(described).toContain('signal SIGKILL')
        expect(described).toContain('timed out')
    })

    it('reports the cancellation explicitly when the command was not started', async () => {
        mockRunTrackedCommand.mockResolvedValue(outcome({
            started: false,
            aborted: true,
        }))

        const err = await execPnpmInstall('/tmp/work').catch((error: unknown) => error)

        // 未启动（取消守卫命中）与"启动后被信号杀死"必须可区分（后者见下一例）
        expect((err as Error).message).toContain('run aborted — install not started')
        // 运行级取消不得被新判据（stderr 为空 → 环境性）误吞
        expect(isInstallEnvironmentalFailure(err)).toBe(false)
    })

    it('marks aborted terminations in the evidence text (distinct from OOM kill)', async () => {
        mockRunTrackedCommand.mockResolvedValue(outcome({
            exitCode: null,
            signal: 'SIGKILL',
            aborted: true,
        }))

        const err = await execPnpmInstall('/tmp/work').catch((error: unknown) => error)

        expect(describeInstallError(err)).toContain('run aborted — command terminated by cancellation')
    })

    it('renders spawn errno when the pnpm toolchain is missing', async () => {
        mockRunTrackedCommand.mockResolvedValue(outcome({
            exitCode: null,
            errno: 'ENOENT',
        }))

        const err = await execPnpmInstall('/tmp/work').catch((error: unknown) => error)

        expect(describeInstallError(err)).toBe('spawn error ENOENT: spawn pnpm install --no-frozen-lockfile ENOENT')
    })
})

// ---------------------------------------------------------------------------
// isInstallEnvironmentalFailure（升级链与 lockfile 诊断链共用的单一判据）
// ---------------------------------------------------------------------------

describe('isInstallEnvironmentalFailure', () => {
    beforeEach(() => {
        mockRunTrackedCommand.mockReset()
    })

    async function installError(overrides: Partial<import('../../runners/process-control').TrackedCommandResult>) {
        mockRunTrackedCommand.mockResolvedValue(outcome(overrides))
        return execPnpmInstall('/tmp/work').catch((error: unknown) => error)
    }

    it('有明确 stderr 的安装失败不判环境性（归因目标仓库）', async () => {
        const err = await installError({ exitCode: 1, stderr: 'ERR_PNPM_IGNORED_BUILDS: approve builds' })
        expect(isInstallEnvironmentalFailure(err)).toBe(false)
    })

    it('信号终止 / 超时判环境性', async () => {
        expect(isInstallEnvironmentalFailure(await installError({ exitCode: null, signal: 'SIGKILL' }))).toBe(true)
        expect(isInstallEnvironmentalFailure(await installError({ exitCode: null, timedOut: true }))).toBe(true)
    })

    it('静默非零退出判环境性（与 lockfile 诊断链同口径）', async () => {
        const err = await installError({ exitCode: 1 })
        expect(isInstallEnvironmentalFailure(err)).toBe(true)
    })

    it('只有 stdout 诊断时仍判环境性（stdout 不参与归因判定）', async () => {
        const err = await installError({ exitCode: 1, stdout: 'gyp ERR! find Python' })
        expect(isInstallEnvironmentalFailure(err)).toBe(true)
    })

    it('运行级取消不判环境性（中止是独立类别）', async () => {
        const err = await installError({ exitCode: null, signal: 'SIGKILL', aborted: true })
        expect(isInstallEnvironmentalFailure(err)).toBe(false)
    })
})
