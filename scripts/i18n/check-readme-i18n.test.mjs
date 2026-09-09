import { existsSync, readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

vi.mock('node:fs', async (importOriginal) => {
    const actual = await importOriginal()
    return {
        ...actual,
        existsSync: vi.fn(),
        readFileSync: vi.fn(),
    }
})

vi.mock('node:child_process', async (importOriginal) => {
    const actual = await importOriginal()
    return {
        ...actual,
        execSync: vi.fn(),
    }
})

import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest'
import {
    SWITCH_MARKER,
    extractHeadings,
    listReadmes,
    checkFile,
    getRepoRoot,
    main,
} from './check-readme-i18n.mjs'

const existsSyncMock = vi.mocked(existsSync)
const readFileSyncMock = vi.mocked(readFileSync)
const execSyncMock = vi.mocked(execSync)

const REPO_ROOT = '/tmp/fake-repo'

beforeEach(() => {
    existsSyncMock.mockReset()
    readFileSyncMock.mockReset()
    execSyncMock.mockReset()
})

// ---------------------------------------------------------------------------
//  常量
// ---------------------------------------------------------------------------

describe('SWITCH_MARKER', () => {
    it('exports the i18n switch marker literal', () => {
        expect(SWITCH_MARKER).toBe('<!-- i18n: switch -->')
    })
})

// ---------------------------------------------------------------------------
//  extractHeadings — 纯函数
// ---------------------------------------------------------------------------

describe('extractHeadings', () => {
    it('returns an empty array for empty content', () => {
        expect(extractHeadings('')).toEqual([])
    })

    it('returns an empty array for content with no headings', () => {
        const content = [
            'just a paragraph',
            'another line',
            '',
            '> blockquote',
        ].join('\n')
        expect(extractHeadings(content)).toEqual([])
    })

    it('parses a single h1 heading', () => {
        expect(extractHeadings('# Title')).toEqual([
            { level: 1, text: 'Title' },
        ])
    })

    it('parses all heading levels h1 through h6', () => {
        const content = [
            '# h1 title',
            '## h2 title',
            '### h3 title',
            '#### h4 title',
            '##### h5 title',
            '###### h6 title',
        ].join('\n')
        expect(extractHeadings(content)).toEqual([
            { level: 1, text: 'h1 title' },
            { level: 2, text: 'h2 title' },
            { level: 3, text: 'h3 title' },
            { level: 4, text: 'h4 title' },
            { level: 5, text: 'h5 title' },
            { level: 6, text: 'h6 title' },
        ])
    })

    it('trims trailing whitespace from heading text', () => {
        expect(extractHeadings('# Title   ')).toEqual([
            { level: 1, text: 'Title' },
        ])
    })

    it('skips non-heading lines', () => {
        const content = [
            '# Heading',
            '',
            'paragraph line',
            '> blockquote',
            '- list item',
            '```',
            'code fence',
            '```',
            '## Another',
        ].join('\n')
        expect(extractHeadings(content)).toEqual([
            { level: 1, text: 'Heading' },
            { level: 2, text: 'Another' },
        ])
    })

    it('treats lines with no space after # as not headings (regex requires space)', () => {
        // '#Title' (no space) 不应被解析为 heading
        expect(extractHeadings('#Title')).toEqual([])
    })

    it('preserves Chinese characters in heading text', () => {
        expect(extractHeadings('# 中文标题')).toEqual([
            { level: 1, text: '中文标题' },
        ])
    })
})

// ---------------------------------------------------------------------------
//  getRepoRoot / listReadmes — 薄封装 execSync
// ---------------------------------------------------------------------------

describe('getRepoRoot', () => {
    it('returns the trimmed output of git rev-parse', () => {
        execSyncMock.mockReturnValue(`${REPO_ROOT}\n`)
        expect(getRepoRoot()).toBe(REPO_ROOT)
        expect(execSyncMock).toHaveBeenCalledWith('git rev-parse --show-toplevel', { encoding: 'utf-8' })
    })
})

describe('listReadmes', () => {
    it('returns an empty array when git ls-files output is empty', () => {
        execSyncMock.mockReturnValue('')
        expect(listReadmes(REPO_ROOT)).toEqual([])
    })

    it('returns an empty array when output is only whitespace (filtered by filter(Boolean))', () => {
        execSyncMock.mockReturnValue('\n')
        expect(listReadmes(REPO_ROOT)).toEqual([])
    })

    it('returns single-element array when output has one README', () => {
        execSyncMock.mockReturnValue('packages/core/README.md')
        expect(listReadmes(REPO_ROOT)).toEqual(['packages/core/README.md'])
    })

    it('returns multi-element array when output has multiple README files', () => {
        execSyncMock.mockReturnValue('packages/core/README.md\npackages/core/README.en-US.md\npackages/cli/README.md')
        expect(listReadmes(REPO_ROOT)).toEqual([
            'packages/core/README.md',
            'packages/core/README.en-US.md',
            'packages/cli/README.md',
        ])
    })

    it('passes cwd option to execSync', () => {
        execSyncMock.mockReturnValue('packages/core/README.md')
        listReadmes(REPO_ROOT)
        expect(execSyncMock).toHaveBeenCalledWith(
            'git ls-files "packages/*/README*.md"',
            { cwd: REPO_ROOT, encoding: 'utf-8' },
        )
    })
})

// ---------------------------------------------------------------------------
//  checkFile — 文件存在性 + marker + 互链 + heading 结构
//
//  注意：link 方向约定
//  - 中文 README（path 以 /README.md 结尾，不含 .en-US）→ 内容应包含 ./README.en-US.md
//  - 英文 README（path 含 README.en-US.md）→ 内容应包含 ./README.md
// ---------------------------------------------------------------------------

const ZH_REL = 'packages/foo/README.md'
const EN_REL = 'packages/foo/README.en-US.md'
const ZH_ABS = `${REPO_ROOT}/${ZH_REL}`
const EN_ABS = `${REPO_ROOT}/${EN_REL}`

// 通用 helper：让 existsSync 只对指定路径返回 true
function mockExistsOnly(...existingAbsPaths) {
    existsSyncMock.mockImplementation((p) => existingAbsPaths.includes(p))
}

describe('checkFile', () => {
    it('does nothing when readme file does not exist on disk', () => {
        mockExistsOnly() // 任何路径都不存在
        const errors = []
        checkFile(ZH_REL, REPO_ROOT, errors)
        expect(errors).toEqual([])
        expect(readFileSyncMock).not.toHaveBeenCalled()
    })

    it('reports missing SWITCH_MARKER for Chinese README', () => {
        mockExistsOnly(ZH_ABS)
        readFileSyncMock.mockImplementation((p) => {
            if (p === ZH_ABS) {
                return '# 标题\n'
            }
            return ''
        })
        const errors = []
        checkFile(ZH_REL, REPO_ROOT, errors)
        expect(errors).toHaveLength(1)
        expect(errors[0]).toMatchObject({
            file: ZH_REL,
            message: expect.stringContaining('Missing <!-- i18n: switch --> marker'),
        })
    })

    it('reports missing SWITCH_MARKER for English README', () => {
        mockExistsOnly(EN_ABS)
        readFileSyncMock.mockImplementation((p) => {
            if (p === EN_ABS) {
                return '# Title\n'
            }
            return ''
        })
        const errors = []
        checkFile(EN_REL, REPO_ROOT, errors)
        expect(errors).toHaveLength(1)
        expect(errors[0]).toMatchObject({
            file: EN_REL,
            message: expect.stringContaining('Missing <!-- i18n: switch --> marker'),
        })
        // marker 缺失时，checkFile 应在第一个分支就退出，不读 counterpart
        expect(existsSyncMock).toHaveBeenCalledTimes(1)
    })

    it('reports missing English placeholder when Chinese README has no EN counterpart and no placeholder', () => {
        mockExistsOnly(ZH_ABS) // counterpart 不存在
        readFileSyncMock.mockImplementation((p) => {
            if (p === ZH_ABS) {
                return `${SWITCH_MARKER}\n# 中文标题\n`
            }
            return ''
        })
        const errors = []
        checkFile(ZH_REL, REPO_ROOT, errors)
        expect(errors).toHaveLength(1)
        expect(errors[0].message).toContain('Missing English version placeholder comment')
    })

    it('passes when Chinese README has no EN counterpart but has English version pending placeholder', () => {
        mockExistsOnly(ZH_ABS)
        readFileSyncMock.mockImplementation((p) => {
            if (p === ZH_ABS) {
                return `${SWITCH_MARKER}\n<!-- English version pending -->\n# 中文标题\n`
            }
            return ''
        })
        const errors = []
        checkFile(ZH_REL, REPO_ROOT, errors)
        expect(errors).toEqual([])
    })

    it('skips placeholder check when English README has no Chinese counterpart (no error)', () => {
        mockExistsOnly(EN_ABS)
        readFileSyncMock.mockImplementation((p) => {
            if (p === EN_ABS) {
                return `${SWITCH_MARKER}\n# Title\n`
            }
            return ''
        })
        const errors = []
        checkFile(EN_REL, REPO_ROOT, errors)
        expect(errors).toEqual([])
    })

    it('reports missing English link in Chinese README when both bilingual exist', () => {
        mockExistsOnly(ZH_ABS, EN_ABS)
        readFileSyncMock.mockImplementation((p) => {
            if (p === ZH_ABS) {
                // 中文 README 缺 ./README.en-US.md 链接
                return `${SWITCH_MARKER}\n# 中文标题\n`
            }
            return `${SWITCH_MARKER}\n# Title\n`
        })
        const errors = []
        checkFile(ZH_REL, REPO_ROOT, errors)
        expect(errors.some((e) => e.message.includes('Chinese README missing English version link'))).toBe(true)
    })

    it('reports missing Chinese link in English README when both bilingual exist', () => {
        mockExistsOnly(ZH_ABS, EN_ABS)
        readFileSyncMock.mockImplementation((p) => {
            if (p === EN_ABS) {
                // 英文 README 缺 ./README.md 链接
                return `${SWITCH_MARKER}\n# Title\n`
            }
            return `${SWITCH_MARKER}\n# 中文标题\n`
        })
        const errors = []
        checkFile(EN_REL, REPO_ROOT, errors)
        expect(errors.some((e) => e.message.includes('English README missing Chinese version link'))).toBe(true)
    })

    it('reports heading count mismatch between bilingual READMEs', () => {
        mockExistsOnly(ZH_ABS, EN_ABS)
        readFileSyncMock.mockImplementation((p) => {
            if (p === ZH_ABS) {
                return `${SWITCH_MARKER}\n[English](./README.en-US.md)\n# 中文\n## 子标题\n### 三级\n`
            }
            return `${SWITCH_MARKER}\n[中文](./README.md)\n# Title\n## Subtitle\n`
        })
        const errors = []
        checkFile(ZH_REL, REPO_ROOT, errors)
        expect(errors.some((e) => e.message.includes('Heading count mismatch'))).toBe(true)
    })

    it('reports heading level mismatch between bilingual READMEs (same count, different levels)', () => {
        mockExistsOnly(ZH_ABS, EN_ABS)
        readFileSyncMock.mockImplementation((p) => {
            if (p === ZH_ABS) {
                // 1 个 h1
                return `${SWITCH_MARKER}\n[English](./README.en-US.md)\n# 中文\n`
            }
            // 1 个 h2 (level mismatch)
            return `${SWITCH_MARKER}\n[中文](./README.md)\n## Title\n`
        })
        const errors = []
        checkFile(ZH_REL, REPO_ROOT, errors)
        expect(errors.some((e) => e.message.includes('Heading 1 level mismatch'))).toBe(true)
    })

    it('passes when both bilingual READMEs have matching heading structure and mutual links', () => {
        mockExistsOnly(ZH_ABS, EN_ABS)
        readFileSyncMock.mockImplementation((p) => {
            if (p === ZH_ABS) {
                return `${SWITCH_MARKER}\n[English](./README.en-US.md)\n# 中文\n## 子标题\n`
            }
            return `${SWITCH_MARKER}\n[中文](./README.md)\n# Title\n## Subtitle\n`
        })
        const errors = []
        checkFile(ZH_REL, REPO_ROOT, errors)
        expect(errors).toEqual([])
    })
})

// ---------------------------------------------------------------------------
//  main() — 顶层 CLI 入口
//
//  mock 策略：
//  - execSync: 第一次（getRepoRoot）→ REPO_ROOT；后续（listReadmes）→ readme paths
//  - existsSync: 按 readme path 区分
//  - readFileSync: 按 readme path 区分
//  - process.exit: spy 拦截避免 vitest 进程退出
//  - console.log / console.error: spy 捕获输出
// ---------------------------------------------------------------------------

describe('main()', () => {
    let consoleLogSpy
    let consoleErrorSpy
    let exitSpy

    beforeEach(() => {
        consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
        consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
        exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined)
    })

    afterEach(() => {
        consoleLogSpy.mockRestore()
        consoleErrorSpy.mockRestore()
        exitSpy.mockRestore()
    })

    it('prints OK and does not exit when no README errors', async () => {
        // execSync 调用顺序：getRepoRoot() → listReadmes()
        execSyncMock.mockReturnValueOnce(REPO_ROOT)
        execSyncMock.mockReturnValueOnce(`${ZH_REL}\n${EN_REL}`)
        mockExistsOnly(ZH_ABS, EN_ABS)
        readFileSyncMock.mockImplementation((p) => {
            if (p === ZH_ABS) {
                return `${SWITCH_MARKER}\n[English](./README.en-US.md)\n# 中文\n`
            }
            return `${SWITCH_MARKER}\n[中文](./README.md)\n# Title\n`
        })

        await main()

        const allLogs = consoleLogSpy.mock.calls.map((c) => String(c[0])).join('\n')
        expect(allLogs).toContain('OK: 2 README files all pass')
        expect(exitSpy).not.toHaveBeenCalled()
        expect(consoleErrorSpy).not.toHaveBeenCalled()
    })

    it('prints error summary and exits with 1 when errors found', async () => {
        execSyncMock.mockReturnValueOnce(REPO_ROOT)
        execSyncMock.mockReturnValueOnce(`${ZH_REL}\n`)
        // 文件存在但内容缺 marker → 报错
        mockExistsOnly(ZH_ABS)
        readFileSyncMock.mockReturnValue('# 标题\n')

        await main()

        expect(exitSpy).toHaveBeenCalledWith(1)
        const allErrors = consoleErrorSpy.mock.calls.map((c) => String(c[0])).join('\n')
        expect(allErrors).toContain('1 issue(s):')
        expect(allErrors).toContain('Missing <!-- i18n: switch --> marker')
    })
})
