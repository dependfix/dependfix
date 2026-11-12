/**
 * verify-changelog.mjs —— CHANGELOG 版本段校验脚本（verify:changelog，CI 用）
 *
 * 两种模式：
 * 1. 默认：校验各份 CHANGELOG（根级 + 全部发布包级）**已包含**当前版本段。
 *    - 包清单来自单点配置 scripts/packages.config.mjs（新增发布包自动生效）
 *    - 版本段判定复用 create-github-release.mjs 的 extractSection（精确匹配：
 *      `# [x.y.z](...) (date)` / `# x.y.z (date)` / patch 段 `## [x.y.z](...)`
 *    - 普通提交（版本未变）时各日志已含对应版本段，校验自动通过
 *    - 缺失版本段 → 非零退出（禁止发布），根因通常是漏跑 `pnpm changelog`
 * 2. `--fresh`：校验版本段**内容**是否最新——按当前 git 历史在内存重算当前
 *    未发布版本段，与磁盘文件中的同名段按「条目集合」比对（D2 口径：只比
 *    `* ` 条目行，不做整段字节比对），差异 → 非零退出并指出文件。用于发现
 *    「版本段存在但生成后又有新 commit」的陈旧日志；不写盘。**只约束未发布版本段**：
 *    当前版本已有本地 tag 时视为已发布段（允许人工编辑），跳过比对。
 *    浅克隆 / 无 tag 无法可靠重算 → `::warning::` 后 exit 0（fail-open：只降级新鲜度比对，
 *    版本段存在性仍校验；结果不作为通过证据；判据见 docs/guide/release.md 与发布管线设计 §4.5）。
 *
 * 用法：
 *   pnpm verify:changelog
 *   pnpm verify:changelog --fresh
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { PUBLISHABLE_PACKAGES, ROOT_PACKAGE } from './packages.config.mjs'
import { extractSection } from './create-github-release.mjs'
import { getCliArgs } from './shared/cli.mjs'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))

/** 校验单份 changelog 内容是否包含指定版本段（纯函数） */
export function verifyChangelog(content, version) {
    return extractSection(content, version) !== null
}

/**
 * 构建校验规格（纯函数，依赖注入便于测试）。
 * 返回 [{ file, version }]：发布包级 changelog + 根级 CHANGELOG（锚 = 主交付物版本）。
 */
export function buildVerifySpecs(packages, versionOf) {
    const specs = packages.map((p) => ({ file: p.changelog, version: versionOf(p.path) }))
    specs.push({ file: 'CHANGELOG.md', version: versionOf(ROOT_PACKAGE.path) })
    return specs
}

/**
 * 收集校验失败项（纯函数，依赖注入便于测试）。
 * 返回失败消息数组（空 = 全部通过）：缺版本段 / 文件不存在两类错误语义分离。
 */
export function collectFailures(specs, readFile) {
    const failures = []
    for (const spec of specs) {
        let content
        try {
            content = readFile(spec.file)
        } catch (err) {
            if (err?.code === 'ENOENT') {
                failures.push(`${spec.file} 不存在，请先运行 pnpm changelog 并提交`)
                continue
            }
            throw err
        }
        if (!verifyChangelog(content, spec.version)) {
            failures.push(`${spec.file} 缺少版本段 ${spec.version}，请先运行 pnpm changelog 并提交`)
        }
    }
    return failures
}

/** 版本段内的条目行（只取 `* ` 列表行并归一空白；标题 / 分组 / 空行不参与比对）。 */
export function sectionEntries(section) {
    if (typeof section !== 'string') {
        return []
    }
    return section
        .split('\n')
        .map((line) => line.trim().replace(/\s+/g, ' '))
        .filter((line) => line.startsWith('* '))
        .sort()
}

/** 按条目集合比对重算段（expected）与磁盘段（actual）；元素为排序后的数组。 */
export function compareSectionEntries(expected, actual) {
    const expectedEntries = sectionEntries(expected)
    const actualEntries = sectionEntries(actual)
    const remaining = new Map()
    for (const entry of actualEntries) {
        remaining.set(entry, (remaining.get(entry) ?? 0) + 1)
    }
    const missing = []
    for (const entry of expectedEntries) {
        const count = remaining.get(entry) ?? 0
        if (count > 0) {
            remaining.set(entry, count - 1)
        } else {
            missing.push(entry)
        }
    }
    const extra = []
    for (const [entry, count] of remaining) {
        for (let i = 0; i < count; i += 1) {
            extra.push(entry)
        }
    }
    return { fresh: missing.length === 0 && extra.length === 0, missing, extra }
}

/** 差异摘要（最多各 2 条，防止刷屏）。 */
export function describeDiff({ missing, extra }) {
    const parts = []
    if (missing.length > 0) {
        parts.push(`缺少 ${missing.length} 项（${missing.slice(0, 2).join(' / ')}）`)
    }
    if (extra.length > 0) {
        parts.push(`多出 ${extra.length} 项（${extra.slice(0, 2).join(' / ')}）`)
    }
    return parts.join('；')
}

/**
 * 收集「新鲜度」失败项（异步；依赖注入便于测试）。
 * deps: { readFile, compute, specs }；compute(spec) 返回重算的版本段文本（空串 = 当前版本无未发布内容）。
 * 顺序：文件缺失 / 版本段缺失 / 条目集合差异，三类语义分开。
 */
export async function collectFreshnessFailures(specs, { readFile, compute }) {
    const failures = []
    for (const spec of specs) {
        let content
        try {
            content = readFile(spec.file)
        } catch (err) {
            if (err?.code === 'ENOENT') {
                failures.push(`${spec.file} 不存在，请先运行 pnpm changelog 并提交`)
                continue
            }
            throw err
        }
        const actual = extractSection(content, spec.version)
        if (actual === null) {
            failures.push(`${spec.file} 缺少版本段 ${spec.version}，请先运行 pnpm changelog 并提交`)
            continue
        }
        const expected = await compute(spec)
        if (!expected) {
            // 当前版本已发布 / 无未发布内容：没有可比对的重算段，视为通过
            continue
        }
        const diff = compareSectionEntries(expected, actual)
        if (!diff.fresh) {
            failures.push(`${spec.file} 的版本段 ${spec.version} 不是最新：${describeDiff(diff)}；请重新生成 CHANGELOG 并提交`)
        }
    }
    return failures
}

/** 解析参数：默认模式 / `--fresh` / `--help`；未知参数 fail-closed（退出码 2）。 */
export function parseVerifyArgs(argv = []) {
    const options = { fresh: false, help: false }
    for (const arg of argv) {
        if (arg === '--fresh') {
            options.fresh = true
        } else if (arg === '--help' || arg === '-h') {
            options.help = true
        } else {
            throw new Error(`未知参数：${arg}`)
        }
    }
    return options
}

function printUsage(log = (line) => console.log(line)) {
    log(`用法：
  pnpm verify:changelog            # 校验版本段存在
  pnpm verify:changelog --fresh    # 校验版本段内容与当前 git 历史一致（不写盘）

退出码：0 通过（--fresh 在浅克隆 / 无 tag 时 warn 后放行） / 1 校验失败 / 2 参数错误`)
}

function readGit(args) {
    return execFileSync('git', args, {
        cwd: repoRoot,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
    }).trim()
}

/**
 * 判断 --fresh 是否具备重算条件（浅克隆 / 无 tag → 不可靠）。
 * 返回 { ok, reason }；reason ∈ shallow-clone / no-tags。
 */
export function detectFreshPrerequisites(run = readGit) {
    if (run(['rev-parse', '--is-shallow-repository']) === 'true') {
        return { ok: false, reason: 'shallow-clone' }
    }
    if (run(['tag', '--list']) === '') {
        return { ok: false, reason: 'no-tags' }
    }
    return { ok: true }
}

/**
 * 该版本段是否已发布（本地存在 `<prefix><version>` tag）——已发布段允许人工编辑，
 * 新鲜度校验跳过（`--fresh` 只约束「未发布版本段」，与 release 流程的写入面一致）。
 * 口径说明：生成侧的 isVersionTagged 还会探测 npm registry（兼容「已发布但缺 tag」），
 * 这里刻意只认本地 tag（无网络依赖）；「无 tag 但 npm 已发布 + 人工编辑」的罕见残留轮次
 * 可能误报，此时重跑生成即可恢复（不会改坏已发布段，mergeUnreleased 同版本段整段替换只发生在未发布判定下）。
 */
export function isReleasedSection(target, version, run = readGit) {
    try {
        run(['rev-parse', '--verify', '--quiet', `${target.tags.prefix}${version}`])
        return true
    } catch {
        return false
    }
}

/**
 * 默认的重算器工厂：惰性加载变更日志生成器（默认模式不加载），按 spec 文件找到 target，
 * 用当前 git 历史在内存重算未发布版本段。依赖可注入（单测覆盖「已发布段跳过」护栏）。
 */
export async function createFreshCompute({
    readGit: run = readGit,
    readFile = readFileSync,
    loadGenerator = () => import('./changelog.mjs'),
} = {}) {
    // 惰性导入：默认模式不加载 conventional-changelog（重且与单测的 fs mock 隔离）
    const { CHANGELOG_TARGETS, computeUnreleasedSection } = await loadGenerator()
    let repo = null
    try {
        repo = run(['remote', 'get-url', 'origin'])
    } catch {
        repo = null
    }
    const headDate = new Date(run(['log', '-1', '--format=%cI'])).toISOString().slice(0, 10)
    const targetsByFile = new Map(CHANGELOG_TARGETS.map((target) => [target.file, target]))
    return async (spec) => {
        const target = targetsByFile.get(spec.file)
        if (!target) {
            return ''
        }
        // 已发布段允许人工编辑（1.0.0 段就含手写说明），不参与新鲜度比对
        if (isReleasedSection(target, spec.version, run)) {
            return ''
        }
        const currentPkgJson = JSON.parse(readFile(join(repoRoot, target.pkg), 'utf8'))
        return computeUnreleasedSection(target, {
            version: spec.version,
            currentPkgJson,
            repo,
            headDate,
        })
    }
}

export async function main({
    argv = getCliArgs(),
    log = (line) => console.log(line),
    error = (line) => console.error(line),
    deps = {},
} = {}) {
    let options
    try {
        options = parseVerifyArgs(argv)
    } catch (failure) {
        error(`[verify-changelog] ${failure.message}`)
        printUsage(log)
        return 2
    }
    if (options.help) {
        printUsage(log)
        return 0
    }
    const specs = buildVerifySpecs(PUBLISHABLE_PACKAGES, (path) =>
        JSON.parse(readFileSync(join(repoRoot, path, 'package.json'), 'utf8')).version,
    )
    const readChangeLog = (file) => readFileSync(join(repoRoot, file), 'utf8')
    if (!options.fresh) {
        const failures = collectFailures(specs, readChangeLog)
        if (failures.length > 0) {
            for (const f of failures) {
                error(`::error::${f}`)
            }
            return 1
        }
        log('changelog is up to date')
        return 0
    }
    const prerequisites = (deps.detectPrerequisites ?? detectFreshPrerequisites)()
    if (!prerequisites.ok) {
        // fail-open 只降级「新鲜度比对」，不降级「版本段存在性」——浅克隆 / 无 tag 也必须拦住缺段
        const presenceFailures = collectFailures(specs, readChangeLog)
        if (presenceFailures.length > 0) {
            for (const f of presenceFailures) {
                error(`::error::${f}`)
            }
            return 1
        }
        log(
            `::warning::verify:changelog --fresh 跳过新鲜度比对（${prerequisites.reason}）：版本段存在性已校验，本次结果不作为新鲜度通过证据`,
        )
        return 0
    }
    const compute = deps.computeSpec ?? (await createFreshCompute())
    const failures = await collectFreshnessFailures(specs, { readFile: readChangeLog, compute })
    if (failures.length > 0) {
        for (const f of failures) {
            error(`::error::${f}`)
        }
        return 1
    }
    log('changelog is fresh')
    return 0
}

/* v8 ignore start -- CLI 入口守卫：进程级副作用不可在单测内触发（与其它脚本同惯例） */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main()
        .then((code) => {
            process.exitCode = code
        })
        .catch((failure) => {
            console.error(`[verify-changelog] ${failure instanceof Error ? failure.message : String(failure)}`)
            process.exitCode = 1
        })
}
/* v8 ignore stop */
