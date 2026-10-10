import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FixAction, NormalizedSecurityAlert } from '@dependfix/core'

/**
 * packages/engine/src/app/helpers.test.ts
 *
 * runCodeScanningFixes 批处理测试覆盖：
 * - batchSize 默认 10 + 可配置
 * - N=10/11/25 触发 1/2/3 次 lint
 * - 批内 lint 失败时所有批内告警 rollback + 标记 failed
 * - dry-run 跳过 lint
 * - 单个告警快照失败不影响其他批内告警
 *
 * 关联：baseline bench（commit 395ee29）+ 批处理第二阶段
 */

// ---------------------------------------------------------------------------
// Mock 依赖
// ---------------------------------------------------------------------------

const {
    mockSnapshotSourceFile,
    mockRestoreSourceFile,
    mockApplyCodeScanningFix,
    mockQuickVerifyProject,
} = vi.hoisted(() => ({
    mockSnapshotSourceFile: vi.fn(),
    mockRestoreSourceFile: vi.fn(),
    mockApplyCodeScanningFix: vi.fn(),
    mockQuickVerifyProject: vi.fn(),
}))

vi.mock('../fixers/code-scanning', () => ({
    snapshotSourceFile: mockSnapshotSourceFile,
    restoreSourceFile: mockRestoreSourceFile,
    applyCodeScanningFix: mockApplyCodeScanningFix,
}))

vi.mock('../helpers', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../helpers')>()
    return {
        ...actual,
        quickVerifyProject: mockQuickVerifyProject,
    }
})

import { ensureGitignore, normalizeGitignoreEntry, runCodeScanningFixes } from './helpers'

// ---------------------------------------------------------------------------
// 测试辅助
// ---------------------------------------------------------------------------

/** 构造 cs auto-fixable 告警（最小必填字段） */
function makeCsAlert(ruleId: string, manifestPath = 'src/file.ts'): NormalizedSecurityAlert {
    return {
        id: ruleId.length,
        source: 'code-scanning',
        repository: 'test/repo',
        defaultBranch: 'main',
        severity: 'medium',
        packageEcosystem: 'npm',
        packageName: 'fake-pkg',
        manifestPath,
        ruleId,
        summary: `summary for ${ruleId}`,
        htmlUrl: `https://example.com/${ruleId}`,
        fixable: true,
        fixStrategy: 'manual',
        recommendedVersion: '',
        alertClass: 'auto-fixable',
    } as NormalizedSecurityAlert
}

/** 构造成功 FixAction（含 diff 字段供 logger 使用） */
function makeFixAction(ruleId: string): FixAction {
    return {
        type: 'code-scanning-fix',
        repository: 'test/repo',
        target: ruleId,
        success: true,
        filePath: 'src/file.ts',
        diff: `+ diff for ${ruleId}`,
        durationMs: 1,
    } as FixAction
}

/** 构造 ctx（最小必需字段） */
function makeCtx(workDir: string) {
    return {
        config: { dryRun: false } as never,
        workDir,
        logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never,
        allActions: [] as FixAction[],
    }
}

// ---------------------------------------------------------------------------
// 测试
// ---------------------------------------------------------------------------

describe('runCodeScanningFixes batch processing', () => {
    let workDir: string

    beforeEach(() => {
        vi.clearAllMocks()
        workDir = mkdtempSync(join(tmpdir(), 'dependfix-batch-'))
        // 默认 mock：snapshot 成功 + applyCodeScanningFix 成功 + lint 成功
        mockSnapshotSourceFile.mockImplementation((_wd: string, path: string) => ({
            path,
            content: 'original content',
            existed: true,
        }))
        mockApplyCodeScanningFix.mockImplementation(({ alert }: { alert: NormalizedSecurityAlert }) =>
            makeFixAction(alert.ruleId),
        )
        mockQuickVerifyProject.mockResolvedValue(true)
        mockRestoreSourceFile.mockReturnValue(true)
    })

    afterEach(() => {
        if (workDir) {
            rmSync(workDir, { recursive: true, force: true })
        }
    })

    it('batchSize=10 with N=10 triggers 1 lint call', async () => {
        const ctx = makeCtx(workDir)
        const alerts = Array.from({ length: 10 }, (_, i) => makeCsAlert(`rule-${i}`))

        const result = await runCodeScanningFixes(ctx, 'test/repo', alerts)

        expect(mockQuickVerifyProject).toHaveBeenCalledTimes(1)
        expect(result).toEqual({ fixed: 10, failed: 0 })
        expect(ctx.allActions).toHaveLength(10)
        expect(ctx.allActions.every((a) => a.success)).toBe(true)
    })

    it('batchSize=10 with N=11 triggers 2 lint calls (10 + 1)', async () => {
        const ctx = makeCtx(workDir)
        const alerts = Array.from({ length: 11 }, (_, i) => makeCsAlert(`rule-${i}`))

        const result = await runCodeScanningFixes(ctx, 'test/repo', alerts)

        expect(mockQuickVerifyProject).toHaveBeenCalledTimes(2)
        expect(result).toEqual({ fixed: 11, failed: 0 })
        expect(ctx.allActions).toHaveLength(11)
    })

    it('batchSize=10 with N=25 triggers 3 lint calls (10 + 10 + 5)', async () => {
        const ctx = makeCtx(workDir)
        const alerts = Array.from({ length: 25 }, (_, i) => makeCsAlert(`rule-${i}`))

        const result = await runCodeScanningFixes(ctx, 'test/repo', alerts)

        expect(mockQuickVerifyProject).toHaveBeenCalledTimes(3)
        expect(result).toEqual({ fixed: 25, failed: 0 })
        expect(ctx.allActions).toHaveLength(25)
    })

    it('custom batchSize=5 with N=12 triggers 3 lint calls (5 + 5 + 2)', async () => {
        const ctx = makeCtx(workDir)
        const alerts = Array.from({ length: 12 }, (_, i) => makeCsAlert(`rule-${i}`))

        const result = await runCodeScanningFixes(ctx, 'test/repo', alerts, { batchSize: 5 })

        expect(mockQuickVerifyProject).toHaveBeenCalledTimes(3)
        expect(result).toEqual({ fixed: 12, failed: 0 })
    })

    it('lint failure rolls back entire batch (all marked failed)', async () => {
        const ctx = makeCtx(workDir)
        const alerts = Array.from({ length: 5 }, (_, i) => makeCsAlert(`rule-${i}`))
        mockQuickVerifyProject.mockResolvedValue(false) // 批内 lint 失败

        const result = await runCodeScanningFixes(ctx, 'test/repo', alerts)

        expect(mockQuickVerifyProject).toHaveBeenCalledTimes(1)
        expect(mockRestoreSourceFile).toHaveBeenCalledTimes(5) // 整批 5 个告警都回滚
        expect(result).toEqual({ fixed: 0, failed: 5 })
        expect(ctx.allActions).toHaveLength(5)
        expect(ctx.allActions.every((a) => !a.success)).toBe(true)
        expect(ctx.allActions.every((a) => a.error?.includes('rolled back'))).toBe(true)
    })

    it('lint failure in one batch does not affect subsequent batches', async () => {
        const ctx = makeCtx(workDir)
        const alerts = Array.from({ length: 25 }, (_, i) => makeCsAlert(`rule-${i}`))
        // 第 1 批 lint 失败（calls 1-10 告警），第 2/3 批 lint 成功
        mockQuickVerifyProject
            .mockResolvedValueOnce(false) // 第 1 批
            .mockResolvedValueOnce(true) // 第 2 批
            .mockResolvedValueOnce(true) // 第 3 批

        const result = await runCodeScanningFixes(ctx, 'test/repo', alerts)

        expect(mockQuickVerifyProject).toHaveBeenCalledTimes(3)
        expect(mockRestoreSourceFile).toHaveBeenCalledTimes(10) // 仅第 1 批 10 个回滚
        expect(result).toEqual({ fixed: 15, failed: 10 })
    })

    it('dryRun=true skips lint entirely', async () => {
        const ctx = { ...makeCtx(workDir), config: { dryRun: true } as never }
        const alerts = Array.from({ length: 25 }, (_, i) => makeCsAlert(`rule-${i}`))

        const result = await runCodeScanningFixes(ctx, 'test/repo', alerts)

        expect(mockQuickVerifyProject).toHaveBeenCalledTimes(0) // dry-run 不跑 lint
        expect(mockRestoreSourceFile).toHaveBeenCalledTimes(0)
        expect(result).toEqual({ fixed: 25, failed: 0 })
    })

    it('source snapshot failure for one alert does not affect batch', async () => {
        const ctx = makeCtx(workDir)
        const alerts = [
            makeCsAlert('rule-0'),
            makeCsAlert('rule-1', 'src/blocked.ts'),
            makeCsAlert('rule-2'),
        ]
        // rule-1 路径快照失败（模拟路径越界/读取异常）
        mockSnapshotSourceFile.mockImplementation((_wd: string, path: string) => {
            if (path === 'src/blocked.ts') {
                return null
            }
            return { path, content: 'content', existed: true }
        })

        const result = await runCodeScanningFixes(ctx, 'test/repo', alerts)

        expect(mockSnapshotSourceFile).toHaveBeenCalledTimes(3)
        expect(mockQuickVerifyProject).toHaveBeenCalledTimes(1) // 仍有 1 次 lint（批满 3 个但有 1 个跳过 → 实际 2 个）
        expect(result).toEqual({ fixed: 2, failed: 0 })
    })

    it('empty alerts array returns fixed=0 failed=0 without lint', async () => {
        const ctx = makeCtx(workDir)
        const result = await runCodeScanningFixes(ctx, 'test/repo', [])

        expect(mockQuickVerifyProject).toHaveBeenCalledTimes(0)
        expect(result).toEqual({ fixed: 0, failed: 0 })
    })

    it('non-code-scanning alerts are filtered out', async () => {
        const ctx = makeCtx(workDir)
        // dependabot 告警（即使 alertClass 设置为 auto-fixable 也不会被处理）
        const alerts: NormalizedSecurityAlert[] = [
            { ...makeCsAlert('cs-0'), source: 'code-scanning' },
            { ...makeCsAlert('db-0'), source: 'dependabot', alertClass: 'auto-fixable' },
            { ...makeCsAlert('cs-1'), source: 'code-scanning' },
        ]

        const result = await runCodeScanningFixes(ctx, 'test/repo', alerts)

        // 仅 2 个 cs 告警（cs-0 + cs-1）→ 末尾 flushBatch 触发 1 次 lint
        expect(mockQuickVerifyProject).toHaveBeenCalledTimes(1)
        expect(result).toEqual({ fixed: 2, failed: 0 })
    })
})

// ---------------------------------------------------------------------------
// ensureGitignore / .gitignore 幂等判定归一化
// ---------------------------------------------------------------------------

describe('normalizeGitignoreEntry', () => {
    it('normalizes equivalent directory-ignore forms to the plain name', () => {
        const equivalents = [
            'dependfix-reports',
            '/dependfix-reports',
            'dependfix-reports/',
            '/dependfix-reports/',
            '**/dependfix-reports/',
            'dependfix-reports/**',
            'dependfix-reports/*',
            '/dependfix-reports/**',
        ]
        for (const line of equivalents) {
            expect(normalizeGitignoreEntry(line)).toBe('dependfix-reports')
        }
    })

    it('treats a mid-line hash as a literal character (git only treats a leading hash as a comment)', () => {
        // `dir/ # note` 与 `dir#suffix` 在 git 中并不生效（行中 `#` 属模式本身）→ 不得判为已忽略
        expect(normalizeGitignoreEntry('dependfix-reports/ # report dir')).toBe('dependfix-reports/ # report dir')
        expect(normalizeGitignoreEntry('dependfix-reports#suffix')).toBe('dependfix-reports#suffix')
    })

    it('does not normalize leading whitespace (git only strips trailing whitespace)', () => {
        expect(normalizeGitignoreEntry(' dependfix-reports/')).toBe(' dependfix-reports')
    })

    it('strips trailing spaces and CR but keeps a trailing tab (matching git)', () => {
        expect(normalizeGitignoreEntry('dependfix-reports/ ')).toBe('dependfix-reports')
        expect(normalizeGitignoreEntry('dependfix-reports/\r')).toBe('dependfix-reports')
        // git 不把尾随 tab 视为空白 → 保留后不再是「目录标记」形态，不得判为已忽略
        expect(normalizeGitignoreEntry('dependfix-reports/\t')).toBe('dependfix-reports/\t')
    })

    it('does not treat a slash-wrapped content glob as the directory itself', () => {
        // `dir/**/` 只忽略目录内层级、不忽略目录自身 → 不得判为已忽略
        expect(normalizeGitignoreEntry('dependfix-reports/**/')).toBe('dependfix-reports/**')
    })

    it('returns undefined for lines that do not ignore anything', () => {
        expect(normalizeGitignoreEntry('')).toBeUndefined()
        expect(normalizeGitignoreEntry('   ')).toBeUndefined()
        expect(normalizeGitignoreEntry('# dependfix')).toBeUndefined()
        // 取反行不构成忽略
        expect(normalizeGitignoreEntry('!dependfix-reports/')).toBeUndefined()
    })

    it('keeps unrelated entries intact', () => {
        expect(normalizeGitignoreEntry('node_modules')).toBe('node_modules')
        expect(normalizeGitignoreEntry('/dist/')).toBe('dist')
    })
})

describe('ensureGitignore', () => {
    let dir: string

    beforeEach(() => {
        dir = mkdtempSync(join(tmpdir(), 'dependfix-gitignore-'))
        mkdirSync(join(dir, '.git'))
    })

    afterEach(() => {
        rmSync(dir, { recursive: true, force: true })
    })

    const readGitignore = () => readFileSync(join(dir, '.gitignore'), 'utf-8')

    it.each([
        '/dependfix-reports',
        'dependfix-reports',
        '/dependfix-reports/',
        '**/dependfix-reports/',
        'dependfix-reports/**',
        'dependfix-reports/*',
    ])('skips appending when "%s" already ignores the directory', (line) => {
        writeFileSync(join(dir, '.gitignore'), `node_modules\n${line}\n`, 'utf-8')
        const before = readGitignore()

        ensureGitignore(dir)

        // 语义等价写法 → 幂等跳过（原内容字节级不变）
        expect(readGitignore()).toBe(before)
    })

    it.each([
        'dependfix-reports/ # keep reports out',
        'dependfix-reports#suffix',
        ' dependfix-reports/',
        'dependfix-reports/**/',
        'my-dependfix-reports/',
        'foo/dependfix-reports/',
        'dependfix-reports/\t',
    ])('still appends when "%s" does not actually ignore the directory', (line) => {
        writeFileSync(join(dir, '.gitignore'), `node_modules\n${line}\n`, 'utf-8')

        ensureGitignore(dir)

        // 这些写法在 git 中并不忽略目标目录 → 必须追加（漏追加会让报告被 git add 提交）
        expect(readGitignore()).toContain('# dependfix\ndependfix-reports/\n')
    })

    it('appends the canonical entry once when the directory is not ignored', () => {
        writeFileSync(join(dir, '.gitignore'), 'node_modules\n', 'utf-8')

        ensureGitignore(dir)

        expect(readGitignore()).toBe('node_modules\n# dependfix\ndependfix-reports/\n')
    })

    it('creates .gitignore when missing', () => {
        ensureGitignore(dir)
        expect(readGitignore()).toBe('# dependfix\ndependfix-reports/\n')
    })

    it('is idempotent across repeated calls', () => {
        writeFileSync(join(dir, '.gitignore'), 'node_modules', 'utf-8')

        ensureGitignore(dir)
        const once = readGitignore()
        ensureGitignore(dir)

        expect(readGitignore()).toBe(once)
        expect(once.match(/dependfix-reports\//g)).toHaveLength(1)
    })

    it('does nothing outside a git repository', () => {
        const plain = mkdtempSync(join(tmpdir(), 'dependfix-nogit-'))
        try {
            ensureGitignore(plain)
            expect(existsSync(join(plain, '.gitignore'))).toBe(false)
        } finally {
            rmSync(plain, { recursive: true, force: true })
        }
    })
})
