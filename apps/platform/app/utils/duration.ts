// 浏览器侧的时长输入封装。
//
// 与 `packages/core/src/utils/duration.ts` 保持同一解析语义，但不能直接 import：
// core 的 barrel 引入 node:crypto / node:fs / node:path，进客户端 bundle 会失败。
// 差异仅在「纯数字」的默认单位——表单沿用既有习惯按分钟（`45` = 45 分钟），
// 环境变量侧仍按毫秒（见 core 的 parseDurationMs 缺省值）。
import ms from 'ms'

/** 纯数字输入的默认单位：分钟（与旧版表单「执行上限（分钟）」一致）。 */
const BARE_NUMBER_UNIT_MS = 60_000

export interface ParsedDurationInput {
    /** 解析出的毫秒值；留空或非法时为 null */
    ms: number | null
    /** `empty` = 留空（继承全局）；`invalid` = 非法输入；`ok` = 解析成功 */
    status: 'ok' | 'empty' | 'invalid'
}

/** 解析表单时长文本（支持 `30m` / `1h` / `90s` / `2.5m`；纯数字按分钟）。 */
export function parseDurationInput(raw: string): ParsedDurationInput {
    const normalized = raw.trim()
    if (!normalized) {
        return { ms: null, status: 'empty' }
    }

    if (/^\d+(?:\.\d+)?$/.test(normalized)) {
        const converted = Number(normalized) * BARE_NUMBER_UNIT_MS
        return Number.isFinite(converted) && converted > 0
            ? { ms: Math.floor(converted), status: 'ok' }
            : { ms: null, status: 'invalid' }
    }

    const parsed = ms(normalized as ms.StringValue)
    return typeof parsed === 'number' && Number.isFinite(parsed) && parsed > 0
        ? { ms: Math.floor(parsed), status: 'ok' }
        : { ms: null, status: 'invalid' }
}

/** 毫秒 → 可读输入文本（`1800000` → `30m`、`3600000` → `1h`、`90000` → `90s`）。 */
export function formatDurationInput(value: number | null | undefined): string {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
        return ''
    }

    const rounded = Math.floor(value)
    const units: [unit: string, size: number][] = [
        ['d', 86_400_000],
        ['h', 3_600_000],
        ['m', 60_000],
        ['s', 1_000],
    ]
    for (const [unit, size] of units) {
        if (rounded % size === 0) {
            return `${rounded / size}${unit}`
        }
    }
    return `${rounded}ms`
}
