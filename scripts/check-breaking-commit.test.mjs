import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { checkRange, inspectMessage, isValidDate, main } from './check-breaking-commit.mjs'

const validMessage = `feat(core)!: 移除旧接口

- 旧接口已删除，调用方改用新接口

Breaking-Review: owner 2026-11-25 approved
BREAKING CHANGE: 旧接口已移除，调用方需迁移到新接口`

const tempDirs = []

const makeRepo = () => {
    const dir = mkdtempSync(join(tmpdir(), 'breaking-commit-'))
    tempDirs.push(dir)
    execFileSync('git', ['init', '-q'], { cwd: dir })
    execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir })
    execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir })
    return dir
}

const commit = (dir, message) => {
    execFileSync('git', ['commit', '-q', '--allow-empty', '-m', message], { cwd: dir })
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8' }).trim()
}

afterEach(() => {
    while (tempDirs.length > 0) {
        rmSync(tempDirs.pop(), { recursive: true, force: true })
    }
    vi.restoreAllMocks()
})

describe('inspectMessage', () => {
    it('合规破坏性提交通过', () => {
        expect(inspectMessage(validMessage)).toEqual([])
    })

    it('非破坏性 / merge / 空消息跳过', () => {
        expect(inspectMessage('feat(core): 普通提交')).toEqual([])
        expect(inspectMessage('Merge branch master into feature')).toEqual([])
        expect(inspectMessage('   ')).toEqual([])
    })

    it('正文引用模板行不误判（只有 footer 区参与判定）', () => {
        const message = 'docs(standards): 记录模板\n\n- 示例：\nBREAKING CHANGE: <破坏面说明>\n\n- 结束'
        expect(inspectMessage(message)).toEqual([])
    })

    it('BREAKING CHANGE 说明为空', () => {
        const message = 'feat(core)!: 移除旧接口\n\nBreaking-Review: owner 2026-11-25 approved\nBREAKING CHANGE:'
        expect(inspectMessage(message).join('\n')).toContain('说明为空')
    })

    it('兼容 git commit -s 追加的 Signed-off-by 块', () => {
        const withSignoff = `${validMessage}\n\nSigned-off-by: Test <test@example.com>`
        expect(inspectMessage(withSignoff)).toEqual([])
    })

    it('footer-only 破坏性提交 + Signed-off-by 不得被静默放行', () => {
        const footerOnly = 'fix(core): 调整接口\n\nBREAKING CHANGE: 旧接口已移除\n\nSigned-off-by: Test <test@example.com>'
        expect(inspectMessage(footerOnly).join('\n')).toContain('缺少 `Breaking-Review:`')
    })

    it('忽略 git commit -v 的注释行与剪刀线后裸 diff', () => {
        const annotated = `${validMessage}\n\n# 请为你的更改输入说明\n# On branch master`
        expect(inspectMessage(annotated)).toEqual([])

        const verbose = `${validMessage}\n\n# ------------------------ >8 ------------------------\ndiff --git a/a.ts b/a.ts\n+++ b/a.ts\n+BREAKING CHANGE: fake`
        expect(inspectMessage(verbose)).toEqual([])
    })

    it('缺少 Breaking-Review 记录', () => {
        const message = 'feat(core)!: 移除旧接口\n\nBREAKING CHANGE: 旧接口已移除'
        expect(inspectMessage(message).join('\n')).toContain('缺少 `Breaking-Review:`')
    })

    it('记录位于 BREAKING CHANGE 之后', () => {
        const message = 'feat(core)!: 移除旧接口\n\nBREAKING CHANGE: 旧接口已移除\nBreaking-Review: owner 2026-11-25 approved'
        expect(inspectMessage(message).join('\n')).toContain('必须位于 `BREAKING CHANGE:` 之前')
    })

    it('只写 ! 没有 footer', () => {
        const message = 'feat(core)!: 移除旧接口\n\nBreaking-Review: owner 2026-11-25 approved'
        expect(inspectMessage(message).join('\n')).toContain('缺少标准 `BREAKING CHANGE:` footer')
    })

    it('BREAKING-CHANGE 连字符形态按缺 footer 处理', () => {
        const message = 'feat(core)!: 移除旧接口\n\nBreaking-Review: owner 2026-11-25 approved\nBREAKING-CHANGE: 旧接口已移除'
        expect(inspectMessage(message).join('\n')).toContain('缺少标准 `BREAKING CHANGE:` footer')
    })

    it('确认人标识不是单 token', () => {
        const message = validMessage.replace('Breaking-Review: owner', 'Breaking-Review: Cao Mei')
        expect(inspectMessage(message).join('\n')).toContain('格式不合法')
    })

    it('日期非法', () => {
        const message = validMessage.replace('2026-11-25', '2026-02-30')
        expect(inspectMessage(message).join('\n')).toContain('日期非法')
        expect(isValidDate('2026-02-30')).toBe(false)
        expect(isValidDate('2026-02-28')).toBe(true)
    })

    it('结论不在枚举', () => {
        const message = validMessage.replace('approved', 'rejected')
        expect(inspectMessage(message).join('\n')).toContain('结论不在枚举')
    })

    it('approved-with-migration 必须有迁移路径', () => {
        const missing = validMessage.replace('approved', 'approved-with-migration')
        expect(inspectMessage(missing).join('\n')).toContain('`Migration:` 迁移路径')

        const withPath = missing.replace(
            'BREAKING CHANGE:',
            'Migration: 删除 --foo，改用 --bar（见 docs/guide/migration.md）\nBREAKING CHANGE:',
        )
        expect(inspectMessage(withPath)).toEqual([])
    })
})

describe('checkRange / main', () => {
    it('范围内任一笔违规即返回该 commit hash', () => {
        const dir = makeRepo()
        commit(dir, 'feat(core): 初始提交')
        const good = commit(dir, validMessage)
        const bad = commit(dir, 'feat(core)!: 缺少记录\n\nBREAKING CHANGE: 旧接口已移除')

        expect(checkRange('HEAD~1..HEAD', dir)).toEqual([
            { hash: bad, errors: expect.arrayContaining([expect.stringContaining('缺少 `Breaking-Review:`')]) },
        ])
        expect(checkRange('HEAD~2..HEAD~1', dir)).toEqual([])
        expect(good).toBeTruthy()
    })

    it('--message-file 合规返回 0，违规返回 1', () => {
        const dir = makeRepo()
        const validFile = join(dir, 'valid.txt')
        const invalidFile = join(dir, 'invalid.txt')
        writeFileSync(validFile, validMessage)
        writeFileSync(invalidFile, 'feat(core)!: 缺少记录\n')

        expect(main(['--message-file', validFile])).toBe(0)
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
        expect(main(['--message-file', invalidFile])).toBe(1)
        expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('[breaking-commit]'))
    })

    it('--range 违规返回 1，--help 列出两种入口', () => {
        const dir = makeRepo()
        commit(dir, 'feat(core): 初始提交')
        commit(dir, 'feat(core)!: 缺少记录\n\nBREAKING CHANGE: 旧接口已移除')

        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
        expect(main(['--range', 'HEAD~1..HEAD'], { cwd: dir })).toBe(1)
        expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('提交 '))

        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
        expect(main(['--help'])).toBe(0)
        const help = logSpy.mock.calls.flat().join('\n')
        expect(help).toContain('--message-file')
        expect(help).toContain('--range')
    })

    it('参数缺失 / 冲突 / 非法范围返回 2', () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
        expect(main([])).toBe(2)
        expect(main(['--message-file', 'a', '--range', 'HEAD~1..HEAD'])).toBe(2)
        expect(main(['--range', '-1..HEAD'])).toBe(2)
        expect(errorSpy).toHaveBeenCalled()
    })

    it('消息文件不存在返回 2，空消息文件返回 0', () => {
        const dir = makeRepo()
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
        expect(main(['--message-file', join(dir, 'missing.txt')])).toBe(2)
        expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('无法读取提交消息文件'))

        const empty = join(dir, 'empty.txt')
        writeFileSync(empty, '')
        expect(main(['--message-file', empty])).toBe(0)
    })
})
