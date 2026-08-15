import { readdir, readFile } from 'node:fs/promises'
import { resolve, join, extname } from 'node:path'
import { isDirectExecution } from '../shared/cli.mjs'
import { i18nDynamicKeyPatterns } from './dynamic-key-allowlist.mjs'

const ROOT_DIR = process.cwd()
const DEFAULT_LOCALE_ROOT = resolve(ROOT_DIR, 'apps', 'platform', 'i18n', 'locales')
const DEFAULT_SCAN_ROOT = resolve(ROOT_DIR, 'apps', 'platform')
const SOURCE_EXTENSIONS = new Set(['.ts', '.js', '.mjs', '.vue'])
const DEFAULT_OUTPUT_MODE = 'all'
const DEFAULT_SUMMARY_LIMIT = 10
const IGNORED_DIRS = new Set([
    '.git',
    '.nuxt',
    '.output',
    '.vercel',
    'coverage',
    'dist',
    'docs',
    'logs',
    'node_modules',
    'packages',
    'playwright-report',
    'public',
    'static',
    'test-results',
])

const QUOTED_KEY_REGEX = /['"`]([A-Za-z][\w-]*(?:\.[\w\-[\]]+)+)['"`]/gu

export function parseListArgument(rawValue) {
    if (!rawValue) {
        return []
    }

    return rawValue
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
}

export function parseArguments(argv) {
    const options = {
        failOnMissing: false,
        failOnUnused: false,
        localeRoot: DEFAULT_LOCALE_ROOT,
        locales: [],
        modules: [],
        only: DEFAULT_OUTPUT_MODE,
        scanRoot: DEFAULT_SCAN_ROOT,
        summaryLimit: DEFAULT_SUMMARY_LIMIT,
    }

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index]

        if (arg === '--fail-on-missing') {
            options.failOnMissing = true
            continue
        }

        if (arg === '--fail-on-unused') {
            options.failOnUnused = true
            continue
        }

        if (arg.startsWith('--locale-root=')) {
            options.localeRoot = resolve(ROOT_DIR, arg.slice('--locale-root='.length))
            continue
        }

        if (arg === '--locale-root') {
            options.localeRoot = resolve(ROOT_DIR, argv[index + 1])
            index += 1
            continue
        }

        if (arg.startsWith('--scan-root=')) {
            options.scanRoot = resolve(ROOT_DIR, arg.slice('--scan-root='.length))
            continue
        }

        if (arg === '--scan-root') {
            options.scanRoot = resolve(ROOT_DIR, argv[index + 1])
            index += 1
            continue
        }

        if (arg.startsWith('--locale=')) {
            options.locales.push(...parseListArgument(arg.slice('--locale='.length)))
            continue
        }

        if (arg === '--locale') {
            options.locales.push(...parseListArgument(argv[index + 1]))
            index += 1
            continue
        }

        if (arg.startsWith('--module=')) {
            options.modules.push(...parseListArgument(arg.slice('--module='.length)))
            continue
        }

        if (arg === '--module') {
            options.modules.push(...parseListArgument(argv[index + 1]))
            index += 1
            continue
        }

        if (arg.startsWith('--only=')) {
            options.only = arg.slice('--only='.length).trim() || DEFAULT_OUTPUT_MODE
            continue
        }

        if (arg === '--only') {
            options.only = argv[index + 1]?.trim() || DEFAULT_OUTPUT_MODE
            index += 1
            continue
        }

        if (arg.startsWith('--summary-limit=')) {
            options.summaryLimit = Number(arg.slice('--summary-limit='.length))
            continue
        }

        if (arg === '--summary-limit') {
            options.summaryLimit = Number(argv[index + 1])
            index += 1
        }
    }

    options.locales = [...new Set(options.locales)].sort()
    options.modules = [...new Set(options.modules)].sort()

    if (!['all', 'missing', 'unused'].includes(options.only)) {
        throw new Error(`Unsupported --only value: ${options.only}`)
    }

    if (!Number.isInteger(options.summaryLimit) || options.summaryLimit < 0) {
        throw new Error(`Expected --summary-limit to be a non-negative integer, received: ${options.summaryLimit}`)
    }

    return options
}

export function flattenMessages(source, prefix = '') {
    const result = []

    if (Array.isArray(source)) {
        source.forEach((value, index) => {
            const key = `${prefix}[${index}]`
            if (value && typeof value === 'object') {
                result.push(...flattenMessages(value, key))
                return
            }

            result.push(key)
        })

        return result
    }

    if (!source || typeof source !== 'object') {
        if (prefix) {
            result.push(prefix)
        }
        return result
    }

    Object.entries(source).forEach(([key, value]) => {
        const nextKey = prefix ? `${prefix}.${key}` : key
        if (value && typeof value === 'object') {
            result.push(...flattenMessages(value, nextKey))
            return
        }

        result.push(nextKey)
    })

    return result
}

async function readJson(filePath) {
    return JSON.parse(await readFile(filePath, 'utf8'))
}

/**
 * 扫描 locale root 下的语言资源，兼容两种目录形态：
 * - 单文件形态（dependfix 现状）：`<locale-root>/<locale>.json`
 * - 模块化形态（未来拆分后）：`<locale-root>/<locale>/<module>.json`
 */
export async function getLocaleModules(options) {
    const entries = await readdir(options.localeRoot, { withFileTypes: true })
    const localeMap = new Map()

    const availableLocales = entries
        .filter((entry) => entry.isDirectory() || (entry.isFile() && extname(entry.name) === '.json'))
        .map((entry) => (entry.isDirectory() ? entry.name : entry.name.replace(/\.json$/u, '')))
        .sort()

    const unknownLocales = options.locales.filter((localeCode) => !availableLocales.includes(localeCode))
    if (unknownLocales.length > 0) {
        throw new Error(`Unknown locale selector(s): ${unknownLocales.join(', ')}`)
    }

    for (const entry of entries) {
        const isDirectory = entry.isDirectory()
        const isLocaleFile = entry.isFile() && extname(entry.name) === '.json'

        if (!isDirectory && !isLocaleFile) {
            continue
        }

        const localeCode = isDirectory ? entry.name : entry.name.replace(/\.json$/u, '')

        if (options.locales.length > 0 && !options.locales.includes(localeCode)) {
            continue
        }

        const moduleMap = new Map()

        if (isDirectory) {
            const localeDir = join(options.localeRoot, entry.name)
            const moduleEntries = await readdir(localeDir, { withFileTypes: true })

            for (const moduleEntry of moduleEntries) {
                if (!moduleEntry.isFile() || extname(moduleEntry.name) !== '.json') {
                    continue
                }

                const moduleName = moduleEntry.name.replace(/\.json$/u, '')
                if (options.modules.length > 0 && !options.modules.includes(moduleName)) {
                    continue
                }

                const modulePath = join(localeDir, moduleEntry.name)
                const keys = flattenMessages(await readJson(modulePath))
                moduleMap.set(moduleName, keys.sort())
            }
        } else {
            // 单文件形态：文件即整个 locale 资源，module 名统一为空串（避免按文件名命名
            // 导致两个 locale 被误判为不同 module 而交叉比较，产生重复误报）
            if (options.modules.length > 0) {
                continue
            }

            const modulePath = join(options.localeRoot, entry.name)
            const keys = flattenMessages(await readJson(modulePath))
            moduleMap.set('', keys.sort())
        }

        localeMap.set(localeCode, moduleMap)
    }

    if (options.modules.length > 0) {
        const availableModules = new Set()

        for (const modules of localeMap.values()) {
            for (const moduleName of modules.keys()) {
                availableModules.add(moduleName)
            }
        }

        const unknownModules = options.modules.filter((moduleName) => !availableModules.has(moduleName))
        if (unknownModules.length > 0) {
            throw new Error(`Unknown module selector(s): ${unknownModules.join(', ')}`)
        }
    }

    return localeMap
}

export function shouldScanSourceFile(filePath) {
    return !(/(?:^|[/\\])tests(?:[/\\]|$)|\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(filePath))
}

export async function walkSourceFiles(currentDir, files = []) {
    const entries = await readdir(currentDir, { withFileTypes: true })

    for (const entry of entries) {
        if (entry.name.startsWith('.')) {
            if (!['.github'].includes(entry.name)) {
                continue
            }
        }

        const absolutePath = join(currentDir, entry.name)
        if (entry.isDirectory()) {
            if (IGNORED_DIRS.has(entry.name)) {
                continue
            }

            await walkSourceFiles(absolutePath, files)
            continue
        }

        if (SOURCE_EXTENSIONS.has(extname(entry.name)) && shouldScanSourceFile(absolutePath)) {
            files.push(absolutePath)
        }
    }

    return files
}

export async function getReferencedKeys(options) {
    const files = await walkSourceFiles(options.scanRoot)
    const referencedKeys = new Set()

    for (const filePath of files) {
        const content = await readFile(filePath, 'utf8')
        QUOTED_KEY_REGEX.lastIndex = 0

        for (const match of content.matchAll(QUOTED_KEY_REGEX)) {
            referencedKeys.add(match[1])
        }
    }

    return referencedKeys
}

export function formatSection(title, items) {
    if (items.length === 0) {
        return `${title}: none`
    }

    return `${title}:\n${items.map((item) => `  - ${item}`).join('\n')}`
}

export function collectMissingParity(localeModules) {
    const localeCodes = [...localeModules.keys()].sort()
    const localeNames = localeCodes.filter((locale) => locale)

    if (localeNames.length < 2) {
        return []
    }

    const [baseLocale, ...otherLocales] = localeNames
    const baseModules = localeModules.get(baseLocale)
    const results = []

    for (const otherLocale of otherLocales) {
        const currentModules = localeModules.get(otherLocale)
        const moduleNames = new Set([...baseModules.keys(), ...currentModules.keys()])

        for (const moduleName of moduleNames) {
            const baseKeys = new Set(baseModules.get(moduleName) || [])
            const currentKeys = new Set(currentModules.get(moduleName) || [])

            const missingInCurrent = [...baseKeys].filter((key) => !currentKeys.has(key))
            const missingInBase = [...currentKeys].filter((key) => !baseKeys.has(key))

            missingInCurrent.forEach((key) => {
                results.push({
                    key,
                    localeCode: otherLocale,
                    moduleName,
                })
            })
            missingInBase.forEach((key) => {
                results.push({
                    key,
                    localeCode: baseLocale,
                    moduleName,
                })
            })
        }
    }

    return results.sort((left, right) => {
        const leftPath = toModulePath(left.localeCode, left.moduleName)
        const rightPath = toModulePath(right.localeCode, right.moduleName)
        return leftPath.localeCompare(rightPath) || left.key.localeCompare(right.key)
    })
}

export function collectUnusedCandidates(localeModules, referencedKeys) {
    const results = []

    for (const [localeCode, modules] of localeModules.entries()) {
        for (const [moduleName, keys] of modules.entries()) {
            for (const key of keys) {
                if (referencedKeys.has(key)) {
                    continue
                }

                if (i18nDynamicKeyPatterns.some((pattern) => pattern.test(key))) {
                    continue
                }

                results.push({
                    key,
                    localeCode,
                    moduleName,
                })
            }
        }
    }

    return results.sort((left, right) => {
        const leftPath = toModulePath(left.localeCode, left.moduleName)
        const rightPath = toModulePath(right.localeCode, right.moduleName)
        return leftPath.localeCompare(rightPath) || left.key.localeCompare(right.key)
    })
}

export function toModulePath(localeCode, moduleName) {
    return moduleName ? `${localeCode}/${moduleName}.json` : `${localeCode}.json`
}

export function formatFinding(item, kind) {
    const prefix = toModulePath(item.localeCode, item.moduleName)
    return kind === 'missing'
        ? `${prefix} is missing ${item.key}`
        : `${prefix} -> ${item.key}`
}

export function summarizeFindings(items, options) {
    const moduleHotspots = new Map()
    const localeCounts = new Map()

    for (const item of items) {
        const localeCount = localeCounts.get(item.localeCode) || 0
        localeCounts.set(item.localeCode, localeCount + 1)

        const hotspotKey = toModulePath(item.localeCode, item.moduleName)
        const hotspotCount = moduleHotspots.get(hotspotKey) || 0
        moduleHotspots.set(hotspotKey, hotspotCount + 1)
    }

    return {
        localeCounts: [...localeCounts.entries()]
            .sort((left, right) => left[0].localeCompare(right[0]))
            .map(([localeCode, count]) => `${localeCode}: ${count}`),
        scannedLocales: options.locales.length > 0 ? options.locales : [...options.availableLocales],
        scannedModules: options.modules.length > 0 ? options.modules : [...options.availableModules],
        topHotspots: [...moduleHotspots.entries()]
            .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
            .slice(0, options.summaryLimit)
            .map(([modulePath, count]) => `${modulePath}: ${count}`),
        total: items.length,
    }
}

export function formatSummary(title, summary) {
    const summaryLines = [
        `${title}:`,
        `  - total: ${summary.total}`,
        `  - scanned locales: ${summary.scannedLocales.join(', ') || 'none'}`,
        `  - scanned modules: ${summary.scannedModules.join(', ') || 'none'}`,
        `  - per-locale: ${summary.localeCounts.join(', ') || 'none'}`,
    ]

    if (summary.topHotspots.length > 0) {
        summaryLines.push('  - top hotspots:')
        summary.topHotspots.forEach((hotspot) => {
            summaryLines.push(`    - ${hotspot}`)
        })
    }

    return summaryLines.join('\n')
}

export async function runAudit(options) {
    const localeModules = await getLocaleModules(options)
    const referencedKeys = await getReferencedKeys(options)
    const availableLocales = [...localeModules.keys()].sort()
    const availableModules = [...new Set(
        [...localeModules.values()].flatMap((modules) => [...modules.keys()].filter((moduleName) => moduleName)),
    )].sort()

    const missingParity = collectMissingParity(localeModules)
    const unusedCandidates = collectUnusedCandidates(localeModules, referencedKeys)
    const showMissing = options.only === 'all' || options.only === 'missing'
    const showUnused = options.only === 'all' || options.only === 'unused'
    const output = []

    if (showMissing) {
        output.push(formatSummary('Missing parity summary', summarizeFindings(missingParity, {
            availableLocales,
            availableModules,
            locales: options.locales,
            modules: options.modules,
            summaryLimit: options.summaryLimit,
        })))
        output.push('')
        output.push(formatSection('Missing parity keys', missingParity.map((item) => formatFinding(item, 'missing'))))
    }

    if (showMissing && showUnused) {
        output.push('')
    }

    if (showUnused) {
        output.push(formatSummary('Unused candidate summary', summarizeFindings(unusedCandidates, {
            availableLocales,
            availableModules,
            locales: options.locales,
            modules: options.modules,
            summaryLimit: options.summaryLimit,
        })))
        output.push('')
        output.push(formatSection('Unused candidate keys', unusedCandidates.map((item) => formatFinding(item, 'unused'))))
    }

    return {
        missingParity,
        output: output.join('\n'),
        unusedCandidates,
    }
}

async function main() {
    const options = parseArguments(process.argv.slice(2))
    const result = await runAudit(options)

    console.info(result.output)

    if (options.failOnMissing && result.missingParity.length > 0) {
        process.exitCode = 1
    }

    if (options.failOnUnused && result.unusedCandidates.length > 0) {
        process.exitCode = 1
    }
}

if (isDirectExecution(import.meta.url)) {
    main().catch((error) => {
        console.error('Failed to audit locale keys:', error)
        process.exitCode = 1
    })
}
