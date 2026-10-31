/**
 * check-design-mirror.mjs —— en-US 设计镜像的「结构映射」机检。
 *
 * 背景：`docs/design/**`（zh 事实源）有 60+ 篇，en 侧只镜像 4 篇（决策：结构映射 + 索引补全，
 * 不重译；口径见 `docs/standards/documentation.md` §6）。没有清单时「哪些镜像了、哪些没有」只能靠猜，缺口静默。本脚本以
 * `docs/i18n/en-US/design/mirror-manifest.md` 为唯一登记处，校验三方一致：
 *
 * 1. zh 文件集 ↔ 清单「未镜像 / 镜像」集合：每个 zh 分片必须出现且只出现一次
 * 2. en 文件集 ↔ 清单「镜像」集合：每个 en 设计页必须登记来源（镜像清单本身除外）
 * 3. 每个镜像页的 H2 映射：清单里该页的 zh 列必须等于 zh 事实源的 H2 全集；
 *    en 列要么是 en 事实源里真实存在的 H2 标题，要么以 `—` 开头（显式未镜像 / 合并去向）
 *
 * 用法：
 *   node scripts/docs/check-design-mirror.mjs          # 校验
 *   node scripts/docs/check-design-mirror.mjs --json   # 机读
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getCliArgs, isDirectExecution } from '../shared/cli.mjs'
import { collectHeadings } from './vitepress-slug.mjs'

const SCRIPT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
export const MANIFEST_PATH = 'docs/i18n/en-US/design/mirror-manifest.md'
const ZH_ROOT = 'docs/design'
const EN_ROOT = 'docs/i18n/en-US/design'
const MANIFEST_SELF = 'mirror-manifest.md'

/** 递归列出目录下的 .md（相对给定根的 POSIX 路径，按字典序） */
export function listMd(root, dir) {
    const out = []
    const walk = (current) => {
        for (const entry of readdirSync(current, { withFileTypes: true })) {
            const full = join(current, entry.name)
            if (entry.isDirectory()) {
                walk(full)
            } else if (entry.name.endsWith('.md')) {
                out.push(relative(dir, full).split('\\').join('/'))
            }
        }
    }
    if (existsSync(dir)) {
        walk(dir)
    }
    return out.sort()
}

/** 表格行 → 单元格数组（去掉首尾空段） */
function cellsOf(line) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('|')) {
        return null
    }
    return trimmed.split('|').slice(1, -1).map((cell) => cell.trim())
}

/** 从单元格里取路径（去掉 markdown 链接包装与反引号） */
function pathOf(cell) {
    const link = cell.match(/\]\(([^)]+)\)/)
    const raw = link ? link[1] : cell
    return raw.replace(/`/g, '').trim()
}

/**
 * 解析清单（格式见 mirror-manifest.md）：
 * - `## Mirrored pages` 下每页一个 `### <zh 路径> → <en 路径>`，紧跟一张 `zh H2 | en H2` 表
 * - `## English-side sections` 一张 `en 页面 | en H2 | zh 对应` 表（英文侧存在、zh 内容在别的分片，或确为英文独有）
 * - `## Not mirrored` 一张 `zh source | 理由` 表（未镜像的 zh 分片逐条登记）
 * @returns {{ zhSet: Set<string>, mirrored: Map<string, { en: string, rows: Array<[string, string]> }>, enOnly: Map<string, string[]>, errors: string[] }}
 */
export function parseManifest(content) {
    const lines = content.split(/\r?\n/)
    const zhSet = new Set()
    const englishSources = []
    const mirrored = new Map()
    const enOnly = new Map()
    const errors = []
    let section = ''
    let currentMirror = null
    let currentEnOnly = null

    for (const line of lines) {
        if (/^##\s/.test(line)) {
            section = line.replace(/^##\s+/, '').trim()
            currentMirror = null
            currentEnOnly = null
            continue
        }
        const mirrorHeading = line.match(/^###\s+(.+?)\s*→\s*(.+)$/)
        if (mirrorHeading && section.startsWith('Mirrored')) {
            const zhKey = pathOf(mirrorHeading[1])
            const enKey = pathOf(mirrorHeading[2])
            currentMirror = zhKey
            mirrored.set(zhKey, { en: enKey, rows: [] })
            continue
        }
        const cells = cellsOf(line)
        if (!cells || cells.every((cell) => /^:?-+:?$/.test(cell))) {
            continue
        }
        if (section.startsWith('Mirrored') && currentMirror) {
            if (cells[0] === 'zh H2') {
                continue
            }
            if (cells.length >= 2) {
                mirrored.get(currentMirror).rows.push([cells[0], cells[1]])
            }
            continue
        }
        if (section.startsWith('English-side')) {
            if (cells[0] === 'en page') {
                continue
            }
            if (cells.length >= 2) {
                const page = pathOf(cells[0])
                enOnly.set(page, [...(enOnly.get(page) ?? []), cells[1].replace(/`/g, '').trim()])
                englishSources.push({ page, title: cells[1].replace(/`/g, '').trim(), source: (cells[2] ?? '').replace(/`/g, '').trim() })
            }
            continue
        }
        if (section.startsWith('Not mirrored')) {
            if (cells[0] === 'zh source') {
                continue
            }
            const key = pathOf(cells[0])
            if (zhSet.has(key)) {
                errors.push(`Not mirrored 重复登记: ${key}`)
            }
            if (!(cells[1] ?? '').trim()) {
                errors.push(`Not mirrored 缺少理由: ${key}`)
            }
            zhSet.add(key)
        }
    }

    if (!content.includes('## Mirrored pages')) {
        errors.push('清单缺少 `## Mirrored pages` 小节')
    }
    if (!content.includes('## Not mirrored')) {
        errors.push('清单缺少 `## Not mirrored` 小节')
    }
    return { zhSet, mirrored, enOnly, englishSources, errors }
}

/** 取某文件的 H2 标题文本（跳过代码块） */
function h2Of(root, rel) {
    const file = join(root, rel)
    if (!existsSync(file)) {
        return null
    }
    return collectHeadings(readFileSync(file, 'utf8')).filter((h) => h.level === 2).map((h) => h.text)
}

/**
 * 全量校验。
 * @returns {{ errors: string[], mirrored: string[], notMirrored: number }}
 */
export function checkDesignMirror(root) {
    const manifestFile = join(root, MANIFEST_PATH)
    if (!existsSync(manifestFile)) {
        return { errors: [`缺少镜像清单: ${MANIFEST_PATH}`], mirrored: [], notMirrored: 0 }
    }
    const { zhSet, mirrored, enOnly, englishSources, errors } = parseManifest(readFileSync(manifestFile, 'utf8'))

    const zhFiles = listMd(root, join(root, ZH_ROOT))
    const enFiles = listMd(root, join(root, EN_ROOT)).filter((rel) => !rel.endsWith(MANIFEST_SELF))

    const relZh = (key) => key.replace(/^.*?docs\/design\//, '')
    const relEn = (key) => key.replace(/^.*?en-US\/design\//, '')

    // 1) 每个 zh 分片必须登记且只登记一次
    for (const rel of zhFiles) {
        const asMirror = [...mirrored.keys()].some((key) => relZh(key) === rel)
        const notMirrored = [...zhSet].some((key) => relZh(key) === rel)
        if (!asMirror && !notMirrored) {
            errors.push(`zh 分片未登记（既不在 Mirrored 也不在 Not mirrored）: ${ZH_ROOT}/${rel}`)
        }
        if (asMirror && notMirrored) {
            errors.push(`zh 分片重复登记（同时出现在 Mirrored 与 Not mirrored）: ${ZH_ROOT}/${rel}`)
        }
    }
    for (const key of [...mirrored.keys(), ...zhSet]) {
        if (!zhFiles.includes(relZh(key))) {
            errors.push(`清单引用了不存在的 zh 分片: ${key}`)
        }
    }

    // English-side 第三列：`—（英文版独有）` 或 `docs/design/<分片> §<zh H2 标题>`，两者都必须可核
    for (const entry of englishSources) {
        if (!entry.source) {
            errors.push(`English-side 行缺少 zh 对应列（应写 zh 分片 / 章节，或「—（英文版独有）」）: ${entry.page} / ${entry.title}`)
            continue
        }
        if (entry.source.startsWith('—')) {
            if (!/^—（.+）$/.test(entry.source)) {
                errors.push(`「—」必须写明英文独有原因（形如「—（英文版独有）」）: ${entry.page} / ${entry.title}`)
            }
            continue
        }
        const parts = entry.source.match(/^(docs\/design\/[^\s]+)\s*§\s*(.+)$/)
        if (!parts) {
            errors.push(`zh 对应列格式应为「docs/design/<分片> §<标题>」: ${entry.page} / ${entry.title} → ${entry.source}`)
            continue
        }
        const sourceRel = relZh(parts[1])
        if (!zhFiles.includes(sourceRel)) {
            errors.push(`zh 对应列引用了不存在的分片: ${entry.source}`)
            continue
        }
        const sourceH2 = h2Of(root, join(ZH_ROOT, sourceRel)) ?? []
        const wanted = parts[2].trim()
        if (!sourceH2.includes(wanted)) {
            errors.push(`zh 对应列引用了不存在的章节（${sourceRel}）: ${wanted}`)
        }
    }

    // 2) 每个 en 设计页必须是某个镜像的落点
    for (const rel of enFiles) {
        const hit = [...mirrored.values()].some((entry) => relEn(entry.en) === rel)
        if (!hit) {
            errors.push(`en 设计页未登记来源: ${EN_ROOT}/${rel}`)
        }
    }
    for (const entry of mirrored.values()) {
        if (!enFiles.includes(relEn(entry.en))) {
            errors.push(`镜像目标不存在: ${entry.en}`)
        }
    }

    // 3) H2 映射：zh 列 == zh 事实源 H2 全集；en 列 == 真实 H2 或显式 `—`；en 多出的必须登记
    for (const [key, entry] of mirrored) {
        const zhSource = relZh(key)
        const enRel = relEn(entry.en)
        const zhH2 = h2Of(root, join(ZH_ROOT, zhSource)) ?? []
        const enH2 = h2Of(root, join(EN_ROOT, enRel)) ?? []
        const zhColumn = entry.rows.map(([zh]) => zh)
        const enColumn = entry.rows.map(([, en]) => en)

        for (const title of zhH2) {
            if (!zhColumn.includes(title)) {
                errors.push(`H2 映射缺 zh 侧标题（${zhSource}）: ${title}`)
            }
        }
        for (const title of zhColumn) {
            if (!zhH2.includes(title)) {
                errors.push(`H2 映射引用了 zh 不存在的标题（${zhSource}）: ${title}`)
            }
        }
        for (const cell of enColumn) {
            if (cell.trim() === '—' || cell.trim() === '-') {
                errors.push(`映射表「—」必须写去向（未镜像原因 / 合并到哪一节）: ${zhSource}`)
            }
        }
        const mappedEn = enColumn.filter((cell) => !cell.startsWith('—'))
        for (const title of mappedEn) {
            if (!enH2.includes(title)) {
                errors.push(`H2 映射引用了 en 不存在的标题（${enRel}）: ${title}`)
            }
        }
        const declared = enOnly.get(entry.en) ?? []
        for (const title of enH2) {
            if (!mappedEn.includes(title) && !declared.includes(title)) {
                errors.push(`en 侧标题未登记（既未映射也未列为 en-only，${enRel}）: ${title}`)
            }
        }
        for (const title of declared) {
            if (!enH2.includes(title)) {
                errors.push(`en-only 登记引用了不存在的标题（${enRel}）: ${title}`)
            }
        }
    }

    return { errors, mirrored: [...mirrored.keys()], notMirrored: zhSet.size }
}

if (isDirectExecution(import.meta.url)) {
    const json = getCliArgs().includes('--json')
    const result = checkDesignMirror(SCRIPT_ROOT)
    if (json) {
        console.log(JSON.stringify(result, null, 2))
    } else if (result.errors.length === 0) {
        console.log(`[check-design-mirror] OK：镜像 ${result.mirrored.length} 篇 / 未镜像登记 ${result.notMirrored} 篇`)
    } else {
        console.error(`[check-design-mirror] ${result.errors.length} 处问题:`)
        for (const message of result.errors) {
            console.error(`  - ${message}`)
        }
    }
    if (result.errors.length > 0) {
        process.exit(1)
    }
}
