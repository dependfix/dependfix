import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { checkLinks, collectTitles, isGitIgnored, isInsideGitWorkTree, looseNorm, normAnchor } from './check-links.mjs'

let root

beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'check-links-test-'))
})

afterEach(() => {
    rmSync(root, { recursive: true, force: true })
})

const write = (rel, content) => {
    const file = join(root, rel)
    mkdirSync(join(root, rel.split(/[\\/]/).slice(0, -1).join('/')), { recursive: true })
    writeFileSync(file, content)
}

describe('looseNorm', () => {
    it('lowercases and strips punctuation/symbols/whitespace', () => {
        expect(looseNorm('Hello, World!')).toBe('helloworld')
        expect(looseNorm('  中 文 标点，。！')).toBe('中文标点')
    })

    it('strips emoji and mixed symbols', () => {
        expect(looseNorm('M7.2 ✅ 已归档')).toBe('m72已归档')
    })
})

describe('normAnchor', () => {
    it('decodes URL-encoded anchors before normalization', () => {
        expect(normAnchor('hello%20world')).toBe('helloworld')
    })

    it('falls back to raw anchor on invalid encoding', () => {
        // 解码失败回退到原文，随后 looseNorm 移除 % 等标点
        expect(normAnchor('%E0%A4%A')).toBe('e0a4a')
    })
})

describe('collectTitles', () => {
    it('collects heading titles with inline code and link syntax stripped', () => {
        // 行内代码与链接语法被整段移除（非保留），随后 looseNorm 归一空白
        write('t.md', [
            '# 标题 一',
            '## 标题 `code` 二',
            '## 标题 [链接](x.md) 三',
            '### 标题 _强调_ *斜体* ~删除~ 四',
            '',
        ].join('\n'))
        const titles = collectTitles(join(root, 't.md'))
        expect(titles.has('标题一')).toBe(true)
        expect(titles.has('标题二')).toBe(true)
        expect(titles.has('标题三')).toBe(true)
        expect(titles.has('标题强调斜体删除四')).toBe(true)
    })

    it('skips headings inside fenced code blocks', () => {
        write('t.md', ['```md', '# 代码块里的标题', '```', '# 真实标题'].join('\n'))
        const titles = collectTitles(join(root, 't.md'))
        expect(titles.has('真实标题')).toBe(true)
        expect(titles.has('代码块里的标题')).toBe(false)
    })
})

describe('checkLinks', () => {
    it('passes valid relative links with existing anchors', () => {
        write('docs/a.md', '[b](b.md#标题二)\n\n[b2](./b.md)')
        write('docs/b.md', '# 标题一\n\n## 标题二')
        const { files, errors } = checkLinks(root)
        expect(files).toHaveLength(2)
        expect(errors).toEqual([])
    })

    it('reports broken relative links', () => {
        write('docs/a.md', '[missing](missing.md)')
        const { errors } = checkLinks(root)
        expect(errors).toHaveLength(1)
        expect(errors[0]).toContain('链接目标不存在: missing.md')
    })

    it('reports invalid in-file anchors', () => {
        write('docs/a.md', '[top](#不存在的标题)')
        const { errors } = checkLinks(root)
        expect(errors).toHaveLength(1)
        expect(errors[0]).toContain('站内锚点 "#不存在的标题" 在文件中找不到对应标题')
    })

    it('reports anchors missing in the target file', () => {
        write('docs/a.md', '[b](b.md#不存在的锚点)')
        write('docs/b.md', '# 标题')
        const { errors } = checkLinks(root)
        expect(errors).toHaveLength(1)
        expect(errors[0]).toContain('锚点 "#不存在的锚点" 在 b.md 中找不到对应标题')
    })

    it('rejects local absolute paths', () => {
        write('docs/a.md', '[abs](C:/Users/foo/file.md)\n\n[unix](/etc/hosts)')
        const { errors } = checkLinks(root)
        expect(errors.some((e) => e.includes('本地绝对路径') && e.includes('C:/Users/foo/file.md'))).toBe(true)
        expect(errors.some((e) => e.includes('本地绝对路径') && e.includes('/etc/hosts'))).toBe(true)
    })

    it('rejects path traversal beyond repo root', () => {
        write('docs/a.md', '[out](../../../outside.md)')
        const { errors } = checkLinks(root)
        expect(errors).toHaveLength(1)
        expect(errors[0]).toContain('路径穿越')
    })

    it('rejects personal machine paths in body text', () => {
        write('docs/a.md', '本地路径 C:\\Users\\foo\\file 见说明')
        const { errors } = checkLinks(root)
        expect(errors).toHaveLength(1)
        expect(errors[0]).toContain('正文包含本地绝对路径')
    })

    it('ignores https/mailto links and code content', () => {
        write('docs/a.md', [
            '[site](https://example.com)',
            '[mail](mailto:a@b.c)',
            '',
            // 行内代码内的纯文本路径：无 []( ) 链接语法，不应被检查
            '行内代码 `参见 docs/not-exist.md` 不应检查',
            '',
            '```md',
            '[fenced](also-not-exist.md)',
            '```',
            '',
        ].join('\n'))
        const { errors } = checkLinks(root)
        expect(errors).toEqual([])
    })

    it('excludes node_modules/.git dirs and non-md files from walk', () => {
        write('node_modules/pkg/README.md', '[x](missing.md)')
        write('.git/hooks/readme.md', '[x](missing.md)')
        write('docs/note.txt', '[x](missing.md)')
        write('docs/real.md', '正常内容')
        const { files, errors } = checkLinks(root)
        expect(files).toEqual([join(root, 'docs', 'real.md')])
        expect(errors).toEqual([])
    })
})

describe('isInsideGitWorkTree / isGitIgnored', () => {
    it('detects tmpdir as non-git work tree', () => {
        // mkdtempSync 创建的是非 git 仓库
        expect(isInsideGitWorkTree(root)).toBe(false)
        expect(isGitIgnored(join(root, 'any.md'))).toBe(false)
    })

    it('returns true for files matched by .gitignore in a real git repo', () => {
        // 用当前项目自身做真实 git 仓库探针：避免在 tmpdir 跑 git init 引入测试侧副作用
        // （git init 会创建 .git/ 目录，可能与本测试套件的并发执行冲突）
        // 当前项目 .gitignore 含 `.session`，因此该路径应被识别为 ignored
        const realProjectRoot = join(import.meta.dirname, '..')
        if (!isInsideGitWorkTree(realProjectRoot)) {
            // 极端兜底：若测试环境不在 git 项目内，跳过本测试
            return
        }
        const sessionPath = join(realProjectRoot, '.session', 'wisdom.md')
        expect(isGitIgnored(sessionPath, realProjectRoot)).toBe(true)
        // 已提交的 docs/standards 不在 .gitignore 内
        const standardsPath = join(realProjectRoot, 'docs', 'standards', 'development.md')
        expect(isGitIgnored(standardsPath, realProjectRoot)).toBe(false)
    })
})

describe('checkLinks with gitignored targets', () => {
    let gitRoot

    beforeEach(() => {
        // 临时为该 describe 套件跑 git init：tmpdir 自身不在 git work tree，
        // checkLinks 会跳过 git 忽略检查，无法验证"本地有、CI 无"场景
        gitRoot = mkdtempSync(join(tmpdir(), 'check-links-git-test-'))
        try {
            execFileSync('git', ['init', '--quiet'], { cwd: gitRoot, stdio: 'ignore' })
            execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: gitRoot, stdio: 'ignore' })
            execFileSync('git', ['config', 'user.name', 'test'], { cwd: gitRoot, stdio: 'ignore' })
        } catch (e) {
            // git 不可用时跳过（CI minimal 环境兜底）
            gitRoot = null
        }
    })

    afterEach(() => {
        if (gitRoot) {
            rmSync(gitRoot, { recursive: true, force: true })
        }
    })

    it('rejects links to gitignored files (local has / CI missing scenario)', () => {
        if (!gitRoot) {
            return // 跳过：git 不可用
        }
        // 模拟 §三十 复现：.session/wisdom.md 在 .gitignore 中 → git 排除
        // 本地 mkdtempSync 落地的文件"存在"，但被 .gitignore 标记为不入仓库
        writeFileSync(join(gitRoot, '.gitignore'), '.session/\n')
        mkdirSync(join(gitRoot, '.session'), { recursive: true })
        writeFileSync(join(gitRoot, '.session', 'wisdom.md'), '# local wisdom')
        // 不用外层 write() helper：它绑定了外层 root；这里需要写到 gitRoot
        mkdirSync(join(gitRoot, 'docs'), { recursive: true })
        writeFileSync(join(gitRoot, 'docs', 'note.md'), '教训沉淀至 [wisdom.md](../.session/wisdom.md)')
        const { errors } = checkLinks(gitRoot)
        expect(errors).toHaveLength(1)
        expect(errors[0]).toContain('.gitignore')
        expect(errors[0]).toContain('../.session/wisdom.md')
    })

    it('passes links to committed files (sanity check after git init)', () => {
        if (!gitRoot) {
            return
        }
        writeFileSync(join(gitRoot, '.gitignore'), '.session/\n')
        mkdirSync(join(gitRoot, 'docs'), { recursive: true })
        writeFileSync(join(gitRoot, 'docs', 'a.md'), '[b](b.md)')
        writeFileSync(join(gitRoot, 'docs', 'b.md'), '# ok')
        const { errors } = checkLinks(gitRoot)
        expect(errors).toEqual([])
    })
})
