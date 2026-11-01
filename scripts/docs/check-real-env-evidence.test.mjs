import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
    checkEvidenceDir,
    CliUsageError,
    DEFAULT_DIR,
    initTemplates,
    listEvidenceFiles,
    main,
    parseCli,
    REAL_ENV_PATHS,
    isInsideRepo,
    renderTemplate,
    resolveEvidencePath,
    splitFrontmatter,
    validateEvidence,
} from './check-real-env-evidence.mjs'

const repoRoot = path.resolve(import.meta.dirname, '../..')
const tempDirs = []

const makeTempDir = () => {
    // 必须用系统临时目录：`artifacts/` 是 gitignored 且干净检出中不存在（CI 会 ENOENT）
    const dir = mkdtempSync(path.join(tmpdir(), 'real-env-test-'))
    tempDirs.push(dir)
    return dir
}

afterEach(() => {
    while (tempDirs.length > 0) {
        rmSync(tempDirs.pop(), { recursive: true, force: true })
    }
})

const frontmatter = (fields) => {
    const lines = Object.entries(fields).map(([key, value]) => `${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`)
    return `---\n${lines.join('\n')}\n---\n\n## 步骤\n\n已执行。\n`
}

const passedEvidence = (overrides = {}) => frontmatter({
    path: 'G3.8',
    status: 'passed',
    executed_at: '2026-11-01T02:00:00+08:00',
    operator: '执行角色',
    environment: 'local linux / Node 22',
    commands: ['pnpm release:preflight'],
    evidence: ['artifacts/release-preflight/preflight.json'],
    check_files: false,
    result: '三条安装路径 --version 均为 0.6.0',
    ...overrides,
})

const problemsOf = (input) => validateEvidence(input).problems

describe('splitFrontmatter', () => {
    it('拆分 frontmatter 与正文；无 frontmatter 返回 null', () => {
        expect(splitFrontmatter('---\npath: G3.1\n---\n\n正文')).toMatchObject({ body: '\n正文' })
        expect(splitFrontmatter('# 无字段')).toBeNull()
    })
})

describe('validateEvidence', () => {
    it('passed 证据字段齐全 → 通过，并返回解析后的 meta', () => {
        const result = validateEvidence({ file: 'G3.8.md', expectedPath: 'G3.8', text: passedEvidence() })
        expect(result.problems).toEqual([])
        expect(result.meta).toMatchObject({ path: 'G3.8', status: 'passed' })
    })

    it('缺 frontmatter / 非法 YAML / 非法状态都判失败', () => {
        expect(problemsOf({ file: 'G3.1.md', expectedPath: 'G3.1', text: '纯文本' })[0]).toContain('缺少 YAML frontmatter')
        expect(problemsOf({ file: 'G3.1.md', expectedPath: 'G3.1', text: '---\npath: [\n---\n' })[0]).toContain('不是合法 YAML')
        expect(problemsOf({ file: 'G3.1.md', expectedPath: 'G3.1', text: frontmatter({ path: 'G3.1', status: 'ok' }) })[0])
            .toContain('status 必须是')
    })

    it('路径未知 / 与文件名不一致 → 失败', () => {
        expect(problemsOf({ file: 'G3.9.md', expectedPath: 'G3.9', text: frontmatter({ path: 'G4.0', status: 'pending', next_action: 'x' }) })[0])
            .toContain('path 必须是 G3.0–G3.9')
        expect(problemsOf({ file: 'G3.1.md', expectedPath: 'G3.1', text: frontmatter({ path: 'G3.2', status: 'pending', next_action: 'x' }) })[0])
            .toContain('与文件名 G3.1 不一致')
    })

    it('passed 缺关键字段（commands / evidence / result）→ 逐项报出', () => {
        const problems = problemsOf({
            file: 'G3.8.md',
            expectedPath: 'G3.8',
            text: passedEvidence({ commands: [], evidence: [], result: '' }),
        })
        expect(problems.join('\n')).toContain('commands 不能为空')
        expect(problems.join('\n')).toContain('evidence 不能为空')
        expect(problems.join('\n')).toContain('result 不能为空')
    })

    it('blocked 必须写清阻塞原因与重试条件', () => {
        const base = {
            path: 'G3.8',
            status: 'blocked',
            executed_at: '2026-11-01T02:00:00+08:00',
            operator: '执行角色',
            environment: 'local',
            commands: ['docker manifest inspect'],
            result: 'GHCR 401',
        }
        expect(problemsOf({ file: 'G3.8.md', expectedPath: 'G3.8', text: frontmatter(base) }).join('\n'))
            .toContain('blocked_reason 不能为空')
        expect(validateEvidence({
            file: 'G3.8.md',
            expectedPath: 'G3.8',
            text: frontmatter({ ...base, blocked_reason: 'token 缺 read:packages', retry_condition: '拿到 token 后重跑' }),
        }).problems).toEqual([])
    })

    it('pending 只需 path / status / next_action（模板不构成通过证据）', () => {
        expect(validateEvidence({
            file: 'G3.1.md',
            expectedPath: 'G3.1',
            text: frontmatter({ path: 'G3.1', status: 'pending', next_action: '准备 token' }),
        }).problems).toEqual([])
        expect(problemsOf({
            file: 'G3.1.md',
            expectedPath: 'G3.1',
            text: frontmatter({ path: 'G3.1', status: 'pending' }),
        }).join('\n')).toContain('next_action 不能为空')
    })

    it('证据文件不存在 / 是目录 / 是空文件 → 失败；check_files: false 跳过但留 warning', () => {
        const text = frontmatter({
            path: 'G3.8',
            status: 'passed',
            executed_at: '2026-11-01T02:00:00+08:00',
            operator: 'x',
            environment: 'y',
            commands: ['a'],
            evidence: ['not-exist/foo.json'],
            result: 'ok',
        })
        expect(problemsOf({ file: 'G3.8.md', expectedPath: 'G3.8', text }).join('\n')).toContain('证据文件不存在')

        const skipped = validateEvidence({ file: 'G3.8.md', expectedPath: 'G3.8', text: passedEvidence() })
        expect(skipped.problems).toEqual([])
        expect(skipped.warnings.join('\n')).toContain('check_files: false')

        // 目录 / 空文件都不是有效证据（绝对路径允许，便于临时目录）
        const dir = makeTempDir()
        writeFileSync(path.join(dir, 'empty.json'), '')
        expect(problemsOf({
            file: 'G3.8.md',
            expectedPath: 'G3.8',
            text: passedEvidence({ check_files: true, evidence: [dir] }),
        }).join('\n')).toContain('不是非空文件')
        expect(problemsOf({
            file: 'G3.8.md',
            expectedPath: 'G3.8',
            text: passedEvidence({ check_files: true, evidence: [path.join(dir, 'empty.json')] }),
        }).join('\n')).toContain('不是非空文件')

        // 相对路径越出仓库根 → 拒绝
        expect(problemsOf({
            file: 'G3.8.md',
            expectedPath: 'G3.8',
            text: passedEvidence({ check_files: true, evidence: ['../outside.json'] }),
        }).join('\n')).toContain('相对路径须落在仓库根内')
    })

    it('仓库内相对路径被正确解析（尾分隔符回归）', () => {
        expect(resolveEvidencePath('README.md')).toBe(path.join(repoRoot, 'README.md'))
        expect(resolveEvidencePath('../outside.json')).toBeNull()
        expect(isInsideRepo(path.join(repoRoot, 'README.md'))).toBe(true)
        expect(isInsideRepo(tmpdir())).toBe(false)
        // 用真实仓库文件走一遍默认存在性校验（不能因尾分隔符误判越界）
        const result = validateEvidence({
            file: 'G3.8.md',
            expectedPath: 'G3.8',
            text: passedEvidence({ check_files: true, evidence: ['README.md'] }),
        })
        expect(result.problems).toEqual([])
        expect(result.warnings).toEqual([])
    })

    it('仓库外的绝对路径可校验但必须留 warning', () => {
        const dir = makeTempDir()
        const outside = path.join(dir, 'outside.txt')
        writeFileSync(outside, 'proof')
        const result = validateEvidence({
            file: 'G3.8.md',
            expectedPath: 'G3.8',
            text: passedEvidence({ check_files: true, evidence: [outside] }),
        })
        expect(result.problems).toEqual([])
        expect(result.warnings.join('\n')).toContain('证据位于仓库外')
    })

    it('executed_at 必须是 2000–2100 年间的 ISO 时间', () => {
        expect(problemsOf({ file: 'G3.8.md', expectedPath: 'G3.8', text: passedEvidence({ executed_at: '昨天' }) }).join('\n'))
            .toContain('executed_at 需为 2000–2100 年间的 ISO 时间')
        expect(problemsOf({ file: 'G3.8.md', expectedPath: 'G3.8', text: passedEvidence({ executed_at: '2026-11' }) }).join('\n'))
            .toContain('executed_at 需为 2000–2100 年间的 ISO 时间')
        // 未加引号的 2026 会被 YAML 解析成数字 → 明确报「需要字符串形式」
        expect(problemsOf({ file: 'G3.8.md', expectedPath: 'G3.8', text: passedEvidence({ executed_at: '2026' }) }).join('\n'))
            .toContain('executed_at 需为字符串形式的 ISO 时间')
    })
})

describe('模板生成与目录校验', () => {
    it('--init 生成 10 条模板且可被校验为 pending；重复执行跳过，force 覆盖', () => {
        const dir = makeTempDir()
        const first = initTemplates({ dir })
        expect(first.created).toHaveLength(REAL_ENV_PATHS.length)
        expect(first.skipped).toEqual([])

        const second = initTemplates({ dir })
        expect(second.created).toEqual([])
        expect(second.skipped).toHaveLength(REAL_ENV_PATHS.length)

        const files = listEvidenceFiles({ dir })
        expect(files.files).toHaveLength(REAL_ENV_PATHS.length)
        const report = checkEvidenceDir({ dir, checkFiles: false })
        expect(report.problems).toEqual([])
        expect(report.pending).toHaveLength(REAL_ENV_PATHS.length)
        expect(report.ok).toBe(true)
    })

    it('模板路径与指南小节集合一致（防清单漂移）', () => {
        const guide = readFileSync(path.join(repoRoot, 'docs/guide/real-env-matrix.md'), 'utf8')
        const headings = [...guide.matchAll(/^### (G3\.\d)\b/gm)].map((match) => match[1])
        expect(headings).toEqual(REAL_ENV_PATHS)
        for (const realEnvPath of REAL_ENV_PATHS) {
            expect(renderTemplate(realEnvPath)).not.toContain('next_action: undefined')
        }
    })

    it('空文件 / 非法 YAML 文件 → 目录校验失败且不抛异常', () => {
        const dir = makeTempDir()
        writeFileSync(path.join(dir, 'G3.1.md'), '')
        writeFileSync(path.join(dir, 'G3.2.md'), '---\npath: [\n---\n')
        const report = checkEvidenceDir({ dir, checkFiles: false })
        expect(report.ok).toBe(false)
        expect(report.problems.join('\n')).toContain('缺少 YAML frontmatter')
        expect(report.problems.join('\n')).toContain('不是合法 YAML')
    })

    it('--require / --require-all 只认 passed', () => {
        const dir = makeTempDir()
        writeFileSync(path.join(dir, 'G3.8.md'), passedEvidence())
        writeFileSync(path.join(dir, 'G3.1.md'), renderTemplate('G3.1'))

        expect(checkEvidenceDir({ dir, requirePaths: ['G3.8'], checkFiles: false }).missingRequired).toEqual([])
        const requiredPending = checkEvidenceDir({ dir, requirePaths: ['G3.1'], checkFiles: false })
        expect(requiredPending.ok).toBe(false)
        expect(requiredPending.missingRequired).toEqual(['G3.1'])
        expect(checkEvidenceDir({ dir, requireAll: true, checkFiles: false }).missingRequired).toHaveLength(REAL_ENV_PATHS.length - 1)
    })

    it('目录不存在 → found 为空（尚未开始）', () => {
        const report = checkEvidenceDir({ dir: path.join(makeTempDir(), 'nope'), checkFiles: false })
        expect(report.found).toEqual([])
        expect(report.ok).toBe(true)
    })
})

describe('parseCli / main', () => {
    const quiet = { log: () => {}, error: () => {} }

    it('默认值与 require 解析', () => {
        expect(parseCli([])).toMatchObject({ dir: DEFAULT_DIR, init: false, requireAll: false, requirePaths: [] })
        expect(parseCli(['--require=G3.1,G3.8']).requirePaths).toEqual(['G3.1', 'G3.8'])
        expect(parseCli(['--init', '--init-force'])).toMatchObject({ init: true, initForce: true })
    })

    it('未知参数 / 未知路径 / 空 require → 2（空 require 不得静默放行）', () => {
        expect(main(['--nope'], quiet)).toBe(2)
        expect(main(['--require=G4.0'], quiet)).toBe(2)
        expect(main(['--require='], quiet)).toBe(2)
        expect(main(['--require=,,'], quiet)).toBe(2)
        expect(() => parseCli(['--require='])).toThrow(CliUsageError)
    })

    it('--init 生成模板 → 0；随后默认校验 → 0（pending 不算通过）', () => {
        const dir = makeTempDir()
        expect(main(['--init', `--dir=${dir}`], quiet)).toBe(0)
        expect(existsSync(path.join(dir, 'G3.0.md'))).toBe(true)
        /* G3.0 的下一步动作必须与指南同步：Google 凭据当前不可用，不能继续引导操作者去跑三种登录。
           （同源口径：docs/guide/real-env-matrix.md 的 G3.0「当前可测范围」） */
        const g30 = readFileSync(path.join(dir, 'G3.0.md'), 'utf8')
        expect(g30).toContain('GitHub OAuth App')
        expect(g30).toContain('Google 凭据暂不可用')
        expect(g30).toContain('GitHub / OIDC 各一次')
        expect(main([`--dir=${dir}`, '--no-check-files'], quiet)).toBe(0)
        expect(main([`--dir=${dir}`, '--no-check-files', '--require-all'], quiet)).toBe(1)
    })

    it('--json 输出可解析，且包含 problems / warnings', () => {
        const dir = makeTempDir()
        initTemplates({ dir })
        writeFileSync(path.join(dir, 'G3.1.md'), '')
        const out = []
        const code = main([`--dir=${dir}`, '--json', '--no-check-files'], { log: (line) => out.push(line), error: () => {} })
        expect(code).toBe(1)
        const report = JSON.parse(out.join('\n'))
        expect(report.ok).toBe(false)
        expect(report.problems.length).toBeGreaterThan(0)
        expect(Array.isArray(report.warnings)).toBe(true)
    })

    it('--no-check-files 会在报告里留 warning（不得静默跳过）', () => {
        const dir = makeTempDir()
        initTemplates({ dir })
        const out = []
        expect(main([`--dir=${dir}`, '--no-check-files', '--json'], { log: (line) => out.push(line), error: () => {} })).toBe(0)
        const report = JSON.parse(out.join('\n'))
        expect(report.warnings.join('\n')).toContain('--no-check-files')
    })

    it('--json 下目录不可读仍是可解析 JSON（不是空 stdout）', () => {
        const dir = makeTempDir()
        const notADir = path.join(dir, 'file.txt')
        writeFileSync(notADir, 'x')
        const out = []
        const code = main([`--dir=${notADir}`, '--json'], { log: (line) => out.push(line), error: () => {} })
        expect(code).toBe(1)
        const report = JSON.parse(out.join('\n'))
        expect(report.ok).toBe(false)
        expect(report.problems[0]).toContain('读取证据目录失败')
    })

    it('--init 的 IO 错误在 --json 下也是可解析 JSON', () => {
        const dir = makeTempDir()
        const notADir = path.join(dir, 'file.txt')
        writeFileSync(notADir, 'x')
        const out = []
        const code = main(['--init', `--dir=${notADir}`, '--json'], { log: (line) => out.push(line), error: () => {} })
        expect(code).toBe(1)
        const parsed = JSON.parse(out.join('\n'))
        expect(parsed.ok).toBe(false)
        expect(parsed.problems[0]).toContain('生成模板失败')
    })

    it('--json --init 输出纯 JSON', () => {
        const dir = makeTempDir()
        const out = []
        expect(main(['--init', `--dir=${dir}`, '--json'], { log: (line) => out.push(line), error: () => {} })).toBe(0)
        const parsed = JSON.parse(out.join('\n'))
        expect(parsed.created).toHaveLength(REAL_ENV_PATHS.length)
        expect(parsed.ok).toBe(true)
    })

    it('模板正文包含下一步动作与字段占位', () => {
        const text = renderTemplate('G3.9')
        expect(text).toContain('path: G3.9')
        expect(text).toContain('next_action:')
        expect(text).toContain('## 步骤')
    })
})
