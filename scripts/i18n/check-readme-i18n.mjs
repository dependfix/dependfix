#!/usr/bin/env node
// check-readme-i18n.mjs — README bidirectional link + section structure consistency gate
//
// Validates (todo.md §M26.3 + docs-and-readme-i18n.md §4.3):
// 1. Each packages/*/README.md top contains the i18n switch marker
// 2. README.md and README.en-US.md link to each other
// 3. README.md and README.en-US.md have the same heading hierarchy (levels)
//
// Exit code: 0 = pass; 1 = fail

import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { execSync } from 'node:child_process'
import { isDirectExecution } from '../shared/cli.mjs'

export const SWITCH_MARKER = '<!-- i18n: switch -->'

export function getRepoRoot() {
    return execSync('git rev-parse --show-toplevel', { encoding: 'utf-8' }).trim()
}

export function listReadmes(repoRoot) {
    const out = execSync('git ls-files "packages/*/README*.md"', { cwd: repoRoot, encoding: 'utf-8' }).trim()
    return out.split('\n').filter(Boolean)
}

export function extractHeadings(content) {
    const lines = content.split('\n')
    const headings = []
    for (const line of lines) {
        const m = line.match(/^(#{1,6})\s+(.+?)\s*$/)
        if (m) {
            headings.push({ level: m[1].length, text: m[2].trim() })
        }
    }
    return headings
}

export function checkFile(readmePath, repoRoot, errors) {
    const absPath = join(repoRoot, readmePath)
    if (!existsSync(absPath)) {
        return
    }

    const content = readFileSync(absPath, 'utf-8')
    const isChinese = readmePath.endsWith('/README.md')
    const counterpartExt = isChinese ? '.en-US.md' : '.md'
    const counterpartPath = readmePath.replace(/\/README(?:\.en-US)?\.md$/, `/README${counterpartExt}`)

    // 1. Check i18n switch marker
    const hasMarker = content.includes(SWITCH_MARKER)
    if (!hasMarker) {
        errors.push({ file: readmePath, message: `Missing ${SWITCH_MARKER} marker (see docs/design/governance/docs-and-readme-i18n.md §4.3)` })
        return
    }

    // 2. Check mutual link (only when counterpart exists)
    const counterpartAbs = join(repoRoot, counterpartPath)
    if (!existsSync(counterpartAbs)) {
        // Chinese-only README: allow placeholder comment
        if (isChinese) {
            const hasPlaceholder = content.includes('English version pending')
            if (!hasPlaceholder) {
                errors.push({ file: readmePath, message: `Missing English version placeholder comment (English version pending)` })
            }
        }
        return
    }

    // Bilingual README: check mutual link
    if (isChinese) {
        if (!content.includes('./README.en-US.md')) {
            errors.push({ file: readmePath, message: `Chinese README missing English version link ./README.en-US.md` })
        }
    } else if (!content.includes('./README.md')) {
        errors.push({ file: readmePath, message: `English README missing Chinese version link ./README.md` })
    }

    // 3. Check heading structure consistency (when both bilingual exist)
    const counterpartContent = readFileSync(counterpartAbs, 'utf-8')
    const headingsSelf = extractHeadings(content)
    const headingsCounterpart = extractHeadings(counterpartContent)

    if (headingsSelf.length !== headingsCounterpart.length) {
        errors.push({
            file: readmePath,
            message: `Heading count mismatch: ${readmePath} has ${headingsSelf.length}, ${counterpartPath} has ${headingsCounterpart.length}`,
        })
    } else {
        for (let i = 0; i < headingsSelf.length; i++) {
            const self = headingsSelf[i]
            const cp = headingsCounterpart[i]
            if (self.level !== cp.level) {
                errors.push({
                    file: readmePath,
                    message: `Heading ${i + 1} level mismatch: ${readmePath} = h${self.level} "${self.text}", ${counterpartPath} = h${cp.level} "${cp.text}"`,
                })
            }
            // Don't compare text (zh vs en necessarily differ), only structure
        }
    }
}

export function main() {
    console.log('[check-readme-i18n] Checking packages/*/README*.md bidirectional links + section structure consistency...\n')

    const repoRoot = getRepoRoot()
    const readmes = listReadmes(repoRoot)
    const errors = []
    for (const r of readmes) {
        checkFile(r, repoRoot, errors)
    }

    if (errors.length === 0) {
        console.log(`[check-readme-i18n] OK: ${readmes.length} README files all pass`)
        return
    }

    console.error(`[check-readme-i18n] ${errors.length} issue(s):\n`)
    for (const e of errors) {
        console.error(`  - ${e.file}: ${e.message}`)
    }
    process.exit(1)
}

if (isDirectExecution(import.meta.url)) {
    main()
}
