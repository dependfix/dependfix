/**
 * 产品 skill 分发一致性测试：
 * packages/skills/dependfix-remediator（权威源）与 skills/dependfix-remediator（npx skills 分发）
 * 必须保持文件集合一致、内容 hash 一致（防止仅改一处导致生态分发漂移）。
 */
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const srcDir = join(here, '..', 'dependfix-remediator')
const distDir = join(here, '..', '..', '..', 'skills', 'dependfix-remediator')

function collectFiles(dir, out = []) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name)
        if (entry.isDirectory()) {
            collectFiles(full, out)
        } else {
            out.push(relative(dir, full).split('\\').join('/'))
        }
    }
    return out
}

function fileHash(filePath) {
    return createHash('sha256').update(readFileSync(filePath)).digest('hex')
}

describe('skill 分发一致性', () => {
    it('权威源与分发目录文件集合一致', () => {
        const srcFiles = collectFiles(srcDir).sort()
        const distFiles = collectFiles(distDir).sort()
        expect(distFiles).toEqual(srcFiles)
    })

    it('权威源与分发目录同名文件 hash 一致', () => {
        for (const rel of collectFiles(srcDir)) {
            expect(fileHash(join(distDir, rel)), rel).toBe(fileHash(join(srcDir, rel)))
        }
    })
})
