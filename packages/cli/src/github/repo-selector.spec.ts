import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { AppError } from '@dependfix/core'
import { readReposFile, resolveRepoList } from './repo-selector'

describe('readReposFile', () => {
    const tmpDir = resolve(__dirname, '__tmp_repo_test__')

    function writeTempFile(name: string, content: string): string {
        mkdirSync(tmpDir, { recursive: true })
        const filePath = resolve(tmpDir, name)
        writeFileSync(filePath, content, 'utf-8')
        return filePath
    }

    afterAll(() => {
        rmSync(tmpDir, { recursive: true, force: true })
    })

    it('reads repository identifiers from file (one per line)', () => {
        const file = writeTempFile('repos-valid.txt', 'owner/repo-a\nowner/repo-b\n')
        const result = readReposFile(file)
        expect(result).toEqual(['owner/repo-a', 'owner/repo-b'])
    })

    it('skips blank lines and comments', () => {
        const file = writeTempFile('repos-comments.txt', '# top comment\nowner/repo-a\n\n  \n# inline comment\nowner/repo-b\n')
        const result = readReposFile(file)
        expect(result).toEqual(['owner/repo-a', 'owner/repo-b'])
    })

    it('trims whitespace from each line', () => {
        const file = writeTempFile('repos-trim.txt', '  owner/repo-a  \n  owner/repo-b  \n')
        const result = readReposFile(file)
        expect(result).toEqual(['owner/repo-a', 'owner/repo-b'])
    })

    it('throws when file does not exist', () => {
        expect(() => readReposFile(resolve(tmpDir, 'nonexistent.txt')))
            .toThrowError(AppError)
        expect(() => readReposFile(resolve(tmpDir, 'nonexistent.txt')))
            .toThrow('Repositories file not found')
    })

    it('throws on invalid repository identifier in file', () => {
        const file = writeTempFile('repos-invalid.txt', 'owner/repo-a\nnot-a-valid-repo\nowner/repo-b\n')
        expect(() => readReposFile(file)).toThrow('Invalid repository identifier')
    })

    it('throws when file contains only comments and blank lines', () => {
        const file = writeTempFile('repos-empty.txt', '# nothing here\n# just comments\n')
        expect(() => readReposFile(file)).toThrow('No valid repository identifiers')
    })
})

describe('resolveRepoList', () => {
    it('deduplicates repository entries', () => {
        const result = resolveRepoList(['owner/a', 'owner/b', 'owner/a'])
        expect(result).toEqual(['owner/a', 'owner/b'])
    })

    it('returns empty array when no repos provided and no file', () => {
        const result = resolveRepoList([])
        expect(result).toEqual([])
    })

    it('throws on invalid repository identifier in CLI list', () => {
        expect(() => resolveRepoList(['invalid']))
            .toThrow('Invalid repository identifier')
    })
})
