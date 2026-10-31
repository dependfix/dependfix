import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { NPM_PUBLISHABLE_PACKAGES } from '../packages.config.mjs'
import {
    buildInstallProject,
    checkLockfileUsesTarballs,
    checkPackedManifest,
    CliUsageError,
    formatReport,
    main,
    parseCli,
    REQUIRED_PAYLOAD,
    runPreflight,
    tarballName,
} from './preflight.mjs'

const tempDirs = []

const makeTempDir = () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'preflight-test-'))
    tempDirs.push(dir)
    return dir
}

afterEach(() => {
    while (tempDirs.length > 0) {
        rmSync(tempDirs.pop(), { recursive: true, force: true })
    }
})

const manifest = (overrides = {}) => ({
    name: 'dependfix',
    version: '0.6.0',
    bin: { dependfix: './dist/bin.mjs' },
    main: './dist/index.mjs',
    exports: { '.': { import: './dist/index.mjs' } },
    dependencies: { '@dependfix/core': '0.6.0' },
    ...overrides,
})

const fileSet = (...entries) => new Set(entries.map((entry) => `package/${entry}`))

// 真实版本从各包 package.json 读取（避免夹具与仓库漂移）
const realVersions = Object.fromEntries(NPM_PUBLISHABLE_PACKAGES.map((p) => [
    p.pkg,
    JSON.parse(readFileSync(path.join(import.meta.dirname, '../..', p.path, 'package.json'), 'utf8')).version,
]))

const makeExec = ({ reportVersion = realVersions.dependfix, dirty = false, registryFallback = false } = {}) => (command, args, options = {}) => {
    if (command === 'git') {
        return dirty ? ' M scripts/release/preflight.mjs' : ''
    }
    if (command === 'pnpm' && args[0] === '--filter' && args[2] === 'pack') {
        const pkg = args[1]
        const outDir = args[args.indexOf('--pack-destination') + 1]
        mkdirSync(outDir, { recursive: true })
        const tarball = path.join(outDir, tarballName(pkg, realVersions[pkg]))
        writeFileSync(tarball, 'fake tarball')
        // 侧车文件供 tar 桩返回该包自己的 manifest
        writeFileSync(`${tarball}.json`, JSON.stringify({
            name: pkg,
            version: realVersions[pkg],
            bin: { [pkg === 'dependfix' ? 'dependfix' : 'x']: './dist/bin.mjs' },
            main: './dist/index.mjs',
            dependencies: {},
        }))
        return ''
    }
    if (command === 'tar' && args[0] === '-tzf') {
        return 'package/package.json\npackage/README.md\npackage/dependfix-remediator/SKILL.md\npackage/dist/bin.mjs\npackage/dist/index.mjs\n'
    }
    if (command === 'tar' && args[0] === '-xOzf') {
        return readFileSync(`${args[1]}.json`, 'utf8')
    }
    if (command === 'pnpm' && args[0] === 'install') {
        const project = JSON.parse(readFileSync(path.join(options.cwd, 'package.json'), 'utf8'))
        const entries = Object.entries(project.dependencies).map(([name, spec]) => {
            const rel = path.relative(options.cwd, spec.replace('file:', ''))
            return `  '${name}@file:${rel}': {}`
        })
        if (registryFallback) {
            entries.push('  \'@dependfix/core@0.6.0\': {}')
        }
        writeFileSync(path.join(options.cwd, 'pnpm-lock.yaml'), ['lockfileVersion: \'9.0\'', 'packages:', ...entries, ''].join('\n'))
        return ''
    }
    if (command === 'pnpm' && args[0] === '--dir' && args[2] === 'exec') {
        return `${reportVersion}\n`
    }
    throw new Error(`未预期的命令：${command} ${args.join(' ')}`)
}

describe('tarballName / buildInstallProject', () => {
    it('按 npm 规则去 scope 命名 tarball', () => {
        expect(tarballName('@dependfix/core', '0.6.0')).toBe('dependfix-core-0.6.0.tgz')
        expect(tarballName('dependfix', '0.6.0')).toBe('dependfix-0.6.0.tgz')
    })

    it('内部包同时进 dependencies 与 workspace overrides（pnpm 11 不读 package.json pnpm 字段）', () => {
        const packs = [
            { pkg: '@dependfix/core', version: '0.6.0', tarball: '/tmp/x/core.tgz' },
            { pkg: 'dependfix', version: '0.6.0', tarball: '/tmp/x/cli.tgz' },
        ]
        const { project, workspaceYaml } = buildInstallProject({ packs })

        expect(project.dependencies).toEqual({
            '@dependfix/core': 'file:/tmp/x/core.tgz',
            dependfix: 'file:/tmp/x/cli.tgz',
        })
        expect(project.pnpm).toBeUndefined()
        expect(workspaceYaml).toContain('packages: []')
        expect(workspaceYaml).toContain('\'@dependfix/core\': file:/tmp/x/core.tgz')
        expect(workspaceYaml).toContain('\'dependfix\': file:/tmp/x/cli.tgz')
    })
})

describe('checkPackedManifest', () => {
    it('版本一致 / 无 workspace 协议 / 入口齐全 → 无问题', () => {
        expect(checkPackedManifest({
            pkg: 'dependfix',
            expectedVersion: '0.6.0',
            manifest: manifest(),
            files: fileSet('dist/bin.mjs', 'dist/index.mjs'),
        })).toEqual([])
    })

    it('版本漂移 / 残留 workspace 协议 / 入口缺失都被拦下', () => {
        const problems = checkPackedManifest({
            pkg: 'dependfix',
            expectedVersion: '0.6.0',
            manifest: manifest({ version: '0.1.0', dependencies: { '@dependfix/core': 'workspace:*' } }),
            files: fileSet('dist/index.mjs'),
        })
        expect(problems.join('\n')).toContain('tarball 版本 0.1.0 ≠ package.json 0.6.0')
        expect(problems.join('\n')).toContain('dependencies.@dependfix/core 仍是 workspace:*')
        expect(problems.join('\n')).toContain('入口 ./dist/bin.mjs 不在 tarball 内')
    })

    it('两层及以上条件嵌套的 exports 也会被检查（不能静默跳过）', () => {
        const problems = checkPackedManifest({
            pkg: 'dependfix',
            expectedVersion: '0.6.0',
            manifest: manifest({ exports: { '.': { node: { import: './dist/nested.mjs' } } } }),
            files: fileSet('dist/bin.mjs', 'dist/index.mjs'),
        })
        expect(problems.join('\n')).toContain('入口 ./dist/nested.mjs 不在 tarball 内')
    })

    it('内容包缺必要 payload 时报出（skills 的 dependfix-remediator）', () => {
        const problems = checkPackedManifest({
            pkg: '@dependfix/skills',
            expectedVersion: '0.3.0',
            manifest: { name: '@dependfix/skills', version: '0.3.0' },
            files: fileSet('package.json'),
        })
        expect(REQUIRED_PAYLOAD['@dependfix/skills'].every((file) => problems.join('\n').includes(file))).toBe(true)
    })

    it('包名不符 / 缺必填字段也报出', () => {
        const problems = checkPackedManifest({
            pkg: '@dependfix/core',
            expectedVersion: '0.6.0',
            manifest: { name: 'other', bin: {}, dependencies: {} },
            files: fileSet(),
        })
        expect(problems.join('\n')).toContain('缺 version')
        expect(problems.join('\n')).toContain('tarball 内包名为 other')
    })
})

describe('checkLockfileUsesTarballs', () => {
    const packs = [
        { pkg: '@dependfix/core', version: '0.6.0', tarball: '/tmp/x/core.tgz' },
        { pkg: 'dependfix', version: '0.6.0', tarball: '/tmp/x/cli.tgz' },
    ]
    const lockWith = (...keys) => [
        'lockfileVersion: \'9.0\'',
        'packages:',
        ...keys.map((key) => `  '${key}': {}`),
        '',
    ].join('\n')

    it('packages 段唯一解析且为 @file: → 通过', () => {
        expect(checkLockfileUsesTarballs({
            lockfile: lockWith(
                '@dependfix/core@file:../packs/dependfix-core-0.6.0.tgz',
                'dependfix@file:../packs/dependfix-0.6.0.tgz',
            ),
            packs,
        })).toEqual([])
    })

    it('内部包回落 registry（packages 段为 name@版本）→ 失败', () => {
        const problems = checkLockfileUsesTarballs({
            lockfile: lockWith(
                '@dependfix/core@0.6.0',
                'dependfix@file:../packs/dependfix-0.6.0.tgz',
            ),
            packs,
        })
        expect(problems.join('\n')).toContain('@dependfix/core: 解析为 @dependfix/core@0.6.0')
    })

    it('同一内部包两种解析并存 → 失败（overrides 缺席时的真实形态）', () => {
        const problems = checkLockfileUsesTarballs({
            lockfile: lockWith(
                '@dependfix/core@file:../packs/dependfix-core-0.6.0.tgz',
                '@dependfix/core@0.6.0',
                'dependfix@file:../packs/dependfix-0.6.0.tgz',
            ),
            packs,
        })
        expect(problems.join('\n')).toContain('存在多条解析')
    })

    it('packages 段完全缺失 → 失败（不能当通过）', () => {
        expect(checkLockfileUsesTarballs({ lockfile: 'lockfileVersion: \'9.0\'\n', packs })[0])
            .toContain('没有解析记录')
    })
})

describe('parseCli', () => {
    it('默认安装 + 官方 registry；--no-install 关闭安装', () => {
        expect(parseCli([])).toMatchObject({ install: true, keep: false, json: false, registry: 'https://registry.npmjs.org/' })
        expect(parseCli(['--no-install']).install).toBe(false)
        expect(parseCli(['--out-dir=/tmp/x', '--packages=dependfix'])).toMatchObject({ outDir: '/tmp/x', packages: 'dependfix' })
    })

    it('未知参数抛出（由 main 映射为退出码 2）', () => {
        expect(() => parseCli(['--nope'])).toThrow()
    })
})

describe('runPreflight（注入 exec）', () => {
    it('全部通过时 ok=true，且 __version 与包版本一致', async () => {
        const report = await runPreflight({ exec: makeExec(), tmpRoot: makeTempDir() })

        expect(report.problems).toEqual([])
        expect(report.ok).toBe(true)
        expect(report.version).toBe(realVersions.dependfix)
        expect(report.steps.map((s) => s.step)).toEqual(['pack', 'inspect', 'install', 'workspace'])
    })

    it('--version 与包版本不一致 → 失败并指出发布物元数据缺陷', async () => {
        const report = await runPreflight({ exec: makeExec({ reportVersion: '0.1.0' }), tmpRoot: makeTempDir() })

        expect(report.ok).toBe(false)
        expect(report.problems.join('\n')).toContain('--version 输出 0.1.0 ≠ 包版本')
    })

    it('预演前后工作区状态变化 → 判为留痕', async () => {
        let calls = 0
        const exec = (command, args, options) => {
            if (command === 'git') {
                calls += 1
                return calls === 1 ? '' : '?? .preflight-tmp/'
            }
            return makeExec()(command, args, options)
        }
        const report = await runPreflight({ exec, tmpRoot: makeTempDir() })

        expect(report.ok).toBe(false)
        expect(report.problems.join('\n')).toContain('预演前后工作区状态不一致')
    })

    it('--no-install 跳过安装但仍做 tarball 校验', async () => {
        const report = await runPreflight({ exec: makeExec(), install: false, tmpRoot: makeTempDir() })

        expect(report.ok).toBe(true)
        expect(report.steps.find((s) => s.step === 'install')?.detail).toContain('skipped')
    })

    it('内部包出现 registry 解析（overrides 失效）→ 失败', async () => {
        const report = await runPreflight({
            exec: makeExec({ registryFallback: true }),
            tmpRoot: makeTempDir(),
        })

        expect(report.ok).toBe(false)
        expect(report.problems.join('\n')).toContain('@dependfix/core: lockfile 存在多条解析')
    })

    it('报告带临时目录路径（--keep 排查用）', async () => {
        const tmpRoot = makeTempDir()
        const report = await runPreflight({ exec: makeExec(), install: false, tmpRoot })

        expect(report.tmp).toBe(tmpRoot)
    })
})

describe('main（退出码与落盘）', () => {
    const quiet = { log: () => {}, error: () => {} }

    it('全部通过 → 0', async () => {
        const exec = makeExec()
        expect(await main(['--no-install'], { exec, ...quiet })).toBe(0)
    })

    it('版本断言失败 → 1', async () => {
        const exec = makeExec({ reportVersion: '0.1.0' })
        expect(await main([], { exec, ...quiet })).toBe(1)
    })

    it('未知参数 / 未知包 → 2', async () => {
        expect(await main(['--nope'], quiet)).toBe(2)
        expect(await main(['--packages=nope'], { exec: makeExec(), ...quiet })).toBe(2)
    })

    it('--json --keep 时 stdout 仍是纯 JSON（提示走 stderr）', async () => {
        const out = []
        const err = []
        const code = await main(['--no-install', '--json', '--keep'], {
            exec: makeExec(),
            log: (line) => out.push(line),
            error: (line) => err.push(line),
        })
        expect(code).toBe(0)
        expect(() => JSON.parse(out.join('\n'))).not.toThrow()
        expect(err.join('\n')).toContain('临时目录保留在')
    })

    it('--out-dir 写出 preflight.json', async () => {
        const outDir = makeTempDir()
        const code = await main(['--no-install', `--out-dir=${outDir}`], { exec: makeExec(), ...quiet })
        expect(code).toBe(0)
        const written = JSON.parse(readFileSync(path.join(outDir, 'preflight.json'), 'utf8'))
        expect(written.ok).toBe(true)
    })
})

describe('真实打包（离线）', () => {
    // 需要 packages/core、packages/engine 的 dist（两包 `files: ["dist"]`，pnpm pack 不构建）：
    // CI 各 workflow 在 test 前已构建，全新 clone 直接 pnpm test 时跳过而不是误报失败。
    const distReady = ['packages/core/dist/index.mjs', 'packages/engine/dist/index.mjs']
        .every((file) => existsSync(path.join(import.meta.dirname, '../..', file)))
    it.skipIf(!distReady)('core / engine / skills 的 tarball 内容与版本一致（入口与 payload 都被校验）', async () => {
        const tmpRoot = makeTempDir()
        const wanted = new Set(['@dependfix/core', '@dependfix/engine', '@dependfix/skills'])
        const report = await runPreflight({
            packages: NPM_PUBLISHABLE_PACKAGES.filter((p) => wanted.has(p.pkg)),
            install: false,
            tmpRoot,
        })

        expect(report.problems).toEqual([])
        expect(report.ok).toBe(true)
        expect(report.steps[0].detail).toHaveLength(3)
    }, 180_000)
})

describe('formatReport', () => {
    it('通过 / 失败两种输出', () => {
        expect(formatReport({ ok: true, steps: [{ step: 'pack', ok: true }], problems: [] }))
            .toContain('[release:preflight] OK')
        expect(formatReport({ ok: false, steps: [{ step: 'inspect', ok: false }], problems: ['x 失败'] }))
            .toContain('- x 失败')
    })
})
