/**
 * regression-window.mjs
 * 回归日志窗口管理工具模块
 *
 * 管理 docs/reports/regression/current.md 文件的读写和滚动归档逻辑。
 * 用于周期性回归检查的结果记录和窗口维护。
 *
 * 参考: momei 项目的 scripts/shared/regression-window.mjs 实现
 */

import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const REGRESSION_WINDOW_RELATIVE_PATH = path.join('docs', 'reports', 'regression', 'current.md')
const FIRST_RECORD_HEADING_PATTERN = /^## \d{4}-\d{2}-\d{2} /mu

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

    // 查找第一条记录的位置
    const firstRecordMatch = FIRST_RECORD_HEADING_PATTERN.exec(nextContent)

    // 如果没有找到记录，则追加到文件末尾
    if (!firstRecordMatch) {
        return `${nextContent}\n\n${block}\n`
    }

    // 在第一条记录之前插入新记录
    const before = nextContent.slice(0, firstRecordMatch.index).trimEnd()
    const after = nextContent.slice(firstRecordMatch.index).trimStart()

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
    const currentContent = await readFile(regressionWindowPath, 'utf8')
    const nextContent = upsertRegressionWindowContent(currentContent, entry)

    await writeFile(regressionWindowPath, nextContent, 'utf8')

    return {
        regressionWindowPath,
    }
}
