import type { H3Event } from 'h3'

/**
 * 新建仓库「允许跨大版本升级」的平台默认值。
 *
 * 仅作用于创建路径（单个创建 / 批量导入）；既有仓库始终读自身列。
 * 值来自 `runtimeConfig.public.allowMajorUpgradeDefault`（构建期
 * `ALLOW_MAJOR_UPGRADE_DEFAULT` / 运行期 `NUXT_PUBLIC_ALLOW_MAJOR_UPGRADE_DEFAULT`）。
 * 仅布尔 `true` 视为开启，其他形态（字符串 / 数字 / 缺省）一律按关闭处理（fail-closed）。
 */
export function resolveAllowMajorUpgradeDefault(event?: H3Event): boolean {
    const config = useRuntimeConfig(event) as { public?: { allowMajorUpgradeDefault?: unknown } }
    return config.public?.allowMajorUpgradeDefault === true
}
