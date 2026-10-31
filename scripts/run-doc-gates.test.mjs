import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { DOC_GATES, buildPnpmCommand, runDocGates, runPnpmScript } from './run-doc-gates.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** 文档门禁的脚本命名空间（与 DOC_GATES 成员同前缀；用于从 test.yml 反推集合）。 */
const DOC_GATE_PREFIXES = ['check:', 'docs:', 'i18n:', 'lint:md', 'lint:i18n']

/** 从 workflow 文本解析 `- run: pnpm run <script>` 步骤（忽略注释行）。 */
export function parseWorkflowRunScripts(workflow) {
    return workflow
        .split(/\r?\n/)
        .filter((line) => !line.trim().startsWith('#'))
        .map((line) => /^\s*- run: pnpm run ([a-z0-9:_.-]+)\s*$/.exec(line))
        .filter(Boolean)
        .map((match) => match[1])
}

describe('DOC_GATES', () => {
    it('与 test.yml 的文档门禁步骤双向同集合', () => {
        const workflow = readFileSync(path.join(repoRoot, '.github/workflows/test.yml'), 'utf8')
        const testDocGates = parseWorkflowRunScripts(workflow)
            .filter((script) => DOC_GATE_PREFIXES.some((prefix) => script.startsWith(prefix)))

        // Test 有、集合没有 → release / 周回归漏跑（本次要治的漂移方向）
        expect(testDocGates.filter((gate) => !DOC_GATES.includes(gate))).toEqual([])
        // 集合有、Test 没有 → 集合虚空接线
        expect(DOC_GATES.filter((gate) => !testDocGates.includes(gate))).toEqual([])
        // 集合内名称必须在 package.json 有对应脚本（防拼写漂移）
        const scripts = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8')).scripts
        for (const gate of DOC_GATES) {
            expect(scripts[gate], `package.json 缺少 ${gate}`).toBeTruthy()
        }
    })

    it('名称唯一且不包含自身（防递归调用）', () => {
        expect(new Set(DOC_GATES).size).toBe(DOC_GATES.length)
        expect(DOC_GATES).not.toContain('gates:docs')
        expect(DOC_GATES.length).toBeGreaterThan(0)
    })

    it('release.yml 引用同一入口（防发布侧漏接）', () => {
        const release = readFileSync(path.join(repoRoot, '.github/workflows/release.yml'), 'utf8')
        const scripts = parseWorkflowRunScripts(release)
        expect(scripts).toContain('gates:docs')
    })

    it('docs 构建先于 fallback 检查（依赖 dist）', () => {
        expect(DOC_GATES.indexOf('docs:build')).toBeLessThan(DOC_GATES.indexOf('docs:check:fallback'))
        expect(DOC_GATES.indexOf('docs:build')).toBeGreaterThanOrEqual(0)
        // 锚点实证依赖刚构建出的产物：必须在 docs:build 之后、fallback 之前
        expect(DOC_GATES.indexOf('docs:check:anchors')).toBe(DOC_GATES.indexOf('docs:build') + 1)
    })
})

describe('buildPnpmCommand', () => {
    it('POSIX 直接执行 pnpm', () => {
        expect(buildPnpmCommand('check:docs', 'linux')).toEqual({ file: 'pnpm', args: ['run', 'check:docs'] })
    })

    it('Windows 经 cmd.exe 执行（pnpm 是 .cmd shim）', () => {
        expect(buildPnpmCommand('check:docs', 'win32')).toEqual({
            file: 'cmd.exe',
            args: ['/d', '/s', '/c', 'pnpm run check:docs'],
        })
    })
})

describe('runPnpmScript（默认执行器无法启动）', () => {
    it('PATH 不可用时输出原因并返回 1（默认 error 通道）', () => {
        const originalPath = process.env.PATH
        const emptyDir = mkdtempSync(path.join(tmpdir(), 'gates-nopath-'))
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
        try {
            process.env.PATH = emptyDir
            expect(runPnpmScript('check:mergify')).toBe(1)
            expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('无法执行'))
        } finally {
            process.env.PATH = originalPath
            errorSpy.mockRestore()
            rmSync(emptyDir, { recursive: true, force: true })
        }
    })
})

describe('runPnpmScript', () => {
    it('成功返回 0', () => {
        const exec = vi.fn()
        expect(runPnpmScript('check:docs', { exec })).toBe(0)
        expect(exec).toHaveBeenCalledWith('pnpm', ['run', 'check:docs'], expect.objectContaining({ stdio: 'inherit' }))
    })

    it('门禁失败透传退出码', () => {
        const exec = vi.fn(() => {
            const error = new Error('exit 2')
            error.status = 2
            throw error
        })
        expect(runPnpmScript('check:docs', { exec })).toBe(2)
    })

    it('Windows 经 cmd.exe 执行（win32 注入路径）', () => {
        const exec = vi.fn()
        expect(runPnpmScript('check:docs', { exec, platform: 'win32' })).toBe(0)
        expect(exec).toHaveBeenCalledWith(
            'cmd.exe',
            ['/d', '/s', '/c', 'pnpm run check:docs'],
            expect.objectContaining({ stdio: 'inherit' }),
        )
    })

    it('无法启动进程（无 status）时输出原因并返回 1', () => {
        const exec = vi.fn(() => {
            const error = new Error('spawn pnpm ENOENT')
            error.code = 'ENOENT'
            throw error
        })
        const error = vi.fn()
        expect(runPnpmScript('check:docs', { exec, error })).toBe(1)
        expect(error).toHaveBeenCalledWith(expect.stringContaining('ENOENT'))
    })
})

describe('runDocGates', () => {
    it('按顺序执行全部门禁并返回 0', () => {
        const runner = vi.fn(() => 0)
        const log = vi.fn()
        expect(runDocGates({ runner, log, error: vi.fn() })).toBe(0)
        expect(runner.mock.calls.map(([gate]) => gate)).toEqual(DOC_GATES)
        expect(log).toHaveBeenCalledWith(`[gates:docs] OK：${DOC_GATES.length} 项通过`)
    })

    it('首个失败即停止并返回非零退出码', () => {
        const runner = vi.fn((gate) => (gate === DOC_GATES[2] ? 2 : 0))
        const error = vi.fn()
        expect(runDocGates({ runner, log: vi.fn(), error })).toBe(2)
        expect(runner).toHaveBeenCalledTimes(3)
        expect(error).toHaveBeenCalledWith(expect.stringContaining(`FAIL: pnpm run ${DOC_GATES[2]}`))
    })

    it('runner 返回 0 以外的假值（false / undefined）按失败处理', () => {
        for (const falsy of [false, undefined, null]) {
            expect(runDocGates({ runner: () => falsy, log: vi.fn(), error: vi.fn() })).toBe(1)
        }
    })

    it('默认 runner / log / error 可用（真实执行最便宜门禁）', () => {
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
        try {
            expect(runDocGates({ gates: ['check:mergify'] })).toBe(0)
            expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('check:mergify'))

            expect(runDocGates({ gates: ['missing-script'], runner: () => 1 })).toBe(1)
            expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('missing-script'))
        } finally {
            logSpy.mockRestore()
            errorSpy.mockRestore()
        }
    })

    it('runner 抛错时降级为失败（不冒泡）', () => {
        const error = vi.fn()
        expect(runDocGates({
            runner: () => {
                throw new Error('boom')
            },
            log: vi.fn(),
            error,
        })).toBe(1)
        expect(error).toHaveBeenCalledWith(expect.stringContaining('runner 抛错'))
    })
})
