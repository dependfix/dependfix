import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { distPageOf, idsOf, verifyAnchorDist } from './verify-anchor-dist.mjs'

let root
let distRoot

beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'verify-anchor-root-'))
    distRoot = join(root, '.vitepress-dist')
})

afterEach(() => {
    rmSync(root, { recursive: true, force: true })
})

const write = (rel, content) => {
    const file = join(root, rel)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, content)
}

describe('distPageOf', () => {
    it('docs 源文件映射到同名产物 html', () => {
        expect(distPageOf(join(root, 'docs/guide/quick-start.md'), distRoot, join(root, 'docs')))
            .toBe(join(distRoot, 'guide/quick-start.html'))
    })

    it('en-US 镜像映射到 dist/en-US', () => {
        expect(distPageOf(join(root, 'docs/i18n/en-US/guide/quick-start.md'), distRoot, join(root, 'docs')))
            .toBe(join(distRoot, 'en-US/guide/quick-start.html'))
    })
})

describe('idsOf', () => {
    it('抽取全部标题 id', () => {
        const ids = idsOf('<h2 id="a">A</h2><h3 id="_1-2-b">B</h3>')
        expect([...ids]).toEqual(['a', '_1-2-b'])
    })
})

describe('verifyAnchorDist', () => {
    it('锚点命中产物 id：无未命中', () => {
        write('docs/t.md', '## 5.6 交付闸门\n')
        write('docs/a.md', '[一](t.md#_5-6-交付闸门)\n')
        write('.vitepress-dist/t.html', '<h2 id="_5-6-交付闸门">5.6 交付闸门</h2>')
        const { checked, misses } = verifyAnchorDist(root, distRoot)
        expect(checked).toBe(1)
        expect(misses).toEqual([])
    })

    it('锚点未命中产物 id：报出未命中并带来源行', () => {
        write('docs/t.md', '## 5.6 交付闸门\n')
        write('docs/a.md', '[一](t.md#56-交付闸门)\n')
        write('.vitepress-dist/t.html', '<h2 id="_5-6-交付闸门">5.6 交付闸门</h2>')
        const { checked, misses } = verifyAnchorDist(root, distRoot)
        expect(checked).toBe(1)
        expect(misses).toHaveLength(1)
        expect(misses[0]).toMatchObject({ file: 'docs/a.md', anchor: '56-交付闸门' })
    })

    it('slug 口径自校验：推算 id 与产物不一致时单列（不混入锚点未命中）', () => {
        write('docs/t.md', '## 5.6 交付闸门\n')
        write('docs/a.md', '[一](t.md#_5-6-交付闸门)\n')
        // 产物侧被改造成不同 id：模拟 VitePress 升级后的 slug 规则漂移
        write('.vitepress-dist/t.html', '<h2 id="_5-6-旧规则">5.6 交付闸门</h2>')
        const { headingMismatches, misses } = verifyAnchorDist(root, distRoot)
        expect(headingMismatches).toHaveLength(1)
        expect(headingMismatches[0]).toMatchObject({ file: 'docs/t.md', index: 0, expected: '_5-6-交付闸门', actual: '_5-6-旧规则' })
        expect(misses).toHaveLength(1)
    })

    it('目标页未构建或 file-dead：跳过，不计入 checked', () => {
        write('docs/a.md', ['[一](missing.md#x)', '[二](t.md#whatever)'].join('\n'))
        write('docs/t.md', '## 别的标题\n')
        const { checked } = verifyAnchorDist(root, distRoot)
        expect(checked).toBe(0)
    })
})
