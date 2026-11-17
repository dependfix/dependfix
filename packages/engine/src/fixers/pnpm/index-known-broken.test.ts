// index-known-broken.test.ts — 锁文件「基线已判安装失败」不变式与结构兜底策略。
// 从 index.test.ts 拆出（该文件已接近 max-lines 上限），只覆盖 knownBrokenLockfile 与
// REGENERATE_FROM_MANIFEST 三条路径；其余诊断 / 策略用例留在原文件。
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockRunTrackedCommand } = vi.hoisted(() => ({
    mockRunTrackedCommand: vi.fn(),
}))

vi.mock('../../runners/process-control', async (importOriginal) => {
    const original = await importOriginal<typeof import('../../runners/process-control')>()
    return { ...original, runTrackedCommand: mockRunTrackedCommand }
})

import { repairLockfile } from './index'

type TrackedOutcome = import('../../runners/process-control').TrackedCommandResult

function okOutcome(overrides: Partial<TrackedOutcome> = {}): TrackedOutcome {
    return {
        started: true,
        exitCode: 0,
        signal: null,
        timedOut: false,
        aborted: false,
        errno: null,
        stdout: '',
        stderr: '',
        durationMs: 0,
        ...overrides,
    }
}

function generateLockfileContent(lineCount: number, packageCount: number): string {
    const lines = ['lockfileVersion: \'9.0\'', '', 'importers:', '  .: {}', '', 'packages:']
    for (let i = 0; i < packageCount; i++) {
        lines.push(`  /pkg-${i}@${i % 2 === 0 ? '1.0.0' : '2.0.0'}:`)
        lines.push(`    resolution: {integrity: sha512-${i}}`)
    }
    while (lines.length < lineCount) {
        lines.push('')
    }
    return `${lines.join('\n')}\n`
}

describe('repairLockfile — known-broken lockfile invariant', () => {
    let dir: string
    let lockfilePath: string

    const baselineFailure = {
        command: 'pnpm install --frozen-lockfile',
        detail: 'ERR_PNPM_BROKEN_LOCKFILE: duplicated mapping key "packages"',
    }

    beforeEach(() => {
        mockRunTrackedCommand.mockReset()
        dir = mkdtempSync(join(tmpdir(), 'dependfix-test-known-broken-'))
        writeFileSync(join(dir, 'package.json'), `${JSON.stringify({ name: 'fixture', version: '1.0.0' }, null, 2)}\n`)
        lockfilePath = join(dir, 'pnpm-lock.yaml')
        writeFileSync(lockfilePath, generateLockfileContent(5, 10))
    })

    afterEach(() => {
        try {
            rmSync(dir, { recursive: true, force: true })
        } catch {
            /* ignore */
        }
    })

    it('disables the compliant shortcut and rebuilds from manifest', async () => {
        let calls = 0
        mockRunTrackedCommand.mockImplementation(async (options: { args: string[] }) => {
            calls += 1
            // 诊断复检通过（与基线结论冲突）——不得据此返回「已合规」
            if (calls === 1) {
                return okOutcome()
            }
            if (options.args.includes('--lockfile-only')) {
                writeFileSync(lockfilePath, generateLockfileContent(8, 12))
                return okOutcome()
            }
            return okOutcome()
        })

        const result = await repairLockfile({ workDir: dir, knownBrokenLockfile: baselineFailure })

        expect(result.success).toBe(true)
        expect(result.strategy).toBe('REGENERATE_FROM_MANIFEST')
        expect(result.changed).toBe(true)
        expect(result.diff?.linesChanged).not.toBe(0)
        expect(result.attemptHistory[0].strategy).toBe('REGENERATE_FROM_MANIFEST')
        expect(existsSync(`${lockfilePath}.broken`)).toBe(false)
    })

    it('reports PRECONDITION_FAILED with baseline evidence when every strategy fails', async () => {
        const original = readFileSync(lockfilePath, 'utf-8')
        let calls = 0
        mockRunTrackedCommand.mockImplementation(async () => {
            calls += 1
            if (calls === 1) {
                return okOutcome()
            }
            return okOutcome({ exitCode: 1, stderr: 'ERR_PNPM_BROKEN_LOCKFILE: duplicated mapping key "packages"' })
        })

        const result = await repairLockfile({ workDir: dir, knownBrokenLockfile: baselineFailure })

        expect(result.success).toBe(false)
        expect(result.failureCategory).toBe('PRECONDITION_FAILED')
        expect(result.failureDetail).toContain('baseline install already failed')
        expect(result.failureDetail).toContain('refusing the "already compliant" shortcut')
        expect(result.attemptHistory.slice(0, 3).map((attempt) => attempt.strategy)).toEqual([
            'REGENERATE_FROM_MANIFEST',
            'REGENERATE',
            'REINSTALL',
        ])
        // 回滚：内容逐字节一致，备份 / 移出件均不残留
        expect(readFileSync(lockfilePath, 'utf-8')).toBe(original)
        expect(existsSync(`${lockfilePath}.bak`)).toBe(false)
        expect(existsSync(`${lockfilePath}.broken`)).toBe(false)
    })

    it('escalates CORRUPTED_LOCKFILE to REGENERATE_FROM_MANIFEST', async () => {
        let calls = 0
        mockRunTrackedCommand.mockImplementation(async (options: { args: string[] }) => {
            calls += 1
            if (calls <= 3) {
                // 诊断 + FIX_ENTRIES + REGENERATE 都无法解析原文件
                return okOutcome({ exitCode: 1, stderr: 'ERR_PNPM_BROKEN_LOCKFILE: duplicated mapping key "packages"' })
            }
            if (options.args.includes('--lockfile-only')) {
                writeFileSync(lockfilePath, generateLockfileContent(9, 13))
                return okOutcome()
            }
            return okOutcome()
        })

        const result = await repairLockfile({ workDir: dir })

        expect(result.success).toBe(true)
        expect(result.strategy).toBe('REGENERATE_FROM_MANIFEST')
        expect(result.changed).toBe(true)
        expect(result.attemptHistory.map((attempt) => attempt.strategy)).toEqual([
            'FIX_ENTRIES',
            'REGENERATE',
            'REGENERATE_FROM_MANIFEST',
        ])
    })

    // 回归：pnpm 在 node_modules 已是最新时对 install 直接返回 0（"Already up to date"），
    // 既不重建被移出的锁文件，也让 frozen 验证短路通过——旧的「命令成功 + 验证通过」判据
    // 会把删除当修复发布（PR 只剩 pnpm-lock.yaml 删除）。成功必须有可用产物。
    it('never treats a zero-exit pnpm run without a lockfile as a successful repair', async () => {
        // 现网形态：原锁文件结构损坏（重复 key），pnpm 全部命令因 up-to-date 返回 0 且不写文件
        const corrupt = 'lockfileVersion: \'9.0\'\npackages:\n  /a@1.0.0: {}\n  /a@1.0.0: {}\n'
        writeFileSync(lockfilePath, corrupt)
        mockRunTrackedCommand.mockImplementation(async () => okOutcome())

        const result = await repairLockfile({ workDir: dir, knownBrokenLockfile: baselineFailure })

        expect(result.success).toBe(false)
        expect(result.failureCategory).toBe('PRECONDITION_FAILED')
        // 原锁文件逐字节恢复，备份 / 移出件均不残留
        expect(readFileSync(lockfilePath, 'utf-8')).toBe(corrupt)
        expect(existsSync(`${lockfilePath}.bak`)).toBe(false)
        expect(existsSync(`${lockfilePath}.broken`)).toBe(false)
        // 每个策略的失败原因都指向产物缺失（而不是伪装成安装失败）
        expect(result.attemptHistory.some((attempt) => attempt.error?.includes('did not produce a usable lockfile'))).toBe(true)
    })

})
