// index-artifact.test.ts — 锁文件修复的产物判据（存在 + 可解析）与「验证通过但产物不可用」回归。
// 从 index.test.ts 拆出（该文件已接近 max-lines 上限）：只覆盖 inspectLockfileArtifact 直测
// 与两条 repairLockfile 产物不变式用例，其余诊断 / 策略用例留在原文件。
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

import { inspectLockfileArtifact } from './lockfile-artifact'
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

describe('inspectLockfileArtifact', () => {
    let dir: string
    let lockfilePath: string

    beforeEach(() => {
        dir = mkdtempSync(join(tmpdir(), 'dependfix-test-artifact-'))
        lockfilePath = join(dir, 'pnpm-lock.yaml')
    })

    afterEach(() => {
        try {
            rmSync(dir, { recursive: true, force: true })
        } catch {
            /* ignore */
        }
    })

    it('accepts an existing lockfile with a numeric or string lockfileVersion', () => {
        writeFileSync(lockfilePath, generateLockfileContent(5, 2))
        expect(inspectLockfileArtifact(dir).ok).toBe(true)

        writeFileSync(lockfilePath, 'lockfileVersion: 6.0\npackages: {}\n')
        expect(inspectLockfileArtifact(dir).ok).toBe(true)
    })

    it('rejects a missing lockfile', () => {
        const result = inspectLockfileArtifact(dir)
        expect(result.ok).toBe(false)
        expect(result.reason).toContain('lockfile missing')
    })

    it('rejects a lockfile with duplicated mapping keys', () => {
        writeFileSync(lockfilePath, 'lockfileVersion: \'9.0\'\npackages:\n  /a@1.0.0: {}\n  /a@1.0.0: {}\n')
        const result = inspectLockfileArtifact(dir)
        expect(result.ok).toBe(false)
        expect(result.reason).toContain('not valid YAML')
    })

    it('rejects a YAML document that is not a pnpm lockfile', () => {
        writeFileSync(lockfilePath, '- just\n- a\n- list\n')
        expect(inspectLockfileArtifact(dir).reason).toContain('root is not a mapping')

        writeFileSync(lockfilePath, 'packages: {}\n')
        expect(inspectLockfileArtifact(dir).reason).toContain('missing lockfileVersion')
    })
})

describe('repairLockfile — artifact invariant', () => {
    let dir: string
    let lockfilePath: string

    beforeEach(() => {
        mockRunTrackedCommand.mockReset()
        dir = mkdtempSync(join(tmpdir(), 'dependfix-test-artifact-repair-'))
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

    // 第二道产物判据：frozen 验证本身也可能被 pnpm 的 up-to-date 快路径短路，
    // 「验证通过」必须在锁文件可用时才算数。
    it('rejects a repair whose frozen verification passes but leaves no usable lockfile', async () => {
        let frozenCalls = 0
        mockRunTrackedCommand.mockImplementation(async (options: { args: string[] }) => {
            if (options.args.includes('--frozen-lockfile')) {
                frozenCalls += 1
                if (frozenCalls === 1) {
                    return okOutcome({ exitCode: 1, stderr: 'ERR_PNPM_OUTDATED_LOCKFILE' })
                }
                // 验证「通过」但锁文件已不可用（短路不接受缺失产物）
                rmSync(lockfilePath, { force: true })
                return okOutcome()
            }
            if (options.args.includes('--lockfile-only')) {
                writeFileSync(lockfilePath, generateLockfileContent(6, 11))
                return okOutcome()
            }
            return okOutcome()
        })

        const result = await repairLockfile({ workDir: dir })

        expect(result.success).toBe(false)
        expect(result.failureDetail).toContain('verification passed but the lockfile is unusable')
        expect(existsSync(lockfilePath)).toBe(true)
        expect(existsSync(`${lockfilePath}.bak`)).toBe(false)
    })

    // 未走 REGENERATE_FROM_MANIFEST 时 pnpm 也可能自行删掉 root lockfile：
    // 失败分支必须同样从 .bak 恢复（旧实现只处理「移出过」的场景）。
    it('restores the lockfile when a strategy command deletes it despite exiting 0', async () => {
        const original = readFileSync(lockfilePath, 'utf-8')
        mockRunTrackedCommand.mockImplementation(async (options: { args: string[] }) => {
            if (options.args.includes('--frozen-lockfile')) {
                return okOutcome({ exitCode: 1, stderr: 'ERR_PNPM_OUTDATED_LOCKFILE' })
            }
            rmSync(lockfilePath, { force: true })
            return okOutcome()
        })

        const result = await repairLockfile({ workDir: dir })

        expect(result.success).toBe(false)
        expect(readFileSync(lockfilePath, 'utf-8')).toBe(original)
        expect(result.attemptHistory
            .filter((attempt) => attempt.strategy !== 'SKIP')
            .every((attempt) => attempt.success === false)).toBe(true)
        expect(result.attemptHistory.some((attempt) => attempt.error?.includes('lockfile missing after the command'))).toBe(true)
    })
})
