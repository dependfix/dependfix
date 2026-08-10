/**
 * verify-changelog.mjs —— CHANGELOG 版本段校验脚本（verify:changelog，CI 用）
 *
 * 发布前校验：各份 CHANGELOG（根级 + 全部发布包级）已包含当前版本段。
 * - 包清单来自单点配置 scripts/packages.config.mjs（新增发布包自动生效）
 * - 版本段判定复用 create-github-release.mjs 的 extractSection（精确匹配：
 *   `# [x.y.z](...) (date)` / `# x.y.z (date)` / patch 段 `## [x.y.z](...)`）
 * - 普通提交（版本未变）时各日志已含对应版本段，校验自动通过
 * - 缺失版本段 → ::error:: + 非零退出（禁止发布），根因通常是漏跑
 *   `pnpm changelog` 生成步骤
 *
 * 用法：
 *   pnpm verify:changelog
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { PUBLISHABLE_PACKAGES, ROOT_PACKAGE } from './packages.config.mjs'
import { extractSection } from './create-github-release.mjs'

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

export function main() {
    const specs = buildVerifySpecs(PUBLISHABLE_PACKAGES, (path) =>
        JSON.parse(readFileSync(join(repoRoot, path, 'package.json'), 'utf8')).version,
    )
    const failures = collectFailures(specs, (file) => readFileSync(join(repoRoot, file), 'utf8'))
    if (failures.length > 0) {
        for (const f of failures) {
            console.error(`::error::${f}`)
        }
        process.exit(1)
    }
    console.log('changelog is up to date')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main()
}
