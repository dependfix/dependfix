import { readdir, access } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { isDirectExecution } from '../shared/cli.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..', '..')
const docsRoot = path.join(projectRoot, 'docs')
const i18nRoot = path.join(docsRoot, 'i18n')
const localePattern = /^[a-z]{2}(?:-[A-Z]{2})$/

export async function pathExists(targetPath) {
    try {
        await access(targetPath)
        return true
    } catch {
        return false
    }
}

export async function listLocaleDirectories(baseDir) {
    if (!(await pathExists(baseDir))) {
        return []
    }

    const entries = await readdir(baseDir, { withFileTypes: true })
    return entries
        .filter((entry) => entry.isDirectory() && localePattern.test(entry.name))
        .map((entry) => entry.name)
}

export async function walkMarkdownFiles(baseDir, currentDir = '') {
    const targetDir = path.join(baseDir, currentDir)
    const entries = await readdir(targetDir, { withFileTypes: true })
    const files = []

    for (const entry of entries) {
        // 统一使用 posix 分隔符，保证 Windows / Linux 输出一致（后续 path.join 兼容 posix 路径）
        const relativePath = currentDir
            ? `${currentDir}/${entry.name}`
            : entry.name

        if (entry.isDirectory()) {
            files.push(...await walkMarkdownFiles(baseDir, relativePath))
            continue
        }

        if (entry.isFile() && entry.name.endsWith('.md')) {
            files.push(relativePath)
        }
    }

    return files
}

export function toDocPath(...segments) {
    return path.posix.join(...segments.map((segment) => segment.replaceAll('\\', '/')))
}

export async function collectDuplicates(docsRootPath = docsRoot, i18nRootPath = i18nRoot) {
    const locales = [...new Set([
        ...await listLocaleDirectories(docsRootPath),
        ...await listLocaleDirectories(i18nRootPath),
    ])].sort()

    const duplicates = []

    for (const locale of locales) {
        const legacyRoot = path.join(docsRootPath, locale)
        const translatedRoot = path.join(i18nRootPath, locale)

        if (!(await pathExists(legacyRoot)) || !(await pathExists(translatedRoot))) {
            continue
        }

        const legacyFiles = await walkMarkdownFiles(legacyRoot)

        for (const relativeFile of legacyFiles) {
            const translatedFile = path.join(translatedRoot, relativeFile)

            if (await pathExists(translatedFile)) {
                duplicates.push({
                    locale,
                    relativeFile: relativeFile.replaceAll('\\', '/'),
                    legacyPath: toDocPath('docs', locale, relativeFile),
                    translatedPath: toDocPath('docs', 'i18n', locale, relativeFile),
                })
            }
        }
    }

    return duplicates
}

export async function main() {
    const duplicates = await collectDuplicates()

    if (duplicates.length === 0) {
        console.info('docs i18n duplicate check passed: no legacy/i18n duplicate translated pages found.')
        return 0
    }

    console.error('docs i18n duplicate check failed: found translated pages duplicated in both legacy and i18n directories:')

    for (const duplicate of duplicates) {
        console.error(`- ${duplicate.locale}/${duplicate.relativeFile}`)
        console.error(`  legacy: ${duplicate.legacyPath}`)
        console.error(`  i18n:   ${duplicate.translatedPath}`)
    }

    process.exitCode = 1
    return 1
}

if (isDirectExecution(import.meta.url)) {
    main().catch((error) => {
        console.error('docs i18n duplicate check failed:', error)
        process.exitCode = 1
    })
}
