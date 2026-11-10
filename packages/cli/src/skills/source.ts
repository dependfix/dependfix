// ---------------------------------------------------------------------------
// 产品 skill 内容来源定位
// ---------------------------------------------------------------------------
// dependfix-remediator 权威源随 npm 包 @dependfix/skills 发布（files: dependfix-remediator）。
// CLI 依赖该包，运行时通过 require.resolve 定位包内 skill 目录：
// - 开发（tsx）：workspace 链接解析到 packages/skills/dependfix-remediator
// - 发布（npx dependfix）：node_modules 中解析 @dependfix/skills/dependfix-remediator
// - 沙箱自包含产物：`DEPENDFIX_SKILLS_DIR` 指向随 bundle 复制的 skills 根目录
//   （其下为 dependfix-remediator），避免在无 node_modules 的容器里解析包。

import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

export const PRODUCT_SKILL_NAME = 'dependfix-remediator'

/**
 * 解析产品 skill 内容目录（含 SKILL.md 的目录）。
 *
 * `DEPENDFIX_SKILLS_DIR` 表示**包含** `dependfix-remediator` 的根目录
 * （与 `@dependfix/skills` 包布局一致）；设置后优先于包解析，供自包含产物使用。
 * 覆盖路径**不校验存在性**（调用方 doctor / installer 各自判定）。
 * 找不到包或内容目录时抛错（install / doctor 的必要前置）。
 */
export function resolveProductSkillSourceDir(): string {
    const override = process.env.DEPENDFIX_SKILLS_DIR?.trim()
    if (override) {
        return join(override, PRODUCT_SKILL_NAME)
    }
    const require = createRequire(import.meta.url)
    const pkgJsonPath = require.resolve('@dependfix/skills/package.json')
    return join(dirname(pkgJsonPath), PRODUCT_SKILL_NAME)
}
