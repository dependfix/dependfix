// override-protect.ts — `--override-protect` / `DEPENDFIX_OVERRIDE_PROTECT` 的解析。
//
// 从 config/index.ts 迁出以控制单文件规模；解析失败按配置校验错误抛出。
import { AppError } from '@dependfix/core'
import { parseOverrideProtectEntries } from '../github/repo-policy'
import { ENV_PREFIX } from './env-prefix'

/**
 * 解析 `DEPENDFIX_OVERRIDE_PROTECT`：`repo-glob:pkg1,pkg2;repo-glob2:pkg3`。
 *
 * 语法与 `normalizeUpgradeGroups` 一致（`;` 分隔条目 / `:` 分隔仓库 glob 与包列表 / `,` 分隔包名）；
 * 解析逻辑复用 `parseOverrideProtectEntries`（与 CLI 同源），非法条目 fail-fast。
 * 空串 / 空对象 → undefined（未配置）。
 */
export function normalizeOverrideProtect(value: string | undefined): Record<string, string[]> | undefined {
    if (value === undefined || value.trim() === '') {
        return undefined
    }
    const parsed = parseOverrideProtectEntries(
        value,
        (message) => new AppError('CONFIG_VALIDATION_ERROR', message),
        `${ENV_PREFIX}OVERRIDE_PROTECT`,
    )
    return Object.keys(parsed).length > 0 ? parsed : undefined
}
