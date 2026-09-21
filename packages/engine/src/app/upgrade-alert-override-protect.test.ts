// upgrade-alert-override-protect.test.ts
// M29.4（C77）：间接依赖 override 路径的 overrides 保护名单覆盖。
// 该路径（upgradeAlert 的 `not found in dependencies` 回退分支）此前零覆盖（A 阶段审计 RG-B03）。
import { describe, expect, it, vi } from 'vitest'
import type { NormalizedSecurityAlert } from '@dependfix/core'

const { mockUpgradeDependency, mockOverrideTransitiveDependency } = vi.hoisted(() => ({
    mockUpgradeDependency: vi.fn(),
    mockOverrideTransitiveDependency: vi.fn(),
}))

vi.mock('../fixers/dependency', () => ({
    upgradeDependency: mockUpgradeDependency,
    overrideTransitiveDependency: mockOverrideTransitiveDependency,
}))

import { upgradeAlert } from './helpers'

const alert = {
    repository: 'foo/bar',
    packageName: 'decode-uri-component',
    recommendedVersion: '0.5.0',
} as NormalizedSecurityAlert

function makeCtx(overrideProtect?: Record<string, string[]>) {
    return {
        config: { dryRun: false, overrideProtect } as never,
        logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as never,
        workDir: '/tmp/m294',
        allErrors: [] as { category?: string, message: string }[],
        summary: { alertsSkipped: 0 },
    }
}

describe('upgradeAlert overrides 保护名单（间接依赖 override 路径）', () => {
    it('保护命中：不调用 override 写入 + 记 OVERRIDE_PROTECTED + noOp + skipped 计 1 次', async () => {
        mockUpgradeDependency.mockReset()
        mockOverrideTransitiveDependency.mockReset()
        mockUpgradeDependency.mockResolvedValue({ success: false, error: 'decode-uri-component not found in dependencies' })

        const ctx = makeCtx({ 'foo/bar': ['decode-uri-component'] })
        const action = await upgradeAlert(ctx as never, alert)

        // 关键：命中保护则不进入 override 写入路径
        expect(mockOverrideTransitiveDependency).not.toHaveBeenCalled()
        expect(action.noOp).toBe(true)
        expect(action.strategy).toBe('override-protected')
        expect(action.success).toBe(true)
        // 报告记录判定依据（含命中模式）
        expect(ctx.allErrors).toHaveLength(1)
        expect(ctx.allErrors[0].category).toBe('OVERRIDE_PROTECTED')
        expect(ctx.allErrors[0].message).toContain('foo/bar')
        // skipped 恰好计 1 次（RG-B01：不得与调用侧重复计数）
        expect(ctx.summary.alertsSkipped).toBe(1)
    })

    it('未命中保护名单：正常走 override 路径（回归，行为不变）', async () => {
        mockUpgradeDependency.mockReset()
        mockOverrideTransitiveDependency.mockReset()
        mockUpgradeDependency.mockResolvedValue({ success: false, error: 'decode-uri-component not found in dependencies' })
        mockOverrideTransitiveDependency.mockResolvedValue({
            packageName: 'decode-uri-component',
            fromVersion: '0.2.2',
            toVersion: '0.5.0',
            isMajor: false,
            success: true,
        })

        const ctx = makeCtx({ 'other/repo': ['decode-uri-component'] })
        const action = await upgradeAlert(ctx as never, alert)

        expect(mockOverrideTransitiveDependency).toHaveBeenCalledTimes(1)
        expect(action.noOp).toBeUndefined()
        expect(action.strategy).toBe('override')
        expect(ctx.allErrors).toHaveLength(0)
        expect(ctx.summary.alertsSkipped).toBe(0)
    })
})
