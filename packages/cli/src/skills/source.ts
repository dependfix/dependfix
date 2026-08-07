// ---------------------------------------------------------------------------
// 产品 skill 内容来源定位
// ---------------------------------------------------------------------------
// dependfix-remediator 权威源随 npm 包 @dependfix/skills 发布（files: dependfix-remediator）。
// CLI 依赖该包，运行时通过 require.resolve 定位包内 skill 目录：
// - 开发（tsx）：workspace 链接解析到 packages/skills/dependfix-remediator
// - 发布（npx dependfix）：node_modules 中解析 @dependfix/skills/dependfix-remediator

import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

export const PRODUCT_SKILL_NAME = 'dependfix-remediator'

/**
 * 解析产品 skill 内容目录（含 SKILL.md 的目录）。
 * 找不到包或内容目录时抛错（install / doctor 的必要前置）。
 */
export function resolveProductSkillSourceDir(): string {
    const require = createRequire(import.meta.url)
    const pkgJsonPath = require.resolve('@dependfix/skills/package.json')
    return join(dirname(pkgJsonPath), PRODUCT_SKILL_NAME)
}
