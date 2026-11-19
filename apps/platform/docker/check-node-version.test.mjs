import { describe, expect, it, vi } from 'vitest'
import {
    NODE_SECURITY_BASELINE,
    checkNodeVersion,
    isAtLeast,
    main,
    parseVersion,
    resolveVersionArg,
} from './check-node-version.mjs'

describe('check-node-version', () => {
    it('解析 v 前缀与预发布后缀', () => {
        expect(parseVersion('24.22.3')).toEqual({ major: 24, minor: 22, patch: 3 })
        expect(parseVersion('v24.22.3')).toEqual({ major: 24, minor: 22, patch: 3 })
        expect(parseVersion('26.13.1-rc.2')).toEqual({ major: 26, minor: 13, patch: 1 })
    })

    it('无法解析的版本号抛错（不静默放行）', () => {
        expect(() => parseVersion('24.22')).toThrow('无法解析 Node 版本号')
        expect(() => parseVersion('')).toThrow('无法解析 Node 版本号')
    })

    it('同发布线内按 minor / patch 比较，跨发布线按 major 比较', () => {
        expect(isAtLeast('24.22.3', '24.22.3')).toBe(true)
        expect(isAtLeast('24.22.2', '24.22.3')).toBe(false)
        expect(isAtLeast('24.23.0', '24.22.3')).toBe(true)
        expect(isAtLeast('26.11.0', '24.22.3')).toBe(true)
        expect(isAtLeast('22.23.5', '24.22.3')).toBe(false)
    })

    it('各发布线达标版本通过', () => {
        for (const [major, minimum] of Object.entries(NODE_SECURITY_BASELINE)) {
            expect(checkNodeVersion(minimum), `major ${major}`).toMatchObject({ ok: true, minimum })
        }
        expect(checkNodeVersion('24.23.0')).toMatchObject({ ok: true })
    })

    it('低于基线的同发布线版本被拒', () => {
        expect(checkNodeVersion('24.18.1')).toMatchObject({ ok: false, minimum: '24.22.3' })
        expect(checkNodeVersion('22.23.4')).toMatchObject({ ok: false, minimum: '22.23.5' })
        expect(checkNodeVersion('26.12.1')).toMatchObject({ ok: false, minimum: '26.13.1' })
    })

    it('已 EOL / 不在补丁范围的发布线被拒（不能用单一下界放行 25.x）', () => {
        for (const version of ['20.19.0', '23.11.0', '25.0.0']) {
            expect(checkNodeVersion(version), version).toMatchObject({ ok: false, minimum: null })
        }
    })

    it('仅从显式 --version= 参数取版本，不读环境变量（防镜像 ENV 旁路）', () => {
        expect(resolveVersionArg([], '24.22.3')).toBe('24.22.3')
        expect(resolveVersionArg(['--version=24.18.1'], '24.22.3')).toBe('24.18.1')
        expect(resolveVersionArg(['--verbose'], '24.22.3')).toBe('24.22.3')
    })

    it('main 达标返回 0 并打印基线，未达标返回 1 并提示公告链接', () => {
        const log = { log: vi.fn(), error: vi.fn() }
        expect(main('24.22.3', log)).toBe(0)
        expect(log.log).toHaveBeenCalledWith('[node-baseline] Node 24.22.3 >= 24.22.3')
        expect(log.error).not.toHaveBeenCalled()

        const failLog = { log: vi.fn(), error: vi.fn() }
        expect(main('24.18.1', failLog)).toBe(1)
        expect(failLog.error).toHaveBeenCalledWith('[node-baseline] Node 24.18.1 低于 24.x 安全基线 24.22.3')
        expect(failLog.error).toHaveBeenCalledWith(expect.stringContaining('https://nodejs.org/en/blog/vulnerability/november-2026-security-releases'))
        expect(failLog.log).not.toHaveBeenCalled()
    })
})
