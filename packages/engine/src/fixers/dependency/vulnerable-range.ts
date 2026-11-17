// vulnerable-range.ts — advisory 受影响区间判定（纯函数，无项目内依赖）。
//
// 单独成文件：`app/helpers.ts` 的版本化 overrides 生成与 `app/cross-major.ts` 的混合实例判定
// 都要用它，放在任一「上层」模块都会引入循环依赖。
import { satisfies, valid, validRange } from 'semver'

/**
 * 版本是否落在 advisory 受影响区间内（如 `>= 4.0.0, < 4.17.21`）。
 *
 * 区间缺失 / 无法解析 / 版本非法时**保守返回 true**（按受影响处理）：宁可多留人工复核，
 * 也不因数据缺失放宽跳过（与「未知不算既有」同向的保守口径）。
 */
export function isVersionAffected(version: string, vulnerableRange?: string): boolean {
    if (!vulnerableRange) {
        return true
    }
    const normalizedVersion = valid(version)
    // GitHub Advisory 的区间是逗号分隔（`>= 1.0.0, < 4.17.21`），node-semver 只认空格 /
    // `||`：先归一化逗号，否则真实数据全部落到「无法解析 → 保守 true」，过滤整体空转。
    // 已知保守面：`!= x.y.z` 等 node-semver 不支持的形态归一化后仍不可解析 → 保守 true
    // （不会误判收敛，只是把可收敛实例按受影响处理）。
    const range = validRange(vulnerableRange.replace(/\s*,\s*/g, ' '))
    if (!normalizedVersion || !range) {
        return true
    }
    return satisfies(normalizedVersion, range)
}
