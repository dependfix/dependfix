/**
 * regression-window.mjs
 * 回归日志窗口管理工具模块
 *
 * 管理 artifacts/regression/current.md 文件的读写和滚动归档逻辑（证据产物，gitignored）。
 * 用于周期性回归检查的结果记录和窗口维护。
 *
 * 参考: momei 项目的 scripts/shared/regression-window.mjs 实现
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const REGRESSION_WINDOW_RELATIVE_PATH = path.join('artifacts', 'regression', 'current.md')
const FIRST_RECORD_HEADING_PATTERN = /^## \d{4}-\d{2}-\d{2} /mu
const FIRST_MANAGED_BLOCK_MARKER = '<!-- regression-window:start:'

/**
 * 转义正则表达式特殊字符
 * @param {string} value - 需要转义的字符串
 * @returns {string} 转义后的字符串
 */
function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
}

/**
 * 构建受管理的回归记录块
 * @param {object} entry - 回归记录条目
 * @param {string} entry.id - 记录唯一标识符
 * @param {string} entry.title - 记录标题
 * @param {string} entry.body - 记录正文内容
 * @returns {string} 格式化后的记录块
 */
function buildManagedEntryBlock({ body, id, title }) {
    return [
        `<!-- regression-window:start:${id} -->`,
        `## ${title}`,
        '',
        body.trim(),
        '',
        `<!-- regression-window:end:${id} -->`,
    ].join('\n')
}

/**
 * 解析回归日志窗口文件路径
 * @param {string} [projectRoot=process.cwd()] - 项目根目录
 * @returns {string} 回归日志窗口文件的绝对路径
 */
export function resolveRegressionWindowPath(projectRoot = process.cwd()) {
    return path.resolve(projectRoot, REGRESSION_WINDOW_RELATIVE_PATH)
}

/**
 * 计算从一个文件到另一个文件的相对路径（POSIX 格式）
 * @param {string} fromFilePath - 起始文件路径
 * @param {string} toFilePath - 目标文件路径
 * @returns {string} POSIX 格式的相对路径
 */
export function toPosixRelativePath(fromFilePath, toFilePath) {
    return path.relative(path.dirname(fromFilePath), toFilePath).split(path.sep).join('/')
}

/**
 * 计算新记录块的插入位置（顶层，永不落在上一条记录的受管块内部）。
 *
 * 受管块以 `<!-- regression-window:start:<id> -->` 开头、其 `## YYYY-MM-DD` 标题在块**内部**：
 * 只按「第一条 `## ` 标题」定位会把新块插进上一条记录的 start / end 标记之间（嵌套污染受管块）。
 * 故取「首个受管块 start 标记」与「首个日期标题」中更早的一个作为插入点。
 * @param {string} content - 当前文件内容
 * @returns {number} 插入位置（-1 表示文件内无记录标题，应追加到末尾）
 */
function findInsertionIndex(content) {
    const firstRecordMatch = FIRST_RECORD_HEADING_PATTERN.exec(content)
    const firstManagedIndex = content.indexOf(FIRST_MANAGED_BLOCK_MARKER)

    if (firstManagedIndex === -1) {
        return firstRecordMatch ? firstRecordMatch.index : -1
    }

    if (!firstRecordMatch) {
        return firstManagedIndex
    }

    return Math.min(firstRecordMatch.index, firstManagedIndex)
}

/**
 * 更新或插入回归日志窗口内容
 * @param {string} content - 当前文件内容
 * @param {object} entry - 回归记录条目
 * @param {string} entry.id - 记录唯一标识符
 * @param {string} entry.title - 记录标题
 * @param {string} entry.body - 记录正文内容
 * @returns {string} 更新后的文件内容
 */
export function upsertRegressionWindowContent(content, entry) {
    const nextContent = content.trimEnd()
    const block = buildManagedEntryBlock(entry)
    const startMarker = `<!-- regression-window:start:${entry.id} -->`
    const endMarker = `<!-- regression-window:end:${entry.id} -->`
    const markerPattern = new RegExp(`${escapeRegExp(startMarker)}[\\s\\S]*?${escapeRegExp(endMarker)}\\n?`, 'u')

    // 如果已存在相同 ID 的记录，则替换
    if (markerPattern.test(nextContent)) {
        return `${nextContent.replace(markerPattern, `${block}\n`).trimEnd()}\n`
    }

    const insertionIndex = findInsertionIndex(nextContent)

    // 如果没有找到记录，则追加到文件末尾
    if (insertionIndex === -1) {
        return `${nextContent}\n\n${block}\n`
    }

    // 在第一条记录（或其受管块标记）之前插入新记录
    const before = nextContent.slice(0, insertionIndex).trimEnd()
    const after = nextContent.slice(insertionIndex).trimStart()

    return `${before}\n\n${block}\n\n${after}`
}

/**
 * 更新或插入回归日志窗口条目
 * @param {object} entry - 回归记录条目
 * @param {object} [options={}] - 选项
 * @param {string} [options.projectRoot] - 项目根目录
 * @param {string} [options.regressionWindowPath] - 回归日志窗口文件路径
 * @returns {Promise<object>} 包含回归日志窗口文件路径的对象
 */
export async function upsertRegressionWindowEntry(entry, options = {}) {
    const projectRoot = options.projectRoot ?? process.cwd()
    const regressionWindowPath = options.regressionWindowPath ?? resolveRegressionWindowPath(projectRoot)
    // CI 首跑 / 清理 artifacts 后目录与文件均不存在：自动初始化，避免 ENOENT 阻断整轮回归。
    await mkdir(path.dirname(regressionWindowPath), { recursive: true })
    let currentContent
    try {
        currentContent = await readFile(regressionWindowPath, 'utf8')
    } catch (error) {
        if (error?.code !== 'ENOENT') {
            throw error
        }
        currentContent = '# 周期性回归日志窗口\n'
    }
    const nextContent = upsertRegressionWindowContent(currentContent, entry)

    await writeFile(regressionWindowPath, nextContent, 'utf8')

    return {
        regressionWindowPath,
    }
}
