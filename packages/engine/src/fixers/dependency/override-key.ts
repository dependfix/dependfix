// ---------------------------------------------------------------------------
// override key 归一化
//
// pnpm 的 overrides key 形如 `<pkg>[@<selector>]`（`selector` 按 semver range
// 解析），路径级形式为 `parent>child[@<selector>]`。因此 `brace-expansion@^1`
// 与 `brace-expansion@1` 语义等价（都指 1.x），但字符串不同。
//
// 生成 / 写入 overrides 时必须按归一化 key 判断"是否已存在"，否则会并存两种
// 写法（dependfix 在 nuxt-latest-template#298 中同时写出 `brace-expansion@^1`
// 与 `brace-expansion@1`）。
//
// 归一化只收敛**语义等价且常见**的等价类（裸 major / caret major / major 通配），
// 无法判定时原样返回——`~1`、`1.2`、`^1.2`、`1.1.21` 等保持区分，避免误合并。
// ---------------------------------------------------------------------------

/**
 * 归一化单个 selector。
 *
 * 等价类：`1` / `^1` / `1.x` / `1.*` / `^1.x` → `major:1`。
 * 其余（`~1`、`^1.2`、`1.1.21`、`>=1 <2` 等）原样返回（trim 后）。
 */
export function normalizeOverrideSelector(selector: string): string {
    const sel = selector.trim()
    // 裸 major / caret major / major 通配：`1`、`^1`、`1.x`、`1.*`、`^1.x`、`1.x.x`
    const bareMajor = /^(\d+)(?:\.(?:x|\*)(?:\.(?:x|\*))?)?$/i.exec(sel)
    if (bareMajor) {
        return `major:${bareMajor[1]}`
    }
    // caret + 零补位 / 通配补位：`^1.0`、`^1.0.0`、`^1.x`、`^1.*` 仍等价于 1.x。
    // major 0 时 caret 会锁 minor/patch（`^0.0` = <0.1.0、`^0.0.0` = <0.0.1），语义不同 → 不合并。
    const caretMajor = /^\^\s*(\d+)(?:\.0(?:\.0)?|\.(?:x|\*)(?:\.(?:x|\*))?)?$/i.exec(sel)
    if (caretMajor && caretMajor[1] !== '0') {
        return `major:${caretMajor[1]}`
    }
    return sel
}

/** 归一化整条 override key（含 scoped 包名与 `parent>child` 路径）。 */
export function normalizeOverrideKey(key: string): string {
    const trimmed = key.trim()
    if (!trimmed) {
        return trimmed
    }
    return trimmed
        .split('>')
        .map((segment) => normalizeOverrideSegment(segment))
        .join('>')
}

/** 归一化单段 `<pkg>[@<selector>]`（scoped 包名的首个 `@` 是 scope 前缀，非分隔符）。 */
function normalizeOverrideSegment(segment: string): string {
    const seg = segment.trim()
    if (!seg) {
        return seg
    }
    const separatorIndex = seg.startsWith('@') ? seg.indexOf('@', 1) : seg.indexOf('@')
    if (separatorIndex <= 0) {
        return seg
    }
    const packageName = seg.slice(0, separatorIndex)
    const selector = seg.slice(separatorIndex + 1)
    return `${packageName}@${normalizeOverrideSelector(selector)}`
}

/** upsert 结果：实际写入的 key（优先复用已有等价写法）与写入前旧值。 */
export interface OverrideUpsert {
    /** 实际写入的 key；命中已有语义等价 key 时为其原写法 */
    key: string
    /** 写入前的旧值（`undefined` = 新增） */
    oldValue: string | undefined
}

/**
 * 写入 / 更新一条 override。命中已有语义等价 key（如已有 `pkg@^1` 而写入 `pkg@1`）
 * 时复用已有写法，保证同一 selector 只保留一种写法。
 */
export function upsertOverride(
    overrides: Record<string, string | undefined>,
    key: string,
    value: string,
): OverrideUpsert {
    const normalized = normalizeOverrideKey(key)
    let actualKey = key
    for (const existingKey of Object.keys(overrides)) {
        if (normalizeOverrideKey(existingKey) === normalized) {
            actualKey = existingKey
            break
        }
    }
    const oldValue = overrides[actualKey]
    overrides[actualKey] = value
    return { key: actualKey, oldValue }
}
