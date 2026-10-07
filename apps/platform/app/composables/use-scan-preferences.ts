import { ref, type Ref } from 'vue'

/**
 * 设备级扫描偏好（方案 C 混合）：localStorage 记住上次选择 + 设置页可选「显式默认」+ 一键重置。
 *
 * 解析优先级（`resolveScanDefaults`）：**显式默认 > 上次选择 > 硬编码兜底**。
 * - 显式默认：设置页「扫描偏好」卡片写入（`defaultMode` / `defaultSeverity`）
 * - 上次选择：单仓库 / 批量扫描提交时自动记录（`lastMode` / `lastSeverity`）
 * - 硬编码兜底：`report-only` / `high`（迁移前的固定默认，保证无偏好时行为不变）
 *
 * 边界：
 * - **仅设备级**（localStorage），不做服务端跨设备偏好（登记 backlog）
 * - **不影响计划（schedule）默认**——计划表单有自己的默认值，不读取本偏好
 * - **SSR 安全**：模块不在渲染期读存储；`preferences` 初始为空对象，由 `refresh()`（客户端挂载后 /
 *   打开弹窗时）填充，避免首帧与客户端值不一致导致 hydration 错配
 * - 存储不可用（SSR / 无 `localStorage`）或访问抛错（安全策略 / 配额）→ 读取回退硬编码兜底、
 *   写入静默降级为「不持久化」，均不打断调用方主流程
 */

/** 扫描模式（与 `/api/repos/{id}/scan` 契约一致） */
export type ScanMode = 'report-only' | 'fix' | 'fix-and-pr'

/** 严重级别阈值（与扫描契约一致） */
export type ScanSeverity = 'critical' | 'high' | 'medium' | 'all'

/** 扫描模式全集（顺序与选项渲染一致） */
export const SCAN_MODES: readonly ScanMode[] = ['report-only', 'fix', 'fix-and-pr'] as const

/** 严重级别全集 */
export const SCAN_SEVERITIES: readonly ScanSeverity[] = ['critical', 'high', 'medium', 'all'] as const

/** 无任何偏好时的硬编码兜底（与迁移前 repos.vue 固定默认一致） */
export const DEFAULT_SCAN_MODE: ScanMode = 'report-only'
export const DEFAULT_SCAN_SEVERITY: ScanSeverity = 'high'

/** localStorage 键（设备级偏好，不落服务端） */
export const SCAN_PREFERENCES_STORAGE_KEY = 'dependfix-scan-preferences'

/** 设备级扫描偏好（字段缺省 = 该维度未配置） */
export interface ScanPreferences {
    /** 设置页显式配置的默认扫描模式 */
    defaultMode?: ScanMode
    /** 设置页显式配置的默认严重级别 */
    defaultSeverity?: ScanSeverity
    /** 上次提交扫描时的模式（自动记录） */
    lastMode?: ScanMode
    /** 上次提交扫描时的严重级别（自动记录） */
    lastSeverity?: ScanSeverity
}

/** 偏好来源（供 UI 提示当前生效口径） */
export type ScanPreferenceSource = 'default' | 'last' | 'fallback'

/** 解析结果：实际生效值 + 来源（来源供设置页提示「当前生效」口径） */
export interface ResolvedScanDefaults {
    mode: ScanMode
    severity: ScanSeverity
    modeSource: ScanPreferenceSource
    severitySource: ScanPreferenceSource
}

/** 存储抽象（便于单测注入；浏览器侧默认取 localStorage） */
export interface ScanPreferenceStorage {
    getItem(key: string): string | null
    setItem(key: string, value: string): void
    removeItem(key: string): void
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value)

/** 是否为合法扫描模式 */
export const isScanMode = (value: unknown): value is ScanMode =>
    typeof value === 'string' && (SCAN_MODES as readonly string[]).includes(value)

/** 是否为合法严重级别 */
export const isScanSeverity = (value: unknown): value is ScanSeverity =>
    typeof value === 'string' && (SCAN_SEVERITIES as readonly string[]).includes(value)

/** 逐字段规范化：非法值丢弃（脏数据不整段失败，也不污染回退链） */
export const normalizeScanPreferences = (prefs: ScanPreferences | null | undefined): ScanPreferences => {
    const normalized: ScanPreferences = {}
    if (isScanMode(prefs?.defaultMode)) {
        normalized.defaultMode = prefs.defaultMode
    }
    if (isScanSeverity(prefs?.defaultSeverity)) {
        normalized.defaultSeverity = prefs.defaultSeverity
    }
    if (isScanMode(prefs?.lastMode)) {
        normalized.lastMode = prefs.lastMode
    }
    if (isScanSeverity(prefs?.lastSeverity)) {
        normalized.lastSeverity = prefs.lastSeverity
    }
    return normalized
}

/** 解析持久化字符串（非法 JSON / 非对象 → 空偏好） */
export const parseScanPreferences = (raw: string | null | undefined): ScanPreferences => {
    if (!raw) {
        return {}
    }
    try {
        const parsed: unknown = JSON.parse(raw)
        return isRecord(parsed) ? normalizeScanPreferences(parsed) : {}
    } catch {
        return {}
    }
}

/** 来源判定：显式默认 > 上次选择 > 硬编码兜底 */
const resolvePreferenceSource = (
    explicit: string | undefined,
    last: string | undefined,
): ScanPreferenceSource => {
    if (explicit) {
        return 'default'
    }
    return last ? 'last' : 'fallback'
}

/** 优先级解析：显式默认 > 上次选择 > 硬编码兜底（+ 来源，供设置页提示当前生效口径） */
export const resolveScanDefaults = (prefs: ScanPreferences): ResolvedScanDefaults => {
    const normalized = normalizeScanPreferences(prefs)
    return {
        mode: normalized.defaultMode ?? normalized.lastMode ?? DEFAULT_SCAN_MODE,
        severity: normalized.defaultSeverity ?? normalized.lastSeverity ?? DEFAULT_SCAN_SEVERITY,
        modeSource: resolvePreferenceSource(normalized.defaultMode, normalized.lastMode),
        severitySource: resolvePreferenceSource(normalized.defaultSeverity, normalized.lastSeverity),
    }
}

/** 解析可用存储：显式传入优先（单测注入）；未传入时浏览器取 localStorage、SSR / 无存储环境返回 null */
const resolveStorage = (storage?: ScanPreferenceStorage | null): ScanPreferenceStorage | null => {
    if (storage !== undefined) {
        return storage
    }
    return typeof localStorage === 'undefined' ? null : localStorage
}

/**
 * 读取偏好（存储不可用 → 空偏好，调用方回退硬编码兜底）。
 * `resolveStorage` 也纳入 try：极端配置下访问 `localStorage` 属性本身即抛 SecurityError。
 */
export const readScanPreferences = (storage?: ScanPreferenceStorage | null): ScanPreferences => {
    try {
        const target = resolveStorage(storage)
        if (!target) {
            return {}
        }
        return parseScanPreferences(target.getItem(SCAN_PREFERENCES_STORAGE_KEY))
    } catch {
        return {}
    }
}

/**
 * 写入偏好（全部字段为空 → 移除键；失败静默降级，不影响本次扫描）。
 * 同 `readScanPreferences`：存储解析与读写在同一 try 内，避免「存储不可用」冒泡打断调用方主流程
 * （扫描提交路径在触发请求前记录偏好，抛错会让「弹窗已关但扫描未触发」）。
 */
export const writeScanPreferences = (prefs: ScanPreferences, storage?: ScanPreferenceStorage | null): void => {
    try {
        const target = resolveStorage(storage)
        if (!target) {
            return
        }
        const payload = normalizeScanPreferences(prefs)
        if (Object.keys(payload).length === 0) {
            target.removeItem(SCAN_PREFERENCES_STORAGE_KEY)
            return
        }
        target.setItem(SCAN_PREFERENCES_STORAGE_KEY, JSON.stringify(payload))
    } catch {
        // 存储不可用 / 不可写（SSR / 安全策略 / 配额）→ 不持久化本次偏好
    }
}

export interface UseScanPreferencesReturn {
    /** 当前偏好（客户端读取后的响应式镜像；SSR 首帧为空对象） */
    preferences: Ref<ScanPreferences>
    /** 从存储重新读取（客户端挂载 / 弹窗打开时调用） */
    refresh: () => ScanPreferences
    /** 解析当前生效默认（打开扫描弹窗时调用） */
    resolveDefaults: () => ResolvedScanDefaults
    /** 记录「上次选择」（扫描提交时调用） */
    rememberChoice: (mode: string, severity: string) => void
    /** 设置 / 清除显式默认（设置页；传 null 表示清除该维度） */
    setDefaults: (defaults: { mode?: ScanMode | null, severity?: ScanSeverity | null }) => void
    /** 重置：清除显式默认与上次选择（恢复硬编码兜底） */
    reset: () => void
}

/**
 * 扫描偏好 composable。
 *
 * @param storage 可注入存储（单测传内存实现）；缺省时浏览器取 `localStorage`，SSR / 无存储环境为 null
 */
export const useScanPreferences = (storage?: ScanPreferenceStorage | null): UseScanPreferencesReturn => {
    // SSR 首帧为空偏好（不读存储）→ 避免与客户端存储值产生 hydration 错配
    const preferences = ref<ScanPreferences>({})

    const refresh = (): ScanPreferences => {
        const current = readScanPreferences(storage)
        preferences.value = current
        return current
    }

    const resolveDefaults = (): ResolvedScanDefaults => resolveScanDefaults(refresh())

    const rememberChoice = (mode: string, severity: string): void => {
        const current = readScanPreferences(storage)
        const next: ScanPreferences = { ...current }
        if (isScanMode(mode)) {
            next.lastMode = mode
        }
        if (isScanSeverity(severity)) {
            next.lastSeverity = severity
        }
        writeScanPreferences(next, storage)
        preferences.value = readScanPreferences(storage)
    }

    const setDefaults = (defaults: { mode?: ScanMode | null, severity?: ScanSeverity | null }): void => {
        const next: ScanPreferences = { ...readScanPreferences(storage) }
        if (defaults.mode === null) {
            delete next.defaultMode
        } else if (isScanMode(defaults.mode)) {
            next.defaultMode = defaults.mode
        }
        if (defaults.severity === null) {
            delete next.defaultSeverity
        } else if (isScanSeverity(defaults.severity)) {
            next.defaultSeverity = defaults.severity
        }
        writeScanPreferences(next, storage)
        preferences.value = readScanPreferences(storage)
    }

    const reset = (): void => {
        writeScanPreferences({}, storage)
        preferences.value = {}
    }

    return { preferences, refresh, resolveDefaults, rememberChoice, setDefaults, reset }
}
