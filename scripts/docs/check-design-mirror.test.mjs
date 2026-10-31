import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { checkDesignMirror, listMd, parseManifest } from './check-design-mirror.mjs'

let root
beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'design-mirror-'))
})
afterEach(() => {
    rmSync(root, { recursive: true, force: true })
})

const write = (rel, content) => {
    const file = join(root, rel)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, content)
}

const MANIFEST = 'docs/i18n/en-US/design/mirror-manifest.md'

const writeFixture = ({ mirrored = true, notMirrored = true, map = true, enOnly = true } = {}) => {
    write('docs/design/governance/a.md', ['# A', '## 甲', '## 乙', ''].join('\n'))
    write('docs/design/governance/b.md', '# B\n')
    write('docs/i18n/en-US/design/governance/a.md', ['# A', '## Alpha', '## Extra', ''].join('\n'))
    const rows = []
    rows.push('# Manifest', '', '## Mirrored pages', '')
    if (mirrored) {
        rows.push('### docs/design/governance/a.md → docs/i18n/en-US/design/governance/a.md', '')
        rows.push('| zh H2 | en H2 |', '|:---|:---|')
        rows.push(`| 甲 | ${map ? 'Alpha' : '— not mirrored'} |`)
        rows.push(`| 乙 | ${map ? 'Alpha' : '— not mirrored'} |`)
        rows.push('')
    }
    rows.push('## English-side sections', '', '| en page | en H2 | zh 对应 |', '|:---|:---|:---|')
    if (enOnly) {
        rows.push('| `docs/i18n/en-US/design/governance/a.md` | Extra | —（英文版独有） |')
    }
    rows.push('', '## Not mirrored', '', '| zh source | 理由 |', '|:---|:---|')
    if (notMirrored) {
        rows.push('| `docs/design/governance/b.md` | 未重译 |')
    }
    write(MANIFEST, `${rows.join('\n')}\n`)
}

describe('listMd', () => {
    it('递归列出 md 并返回 POSIX 相对路径（字典序）', () => {
        write('docs/design/x/z.md', '# z\n')
        write('docs/design/a.md', '# a\n')
        expect(listMd(root, join(root, 'docs/design'))).toEqual(['a.md', 'x/z.md'])
    })
})

describe('parseManifest', () => {
    it('解析镜像来源 / H2 映射 / en-only / 未镜像四类登记', () => {
        writeFixture()
        const parsed = parseManifest(readFileSync(join(root, MANIFEST), 'utf8'))
        expect([...parsed.mirrored.keys()]).toEqual(['docs/design/governance/a.md'])
        expect(parsed.mirrored.get('docs/design/governance/a.md').en).toBe('docs/i18n/en-US/design/governance/a.md')
        expect(parsed.mirrored.get('docs/design/governance/a.md').rows).toEqual([['甲', 'Alpha'], ['乙', 'Alpha']])
        expect(parsed.enOnly.get('docs/i18n/en-US/design/governance/a.md')).toEqual(['Extra'])
        expect([...parsed.zhSet]).toEqual(['docs/design/governance/b.md'])
        expect(parsed.errors).toEqual([])
    })

    it('缺少必需小节时报错', () => {
        write(MANIFEST, '# Manifest\n')
        const parsed = parseManifest('# Manifest\n')
        expect(parsed.errors.join(' ')).toContain('Mirrored pages')
        expect(parsed.errors.join(' ')).toContain('Not mirrored')
    })
})

describe('checkDesignMirror', () => {
    it('三方一致 + H2 映射逐条对应：通过', () => {
        writeFixture()
        expect(checkDesignMirror(root).errors).toEqual([])
    })

    it('zh 分片未登记：报错', () => {
        writeFixture({ notMirrored: false })
        expect(checkDesignMirror(root).errors.join(' ')).toContain('zh 分片未登记')
    })

    it('en 设计页未登记来源：报错', () => {
        writeFixture({ mirrored: false })
        write('docs/i18n/en-US/design/governance/c.md', '# C\n')
        expect(checkDesignMirror(root).errors.join(' ')).toContain('en 设计页未登记来源')
    })

    it('H2 映射缺一条：报错', () => {
        writeFixture()
        write('docs/design/governance/a.md', ['# A', '## 甲', '## 乙', '## 丙', ''].join('\n'))
        expect(checkDesignMirror(root).errors.join(' ')).toContain('H2 映射缺 zh 侧标题')
    })

    it('映射引用 en 不存在的标题：报错', () => {
        write('docs/i18n/en-US/design/governance/a.md', ['# A', '## Alpha', '## Extra', ''].join('\n'))
        writeFixture()
        const content = readFileSync(join(root, MANIFEST), 'utf8')
            .replace('| 乙 | Alpha |', '| 乙 | Beta |')
        write(MANIFEST, content)
        expect(checkDesignMirror(root).errors.join(' ')).toContain('en 不存在的标题')
    })

    it('en 独有小节未登记：报错', () => {
        writeFixture({ enOnly: false })
        expect(checkDesignMirror(root).errors.join(' ')).toContain('en 侧标题未登记')
    })

    it('清单缺失：报错', () => {
        expect(checkDesignMirror(root).errors.join(' ')).toContain('缺少镜像清单')
    })

    it('仓库真实清单保持三方一致（4 篇镜像 / 其余 zh 分片逐条登记）', () => {
        const result = checkDesignMirror(join(process.cwd()))
        expect(result.errors).toEqual([])
        expect(result.mirrored).toHaveLength(4)
        expect(result.notMirrored).toBeGreaterThanOrEqual(60)
    })

    it('「—」未写去向：报错', () => {
        writeFixture()
        const content = readFileSync(join(root, MANIFEST), 'utf8').replace('| 乙 | Alpha |', '| 乙 | — |')
        write(MANIFEST, content)
        expect(checkDesignMirror(root).errors.join(' ')).toContain('必须写去向')
    })

    it('Not mirrored 重复登记：报错', () => {
        writeFixture()
        const content = readFileSync(join(root, MANIFEST), 'utf8')
            .replace('| `docs/design/governance/b.md` | 未重译 |', '| `docs/design/governance/b.md` | 未重译 |\n| `docs/design/governance/b.md` | 重复 |')
        write(MANIFEST, content)
        expect(checkDesignMirror(root).errors.join(' ')).toContain('重复登记')
    })

    it('English-side 第三列为空：报错', () => {
        writeFixture()
        const content = readFileSync(join(root, MANIFEST), 'utf8').replace('| Extra | —（英文版独有） |', '| Extra |  |')
        write(MANIFEST, content)
        expect(checkDesignMirror(root).errors.join(' ')).toContain('缺少 zh 对应列')
    })

    it('English-side 第三列只写裸「—」：报错', () => {
        writeFixture()
        const content = readFileSync(join(root, MANIFEST), 'utf8').replace('| Extra | —（英文版独有） |', '| Extra | — |')
        write(MANIFEST, content)
        expect(checkDesignMirror(root).errors.join(' ')).toContain('必须写明英文独有原因')
    })

    it('Not mirrored 理由为空：报错', () => {
        writeFixture()
        const content = readFileSync(join(root, MANIFEST), 'utf8').replace('| `docs/design/governance/b.md` | 未重译 |', '| `docs/design/governance/b.md` |  |')
        write(MANIFEST, content)
        expect(checkDesignMirror(root).errors.join(' ')).toContain('缺少理由')
    })
})
