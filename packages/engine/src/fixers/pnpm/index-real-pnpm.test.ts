// index-real-pnpm.test.ts — 真实 pnpm 的锁文件损坏修复（不 mock 受管执行）。
//
// 覆盖两条只有真实解析器才能证明的行为：
// 1. `duplicated mapping key` 形态的损坏锁文件：原地策略解析失败 → 移出后按 manifest 重建 → frozen 通过；
// 2. 基线已判安装失败（knownBroken）但锁文件其实合规：禁用「已合规」捷径后重建仍应通过。
// 未安装 pnpm 的环境自动跳过（CI 一定具备）。
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { repairLockfile } from './index'

const hasPnpm = (() => {
    try {
        const result = spawnSync('pnpm', ['--version'], { encoding: 'utf-8' })
        return result.status === 0 && Boolean(result.stdout.trim())
    } catch {
        return false
    }
})()

const BROKEN_LOCKFILE = `lockfileVersion: '9.0'

importers:
  .: {}
  .: {}

packages: {}
`

describe.runIf(hasPnpm)('repairLockfile with the real pnpm', () => {
    let dir: string
    let lockfilePath: string

    beforeEach(() => {
        dir = mkdtempSync(join(tmpdir(), 'dependfix-real-pnpm-'))
        writeFileSync(join(dir, 'package.json'), `${JSON.stringify({ name: 'fixture', version: '1.0.0' }, null, 2)}\n`)
        lockfilePath = join(dir, 'pnpm-lock.yaml')
    })

    afterEach(() => {
        try {
            rmSync(dir, { recursive: true, force: true })
        } catch {
            /* ignore */
        }
    })

    it('repairs a duplicated-mapping-key lockfile and passes frozen install', async () => {
        writeFileSync(lockfilePath, BROKEN_LOCKFILE)

        const result = await repairLockfile({ workDir: dir })

        expect(result.success).toBe(true)
        expect(result.changed).toBe(true)
        // 真实 pnpm 可能直接原地修好（--fix-lockfile / --lockfile-only），也可能需要移出重建；
        // 用例只要求落在这三条会真正改写文件的策略上（成功判据仍是 frozen 安装通过）
        expect(['FIX_ENTRIES', 'REGENERATE', 'REGENERATE_FROM_MANIFEST']).toContain(result.strategy)
        // 产物必须能被 frozen 安装接受（成功判据只有一个）
        const verify = spawnSync('pnpm', ['install', '--frozen-lockfile'], { cwd: dir, encoding: 'utf-8' })
        expect(verify.status).toBe(0)
        // 移出件与备份都不残留
        expect(readFileSync(lockfilePath, 'utf-8')).toContain('lockfileVersion')
        expect(existsSync(`${lockfilePath}.broken`)).toBe(false)
        expect(existsSync(`${lockfilePath}.bak`)).toBe(false)
    }, 180_000)

    it('rebuilds from manifest even when the recheck passes but the baseline failed', async () => {
        writeFileSync(lockfilePath, BROKEN_LOCKFILE)
        // 先用真实 pnpm 生成一份合规锁文件
        const seed = spawnSync('pnpm', ['install'], { cwd: dir, encoding: 'utf-8' })
        expect(seed.status).toBe(0)
        const compliant = readFileSync(lockfilePath, 'utf-8')

        const result = await repairLockfile({
            workDir: dir,
            knownBrokenLockfile: {
                command: 'pnpm install --frozen-lockfile',
                detail: 'ERR_PNPM_BROKEN_LOCKFILE: duplicated mapping key "packages"',
            },
        })

        expect(result.success).toBe(true)
        expect(result.strategy).toBe('REGENERATE_FROM_MANIFEST')
        // 重建结果与合规基线等价：不因拒绝捷径而引入内容漂移
        expect(result.changed).toBe(false)
        expect(readFileSync(lockfilePath, 'utf-8')).toBe(compliant)
    }, 180_000)
})
