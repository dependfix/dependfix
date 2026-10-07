import { describe, expect, it, vi } from 'vitest'
import {
    DEFAULT_SCAN_MODE,
    DEFAULT_SCAN_SEVERITY,
    normalizeScanPreferences,
    parseScanPreferences,
    readScanPreferences,
    resolveScanDefaults,
    SCAN_PREFERENCES_STORAGE_KEY,
    useScanPreferences,
    writeScanPreferences,
    type ScanPreferenceStorage,
} from '../../app/composables/use-scan-preferences'

/** 内存存储（单测注入，避免依赖 jsdom / localStorage） */
const createMemoryStorage = (): ScanPreferenceStorage & { raw: () => string | null } => {
    const map = new Map<string, string>()
    return {
        getItem: (key) => map.get(key) ?? null,
        setItem: (key, value) => {
            map.set(key, value)
        },
        removeItem: (key) => {
            map.delete(key)
        },
        raw: () => map.get(SCAN_PREFERENCES_STORAGE_KEY) ?? null,
    }
}

describe('resolveScanDefaults（优先级解析）', () => {
    it('无任何偏好 → 硬编码兜底（report-only / high）', () => {
        expect(resolveScanDefaults({})).toEqual({
            mode: DEFAULT_SCAN_MODE,
            severity: DEFAULT_SCAN_SEVERITY,
            modeSource: 'fallback',
            severitySource: 'fallback',
        })
    })

    it('仅有上次选择 → 用上次选择', () => {
        expect(resolveScanDefaults({ lastMode: 'fix', lastSeverity: 'critical' })).toEqual({
            mode: 'fix',
            severity: 'critical',
            modeSource: 'last',
            severitySource: 'last',
        })
    })

    it('显式默认优先于上次选择', () => {
        expect(resolveScanDefaults({
            defaultMode: 'fix-and-pr',
            defaultSeverity: 'medium',
            lastMode: 'fix',
            lastSeverity: 'critical',
        })).toEqual({
            mode: 'fix-and-pr',
            severity: 'medium',
            modeSource: 'default',
            severitySource: 'default',
        })
    })

    it('两维度独立解析（仅 mode 有显式默认时 severity 仍走上次选择）', () => {
        const resolved = resolveScanDefaults({ defaultMode: 'fix', lastSeverity: 'all' })
        expect(resolved.mode).toBe('fix')
        expect(resolved.modeSource).toBe('default')
        expect(resolved.severity).toBe('all')
        expect(resolved.severitySource).toBe('last')
    })

    it('非法值不参与解析（逐字段丢弃后回退）', () => {
        const resolved = resolveScanDefaults({
            defaultMode: 'bogus' as never,
            lastSeverity: 'nope' as never,
            lastMode: 'fix',
        })
        expect(resolved.mode).toBe('fix')
        expect(resolved.modeSource).toBe('last')
        expect(resolved.severity).toBe(DEFAULT_SCAN_SEVERITY)
        expect(resolved.severitySource).toBe('fallback')
    })
})

describe('normalizeScanPreferences / parseScanPreferences（脏数据防御）', () => {
    it('非法 JSON / 空串 / 非对象载荷 → 空偏好', () => {
        expect(parseScanPreferences(null)).toEqual({})
        expect(parseScanPreferences('')).toEqual({})
        expect(parseScanPreferences('{ not json')).toEqual({})
        expect(parseScanPreferences('[1,2,3]')).toEqual({})
        expect(parseScanPreferences('42')).toEqual({})
        expect(parseScanPreferences('"text"')).toEqual({})
    })

    it('逐字段保留合法值，丢弃非法值', () => {
        expect(parseScanPreferences(JSON.stringify({
            defaultMode: 'fix',
            defaultSeverity: 'bogus',
            lastMode: 123,
            lastSeverity: 'all',
        }))).toEqual({ defaultMode: 'fix', lastSeverity: 'all' })
    })

    it('normalizeScanPreferences 容忍 null / undefined', () => {
        expect(normalizeScanPreferences(null)).toEqual({})
        expect(normalizeScanPreferences(undefined)).toEqual({})
    })
})

describe('readScanPreferences / writeScanPreferences（存储读写）', () => {
    it('写入后可读回；空偏好写入时移除键', () => {
        const storage = createMemoryStorage()
        writeScanPreferences({ lastMode: 'fix', lastSeverity: 'medium' }, storage)
        expect(readScanPreferences(storage)).toEqual({ lastMode: 'fix', lastSeverity: 'medium' })

        writeScanPreferences({}, storage)
        expect(storage.raw()).toBeNull()
        expect(readScanPreferences(storage)).toEqual({})
    })

    it('存储为 null（SSR / 无 localStorage）→ 读空、写 no-op、不抛错', () => {
        expect(readScanPreferences(null)).toEqual({})
        expect(() => writeScanPreferences({ lastMode: 'fix' }, null)).not.toThrow()
    })

    it('存储抛错（隐私模式 / 配额）→ 静默降级，不影响调用方', () => {
        const throwing: ScanPreferenceStorage = {
            getItem: () => {
                throw new Error('denied')
            },
            setItem: () => {
                throw new Error('quota')
            },
            removeItem: () => {
                throw new Error('denied')
            },
        }
        expect(readScanPreferences(throwing)).toEqual({})
        expect(() => writeScanPreferences({ lastMode: 'fix' }, throwing)).not.toThrow()
    })

    it('访问 localStorage 属性本身抛错（安全策略）→ 读写与提交前记录均静默降级', () => {
        const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
        Object.defineProperty(globalThis, 'localStorage', {
            configurable: true,
            get() {
                throw new Error('SecurityError: storage disabled')
            },
        })
        try {
            expect(readScanPreferences()).toEqual({})
            expect(() => writeScanPreferences({ lastMode: 'fix' })).not.toThrow()
            // 提交扫描前记录偏好不得冒泡（否则「弹窗已关但扫描未触发」）
            const prefs = useScanPreferences()
            expect(() => prefs.rememberChoice('fix', 'high')).not.toThrow()
            expect(prefs.resolveDefaults()).toMatchObject({
                mode: DEFAULT_SCAN_MODE,
                severity: DEFAULT_SCAN_SEVERITY,
            })
        } finally {
            if (original) {
                Object.defineProperty(globalThis, 'localStorage', original)
            } else {
                delete (globalThis as { localStorage?: unknown }).localStorage
            }
        }
    })
})

describe('useScanPreferences（composable）', () => {
    it('SSR 首帧 preferences 为空（不读存储，避免 hydration 错配）；refresh 后填充', () => {
        const storage = createMemoryStorage()
        writeScanPreferences({ defaultMode: 'fix' }, storage)

        const prefs = useScanPreferences(storage)
        // 构造期不读存储
        expect(prefs.preferences.value).toEqual({})

        const loaded = prefs.refresh()
        expect(loaded).toEqual({ defaultMode: 'fix' })
        expect(prefs.preferences.value).toEqual({ defaultMode: 'fix' })
    })

    it('rememberChoice 记录上次选择；非法值被忽略（不覆盖既有值）', () => {
        const storage = createMemoryStorage()
        const prefs = useScanPreferences(storage)

        prefs.rememberChoice('fix-and-pr', 'medium')
        expect(prefs.preferences.value).toEqual({ lastMode: 'fix-and-pr', lastSeverity: 'medium' })

        prefs.rememberChoice('bogus', 'nope')
        expect(prefs.preferences.value).toEqual({ lastMode: 'fix-and-pr', lastSeverity: 'medium' })
    })

    it('setDefaults 设置 / 清除显式默认，且保留上次选择', () => {
        const storage = createMemoryStorage()
        const prefs = useScanPreferences(storage)
        prefs.rememberChoice('fix', 'high')

        prefs.setDefaults({ mode: 'fix-and-pr', severity: 'critical' })
        expect(prefs.preferences.value).toEqual({
            lastMode: 'fix',
            lastSeverity: 'high',
            defaultMode: 'fix-and-pr',
            defaultSeverity: 'critical',
        })
        expect(prefs.resolveDefaults().modeSource).toBe('default')

        prefs.setDefaults({ mode: null, severity: null })
        expect(prefs.preferences.value).toEqual({ lastMode: 'fix', lastSeverity: 'high' })
        expect(prefs.resolveDefaults()).toMatchObject({ mode: 'fix', modeSource: 'last' })
    })

    it('reset 清除显式默认与上次选择（恢复硬编码兜底）', () => {
        const storage = createMemoryStorage()
        const prefs = useScanPreferences(storage)
        prefs.setDefaults({ mode: 'fix' })
        prefs.rememberChoice('fix-and-pr', 'all')
        expect(storage.raw()).not.toBeNull()

        prefs.reset()
        expect(prefs.preferences.value).toEqual({})
        expect(storage.raw()).toBeNull()
        expect(prefs.resolveDefaults()).toMatchObject({
            mode: DEFAULT_SCAN_MODE,
            severity: DEFAULT_SCAN_SEVERITY,
            modeSource: 'fallback',
            severitySource: 'fallback',
        })
    })

    it('resolveDefaults 每次实时读存储（另一处写入可被感知）', () => {
        const storage = createMemoryStorage()
        const prefs = useScanPreferences(storage)
        expect(prefs.resolveDefaults().modeSource).toBe('fallback')

        writeScanPreferences({ lastMode: 'fix' }, storage)
        expect(prefs.resolveDefaults()).toMatchObject({ mode: 'fix', modeSource: 'last' })
    })

    it('缺省存储参数在无 localStorage 环境下回退兜底（不抛错）', () => {
        // node 测试环境无 localStorage：resolveStorage 返回 null
        vi.stubGlobal('localStorage', undefined)
        try {
            const prefs = useScanPreferences()
            expect(() => prefs.rememberChoice('fix', 'high')).not.toThrow()
            expect(prefs.resolveDefaults()).toMatchObject({
                mode: DEFAULT_SCAN_MODE,
                severity: DEFAULT_SCAN_SEVERITY,
            })
        } finally {
            vi.unstubAllGlobals()
        }
    })
})
