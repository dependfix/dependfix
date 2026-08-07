/**
 * 同步产品 skill 到仓库根分发目录（npx skills 生态发现）。
 *
 * 职责划分：
 * - 权威源：packages/skills/dependfix-remediator/（随 npm 包 @dependfix/skills 发布）
 * - 分发目录：skills/dependfix-remediator/（发布 = git push，npx skills 自动发现）
 *
 * 语义：递归镜像同步——源文件全量复制到目标（含子目录），目标中源已不存在的文件删除。
 * 空源直接报错（镜像语义下"源清空"几乎必为误操作，防止清空目标）。
 * 幂等可重跑；一致性由 packages/skills/test/sync-consistency.test.mjs 保证。
 *
 * 用法：node scripts/sync-skills.mjs（或 pnpm sync:skills）
 */
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const srcDir = join(here, '..', 'packages', 'skills', 'dependfix-remediator')
const distDir = join(here, '..', 'skills', 'dependfix-remediator')

if (!existsSync(srcDir)) {
    throw new Error(`权威源目录不存在: ${srcDir}`)
}
if (readdirSync(srcDir).length === 0) {
    throw new Error(`权威源目录为空，拒绝同步: ${srcDir}`)
}

mkdirSync(distDir, { recursive: true })

// 1. 删除目标中源已不存在的条目（目录递归删除，逐条目操作）
const srcEntries = new Set(readdirSync(srcDir))
for (const entry of readdirSync(distDir)) {
    if (!srcEntries.has(entry)) {
        rmSync(join(distDir, entry), { recursive: true, force: true })
    }
}

// 2. 全量复制源条目到目标（目录递归复制，文件覆盖）
for (const entry of srcEntries) {
    const src = join(srcDir, entry)
    const dist = join(distDir, entry)
    if (statSync(src).isDirectory()) {
        cpSync(src, dist, { recursive: true })
    } else {
        cpSync(src, dist)
    }
}

const fileCount = readdirSync(srcDir).length
console.info(`已同步 ${fileCount} 个条目: ${srcDir} -> ${distDir}`)
