import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { FixAction } from '@dependfix/core'
import {
    chunkPaths,
    collectDeclaredPaths,
    computeCommitScope,
    isCommitWhitelisted,
    isGeneratedPath,
    listChangedPaths,
    normalizeCommitPath,
    stageScopedChanges,
} from './commit-scope'

const tempDirs: string[] = []

function git(args: string[], cwd: string): string {
    return execFileSync('git', args, { cwd, stdio: 'pipe', encoding: 'utf-8' }).trim()
}

/** 建立带初始提交的临时仓库（`files` 为相对路径 → 内容）。 */
function initRepo(files: Record<string, string>): string {
    const dir = mkdtempSync(join(tmpdir(), 'dependfix-commit-scope-'))
    tempDirs.push(dir)
    git(['init', '-q', '-b', 'main'], dir)
    git(['config', 'user.name', 'test'], dir)
    git(['config', 'user.email', 'test@example.com'], dir)
    for (const [path, content] of Object.entries(files)) {
        writeTracked(dir, path, content)
    }
    git(['add', '.'], dir)
    git(['commit', '-q', '-m', 'init'], dir)
    return dir
}

function writeTracked(dir: string, path: string, content: string): void {
    const absolute = join(dir, path)
    mkdirSync(dirname(absolute), { recursive: true })
    writeFileSync(absolute, content, 'utf-8')
}

function action(overrides: Partial<FixAction> = {}): FixAction {
    return {
        type: 'dependency-upgrade',
        repository: 'owner/repo',
        target: 'lodash',
        fromVersion: '4.17.20',
        toVersion: '4.17.21',
        success: true,
        durationMs: 1,
        ...overrides,
    }
}

afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
        try {
            rmSync(dir, { recursive: true, force: true })
        } catch {
            /* ignore */
        }
    }
})

describe('normalizeCommitPath', () => {
    it('归一化 ./ 与 Windows 分隔符，保留嵌套路径', () => {
        expect(normalizeCommitPath('./src/app.ts')).toEqual({ ok: true, path: 'src/app.ts' })
        expect(normalizeCommitPath('src\\lib\\index.ts')).toEqual({ ok: true, path: 'src/lib/index.ts' })
        expect(normalizeCommitPath('a//b.ts')).toEqual({ ok: true, path: 'a/b.ts' })
        expect(normalizeCommitPath('packages/web/package.json')).toEqual({ ok: true, path: 'packages/web/package.json' })
    })

    it('拒绝绝对路径 / 父级穿越 / pathspec magic / 控制字符 / 空路径', () => {
        const rejected = ['/etc/passwd', 'C:\\Windows\\system32', '..', 'src/../../etc/x', ':(glob)**/*.ts', 'src/\u0000evil.ts', '', '.']
        for (const raw of rejected) {
            expect(normalizeCommitPath(raw).ok).toBe(false)
        }
    })
})

describe('白名单 / 生成物黑名单', () => {
    it('manifest 任意层级；lockfile 与 workspace 配置仅仓库根', () => {
        expect(isCommitWhitelisted('package.json')).toBe(true)
        expect(isCommitWhitelisted('packages/web/package.json')).toBe(true)
        expect(isCommitWhitelisted('pnpm-lock.yaml')).toBe(true)
        expect(isCommitWhitelisted('packages/web/pnpm-lock.yaml')).toBe(false)
        expect(isCommitWhitelisted('pnpm-workspace.yaml')).toBe(true)
        expect(isCommitWhitelisted('.npmrc')).toBe(true)
        expect(isCommitWhitelisted('.gitignore')).toBe(true)
        expect(isCommitWhitelisted('src/app.ts')).toBe(false)
    })

    it('生成物覆盖 .nuxtrc / 类型声明 / dist / node_modules / store / 报告目录', () => {
        for (const path of [
            '.nuxtrc',
            'packages/web/.nuxtrc',
            'auto-imports.d.ts',
            'packages/web/components.d.ts',
            '.nuxt/tsconfig.json',
            'dist/index.js',
            'packages/web/dist/index.js',
            'node_modules/lodash/index.js',
            '.pnpm-store/v3/files',
            'dependfix-reports/summary.json',
        ]) {
            expect(isGeneratedPath(path)).toBe(true)
        }
        for (const path of ['src/dist-utils.ts', 'packages/web/package.json', 'docs/dist-guide.md']) {
            expect(isGeneratedPath(path)).toBe(false)
        }
    })
})

describe('collectDeclaredPaths', () => {
    it('只取成功且非 noOp 的动作；code-scanning 用 filePath，AI patch 用 changedPaths', () => {
        const actions: FixAction[] = [
            action({ changedPaths: ['src/a.ts', 'src/b.ts'] }),
            action({ type: 'code-scanning-fix', filePath: 'src/c.ts' }),
            // 失败动作（AI patch 已回滚）不声明
            action({ success: false, changedPaths: ['src/rolled-back.ts'] }),
            // noOp 动作没有写盘
            action({ noOp: true, changedPaths: ['src/noop.ts'] }),
            // 去重
            action({ changedPaths: ['src/a.ts'] }),
        ]
        expect(collectDeclaredPaths(actions)).toEqual(['src/a.ts', 'src/b.ts', 'src/c.ts'])
    })
})

describe('listChangedPaths', () => {
    it('列出已跟踪改动 / 未跟踪文件（展开目录）与删除', async () => {
        const dir = initRepo({ 'package.json': '{}\n', 'src/app.ts': 'v1\n', 'src/gone.ts': 'bye\n' })
        writeTracked(dir, 'package.json', '{"name":"x"}\n')
        writeTracked(dir, 'src/app.ts', 'v2\n')
        rmSync(join(dir, 'src/gone.ts'))
        writeTracked(dir, 'src/new/deep.ts', 'new\n')

        const changes = await listChangedPaths(dir)
        const byPath = new Map(changes.map((change) => [change.path, change]))
        expect(byPath.get('package.json')?.untracked).toBe(false)
        expect(byPath.get('src/app.ts')?.untracked).toBe(false)
        expect(byPath.get('src/gone.ts')?.deleted).toBe(true)
        expect(byPath.get('src/new/deep.ts')?.untracked).toBe(true)
    })

    it('workDir 为仓库子目录时按子目录折算相对路径', async () => {
        const root = initRepo({ 'package.json': '{}\n', 'sub/package.json': '{}\n', 'sub/src/app.ts': 'v1\n' })
        const workDir = join(root, 'sub')
        writeTracked(workDir, 'package.json', '{"name":"sub"}\n')
        writeTracked(workDir, 'src/app.ts', 'v2\n')

        expect((await listChangedPaths(workDir)).map((change) => change.path).sort()).toEqual(['package.json', 'src/app.ts'])
    })
})

describe('computeCommitScope', () => {
    it('提交集合 = 白名单 ∪ 声明路径；生成物与未跟踪文件忽略', async () => {
        const dir = initRepo({
            'package.json': '{}\n',
            'packages/web/package.json': '{}\n',
            'pnpm-lock.yaml': 'lockfileVersion: 9\n',
            'README.md': '# repo\n',
            'src/app.ts': 'v1\n',
            'auto-imports.d.ts': '// generated\n',
        })
        writeTracked(dir, 'package.json', '{"name":"x"}\n')
        writeTracked(dir, 'packages/web/package.json', '{"name":"web"}\n')
        writeTracked(dir, 'pnpm-lock.yaml', 'lockfileVersion: 9.0\n')
        writeTracked(dir, 'src/app.ts', 'v2\n')
        // 构建产物：已跟踪的类型声明被重写 + 新增未跟踪生成物
        writeTracked(dir, 'auto-imports.d.ts', '// regenerated\n')
        writeTracked(dir, '.nuxtrc', 'compatibilityVersion=4\n')
        writeTracked(dir, 'src/generated.tmp.ts', 'tmp\n')
        writeTracked(dir, 'src/new-fix.ts', 'export const x = 1\n')

        const scope = await computeCommitScope(dir, ['src/app.ts', 'src/new-fix.ts'])
        expect(scope.paths).toEqual([
            'package.json',
            'packages/web/package.json',
            'pnpm-lock.yaml',
            'src/app.ts',
            'src/new-fix.ts',
        ])
        expect(scope.unexpected).toEqual([])
        expect(scope.ignored).toEqual(['.nuxtrc', 'auto-imports.d.ts', 'src/generated.tmp.ts'])
        expect(scope.rejected).toEqual([])
        expect(scope.missing).toEqual([])
    })

    it('未声明的已跟踪改动进入 unexpected（打印路径），白名单仍可提交', async () => {
        const dir = initRepo({ 'package.json': '{}\n', 'README.md': '# repo\n', 'src/hack.ts': 'v1\n' })
        writeTracked(dir, 'package.json', '{"name":"x"}\n')
        writeTracked(dir, 'README.md', '# hacked\n')
        writeTracked(dir, 'src/hack.ts', 'v2\n')

        const scope = await computeCommitScope(dir)
        expect(scope.paths).toEqual(['package.json'])
        expect(scope.unexpected).toEqual(['README.md', 'src/hack.ts'])
    })

    it('声明的非法路径被拒绝，其余判定照常', async () => {
        const dir = initRepo({ 'package.json': '{}\n' })
        writeTracked(dir, 'package.json', '{"name":"x"}\n')

        const scope = await computeCommitScope(dir, ['../escape.ts', '/abs.ts', ':(glob)**'])
        expect(scope.paths).toEqual(['package.json'])
        expect(scope.rejected.map((item) => item.path)).toEqual(['../escape.ts', '/abs.ts', ':(glob)**'])
        expect(scope.rejected.every((item) => item.reason.length > 0)).toBe(true)
    })

    it('声明但无对应改动 → missing（不阻断），空集合单独判定', async () => {
        const dir = initRepo({ 'package.json': '{}\n' })
        const scope = await computeCommitScope(dir, ['src/not-changed.ts'])
        expect(scope.paths).toEqual([])
        expect(scope.missing).toEqual(['src/not-changed.ts'])
    })

    it('声明路径按字面量暂存：文件名含 glob 元字符不会连带同目录匹配文件', async () => {
        const dir = initRepo({ 'package.json': '{}\n', 'src/a[1].ts': 'v1\n' })
        writeTracked(dir, 'src/a[1].ts', 'v2\n')
        // 同目录的未跟踪文件会被 `src/a[1].ts` 的 glob 匹配（`[1]` → `1`）：不得被 `git add` 带入
        writeTracked(dir, 'src/a1.ts', 'decoy\n')

        const scope = await stageScopedChanges(dir, ['src/a[1].ts'])

        expect(scope.staged).toEqual(['src/a[1].ts'])
        expect(git(['diff', '--cached', '--name-only'], dir)).toBe('src/a[1].ts')
    })

    it('未合并冲突 → 拒绝提交（git add 会静默「解决」冲突）', async () => {
        const dir = initRepo({ 'conflict.txt': 'base\n' })
        git(['checkout', '-q', '-b', 'side'], dir)
        writeTracked(dir, 'conflict.txt', 'side\n')
        git(['commit', '-q', '-am', 'side'], dir)
        git(['checkout', '-q', 'main'], dir)
        writeTracked(dir, 'conflict.txt', 'main\n')
        git(['commit', '-q', '-am', 'main'], dir)
        try {
            execFileSync('git', ['merge', 'side'], { cwd: dir, stdio: 'pipe' })
        } catch {
            // 预期冲突
        }

        expect((await listChangedPaths(dir)).some((change) => change.conflicted)).toBe(true)
        await expect(stageScopedChanges(dir)).rejects.toThrowError(/unresolved merge conflict/)
    })

    it('workDir 为子目录时，仓库根已暂存改动 → 拒绝（git commit 会连带提交索引）', async () => {
        const root = initRepo({ 'root.ts': 'v1\n', 'sub/package.json': '{}\n' })
        writeTracked(root, 'root.ts', 'v2\n')
        git(['add', 'root.ts'], root)
        const workDir = join(root, 'sub')
        writeTracked(workDir, 'package.json', '{"name":"sub"}\n')

        expect((await listChangedPaths(workDir)).some((change) => change.outside && change.staged)).toBe(true)
        await expect(stageScopedChanges(workDir)).rejects.toThrowError(/outside workDir/)
    })

    it('索引区已暂存的越界改动（生成物）→ 拒绝提交，且不擅自 reset 用户暂存区', async () => {
        const dir = initRepo({ 'package.json': '{}\n', 'auto-imports.d.ts': '// v1\n' })
        writeTracked(dir, 'auto-imports.d.ts', '// v2\n')
        git(['add', 'auto-imports.d.ts'], dir)
        writeTracked(dir, 'package.json', '{"name":"x"}\n')

        const scope = await computeCommitScope(dir)
        expect(scope.staged).toEqual(['auto-imports.d.ts'])
        await expect(stageScopedChanges(dir)).rejects.toThrowError(/staged change\(s\) outside the commit scope/)
        // 用户暂存区未被 reset（不销毁本地状态）
        expect(git(['diff', '--cached', '--name-only'], dir)).toBe('auto-imports.d.ts')
    })

    it('删除的已跟踪文件未经声明 → unexpected（重命名不会绕过检测）', async () => {
        const dir = initRepo({ 'package.json': '{}\n', 'src/old.ts': 'v1\n' })
        rmSync(join(dir, 'src/old.ts'))

        const scope = await computeCommitScope(dir)
        expect(scope.unexpected).toEqual(['src/old.ts'])
    })

    // 白名单放行的是「内容改动」，不是删除：锁文件 / 清单被删永远不是修复产物。
    // 事故形态：pnpm 在 node_modules 已最新时不重建被移出的锁文件，工作树只剩删除。
    it('白名单文件被删除 → unexpected（拒绝把删除发布成修复）', async () => {
        const dir = initRepo({
            'package.json': '{}\n',
            'pnpm-lock.yaml': 'lockfileVersion: 9.0\n',
            'pnpm-workspace.yaml': 'packages: []\n',
        })
        rmSync(join(dir, 'pnpm-lock.yaml'))
        rmSync(join(dir, 'pnpm-workspace.yaml'))

        const scope = await computeCommitScope(dir)
        expect(scope.paths).toEqual([])
        expect(scope.unexpected).toEqual(['pnpm-lock.yaml', 'pnpm-workspace.yaml'])
        await expect(stageScopedChanges(dir)).rejects.toThrowError(/undeclared tracked change/)
    })
})

describe('chunkPaths', () => {
    it('按固定大小切分，保持顺序', () => {
        const paths = ['a', 'b', 'c', 'd', 'e']
        expect(chunkPaths(paths, 2)).toEqual([['a', 'b'], ['c', 'd'], ['e']])
        expect(chunkPaths([], 2)).toEqual([])
    })
})
