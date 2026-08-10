/**
 * create-github-release.mjs —— 聚合 GitHub Release 创建脚本（release:github，CI 用）
 *
 * 消费 release-publish-result.json（release:publish 成功后的产物：本轮实际发布
 * 列表 + 锚版本），为本轮发布创建一个聚合 GitHub Release：
 * - tag：v<锚版本>（v tag 由 release:publish 创建并随 Push release tags 推送核验，
 *   本脚本只关联、不创建/不推送 tag）
 * - notes：本轮发布版本矩阵 + 项目 changelog 段（优先根 CHANGELOG 最新段，
 *   core-only 等根段为空时取锚包包级 CHANGELOG 段）
 * - 0.x 阶段统一 --prerelease
 *
 * 幂等与失败语义：
 * - 无发布列表 / 无 changelog 段 → 不创建（安全退出）
 * - gh release view <tag> 已存在（重跑）→ 跳过
 * - gh release create 失败 → ::warning:: 不退出非零（npm 已发布完成，
 *   GitHub Release 是展示辅助，可后补 `gh release create`）
 *
 * 用法：
 *   pnpm release:github             # 创建聚合 GitHub Release（CI）
 *   pnpm release:github --dry-run   # 预览 notes 与将执行的 gh 命令，不实际创建
 */
import { execSync } from 'node:child_process'
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { PUBLISHABLE_PACKAGES } from './packages.config.mjs'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const RESULT_FILE = join(repoRoot, 'release-publish-result.json')
const ROOT_CHANGELOG = 'CHANGELOG.md'

/**
 * 从 CHANGELOG 内容中提取指定版本段（`# [x.y.z](...) (date)` / `# x.y.z (date)`
 * / patch 段 `## [x.y.z](...)`，与 changelog.mjs 的 sectionRegex 同款标题形态）。
 * 返回该版本段全文（版本标题行到下一个版本段前），无匹配返回 null。
 */
export function extractSection(content, version) {
    const lineRe = /^#{1,2} \[?(\d+\.\d+\.\d+)\]?(?:\([^)]*\))?\s/
    const lines = content.split('\n')
    let start = -1
    for (let i = 0; i < lines.length; i++) {
        const m = lineRe.exec(lines[i])
        if (m && m[1] === version) {
            start = i
            break
        }
    }
    if (start === -1) {
        return null
    }
    let end = lines.length
    for (let i = start + 1; i < lines.length; i++) {
        if (lineRe.test(lines[i])) {
            end = i
            break
        }
    }
    return lines.slice(start, end).join('\n').trim()
}

/**
 * 构建 GitHub Release 计划（纯函数，依赖注入便于测试）。
 * 返回 { tag, notes, prerelease, action }：
 * - action: create / skip-no-published / skip-no-notes
 * - notes = 版本矩阵 + changelog 段（根 CHANGELOG 优先，空则锚包包级段）
 */
export function buildReleasePlan(result, files, deps) {
    const { published = [], anchorVersion, anchorPkg } = result ?? {}
    if (published.length === 0 || !anchorVersion) {
        return { tag: null, notes: '', prerelease: false, action: 'skip-no-published' }
    }
    const root = deps.readFile(files.root)
    let section = extractSection(root, anchorVersion)
    let source = '根 CHANGELOG'
    if (!section && anchorPkg && files.byPkg[anchorPkg]) {
        const pkgContent = deps.readFile(files.byPkg[anchorPkg])
        section = extractSection(pkgContent, anchorVersion)
        source = `${anchorPkg} 包级 CHANGELOG`
    }
    if (!section) {
        return { tag: null, notes: '', prerelease: false, action: 'skip-no-notes' }
    }
    const matrix = published.map((p) => `- ${p.pkg}@${p.version}`).join('\n')
    const notes = `## 本轮发布包\n\n${matrix}\n\n## 变更日志（${source}）\n\n${section}\n`
    return {
        tag: `v${anchorVersion}`,
        notes,
        prerelease: anchorVersion.startsWith('0.'),
        action: 'create',
    }
}

/** 锚包（rootChangelog）→ 包级 changelog 路径映射（单点配置派生） */
function buildChangelogByPkg() {
    return Object.fromEntries(
        PUBLISHABLE_PACKAGES.filter((p) => p.changelog).map((p) => [p.pkg, p.changelog]),
    )
}

export function main() {
    const dryRun = process.argv.includes('--dry-run')
    let result
    try {
        result = JSON.parse(readFileSync(RESULT_FILE, 'utf8'))
    } catch (err) {
        if (err?.code === 'ENOENT') {
            console.error('未找到 release-publish-result.json，请先运行 pnpm release:publish')
            process.exit(1)
        }
        throw err
    }

    const plan = buildReleasePlan(
        result,
        { root: ROOT_CHANGELOG, byPkg: buildChangelogByPkg() },
        {
            readFile: (path) => {
                try {
                    return readFileSync(join(repoRoot, path), 'utf8')
                } catch {
                    return ''
                }
            },
        },
    )

    if (plan.action !== 'create') {
        console.log(`skip（${plan.action === 'skip-no-published' ? '本轮无发布包' : '未找到 changelog 版本段，跳过创建'}）`)
        return
    }
    console.log(`计划创建 GitHub Release ${plan.tag}（prerelease: ${plan.prerelease}）`)
    if (dryRun) {
        console.log('--- notes 预览 ---')
        console.log(plan.notes)
        console.log('--- dry-run 完成，未实际创建 ---')
        return
    }

    // 幂等：Release 已存在（重跑场景）→ 跳过
    try {
        execSync(`gh release view ${plan.tag}`, { cwd: repoRoot, stdio: 'pipe' })
        console.log(`skip ${plan.tag}（GitHub Release 已存在）`)
        return
    } catch {
        // 不存在 → 继续创建
    }

    const notesFile = join(tmpdir(), `release-notes-${process.pid}.md`)
    writeFileSync(notesFile, plan.notes, 'utf8')
    try {
        const prereleaseFlag = plan.prerelease ? '--prerelease' : ''
        execSync(`gh release create ${plan.tag} --notes-file "${notesFile}" ${prereleaseFlag}`, {
            cwd: repoRoot,
            stdio: 'inherit',
            encoding: 'utf8',
        })
        console.log(`created GitHub Release ${plan.tag}`)
    } catch (err) {
        // 失败不阻断（npm 已发布完成；Release 可后补 gh release create）
        console.warn(`::warning::创建 GitHub Release ${plan.tag} 失败：${err.message}`)
    } finally {
        try {
            unlinkSync(notesFile)
        } catch {
            // 临时文件不存在则跳过
        }
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main()
}
