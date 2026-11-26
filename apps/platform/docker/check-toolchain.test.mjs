import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { afterAll, describe, expect, it, vi } from 'vitest'
import {
    DEFAULT_PROBE_DIRS,
    NATIVE_TOOLCHAIN,
    checkToolchain,
    defaultIsExecutable,
    findExecutable,
    main,
    parseVariant,
    resolveProbeDirs,
} from './check-toolchain.mjs'

const createdDirs = []

function makeDir() {
    const dir = mkdtempSync(join(tmpdir(), 'dependfix-toolchain-'))
    createdDirs.push(dir)
    return dir
}

afterAll(() => {
    for (const dir of createdDirs) {
        rmSync(dir, { recursive: true, force: true })
    }
})

describe('check-toolchain', () => {
    it('解析变体：默认 slim，接受 full，非法值抛错', () => {
        expect(parseVariant([])).toBe('slim')
        expect(parseVariant(['--variant=full'])).toBe('full')
        expect(() => parseVariant(['--variant=minimal'])).toThrow('--variant 只接受')
        expect(() => parseVariant(['--variant='])).toThrow('--variant 只接受')
    })

    it('slim 变体：三者全缺通过，任一存在失败', () => {
        const clean = Object.fromEntries(NATIVE_TOOLCHAIN.map((tool) => [tool, false]))
        expect(checkToolchain('slim', clean)).toMatchObject({ ok: true })
        expect(checkToolchain('slim', clean).reason).toContain('variant=slim')

        const polluted = { ...clean, make: true }
        const result = checkToolchain('slim', polluted)
        expect(result.ok).toBe(false)
        expect(result.reason).toContain('make')
        expect(result.reason).toContain('executor-base-slim')
    })

    it('full 变体：三者齐全通过，缺任一项失败并点名', () => {
        const full = Object.fromEntries(NATIVE_TOOLCHAIN.map((tool) => [tool, true]))
        expect(checkToolchain('full', full)).toMatchObject({ ok: true })

        const partial = { ...full, 'g++': false }
        const result = checkToolchain('full', partial)
        expect(result.ok).toBe(false)
        expect(result.reason).toContain('g++')
    })

    it('main 以退出码表达结论（不抛错到调用方）', () => {
        const okLog = { log: vi.fn(), error: vi.fn() }
        expect(main([], okLog, () => false)).toBe(0)
        expect(okLog.log).toHaveBeenCalledWith(expect.stringContaining('python3:absent'))
        expect(okLog.error).not.toHaveBeenCalled()

        const failLog = { log: vi.fn(), error: vi.fn() }
        expect(main(['--variant=full'], failLog, () => false)).toBe(1)
        expect(failLog.error).toHaveBeenCalledWith(expect.stringContaining('[toolchain] FAIL'))
    })

    it('variant 参数非法时 main 抛错（由命令行入口转非零）', () => {
        const log = { log: vi.fn(), error: vi.fn() }
        expect(() => main(['--variant=both'], log, () => false)).toThrow('--variant 只接受')
    })

    it('findExecutable 按 PATH 逐目录探测，跳过空段与非可执行文件', () => {
        const empty = makeDir()
        const withTool = makeDir()
        const toolFile = join(withTool, 'make')
        writeFileSync(toolFile, '#!/bin/sh\n', { mode: 0o755 })
        // 同名但不可执行的文件不得命中
        const notExec = join(empty, 'make')
        writeFileSync(notExec, 'not executable\n', { mode: 0o644 })

        const pathValue = [empty, '', withTool].join(delimiter)
        expect(findExecutable('make', { path: pathValue })).toBe(true)
        expect(findExecutable('dependfix-nonexistent-tool', { path: pathValue })).toBe(false)
    })

    it('PATH 被裁剪时仍探测固定系统目录（防 PATH 注入绕过 slim 断言）', () => {
        expect(resolveProbeDirs('/custom/bin')).toEqual(expect.arrayContaining(['/custom/bin', '/usr/bin']))
        expect(resolveProbeDirs('')).toEqual([...DEFAULT_PROBE_DIRS])

        // PATH 为空且只有固定目录命中时，仍应判定为存在
        const probe = findExecutable('make', {
            path: '',
            isExecutable: (file) => file === '/usr/bin/make',
        })
        expect(probe).toBe(true)

        // PATH 指向收窄目录但工具在 /usr/local/bin：不得漏判
        expect(findExecutable('g++', {
            path: '/bin',
            isExecutable: (file) => file === '/usr/local/bin/g++',
        })).toBe(true)
    })

    it('defaultIsExecutable 只接受具备执行位的普通文件', () => {
        const dir = makeDir()
        const executable = join(dir, 'g++')
        writeFileSync(executable, '#!/bin/sh\n', { mode: 0o755 })
        expect(defaultIsExecutable(executable)).toBe(true)
        expect(defaultIsExecutable(dir)).toBe(false)
        expect(defaultIsExecutable(join(dir, 'missing'))).toBe(false)
    })
})
