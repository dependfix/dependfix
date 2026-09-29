// repo-config.test.ts
// 目标仓库专属配置 `.github/dependfix.yml` 的读取 / 降级（缺失 · 非法 YAML · schema 不匹配 · 未知键）
// 与合并（中央配置优先），以及在修复链路的实际生效与「中央优先」证伪（app 级集成）。
// 设计与降级矩阵见 docs/design/modules/dependency-fixer.md §12.7。
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import nock from 'nock'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Logger } from '@dependfix/core'
import { resolveRuntimeConfig } from '../config'
import { applyRepoConfig, DEPENDFIX_CONFIG_PATH, readRepoConfig, resolveOverrideProtect } from './repo-config'
import { DependfixApp } from './index'

interface LogRecord {
    level: string
    message: string
}

function makeLogger(records: LogRecord[]): Logger {
    const push = (level: string) => (message: string): void => {
        records.push({ level, message })
    }
    return {
        debug: push('debug'),
        info: push('info'),
        warn: push('warn'),
        error: push('error'),
    }
}

function writeRepoConfig(workDir: string, content: string): void {
    mkdirSync(join(workDir, '.github'), { recursive: true })
    writeFileSync(join(workDir, DEPENDFIX_CONFIG_PATH), content)
}

describe('readRepoConfig：读取与降级', () => {
    let workDir: string
    let logs: LogRecord[]
    let logger: Logger

    beforeEach(() => {
        workDir = mkdtempSync(join(tmpdir(), 'dependfix-repo-config-'))
        logs = []
        logger = makeLogger(logs)
    })

    afterEach(() => {
        rmSync(workDir, { recursive: true, force: true })
    })

    const warnings = (): LogRecord[] => logs.filter((l) => l.level === 'warn')

    it('无配置文件（预期常态）：返回 undefined 且不产生告警', () => {
        expect(readRepoConfig(workDir, logger)).toBeUndefined()
        expect(warnings()).toHaveLength(0)
    })

    it('合法配置：解析出 overrideProtect', () => {
        writeRepoConfig(workDir, 'overrideProtect:\n  foo/bar:\n    - lodash\n')
        expect(readRepoConfig(workDir, logger)).toEqual({ overrideProtect: { 'foo/bar': ['lodash'] } })
        expect(warnings()).toHaveLength(0)
    })

    it('空文件：等价于未声明（undefined，不告警）', () => {
        writeRepoConfig(workDir, '')
        expect(readRepoConfig(workDir, logger)).toBeUndefined()
        expect(warnings()).toHaveLength(0)
    })

    it('非普通文件（路径被目录占用）：告警 + 降级 undefined', () => {
        // 真实故障注入（不做模块 mock）：同名目录 → lstat 判定非普通文件
        mkdirSync(join(workDir, DEPENDFIX_CONFIG_PATH), { recursive: true })
        expect(readRepoConfig(workDir, logger)).toBeUndefined()
        expect(warnings()).toHaveLength(1)
        expect(warnings()[0]!.message).toContain('not a regular file')
    })

    it('符号链接：不跟随读取（防读出检出目录之外的内容），告警 + 降级 undefined', () => {
        // 真实故障注入：链接指向工作区外的合法配置；若实现跟随链接则会被读入并生效
        const outsideDir = mkdtempSync(join(tmpdir(), 'dependfix-repo-config-outside-'))
        const outsideFile = join(outsideDir, 'dependfix.yml')
        writeFileSync(outsideFile, 'overrideProtect:\n  foo/bar:\n    - lodash\n')
        try {
            mkdirSync(join(workDir, '.github'), { recursive: true })
            symlinkSync(outsideFile, join(workDir, DEPENDFIX_CONFIG_PATH))
            expect(readRepoConfig(workDir, logger)).toBeUndefined()
            expect(warnings()).toHaveLength(1)
            expect(warnings()[0]!.message).toContain('not a regular file')
        } finally {
            rmSync(outsideDir, { recursive: true, force: true })
        }
    })

    it('超过大小上限：告警 + 降级 undefined（不整段读入）', () => {
        writeRepoConfig(workDir, `overrideProtect:\n  foo/bar:\n    - lodash\n# ${'x'.repeat(256 * 1024)}\n`)
        expect(readRepoConfig(workDir, logger)).toBeUndefined()
        expect(warnings()).toHaveLength(1)
        expect(warnings()[0]!.message).toContain('too large')
    })

    it('原型链风险键（overrideProtect 内）：告警丢弃，合法条目仍生效', () => {
        writeRepoConfig(workDir, 'overrideProtect:\n  __proto__:\n    - lodash\n  foo/bar:\n    - lodash\n')
        expect(readRepoConfig(workDir, logger)).toEqual({ overrideProtect: { 'foo/bar': ['lodash'] } })
        expect(warnings()).toHaveLength(1)
        expect(warnings()[0]!.message).toContain('Unsafe keys')
        expect(warnings()[0]!.message).toContain('__proto__')
    })

    it('非法 YAML：告警 + 降级 undefined（不抛错）', () => {
        writeRepoConfig(workDir, 'overrideProtect: [unclosed\n')
        expect(readRepoConfig(workDir, logger)).toBeUndefined()
        expect(warnings()).toHaveLength(1)
        expect(warnings()[0]!.message).toContain('Invalid YAML')
        expect(warnings()[0]!.message).toContain(DEPENDFIX_CONFIG_PATH)
    })

    it('schema 不匹配（值为字符串而非数组）：告警 + 降级 undefined', () => {
        writeRepoConfig(workDir, 'overrideProtect:\n  foo/bar: lodash\n')
        expect(readRepoConfig(workDir, logger)).toBeUndefined()
        expect(warnings()).toHaveLength(1)
        expect(warnings()[0]!.message).toContain('schema')
        expect(warnings()[0]!.message).toContain('overrideProtect')
    })

    it('未知键：告警列出并忽略，合法字段仍生效（拼写错误不静默失效）', () => {
        writeRepoConfig(workDir, 'overrideprotected:\n  foo/bar: lodash\noverrideProtect:\n  foo/bar:\n    - lodash\n')
        expect(readRepoConfig(workDir, logger)).toEqual({ overrideProtect: { 'foo/bar': ['lodash'] } })
        expect(warnings()).toHaveLength(1)
        expect(warnings()[0]!.message).toContain('overrideprotected')
    })
})

describe('resolveOverrideProtect：中央配置优先', () => {
    it('中央非空 → 采用中央，仓库声明被整体忽略（不逐条合并）', () => {
        const central = { 'other/repo': ['lodash'] }
        const repo = { 'foo/bar': ['lodash'] }
        const resolved = resolveOverrideProtect(central, repo)
        expect(resolved.source).toBe('central')
        expect(resolved.value).toBe(central)
        expect(resolved.ignoredRepoValue).toBe(repo)
    })

    it('中央未指定 → 采用仓库声明', () => {
        const repo = { 'foo/bar': ['lodash'] }
        const resolved = resolveOverrideProtect(undefined, repo)
        expect(resolved.source).toBe('repo')
        expect(resolved.value).toBe(repo)
    })

    it('中央为空对象（解析后无条目）→ 视为未指定，采用仓库声明', () => {
        const repo = { 'foo/bar': ['lodash'] }
        expect(resolveOverrideProtect({}, repo)).toEqual({ value: repo, source: 'repo' })
    })

    it('两者皆空 → 无生效值', () => {
        expect(resolveOverrideProtect(undefined, undefined)).toEqual({ value: undefined, source: 'none' })
        expect(resolveOverrideProtect({}, {})).toEqual({ value: undefined, source: 'none' })
    })
})

describe('applyRepoConfig：合并进运行时配置', () => {
    let workDir: string
    let logs: LogRecord[]
    let logger: Logger

    beforeEach(() => {
        workDir = mkdtempSync(join(tmpdir(), 'dependfix-repo-config-'))
        logs = []
        logger = makeLogger(logs)
    })

    afterEach(() => {
        rmSync(workDir, { recursive: true, force: true })
    })

    it('中央未指定时采用仓库声明（返回新对象 + info 日志）', () => {
        writeRepoConfig(workDir, 'overrideProtect:\n  foo/bar:\n    - lodash\n')
        const original = { dryRun: true } as never
        const merged = applyRepoConfig(original, workDir, logger)
        expect(merged).not.toBe(original)
        expect(merged.overrideProtect).toEqual({ 'foo/bar': ['lodash'] })
        expect(logs.filter((l) => l.level === 'info')).toHaveLength(1)
    })

    it('中央已指定时保持原对象（引用相等；仓库声明被忽略）', () => {
        writeRepoConfig(workDir, 'overrideProtect:\n  foo/bar:\n    - lodash\n')
        const original = { overrideProtect: { 'other/repo': ['lodash'] } } as never
        const merged = applyRepoConfig(original, workDir, logger)
        expect(merged).toBe(original)
        expect(merged.overrideProtect).toEqual({ 'other/repo': ['lodash'] })
    })

    it('无仓库配置时保持原对象（引用相等）', () => {
        const original = { dryRun: true } as never
        expect(applyRepoConfig(original, workDir, logger)).toBe(original)
    })
})

// ---------------------------------------------------------------------------
// app 级接线：目标仓库配置在修复链路实际生效（中央优先证伪）
// 复用「同 major 多版本 → 版本化 overrides」既有 fixture（fast-uri@3.1.0 + 3.1.5）：
// 命中 overrideProtect 时不写 override 且记 OVERRIDE_PROTECTED，未命中则正常写入。
// ---------------------------------------------------------------------------

describe('DependfixApp 目标仓库配置接线（.github/dependfix.yml）', () => {
    let workDir: string

    beforeEach(() => {
        nock.disableNetConnect()
        workDir = mkdtempSync(join(tmpdir(), 'dependfix-repo-config-app-'))
        writeFileSync(join(workDir, 'package.json'), JSON.stringify({
            name: 'fixture',
            version: '1.0.0',
            dependencies: { '@dependfix/core': '^1.0.0' },
        }, null, 2))
        writeFileSync(join(workDir, 'pnpm-lock.yaml'), [
            'lockfileVersion: \'9.0\'',
            '',
            '  fast-uri@3.1.0:',
            '    resolution: {integrity: sha512-a}',
            '',
            '  fast-uri@3.1.5:',
            '    resolution: {integrity: sha512-b}',
            '',
        ].join('\n'))
    })

    afterEach(() => {
        nock.cleanAll()
        rmSync(workDir, { recursive: true, force: true })
    })

    /** 挂载 Dependabot 告警 + 默认分支两个端点（与既有版本化 overrides 集成用例同形） */
    function mockDependabotEndpoints(): void {
        nock('https://api.github.com')
            .get('/repos/foo/bar/dependabot/alerts')
            .query({ state: 'open', per_page: '100' })
            .reply(200, [{
                number: 1,
                state: 'open',
                security_advisory: { ghsa_id: 'GHSA-f8p3-7c7w-h6x4', severity: 'high' },
                security_vulnerability: {
                    package: { ecosystem: 'npm', name: 'fast-uri' },
                    severity: 'high',
                    vulnerable_version_range: '< 3.1.5',
                    first_patched_version: { identifier: '3.1.5' },
                },
                dependency: { package: { ecosystem: 'npm', name: 'fast-uri' }, manifest_path: 'pnpm-lock.yaml' },
            }])
        nock('https://api.github.com')
            .get('/repos/foo/bar')
            .reply(200, { default_branch: 'master' })
    }

    function makeConfig(extraEnv: Record<string, string> = {}): ReturnType<typeof resolveRuntimeConfig> {
        return resolveRuntimeConfig({
            env: {
                GITHUB_TOKEN: 'main-token-value',
                DEPENDFIX_MODE: 'fix',
                DEPENDFIX_REPOSITORIES: 'foo/bar',
                DEPENDFIX_DRY_RUN: 'true',
                ...extraEnv,
            },
        })
    }

    it('生效：仓库声明命中保护 → 不写 versioned override，记 OVERRIDE_PROTECTED', async () => {
        writeRepoConfig(workDir, 'overrideProtect:\n  foo/bar:\n    - fast-uri\n')
        mockDependabotEndpoints()

        const app = new DependfixApp({ config: makeConfig(), workDir, reportOutputDir: join(workDir, 'reports') })
        const { exitCode, result } = await app.run()

        expect(exitCode).toBe(0)
        expect(result.actions.filter((a) => a.strategy === 'versioned-override' && a.target === 'fast-uri')).toHaveLength(0)
        const protectedActions = result.actions.filter((a) => a.strategy === 'override-protected' && a.target === 'fast-uri')
        expect(protectedActions).toHaveLength(1)
        expect(protectedActions[0]!.noOp).toBe(true)
        expect(result.errors.filter((e) => e.category === 'OVERRIDE_PROTECTED')).toHaveLength(1)
        expect(nock.pendingMocks()).toEqual([])
    })

    it('中央优先（证伪）：中央配置存在但未覆盖该仓库 → 仓库声明被忽略，正常写 versioned override', async () => {
        writeRepoConfig(workDir, 'overrideProtect:\n  foo/bar:\n    - fast-uri\n')
        mockDependabotEndpoints()

        const app = new DependfixApp({
            config: makeConfig({ DEPENDFIX_OVERRIDE_PROTECT: 'other/repo:fast-uri' }),
            workDir,
            reportOutputDir: join(workDir, 'reports'),
        })
        const { result } = await app.run()

        // 若实现退化为「合并」或「仓库优先」，foo/bar 会被保护 → 该断言失败
        expect(result.actions.filter((a) => a.strategy === 'versioned-override' && a.target === 'fast-uri')).toHaveLength(1)
        expect(result.actions.filter((a) => a.strategy === 'override-protected')).toHaveLength(0)
        expect(nock.pendingMocks()).toEqual([])
    })

    it('降级：非法 YAML → 告警且行为与未引入配置前一致（不命中保护、不中断）', async () => {
        writeRepoConfig(workDir, 'overrideProtect: [unclosed\n')
        mockDependabotEndpoints()

        const logs: LogRecord[] = []
        const app = new DependfixApp({
            config: makeConfig(),
            workDir,
            reportOutputDir: join(workDir, 'reports'),
            logger: makeLogger(logs),
        })
        const { exitCode, result } = await app.run()

        expect(exitCode).toBe(0)
        expect(logs.some((l) => l.level === 'warn' && l.message.includes('Invalid YAML'))).toBe(true)
        expect(result.actions.filter((a) => a.strategy === 'versioned-override' && a.target === 'fast-uri')).toHaveLength(1)
        expect(result.actions.filter((a) => a.strategy === 'override-protected')).toHaveLength(0)
        expect(nock.pendingMocks()).toEqual([])
    })
})
