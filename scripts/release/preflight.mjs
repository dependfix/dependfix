/**
 * preflight.mjs —— 发布前预演（release:preflight）：打包 → 安装 → 版本断言 → 清理
 *
 * 目的：把「发布后才发现的打包 / 安装 / 版本戳问题」提前到发布前暴露。0.6.0 曾发布
 * 出 `dependfix --version` 报 0.1.0 的产物（元数据读取缺陷，后续修复），本脚本用
 * **真实 tarball** 复核同一路径：
 * 1. `pnpm --filter <pkg> pack --pack-destination <tmp>` 产出 5 个 npm 包 tarball；
 * 2. 逐包断言：tarball 内版本 == 本地 package.json、无残留 `workspace:` 协议、
 *    `bin` / `main` / `exports` 指向的文件确实在 tarball 内；
 * 3. 在临时工程里用 **本地 tarball + workspace overrides** 安装（内部包不得回落到
 *    registry 已发布版本），运行 `dependfix --version` 断言等于 cli 包版本；
 * 4. 清理临时目录，并断言预演前后工作区状态不变（发布链不留痕）。
 *
 * 用法：
 *   pnpm release:preflight                 # 完整预演（需要能访问 npm registry 取其外部依赖）
 *   pnpm release:preflight --no-install    # 仅生成 + 校验 tarball（离线可用）
 *   pnpm release:preflight --keep          # 保留临时目录（排查用，路径会打印）
 *   pnpm release:preflight --json          # 机器可读报告（写文件时同样输出）
 *
 * 退出码：0 全部通过 / 1 任一断言失败或安装失败 / 2 参数错误。
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { parse as parseYaml } from 'yaml'
import { NPM_PUBLISHABLE_PACKAGES } from '../packages.config.mjs'
import { isDirectExecution, parseCliOptions } from '../shared/cli.mjs'

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
export const DEFAULT_REGISTRY = 'https://registry.npmjs.org/'
/** cli 包名（`--version` 断言对象） */
export const CLI_PKG = 'dependfix'
/** tarball 内需要保留的元数据字段（缺一即视为打包配置漂移） */
const REQUIRED_MANIFEST_FIELDS = ['name', 'version']
/** 内容包的必要 payload（缺一即视为打包配置漂移；路径相对于包根） */
export const REQUIRED_PAYLOAD = {
    '@dependfix/skills': ['dependfix-remediator/SKILL.md', 'README.md'],
}
/** 安装超时（CI 网络抖动时避免无限等待） */
const INSTALL_TIMEOUT_MS = 10 * 60_000
const WORKSPACE_PROTOCOL = 'workspace:'

/** 参数错误（退出码 2）。 */
export class CliUsageError extends Error {}

/** 解析 CLI 参数（纯函数；未知参数由 parseCliOptions 抛出）。 */
export function parseCli(argv = process.argv) {
    return parseCliOptions(argv, {
        defaults: { install: true, keep: false, json: false, outDir: null, registry: DEFAULT_REGISTRY, packages: null },
        flags: {
            '--no-install': { key: 'install', value: false },
            '--keep': { key: 'keep', value: true },
            '--json': { key: 'json', value: true },
            '--help': { key: 'help', value: true },
        },
        values: {
            '--out-dir': { key: 'outDir' },
            '--registry': { key: 'registry' },
            '--packages': { key: 'packages' },
        },
    })
}

/** tarball 文件名：npm 去 scope、以 `-` 连接（@dependfix/core@0.6.0 → dependfix-core-0.6.0.tgz）。 */
export function tarballName(pkgName, version) {
    return `${pkgName.replace(/^@/, '').replace('/', '-')}-${version}.tgz`
}

/** 校验 tarball 内 manifest（纯函数）：版本一致、无 workspace 协议、入口文件在包内。 */
export function checkPackedManifest({ pkg, expectedVersion, manifest, files }) {
    const problems = []
    for (const field of REQUIRED_MANIFEST_FIELDS) {
        if (!manifest?.[field]) {
            problems.push(`${pkg}: tarball 内 package.json 缺 ${field}`)
        }
    }
    if (manifest?.name && manifest.name !== pkg) {
        problems.push(`${pkg}: tarball 内包名为 ${manifest.name}`)
    }
    if (manifest?.version !== expectedVersion) {
        problems.push(`${pkg}: tarball 版本 ${manifest?.version} ≠ package.json ${expectedVersion}（是否忘了 build / pack 缓存旧产物）`)
    }
    const scopes = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']
    for (const scope of scopes) {
        for (const [dep, range] of Object.entries(manifest?.[scope] ?? {})) {
            if (typeof range === 'string' && range.includes(WORKSPACE_PROTOCOL)) {
                problems.push(`${pkg}: ${scope}.${dep} 仍是 ${range}（pack 未替换 workspace 协议，安装会失败）`)
            }
        }
    }
    const entrypoints = []
    if (typeof manifest?.main === 'string') {
        entrypoints.push(manifest.main)
    }
    if (typeof manifest?.module === 'string') {
        entrypoints.push(manifest.module)
    }
    for (const bin of Object.values(manifest?.bin ?? {})) {
        if (typeof bin === 'string') {
            entrypoints.push(bin)
        }
    }
    entrypoints.push(...collectExportTargets(manifest?.exports))
    for (const entry of new Set(entrypoints)) {
        const normalized = entry.replace(/^\.\//, '')
        if (!files.has(`package/${normalized}`)) {
            problems.push(`${pkg}: 入口 ${entry} 不在 tarball 内（files 配置或 build 产物缺失）`)
        }
    }
    for (const required of REQUIRED_PAYLOAD[pkg] ?? []) {
        if (!files.has(`package/${required}`)) {
            problems.push(`${pkg}: 必要文件 ${required} 不在 tarball 内（内容包 payload 缺失）`)
        }
    }
    return problems
}

/** 递归收集 exports 的目标路径（支持两层及以上条件嵌套 / 数组）。 */
const collectExportTargets = (value, out = []) => {
    if (typeof value === 'string') {
        out.push(value)
    } else if (Array.isArray(value)) {
        for (const item of value) {
            collectExportTargets(item, out)
        }
    } else if (value && typeof value === 'object') {
        for (const item of Object.values(value)) {
            collectExportTargets(item, out)
        }
    }
    return out
}

/**
 * 构造临时安装工程的内容（纯函数）：
 * - 直接依赖全部指向本地 tarball（`file:`），避免安装到 registry 上的同名旧版本；
 * - `pnpm-workspace.yaml` 的 `overrides` 把内部包也钉到本地 tarball（pnpm 11 起不再读
 *   package.json 的 `pnpm` 字段，写在那里会被静默忽略）。
 */
export function buildInstallProject({ packs }) {
    const dependencies = {}
    const overrides = {}
    for (const pack of packs) {
        dependencies[pack.pkg] = `file:${pack.tarball}`
        overrides[pack.pkg] = `file:${pack.tarball}`
    }
    const project = {
        name: 'dependfix-preflight',
        private: true,
        dependencies,
    }
    const workspaceLines = ['packages: []', 'overrides:']
    for (const [pkg, spec] of Object.entries(overrides)) {
        workspaceLines.push(`  '${pkg}': ${spec}`)
    }
    return {
        project,
        workspaceYaml: `${workspaceLines.join('\n')}\n`,
    }
}

/**
 * 断言安装确实用了本地 tarball。
 *
 * 只查 `importers` 里的 `specifier` 会自欺——那是我们自己写进去的字符串回显；真正的解析结果在
 * lockfile 的 `packages` 段：本地包写作 `<name>@file:...`，回落 registry 写作 `<name>@<version>`。
 * 因此要求每个内部包**只有一条**解析记录且形态为 `@file:`（重复记录同样判失败）。
 *
 * @param {{ lockfile: string, packs: Array<{pkg: string}> }} input
 * @returns {string[]} 问题列表（空 = 全部来自本地 tarball）
 */
export function checkLockfileUsesTarballs({ lockfile, packs }) {
    const parsed = parseYaml(lockfile)
    const keys = Object.keys(parsed?.packages ?? {})
    const problems = []
    for (const pack of packs) {
        const matches = keys.filter((key) => key.startsWith(`${pack.pkg}@`))
        if (matches.length === 0) {
            problems.push(`${pack.pkg}: lockfile 的 packages 段没有解析记录（安装可能未完成）`)
            continue
        }
        if (matches.length > 1) {
            problems.push(`${pack.pkg}: lockfile 存在多条解析（${matches.join(' / ')}），内部包可能同时来自 registry`)
            continue
        }
        if (!matches[0].includes('@file:')) {
            problems.push(`${pack.pkg}: 解析为 ${matches[0]}（非本地 tarball，安装回落到 registry 版本）`)
        }
    }
    return problems
}

const run = (command, args, options = {}) => execFileSync(command, args, {
    encoding: 'utf8',
    stdio: 'pipe',
    maxBuffer: 16 * 1024 * 1024,
    ...options,
})

/** 打包一个发布包到指定目录（返回 tarball 绝对路径）。 */
export function packPackage({ pkg, path: pkgPath, outDir, exec = run }) {
    exec('pnpm', ['--filter', pkg, 'pack', '--pack-destination', outDir], { cwd: repoRoot })
    const version = JSON.parse(readFileSync(path.join(repoRoot, pkgPath, 'package.json'), 'utf8')).version
    const tarball = path.join(outDir, tarballName(pkg, version))
    if (!existsSync(tarball)) {
        throw new Error(`${pkg}: 未生成预期 tarball ${tarball}（pnpm pack 输出命名可能已变化）`)
    }
    return { pkg, path: pkgPath, version, tarball }
}

/** 读取 tarball 内文件清单与 package.json（依赖系统 tar；CI 与 Windows 10+ 均自带）。 */
export function inspectTarball({ tarball, exec = run }) {
    const listing = exec('tar', ['-tzf', tarball]).split('\n').filter(Boolean)
    const manifest = JSON.parse(exec('tar', ['-xOzf', tarball, 'package/package.json']))
    return { files: new Set(listing), manifest }
}

/**
 * 执行完整预演（可注入 exec / 临时根目录，便于单测）。
 *
 * @returns {Promise<{ok: boolean, steps: object[], problems: string[], version?: string, installDir?: string}>}
 */
export async function runPreflight(options = {}) {
    const {
        packages = NPM_PUBLISHABLE_PACKAGES,
        install = true,
        keep = false,
        registry = DEFAULT_REGISTRY,
        outDir = null,
        exec = run,
        tmpRoot = null,
        workspaceStatus = () => exec('git', ['status', '--porcelain'], { cwd: repoRoot }).trim(),
    } = options
    const tmp = tmpRoot ?? mkdtempSync(path.join(tmpdir(), 'dependfix-preflight-'))
    const packDir = path.join(tmp, 'packs')
    mkdirSync(packDir, { recursive: true })
    const problems = []
    const steps = []

    try {
        const before = workspaceStatus()
        // 1. 打包（packages 支持包名或 packages.config.mjs 条目两种形态）
        const selected = packages.map((entry) => {
            if (typeof entry !== 'string') {
                return entry
            }
            const found = NPM_PUBLISHABLE_PACKAGES.find((p) => p.pkg === entry)
            if (!found) {
                throw new CliUsageError(`未知发布包：${entry}（须在 scripts/packages.config.mjs 登记）`)
            }
            return found
        })
        const packs = selected.map((entry) => packPackage({ pkg: entry.pkg, path: entry.path, outDir: packDir, exec }))
        steps.push({ step: 'pack', ok: true, detail: packs.map((p) => `${p.pkg}@${p.version}`) })

        // 2. tarball 内容断言
        for (const pack of packs) {
            const { files, manifest } = inspectTarball({ tarball: pack.tarball, exec })
            problems.push(...checkPackedManifest({
                pkg: pack.pkg,
                expectedVersion: pack.version,
                manifest,
                files,
            }))
        }
        steps.push({ step: 'inspect', ok: problems.length === 0 })

        // 3. 临时工程安装 + `--version` 断言
        let version = null
        let installDir = null
        if (install) {
            installDir = path.join(tmp, 'install')
            mkdirSync(installDir, { recursive: true })
            const { project, workspaceYaml } = buildInstallProject({ packs })
            writeFileSync(path.join(installDir, 'package.json'), `${JSON.stringify(project, null, 4)}\n`)
            writeFileSync(path.join(installDir, 'pnpm-workspace.yaml'), workspaceYaml)
            // 临时工程显式钉 registry：避免继承用户级 .npmrc（镜像站只读 / 元数据缓存陈旧）
            writeFileSync(path.join(installDir, '.npmrc'), `registry=${registry}\n`)
            exec('pnpm', ['install', '--ignore-scripts', '--registry', registry], { cwd: installDir, timeout: INSTALL_TIMEOUT_MS })
            const lockfile = readFileSync(path.join(installDir, 'pnpm-lock.yaml'), 'utf8')
            problems.push(...checkLockfileUsesTarballs({ lockfile, packs }))

            const cli = packs.find((p) => p.pkg === CLI_PKG)
            version = exec('pnpm', ['--dir', installDir, 'exec', CLI_PKG, '--version']).trim()
            if (!cli) {
                problems.push(`安装断言缺少 cli 包 ${CLI_PKG}`)
            } else if (version !== cli.version) {
                problems.push(`${CLI_PKG} --version 输出 ${version} ≠ 包版本 ${cli.version}（发布物元数据缺陷）`)
            }
            steps.push({ step: 'install', ok: version === cli?.version, detail: `${CLI_PKG} --version = ${version}` })
        } else {
            steps.push({ step: 'install', ok: true, detail: 'skipped (--no-install)' })
        }

        // 4. 工作区不留痕
        const after = workspaceStatus()
        if (after !== before) {
            problems.push(`预演前后工作区状态不一致：\nbefore:\n${before}\nafter:\n${after}`)
        }
        steps.push({ step: 'workspace', ok: after === before })

        const report = { ok: problems.length === 0, version, steps, problems, tmp, installDir }
        if (outDir) {
            mkdirSync(outDir, { recursive: true })
            writeFileSync(path.join(outDir, 'preflight.json'), `${JSON.stringify(report, null, 2)}\n`)
        }
        return report
    } finally {
        if (!keep && !tmpRoot) {
            rmSync(tmp, { recursive: true, force: true })
        }
    }
}

/** 人类可读报告。 */
export function formatReport(report) {
    const lines = ['[release:preflight] 发布前预演']
    for (const step of report.steps) {
        const detail = Array.isArray(step.detail) ? step.detail.join(' ') : (step.detail ?? '')
        lines.push(`  ${step.ok ? 'PASS' : 'FAIL'} ${step.step}${detail ? `：${detail}` : ''}`)
    }
    if (report.ok) {
        lines.push('[release:preflight] OK（tarball 安装后的 --version 与包版本一致）')
    } else {
        lines.push('[release:preflight] FAIL')
        for (const problem of report.problems) {
            lines.push(`  - ${problem}`)
        }
    }
    return lines.join('\n')
}

const HELP_TEXT = `
release:preflight —— 发布前预演（打包 → 安装 → 版本断言 → 清理）

用法：
  pnpm release:preflight                 完整预演（需要 npm registry 取外部依赖）
  pnpm release:preflight --no-install    仅打包 + tarball 内容校验（离线可用）
  pnpm release:preflight --keep          保留临时目录（排查用）
  pnpm release:preflight --out-dir=<dir> 额外写出 preflight.json

参数：
  --packages=<a,b>   只预演指定包（默认全部 npm 发布包）
  --registry=<url>   安装用 registry，默认官方 registry
  --json             标准输出打印 JSON 报告
`.trim()

/** 主流程（退出码语义见文件头）。 */
export async function main(argv = process.argv, { exec = run, log = console.log, error = console.error } = {}) {
    let options
    try {
        options = parseCli(argv)
    } catch (failure) {
        error(`[release:preflight] ${failure instanceof Error ? failure.message : String(failure)}`)
        return 2
    }
    if (options.help) {
        log(HELP_TEXT)
        return 0
    }

    const packages = options.packages
        ? options.packages.split(',').map((name) => name.trim()).filter(Boolean)
        : NPM_PUBLISHABLE_PACKAGES.map((p) => p.pkg)
    const known = new Set(NPM_PUBLISHABLE_PACKAGES.map((p) => p.pkg))
    const unknown = packages.filter((name) => !known.has(name))
    if (unknown.length > 0) {
        error(`[release:preflight] 未知发布包：${unknown.join(', ')}（须在 scripts/packages.config.mjs 登记）`)
        return 2
    }

    try {
        const report = await runPreflight({
            packages: NPM_PUBLISHABLE_PACKAGES.filter((p) => packages.includes(p.pkg)),
            install: options.install,
            keep: options.keep,
            registry: options.registry,
            outDir: options.outDir,
            exec,
        })
        if (options.json) {
            log(JSON.stringify(report, null, 2))
        } else {
            log(formatReport(report))
        }
        if (options.keep) {
            // --keep 的唯一价值是可排查：不打印路径等于没保留。
            // 走 stderr：`--json` 时 stdout 必须是纯 JSON（机器可读契约）。
            error(`[release:preflight] 临时目录保留在 ${report.tmp}`)
        }
        return report.ok ? 0 : 1
    } catch (failure) {
        error(`[release:preflight] FAIL：${failure instanceof Error ? failure.message : String(failure)}`)
        return 1
    }
}

/* v8 ignore start -- CLI 入口守卫：进程级副作用不可在单测内触发（与其它脚本同惯例） */
if (isDirectExecution(import.meta.url)) {
    main()
        .then((code) => {
            process.exitCode = code
        })
        .catch((failure) => {
            console.error(`[release:preflight] 未捕获错误：${failure instanceof Error ? failure.message : String(failure)}`)
            process.exitCode = 1
        })
}
/* v8 ignore stop */
