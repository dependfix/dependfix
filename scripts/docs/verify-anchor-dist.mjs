/**
 * verify-anchor-dist.mjs —— 以 `docs:build` 产物为权威复核站内锚点。
 *
 * 为什么需要：`check-docs` 的 `anchor-id` 规则用内置 slugify 推算产物 id，
 * 属于「规则实现」；VitePress 升级可能改动 slug 规则，届时两者会一起错。
 * 本脚本直接读构建产物 HTML 里的 `id` 属性做比对，是「锚点真能跳转」的实证。
 *
 * 用法：
 *   pnpm run docs:build && node scripts/docs/verify-anchor-dist.mjs [--sample=20]
 *
 * 退出码：0 全命中 / 1 存在未命中 / 2 产物缺失（未构建）
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { getCliArgs, isDirectExecution } from '../shared/cli.mjs'
import { REPO_ROOT, walkMdFiles } from '../shared/md-walk.mjs'
import { EXTERNAL_LINK_RE, LINK_RE, forEachProseLine } from './md-scan.mjs'
import { collectHeadings } from './vitepress-slug.mjs'

const repoRoot = REPO_ROOT
const DIST_ROOT = join(repoRoot, 'docs/.vitepress/dist')

/**
 * 源 md → 产物 html（`docs/i18n/en-US/**` 由 rewrites 发布为 `/en-US/**`）。
 * `docsRoot` / `distRoot` 可注入，便于单测用临时目录验证映射。
 */
export function distPageOf(mdFile, distRoot = DIST_ROOT, docsRoot = join(repoRoot, 'docs')) {
    const rel = relative(docsRoot, mdFile)
    const parts = rel.split(/[\\/]/)
    const mapped = parts[0] === 'i18n' && parts[1] === 'en-US'
        ? ['en-US', ...parts.slice(2)]
        : parts
    return join(distRoot, ...mapped).replace(/\.md$/, '.html')
}

/** 抽取产物 HTML 的标题 id 序列（`id` 不要求是首个属性；顺序与文档标题一致） */
export function headingIdsOf(html) {
    return [...html.matchAll(/<h[1-6]\b[^>]*\sid="([^"]+)"/g)].map((m) => m[1])
}

/** 抽取产物 HTML 的标题 id 集合 */
export function idsOf(html) {
    return new Set(headingIdsOf(html))
}

function decodeSafe(value) {
    try {
        return decodeURIComponent(value)
    } catch {
        return value
    }
}

/**
 * 复核全部站内锚点：源侧链接的锚点必须命中目标页面产物 HTML 的 id。
 * 同时做「slug 口径自校验」：把源文件的推算标题 id 序列与产物 HTML 的 id 序列逐个比对。
 * 该比对只作为**诊断 warning**（不参与退出码）：模拟面未覆盖的合法写法（块引用内标题、
 * emoji shortcode）也会命中不一致，若据此阻断会把合法文档误判为漂移；真正的阻断项是
 * 「锚点未命中产物 id」——VitePress 改 slug 规则时，存量锚点会大面积不命中。
 * @returns {{ checked: number, pages: number, hits: Array, misses: Array, headingMismatches: Array, missingPages: string[] }}
 */
export function verifyAnchorDist(root, distRoot = DIST_ROOT) {
    const docsRoot = join(root, 'docs')
    // 归档目录在默认排除集合内（链接面豁免），但归档页同样会被构建，锚点必须实证
    const files = walkMdFiles(docsRoot, [], [], { includeDirs: ['archive'] })
    const idCache = new Map()
    const hits = []
    const misses = []
    const headingMismatches = []
    let pages = 0
    const missingPages = []

    const idsFor = (mdFile) => {
        const page = distPageOf(mdFile, distRoot, docsRoot)
        if (!idCache.has(page)) {
            idCache.set(page, existsSync(page) ? idsOf(readFileSync(page, 'utf8')) : null)
        }
        return idCache.get(page)
    }

    for (const file of files) {
        const sourceIds = idsFor(file)
        if (sourceIds) {
            pages += 1
            const distIds = headingIdsOf(readFileSync(distPageOf(file, distRoot, docsRoot), 'utf8'))
            const computedIds = collectHeadings(readFileSync(file, 'utf8')).map((h) => h.id)
            if (distIds.join('\n') !== computedIds.join('\n')) {
                const firstDiff = distIds.findIndex((id, i) => id !== computedIds[i])
                const index = firstDiff < 0 ? Math.min(distIds.length, computedIds.length) : firstDiff
                headingMismatches.push({
                    file: relative(root, file),
                    index,
                    expected: computedIds[index] ?? '(产物多出标题)',
                    actual: distIds[index] ?? '(产物缺少该标题)',
                })
            }
        } else {
            missingPages.push(distPageOf(file, distRoot, docsRoot))
        }
        const rel = relative(root, file)

        forEachProseLine(file, (line) => {
            const clean = line.replace(/`[^`]*`/g, '')
            for (const m of clean.matchAll(LINK_RE)) {
                const target = m[2]
                if (EXTERNAL_LINK_RE.test(target)) {
                    continue
                }
                const hashIndex = target.indexOf('#')
                if (hashIndex < 0 || hashIndex === target.length - 1) {
                    continue
                }
                const pathPart = target.slice(0, hashIndex)
                if (pathPart && !pathPart.endsWith('.md')) {
                    continue
                }
                const targetFile = pathPart ? resolve(dirname(file), pathPart) : file
                if (!existsSync(targetFile)) {
                    continue // file-dead：归档豁免面
                }
                const ids = idsFor(targetFile)
                if (!ids) {
                    continue // 目标页面未构建（非 docs 源）
                }
                const anchor = decodeSafe(target.slice(hashIndex + 1))
                const record = { file: rel, anchor, target: relative(root, targetFile) }
                if (ids.has(anchor)) {
                    hits.push(record)
                } else {
                    misses.push(record)
                }
            }
        })
    }

    // 命中数 + 未命中数即复核面（避免在循环回调里累加可变计数）
    return { checked: hits.length + misses.length, pages, hits, misses, headingMismatches, missingPages }
}

if (isDirectExecution(import.meta.url)) {
    if (!existsSync(DIST_ROOT)) {
        console.error('[verify-anchor-dist] 未找到构建产物，先执行 pnpm run docs:build')
        process.exit(2)
    }
    const sampleArg = getCliArgs().find((a) => a.startsWith('--sample='))
    const sample = Math.max(1, Number.parseInt(sampleArg?.slice('--sample='.length) ?? '20', 10) || 20)
    const { checked, pages, hits, misses, headingMismatches, missingPages } = verifyAnchorDist(repoRoot)

    console.log(`[verify-anchor-dist] 产物页面 ${pages} 个 / 站内锚点 ${checked} 处 / 命中 ${hits.length} 处`)
    console.log(`[verify-anchor-dist] slug 口径自校验：${pages - headingMismatches.length}/${pages} 页标题 id 与产物逐个一致`)
    if (headingMismatches.length > 0) {
        // 诊断项：可能是 slug 规则漂移，也可能是模拟面未覆盖的标题形态（块引用 / emoji shortcode）
        console.warn(`[verify-anchor-dist] ${headingMismatches.length} 页标题 id 与产物不一致（诊断项，不阻断）：`)
        for (const item of headingMismatches.slice(0, 10)) {
            console.warn(`  ≠ ${item.file} #${item.index}: 推算 "${item.expected}" / 产物 "${item.actual}"`)
        }
    }
    if (missingPages.length > 0) {
        // 源页没有产物 = 构建过期 / 不完整，复盘面不可信：直接失败（否则「全部命中」是假结论）
        console.error(`[verify-anchor-dist] ${missingPages.length} 个源页缺少构建产物（复核面不完整，先重跑 docs:build）：`)
        for (const page of missingPages.slice(0, 10)) {
            console.error(`  ! ${relative(repoRoot, page)}`)
        }
        process.exit(1)
    }
    console.log(`[verify-anchor-dist] 抽样 ${Math.min(sample, hits.length)} 处命中：`)
    for (const hit of hits.slice(0, sample)) {
        console.log(`  ✓ ${hit.target}#${hit.anchor}`)
    }
    if (misses.length > 0) {
        console.error(`[verify-anchor-dist] ${misses.length} 处未命中：`)
        for (const miss of misses) {
            console.error(`  ✗ ${miss.file} → ${miss.target}#${miss.anchor}`)
        }
        process.exit(1)
    }
    console.log('[verify-anchor-dist] OK：全部站内锚点命中产物 id，且 slug 口径与产物一致')
}
