/**
 * i18n locale 错位污染检测工具。
 *
 * 检测逻辑：对比 zh-CN.json 与 en-US.json 两个 locale 文件，识别「同一 key 在两个 locale 取值完全相等」
 * 这种情况通常意味着 i18n insert 时 anchor 错位（如 en-US 段尾部被 zh-CN 中文改写）。
 * 详见 [经验归档 §五十六 Phase 4 B1](https://github.com/CaoMeiYouRen/dependfix/blob/master/docs/design/governance/experience-archive.md)：
 * en-US.json `alerts.errors.loadFailed` 被中文污染。
 *
 * 排除规则（ignorePatterns）：值为以下模式时不报警
 * - 空字符串（占位符）
 * - 仅包含 ASCII 字母数字 + 下划线 + 连字符 + 数字（如版本号、产品名 "dependfix"）
 * - 数字 / 布尔字面量
 *
 * 调用方式：
 * - 直接执行：`node scripts/i18n/i18n-anchor-check.mjs`
 * - npm script：`pnpm i18n:check:anchor`
 * - 返回值：exit 0 = 全部对称 / exit 1 = 有错位
 */

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { isDirectExecution, parseCliOptions } from '../shared/cli.mjs'

const ROOT_DIR = process.cwd()
const DEFAULT_LOCALE_ROOT = resolve(ROOT_DIR, 'apps', 'platform', 'i18n', 'locales')
const DEFAULT_LOCALES = ['zh-CN', 'en-US']

/**
 * 扁平化嵌套对象为 key=value 对（key 用 . 拼接）
 * 例如 { a: { b: 'hello' } } → [['a.b', 'hello']]
 */
const flatten = (obj, prefix = '') =>
    Object.entries(obj).flatMap(([k, v]) => {
        const key = prefix ? `${prefix}.${k}` : k
        if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
            return flatten(v, key)
        }
        return [[key, v]]
    })

/**
 * 默认 ignorePatterns：值为以下模式时不报警
 * - 仅包含 [a-zA-Z0-9_-] + 空格（如产品名 dependfix、版本号 1.2.3、字段名 snake_case、技术术语 PR Checks）
 * - 数字 / 布尔字面量
 *
 * 注意：纯 ASCII 字符串（含空格）通常不需要翻译（产品名、版本号、技术术语、状态码），
 * 中文字符串通常需要翻译。值相等 + 不是纯 ASCII 字符串 = 大概率是 anchor 错位污染。
 */
const DEFAULT_IGNORE_PATTERNS = [
    /^[\s\-_:./A-Za-z0-9*]+$/, // 仅 ASCII 字母数字 + 常见符号（含 * placeholder 如 "Owner *"，产品名/版本号/技术术语）
    /^\d+(\.\d+)*$/, // 数字（含小数）
    /^(true|false|null|undefined)$/i, // 布尔 / null
    /^\s*$/, // 空白
    // i18n 复合格式占位符（如 "{percent}%" / "{count, number}" / "{date, date}"）
    // 占位符本身不需要翻译（值两边相同是合理的）
    /^\{[\w]+(?:\s*,\s*\w+)?\}.*$/,
    // 常见 SVG / 路径占位符
    /^[\s<>/A-Za-z0-9_-]+$/, // 含 HTML 标签简化字符类
]

/**
 * 检查值是否包含中文（CJK 字符范围）
 * 用于判断 anchor 错位污染：en-US locale 中出现中文字符串 = 大概率污染
 */
const containsChinese = (value) => /[\u4e00-\u9fff]/.test(value)

/**
 * 检查 key 路径是否应该忽略：
 * - key 末尾含 locale 名称（.zh-CN / .en / .en-US 等）：结构化本地化数据内部字段
 * - 例：serverErrors.UNAUTHORIZED.zh-CN（值是错误消息的中文版，不应单独检测）
 */
const isLocaleInternalKey = (key) => {
    const lastSegment = key.split('.').pop()
    return /^(zh-CN|en-US|en|ja-JP|ko-KR)$/.test(lastSegment)
}

/**
 * 检查值是否需要忽略（应被视为合理相等）
 * @param {unknown} value - locale 值
 * @param {string} localeName - locale 名称（如 'zh-CN' / 'en-US'）
 * @param {RegExp[]} ignorePatterns - 忽略模式
 * @returns {boolean} true = 忽略（合理相等）/ false = 需要报警
 */
export const shouldIgnore = (value, localeName = '', ignorePatterns = DEFAULT_IGNORE_PATTERNS) => {
    if (value === null || value === undefined) {
        return true
    }
    if (typeof value !== 'string') {
        // 数字 / 布尔 / 对象等非字符串值：i18n 不强制翻译（数字字面量、布尔等）
        return true
    }
    // 模式匹配（如纯 ASCII 字符串）：忽略
    if (ignorePatterns.some((pattern) => pattern.test(value))) {
        return true
    }
    // en-US locale 中出现中文字符串 = 大概率 anchor 错位污染（即便与 zh-CN 相等）
    if (localeName === 'en-US' && containsChinese(value)) {
        return false
    }
    return false
}

/**
 * 加载并解析 locale 文件为 Map<key, value>
 * @param {string} localePath - locale 文件绝对路径
 * @returns {Promise<Map<string, unknown>>}
 */
export const loadLocaleMap = async (localePath) => {
    const content = await readFile(localePath, 'utf-8')
    const parsed = JSON.parse(content)
    return new Map(flatten(parsed))
}

/**
 * 对比两个 locale Map，找出值相等的 key
 * @param {Map<string, unknown>} localeA - locale A（如 zh-CN）
 * @param {string} localeAName - locale A 名称
 * @param {Map<string, unknown>} localeB - locale B（如 en-US）
 * @param {string} localeBName - locale B 名称
 * @param {RegExp[]} ignorePatterns - 忽略模式
 * @returns {string[]} 错位 key 列表（值相等且不忽略）
 */
export const findSuspiciousMatches = (
    localeA,
    localeAName,
    localeB,
    localeBName,
    ignorePatterns = DEFAULT_IGNORE_PATTERNS,
) => {
    const suspicious = []
    for (const [key, valueA] of localeA) {
        if (!localeB.has(key)) {
            // key 仅存在于 A locale：不算错位（迁移期常见）
            continue
        }
        // key 路径以 locale 名称结尾：跳过（结构化本地化数据内部字段，如 serverErrors.UNAUTHORIZED.zh-CN）
        if (isLocaleInternalKey(key)) {
            continue
        }
        const valueB = localeB.get(key)
        if (valueA !== valueB) {
            continue
        }
        // 值相等：检查是否忽略
        // 检查 locale B（en-US）值是否含中文（含中文 = 污染）
        if (!shouldIgnore(valueB, localeBName, ignorePatterns)) {
            suspicious.push(key)
        }
    }
    return suspicious
}

export const parseArguments = (argv) =>
    parseCliOptions(argv, {
        defaults: {
            format: 'text',
            localeRoot: DEFAULT_LOCALE_ROOT,
            locales: DEFAULT_LOCALES,
        },
        values: {
            '--format': {
                key: 'format',
                allowedValues: ['text', 'json'],
                parse: (value) => value,
            },
            '--locale-root': {
                key: 'localeRoot',
                parse: (value) => value,
            },
            '--locales': {
                key: 'locales',
                parse: (value) => value.split(',').map((s) => s.trim()).filter(Boolean),
            },
        },
    })

export const main = async (argv = process.argv) => {
    const options = parseArguments(argv)
    const { localeRoot, locales, format } = options

    if (locales.length < 2) {
        throw new Error('i18n-anchor-check 需要至少 2 个 locale 进行对比（默认 zh-CN + en-US）')
    }

    const localeMaps = await Promise.all(
        locales.map(async (locale) => {
            const path = resolve(localeRoot, `${locale}.json`)
            return [locale, await loadLocaleMap(path)]
        }),
    )
    const localeNames = localeMaps.map(([name]) => name)
    const localeEntries = localeMaps.map(([, map]) => map)

    // 两两对比所有 locale 对（默认 zh-CN + en-US 仅一对；支持多 locale 扩展）
    const mismatches = []
    for (let i = 0; i < localeEntries.length; i++) {
        for (let j = i + 1; j < localeEntries.length; j++) {
            const suspicious = findSuspiciousMatches(
                localeEntries[i],
                localeNames[i],
                localeEntries[j],
                localeNames[j],
            )
            for (const key of suspicious) {
                mismatches.push({ key, localeA: localeNames[i], localeB: localeNames[j] })
            }
        }
    }

    if (format === 'json') {
        process.stdout.write(`${JSON.stringify({ mismatches }, null, 2)}\n`)
    } else if (mismatches.length > 0) {
        process.stderr.write(`i18n-anchor-check: 发现 ${mismatches.length} 处 locale 错位：\n`)
        for (const { key, localeA, localeB } of mismatches) {
            process.stderr.write(`  - ${key} (${localeA} == ${localeB})\n`)
        }
    } else {
        process.stdout.write('i18n-anchor-check: OK\n')
    }

    return mismatches.length === 0 ? 0 : 1
}

if (isDirectExecution(import.meta.url)) {
    main(process.argv)
        .then((code) => process.exit(code))
        .catch((err) => {
            process.stderr.write(`i18n-anchor-check error: ${err.message}\n`)
            process.exit(2)
        })
}
