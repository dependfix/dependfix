/**
 * migrate-anchors.mjs —— 把文档站内锚点机械迁移为 VitePress 产物 id 形态。
 *
 * 背景：历史链接按 GitHub 口径书写（相邻标点之间的空格写成 `--`、数字开头不加 `_`），
 * 在站点上属死锚；`check:docs` 的宽松归一化会剥离 `-`，因此长期未暴露。本脚本以
 * `vitepress-slug.mjs` 的实际 slug 为唯一权威，逐个链接比对并改写锚点文本，
 * 其余字符（路径、链接文本、行内其他内容）零改动。
 *
 * 匹配规则（宁缺毋滥，歧义一律不出手）：
 * - 目标文件必须存在（归档 file-dead 维持既有豁免，跳过）
 * - 锚点经宽松归一化后**唯一命中**某个标题 → 改写为该标题的产物 id
 * - 命中多个标题（仅标点差异）→ 记入 ambiguous，不改
 * - 命中不到（历史死锚 / 外部锚点）→ 记入 unmatched，不改
 *
 * 用法：
 *   node scripts/docs/migrate-anchors.mjs            # dry-run：打印改写清单与统计
 *   node scripts/docs/migrate-anchors.mjs --write    # 落盘改写
 *   node scripts/docs/migrate-anchors.mjs --json     # 输出机器可读清单
 */
import { readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { getCliArgs, isDirectExecution } from '../shared/cli.mjs'
import { REPO_ROOT, walkMdFiles } from '../shared/md-walk.mjs'
import { EXTERNAL_LINK_RE, LINK_RE, RUNTIME_EXCLUDED_PATHS, fenceMask, looseNorm } from './md-scan.mjs'
import { collectHeadings } from './vitepress-slug.mjs'

const repoRoot = REPO_ROOT

function decodeSafe(value) {
    try {
        return decodeURIComponent(value)
    } catch {
        return value
    }
}

/**
 * 解析目标文件的标题集合（带进程内缓存）。
 * @returns {Array<{ text: string, id: string }>}
 */
function headingsOf(file, cache) {
    if (!cache.has(file)) {
        cache.set(file, statSync(file).isFile() ? collectHeadings(readFileSync(file, 'utf8')) : [])
    }
    return cache.get(file)
}

/** 前缀匹配的最小长度（宽松归一化后）：过短的锚点容易命中无关标题 */
const PREFIX_MIN_LENGTH = 6

/**
 * 在目标文件的标题中定位锚点。
 *
 * 判定顺序（先精确后宽松，宁缺毋滥）：
 * 1. 锚点已是某标题的产物 id → 原样返回（重复标题的 `-1` 后缀在此区分）
 * 2. 宽松归一化后唯一命中 → 改写为该标题 id
 * 3. 唯一标题的宽松文本以锚点宽松文本为前缀（历史截断锚点）→ 改写为该标题 id，
 *    并标记 `prefix` 供清单区分
 * 4. 多命中 / 无命中 → 不改，交调用方报告
 * @returns {{ id: string | null, kind?: 'exact' | 'rewrite' | 'prefix', reason?: 'ambiguous' | 'unmatched' }}
 */
function resolveAnchor(headings, anchor) {
    const decoded = decodeSafe(anchor)
    if (headings.some((h) => h.id === decoded)) {
        return { id: decoded, kind: 'exact' }
    }
    const key = looseNorm(decoded)
    const hits = headings.filter((h) => looseNorm(h.text) === key || looseNorm(h.id) === key)
    if (hits.length === 1) {
        return { id: hits[0].id, kind: 'rewrite' }
    }
    if (hits.length > 1) {
        return { id: null, reason: 'ambiguous' }
    }
    if (key.length >= PREFIX_MIN_LENGTH) {
        const prefixed = headings.filter((h) => looseNorm(h.text).startsWith(key))
        if (prefixed.length === 1) {
            return { id: prefixed[0].id, kind: 'prefix' }
        }
        if (prefixed.length > 1) {
            return { id: null, reason: 'ambiguous' }
        }
    }
    return { id: null, reason: 'unmatched' }
}

/**
 * 生成改写计划（纯读，不落盘）。
 * @param {string} root 仓库根
 * @returns {{ files: string[], rewrites: Array, ambiguous: Array, unmatched: Array }}
 */
export function planAnchorRewrites(root) {
    const files = walkMdFiles(root, [], RUNTIME_EXCLUDED_PATHS, { includeDirs: ['archive'] })
        // `.opencode/skills` 是指向 `.github/skills` 的符号链接（同源镜像），
        // 重复改写会虚增清单计数；以 `.github` 侧为唯一改写面
        .filter((file) => relative(root, file).split(/[\\/]/)[0] !== '.opencode')
    const cache = new Map()
    const rewrites = []
    const ambiguous = []
    const unmatched = []

    for (const file of files) {
        const rel = relative(root, file)
        const lines = readFileSync(file, 'utf8').split(/\r?\n/)
        const mask = fenceMask(lines)

        lines.forEach((line, idx) => {
            if (mask[idx]) {
                return // 代码块内的同形文本不是链接
            }

            // 行内代码里的「链接」不是链接
            const clean = line.replace(/`[^`]*`/g, (m) => ' '.repeat(m.length))
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
                    continue // 非 markdown 目标没有标题 id 可比（与 check-docs 的 anchor-id 同口径）
                }
                const anchor = target.slice(hashIndex + 1)
                const targetFile = pathPart
                    ? resolve(dirname(file), pathPart)
                    : file
                if (pathPart && !statSync(targetFile, { throwIfNoEntry: false })?.isFile()) {
                    continue // file-dead：归档豁免面
                }
                const { id, kind, reason } = resolveAnchor(headingsOf(targetFile, cache), anchor)
                const record = {
                    file: rel,
                    line: idx + 1,
                    path: pathPart,
                    from: anchor,
                    to: id,
                    kind,
                    target: relative(root, targetFile),
                }
                if (id === null) {
                    ;(reason === 'ambiguous' ? ambiguous : unmatched).push(record)
                    continue
                }
                if (id !== anchor) {
                    rewrites.push(record)
                }
            }
        })
    }

    return { files: files.map((f) => relative(root, f)), rewrites, ambiguous, unmatched }
}

/**
 * 按改写计划原地替换锚点文本；返回写盘文件数。
 *
 * 实现要点：
 * - 以「链接整体」为单位用正则回调重建，只替换目标里的锚点段，链接文本 / 收尾括号 /
 *   行内其它内容逐字保留（早期按下标切片的写法少算一个字符，会吃掉路径首字符与 `)`）
 * - 保留原文件的换行风格（CRLF 不被静默改写为 LF）
 * - 同一行多个链接指向同一目标时按同一结论改写；行内代码区间与 fenced code block 均跳过
 *   （与 plan 阶段共用同一掩码，计划数与实改数一致）
 */
export function applyAnchorRewrites(root, rewrites) {
    const byFile = new Map()
    for (const r of rewrites) {
        byFile.set(r.file, [...(byFile.get(r.file) ?? []), r])
    }

    for (const [rel, items] of byFile) {
        const file = resolve(root, rel)
        const content = readFileSync(file, 'utf8')
        const eol = content.includes('\r\n') ? '\r\n' : '\n'
        const replacements = new Map(items.map((item) => [`${item.path}#${item.from}`, item.to]))
        const lines = content.split(/\r?\n/)
        const mask = fenceMask(lines)
        const next = lines
            .map((line, idx) => {
                if (mask[idx]) {
                    return line // 代码块内的示例链接不得被改写（与 plan 同口径）
                }
                // 行内代码里的同形文本不改写（与 plan 的掩码口径对齐）
                const codeRanges = [...line.matchAll(/`[^`]*`/g)].map((m) => [m.index, m.index + m[0].length])
                return line.replace(LINK_RE, (full, text, target, offset) => {
                    if (codeRanges.some(([start, end]) => offset >= start && offset < end)) {
                        return full
                    }
                    const hashIndex = target.indexOf('#')
                    if (hashIndex < 0) {
                        return full
                    }
                    const key = `${target.slice(0, hashIndex)}#${target.slice(hashIndex + 1)}`
                    const to = replacements.get(key)
                    if (to === undefined) {
                        return full
                    }
                    return `[${text}](${target.slice(0, hashIndex + 1)}${to})`
                })
            })
            .join(eol)
        writeFileSync(file, next)
    }

    return { files: byFile.size, rewrites: rewrites.length }
}

if (isDirectExecution(import.meta.url)) {
    const args = getCliArgs()
    const plan = planAnchorRewrites(repoRoot)
    const write = args.includes('--write')
    const json = args.includes('--json')

    if (write) {
        const written = applyAnchorRewrites(repoRoot, plan.rewrites)
        console.log(`[migrate-anchors] 已改写 ${written.rewrites} 处锚点，涉及 ${written.files} 个文件`)
    }

    if (json) {
        console.log(JSON.stringify({ rewrites: plan.rewrites, ambiguous: plan.ambiguous, unmatched: plan.unmatched }, null, 2))
    } else {
        const byFile = new Map()
        for (const r of plan.rewrites) {
            byFile.set(r.file, (byFile.get(r.file) ?? 0) + 1)
        }
        for (const [file, count] of [...byFile].sort((a, b) => b[1] - a[1])) {
            console.log(`  ${count.toString().padStart(3, ' ')}  ${file}`)
        }
        const prefixHits = plan.rewrites.filter((r) => r.kind === 'prefix')
        console.log(`[migrate-anchors] 待改写 ${plan.rewrites.length} 处 / ${byFile.size} 个文件（其中启发式前缀命中 ${prefixHits.length} 处）`)
        for (const hit of prefixHits) {
            console.log(`  ~ prefix ${hit.file}:${hit.line} #${hit.from} → #${hit.to}`)
        }
        console.log(`[migrate-anchors] ambiguous ${plan.ambiguous.length} / unmatched ${plan.unmatched.length}`)
        for (const item of [...plan.ambiguous, ...plan.unmatched]) {
            const kind = plan.ambiguous.includes(item) ? 'ambiguous' : 'unmatched'
            console.log(`  - ${kind} ${item.file}:${item.line} #${item.from} → ${item.target}`)
        }
    }
}
