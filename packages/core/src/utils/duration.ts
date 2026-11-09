import ms from 'ms'

/** 时长单位（与 `ms` 包支持的常用单位对齐；`d` 用于 4 小时封顶等上限展示）。 */
export type DurationUnit = 'ms' | 's' | 'm' | 'h' | 'd'

export interface ParseDurationOptions {
    /**
     * 纯数字（无单位）输入的默认单位。
     *
     * 环境变量历史上以纯数字表示毫秒，故缺省为 `ms`；面向用户的表单另有
     * 「纯数字按分钟」的展示口径，由调用方显式传入 `m`。
     */
    defaultUnit?: DurationUnit
}

/**
 * 归一到正整数毫秒：先 floor 再判正，避免 `0.5ms` 被归零后仍作为有效值返回；
 * 同时拒绝超出 `Number.MAX_SAFE_INTEGER` 的值（`setTimeout` 会按 1ms 折叠）。
 */
function normalizeMilliseconds(value: number): number | undefined {
    if (!Number.isFinite(value)) {
        return undefined
    }
    const floored = Math.floor(value)
    return floored > 0 && floored <= Number.MAX_SAFE_INTEGER ? floored : undefined
}

const UNIT_TO_MS: Record<DurationUnit, number> = {
    ms: 1,
    s: 1_000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
}

/**
 * 解析时长输入为毫秒。
 *
 * - 纯数字（`1800000`）：按 {@link ParseDurationOptions.defaultUnit} 换算，缺省毫秒；
 * - 带单位（`30m` / `1h` / `90s` / `2.5m`）：交给 `ms` 包解析（该包也接受 `w` / `y`，本项目调用方只用 ms/s/m/h/d）；
 * - 空串 / 非法 / 非正数：返回 `undefined`，由调用方决定回退默认值还是报错。
 *
 * 保留「纯数字」分支而不直接交由 `ms`：`ms('45')` 恒按毫秒解释，无法表达
 * 「表单纯数字按分钟」的既有习惯。
 */
export function parseDurationMs(
    value: string | number | null | undefined,
    options: ParseDurationOptions = {},
): number | undefined {
    if (typeof value === 'number') {
        return normalizeMilliseconds(value)
    }
    if (typeof value !== 'string') {
        return undefined
    }

    const normalized = value.trim()
    if (!normalized) {
        return undefined
    }

    if (/^\d+(?:\.\d+)?$/.test(normalized)) {
        return normalizeMilliseconds(Number(normalized) * UNIT_TO_MS[options.defaultUnit ?? 'ms'])
    }

    return normalizeMilliseconds(ms(normalized as ms.StringValue))
}

/**
 * 把毫秒格式化为最简可读单位（用于提示文案与错误消息）。
 *
 * 优先取能整除的最大单位：`3600000` → `1h`、`1800000` → `30m`、`90000` → `90s`；
 * 无法整除到秒时保留毫秒，避免展示成无限小数。
 */
export function formatDurationMs(value: number | null | undefined): string {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
        return '0ms'
    }

    const rounded = Math.floor(value)
    const units: [DurationUnit, number][] = [
        ['d', UNIT_TO_MS.d],
        ['h', UNIT_TO_MS.h],
        ['m', UNIT_TO_MS.m],
        ['s', UNIT_TO_MS.s],
    ]
    for (const [unit, size] of units) {
        if (rounded % size === 0) {
            return `${rounded / size}${unit}`
        }
    }
    return `${rounded}ms`
}
