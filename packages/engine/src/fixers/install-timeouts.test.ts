// install-timeouts.test.ts — 安装类命令超时口径（单一事实源 + env 覆盖）。
//
// 背景：同类的 pnpm install 调用此前在四处各持一份超时值（120s / 120s / 120s / 180s），
// 而验证链单命令上限为 10 分钟——口径分裂使探针 install 常被 120s 打断（2026-10-16 复盘）。
import { describe, expect, it, vi } from 'vitest'
import {
    DEFAULT_INSTALL_TIMEOUT_MS,
    INSTALL_TIMEOUT_ENV,
    MAX_INSTALL_TIMEOUT_MS,
    MIN_INSTALL_TIMEOUT_MS,
    resolveInstallTimeoutMs,
    setRunInstallTimeoutMs,
} from './install-timeouts'

describe('resolveInstallTimeoutMs', () => {
    it('缺省值 = 300s（5 分钟）', () => {
        expect(DEFAULT_INSTALL_TIMEOUT_MS).toBe(300_000)
        expect(resolveInstallTimeoutMs({})).toBe(300_000)
    })

    it('env 覆盖生效（纯数字毫秒与单位写法等价）', () => {
        expect(resolveInstallTimeoutMs({ [INSTALL_TIMEOUT_ENV]: '45000' })).toBe(45_000)
        expect(resolveInstallTimeoutMs({ [INSTALL_TIMEOUT_ENV]: '5m' })).toBe(300_000)
        expect(resolveInstallTimeoutMs({ [INSTALL_TIMEOUT_ENV]: '90s' })).toBe(90_000)
    })

    it('低于下限 / 高于上限 / 非法值一律回退默认（不中断运行）', () => {
        expect(resolveInstallTimeoutMs({ [INSTALL_TIMEOUT_ENV]: String(MIN_INSTALL_TIMEOUT_MS - 1) })).toBe(DEFAULT_INSTALL_TIMEOUT_MS)
        expect(resolveInstallTimeoutMs({ [INSTALL_TIMEOUT_ENV]: String(MAX_INSTALL_TIMEOUT_MS + 1) })).toBe(DEFAULT_INSTALL_TIMEOUT_MS)
        expect(resolveInstallTimeoutMs({ [INSTALL_TIMEOUT_ENV]: '0' })).toBe(DEFAULT_INSTALL_TIMEOUT_MS)
        expect(resolveInstallTimeoutMs({ [INSTALL_TIMEOUT_ENV]: '-1' })).toBe(DEFAULT_INSTALL_TIMEOUT_MS)
        expect(resolveInstallTimeoutMs({ [INSTALL_TIMEOUT_ENV]: 'abc' })).toBe(DEFAULT_INSTALL_TIMEOUT_MS)
        expect(resolveInstallTimeoutMs({ [INSTALL_TIMEOUT_ENV]: '' })).toBe(DEFAULT_INSTALL_TIMEOUT_MS)
    })

    it('边界值与显式毫秒单位被采纳', () => {
        expect(resolveInstallTimeoutMs({ [INSTALL_TIMEOUT_ENV]: String(MIN_INSTALL_TIMEOUT_MS) })).toBe(MIN_INSTALL_TIMEOUT_MS)
        expect(resolveInstallTimeoutMs({ [INSTALL_TIMEOUT_ENV]: String(MAX_INSTALL_TIMEOUT_MS) })).toBe(MAX_INSTALL_TIMEOUT_MS)
        expect(resolveInstallTimeoutMs({ [INSTALL_TIMEOUT_ENV]: '60000ms' })).toBe(60_000)
        // 尾随非数字不再被 parseInt 截断（120000abc 解析失败 → 回退默认）
        expect(resolveInstallTimeoutMs({ [INSTALL_TIMEOUT_ENV]: '120000abc' })).toBe(DEFAULT_INSTALL_TIMEOUT_MS)
    })

    it('非法 env 回退默认并告警（同一原值只告警一次）', () => {
        const spy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
        expect(resolveInstallTimeoutMs({ [INSTALL_TIMEOUT_ENV]: '10fortnights' })).toBe(DEFAULT_INSTALL_TIMEOUT_MS)
        expect(resolveInstallTimeoutMs({ [INSTALL_TIMEOUT_ENV]: '10fortnights' })).toBe(DEFAULT_INSTALL_TIMEOUT_MS)
        expect(spy).toHaveBeenCalledTimes(1)
        expect(String(spy.mock.calls[0]?.[0])).toContain(INSTALL_TIMEOUT_ENV)
        spy.mockRestore()
    })

    it('支持显式 fallback（供策略链等差异化调用）', () => {
        expect(resolveInstallTimeoutMs({}, 12_345)).toBe(12_345)
        expect(resolveInstallTimeoutMs({ [INSTALL_TIMEOUT_ENV]: 'abc' }, 12_345)).toBe(12_345)
    })
    it('运行级覆盖优先于 env 与 fallback，越界视为清除', () => {
        setRunInstallTimeoutMs(120_000)
        expect(resolveInstallTimeoutMs({ [INSTALL_TIMEOUT_ENV]: '45000' })).toBe(120_000)
        // 越界值不接受覆盖
        setRunInstallTimeoutMs(MIN_INSTALL_TIMEOUT_MS - 1)
        expect(resolveInstallTimeoutMs({ [INSTALL_TIMEOUT_ENV]: '45000' })).toBe(45_000)
        // 清除后回退 env
        setRunInstallTimeoutMs(undefined)
        expect(resolveInstallTimeoutMs({ [INSTALL_TIMEOUT_ENV]: '45000' })).toBe(45_000)
    })
})

