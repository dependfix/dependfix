// skills/installer 安装器测试：幂等、覆盖确认、dry-run、失败路径
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { collectFileHashes, installSkillToDir, isContentSame } from './installer'

let tempRoot: string

beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'dfx-install-'))
})

afterEach(() => {
    rmSync(tempRoot, { recursive: true, force: true })
})

function makeSource(): string {
    // 内容目录语义：直接含 SKILL.md（installSkillToDir 将其复制到 targetDir/dependfix-remediator）
    const src = join(tempRoot, 'source')
    mkdirSync(src, { recursive: true })
    writeFileSync(join(src, 'SKILL.md'), '---\nname: dependfix-remediator\n---\n# body')
    mkdirSync(join(src, 'scripts'), { recursive: true })
    writeFileSync(join(src, 'scripts', 'helper.sh'), '#!/bin/sh\necho hi')
    return src
}

describe('installSkillToDir', () => {
    it('首次安装：创建并复制（installed）', async () => {
        const src = makeSource()
        const target = join(tempRoot, 'agents')
        const result = await installSkillToDir({ sourceDir: src, targetDir: target })
        expect(result.status).toBe('installed')
        expect(existsSync(join(target, 'dependfix-remediator', 'SKILL.md'))).toBe(true)
        expect(existsSync(join(target, 'dependfix-remediator', 'scripts', 'helper.sh'))).toBe(true)
    })

    it('重复安装内容一致：幂等跳过（up-to-date）', async () => {
        const src = makeSource()
        const target = join(tempRoot, 'agents')
        await installSkillToDir({ sourceDir: src, targetDir: target })
        const second = await installSkillToDir({ sourceDir: src, targetDir: target })
        expect(second.status).toBe('up-to-date')
    })

    it('内容不一致且非交互拒绝覆盖（skipped-conflict）', async () => {
        const src = makeSource()
        const target = join(tempRoot, 'agents')
        await installSkillToDir({ sourceDir: src, targetDir: target })
        // 篡改已安装内容
        writeFileSync(join(target, 'dependfix-remediator', 'SKILL.md'), '---\nname: other\n---\n# tampered')
        const result = await installSkillToDir({
            sourceDir: src,
            targetDir: target,
            confirmOverwrite: () => false,
        })
        expect(result.status).toBe('skipped-conflict')
        // 内容未被覆盖
        expect(readFileSync(join(target, 'dependfix-remediator', 'SKILL.md'), 'utf8')).toContain('tampered')
    })

    it('内容不一致且确认覆盖：覆盖为权威源内容（installed）', async () => {
        const src = makeSource()
        const target = join(tempRoot, 'agents')
        await installSkillToDir({ sourceDir: src, targetDir: target })
        writeFileSync(join(target, 'dependfix-remediator', 'SKILL.md'), '---\nname: other\n---\n# tampered')
        const result = await installSkillToDir({
            sourceDir: src,
            targetDir: target,
            confirmOverwrite: () => true,
        })
        expect(result.status).toBe('installed')
        expect(readFileSync(join(target, 'dependfix-remediator', 'SKILL.md'), 'utf8')).toContain('name: dependfix-remediator')
    })

    it('force 覆盖跳过确认（installed）', async () => {
        const src = makeSource()
        const target = join(tempRoot, 'agents')
        await installSkillToDir({ sourceDir: src, targetDir: target })
        writeFileSync(join(target, 'dependfix-remediator', 'SKILL.md'), '# tampered')
        const result = await installSkillToDir({ sourceDir: src, targetDir: target, force: true })
        expect(result.status).toBe('installed')
    })

    it('dry-run 不写文件', async () => {
        const src = makeSource()
        const target = join(tempRoot, 'agents')
        const result = await installSkillToDir({ sourceDir: src, targetDir: target, dryRun: true })
        expect(result.status).toBe('installed')
        expect(existsSync(join(target, 'dependfix-remediator'))).toBe(false)
    })

    it('dry-run 目标已存在且一致返回 up-to-date', async () => {
        const src = makeSource()
        const target = join(tempRoot, 'agents')
        await installSkillToDir({ sourceDir: src, targetDir: target })
        const result = await installSkillToDir({ sourceDir: src, targetDir: target, dryRun: true })
        expect(result.status).toBe('up-to-date')
        expect(result.detail).toContain('dry-run')
    })

    it('dry-run 目标已存在但不一致返回 installed', async () => {
        const src = makeSource()
        const target = join(tempRoot, 'agents')
        await installSkillToDir({ sourceDir: src, targetDir: target })
        writeFileSync(join(target, 'dependfix-remediator', 'SKILL.md'), '# tampered')
        const result = await installSkillToDir({ sourceDir: src, targetDir: target, dryRun: true })
        expect(result.status).toBe('installed')
        expect(result.detail).toContain('dry-run')
    })

    it('权威源不存在：failed 不抛错', async () => {
        const result = await installSkillToDir({
            sourceDir: join(tempRoot, 'missing'),
            targetDir: join(tempRoot, 'agents'),
        })
        expect(result.status).toBe('failed')
    })
})

describe('isContentSame', () => {
    it('相同内容判定一致，不同内容判定不一致', () => {
        const a = join(tempRoot, 'a')
        const b = join(tempRoot, 'b')
        mkdirSync(a, { recursive: true })
        mkdirSync(b, { recursive: true })
        writeFileSync(join(a, 'x.md'), 'hello')
        writeFileSync(join(b, 'x.md'), 'hello')
        expect(isContentSame(a, b)).toBe(true)
        writeFileSync(join(b, 'x.md'), 'world')
        expect(isContentSame(a, b)).toBe(false)
        // 文件集合不同
        writeFileSync(join(b, 'extra.md'), 'extra')
        expect(isContentSame(a, b)).toBe(false)
    })
})

describe('collectFileHashes', () => {
    it('不存在的目录返回空 Map', () => {
        const result = collectFileHashes(join(tempRoot, 'missing'))
        expect(result.size).toBe(0)
    })

    it('收集单个文件', () => {
        const dir = join(tempRoot, 'single')
        mkdirSync(dir, { recursive: true })
        writeFileSync(join(dir, 'file.txt'), 'content')
        const result = collectFileHashes(dir)
        expect(result.size).toBe(1)
        expect(result.has('file.txt')).toBe(true)
    })

    it('递归收集嵌套文件', () => {
        const dir = join(tempRoot, 'nested')
        mkdirSync(join(dir, 'sub'), { recursive: true })
        writeFileSync(join(dir, 'root.txt'), 'root')
        writeFileSync(join(dir, 'sub', 'child.txt'), 'child')
        const result = collectFileHashes(dir)
        expect(result.size).toBe(2)
        expect(result.has('root.txt')).toBe(true)
        expect(result.has('sub/child.txt')).toBe(true)
    })

    it('相同内容产生相同 hash', () => {
        const dirA = join(tempRoot, 'hash-a')
        const dirB = join(tempRoot, 'hash-b')
        mkdirSync(dirA, { recursive: true })
        mkdirSync(dirB, { recursive: true })
        writeFileSync(join(dirA, 'file.txt'), 'same content')
        writeFileSync(join(dirB, 'file.txt'), 'same content')
        const hashA = collectFileHashes(dirA)
        const hashB = collectFileHashes(dirB)
        expect(hashA.get('file.txt')).toBe(hashB.get('file.txt'))
    })

    it('不同内容产生不同 hash', () => {
        const dirA = join(tempRoot, 'diff-a')
        const dirB = join(tempRoot, 'diff-b')
        mkdirSync(dirA, { recursive: true })
        mkdirSync(dirB, { recursive: true })
        writeFileSync(join(dirA, 'file.txt'), 'content A')
        writeFileSync(join(dirB, 'file.txt'), 'content B')
        const hashA = collectFileHashes(dirA)
        const hashB = collectFileHashes(dirB)
        expect(hashA.get('file.txt')).not.toBe(hashB.get('file.txt'))
    })

    it('空目录返回空 Map', () => {
        const dir = join(tempRoot, 'empty')
        mkdirSync(dir, { recursive: true })
        const result = collectFileHashes(dir)
        expect(result.size).toBe(0)
    })

    it('混合文件和目录', () => {
        const dir = join(tempRoot, 'mixed')
        mkdirSync(join(dir, 'subdir'), { recursive: true })
        writeFileSync(join(dir, 'file1.txt'), 'content1')
        writeFileSync(join(dir, 'subdir', 'file2.txt'), 'content2')
        const result = collectFileHashes(dir)
        expect(result.size).toBe(2)
        expect(result.has('file1.txt')).toBe(true)
        expect(result.has('subdir/file2.txt')).toBe(true)
    })
})
