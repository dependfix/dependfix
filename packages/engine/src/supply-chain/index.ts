import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { FixAction, SupplyChainWarning } from '@dependfix/core'

/**
 * 供应链信号披露（安全治理：路径 A"合法包被投毒"合入前人工确认的关键依据）。
 *
 * 信号定义：本次新增/升级的包**带 lifecycle scripts**（install/preinstall/postinstall）
 * 且**已被目标仓库 `allowBuilds` / `onlyBuiltDependencies` 批准**——pnpm 10+/11 默认
 * 忽略依赖 lifecycle scripts，仅显式批准的包才在安装时执行脚本；被批准 + 带脚本
 * 的组合意味着升级该包会在目标仓库真实执行其脚本（投毒扩散面）。
 *
 * 数据源（不依赖 lockfile 的 hasInstallScript 字段——pnpm 11.17 实证该字段不写入）：
 * - 批准列表：目标仓库 `pnpm-workspace.yaml` 的 `allowBuilds`（对象）/
 *   `onlyBuiltDependencies`（数组）
 * - 脚本类型：升级验证后的 `node_modules/.pnpm/{pkg}@{ver}/node_modules/{pkg}/package.json`
 *   的 scripts 键（install/preinstall/postinstall）
 */

/** pnpm 生命周期的可执行脚本键（白名单，忽略 test/build 等非安装期脚本） */
const LIFECYCLE_SCRIPT_KEYS = ['install', 'preinstall', 'postinstall'] as const

/** pnpm-workspace.yaml 中批准配置的键名（pnpm 10+ / pnpm 11 allowBuilds 对象） */
const ALLOW_BUILDS_KEY = 'allowBuilds'
const ONLY_BUILT_DEPENDENCIES_KEY = 'onlyBuiltDependencies'

/**
 * 解析 pnpm-workspace.yaml 中被批准执行 install 脚本的包集合。
 *
 * 支持两种形态（行级解析，不引入 yaml 依赖）：
 * ```yaml
 * allowBuilds:            # pnpm 11 对象形态（pkg: true 或 pkg: [scripts]）
 *   esbuild: true
 *   better-sqlite3: true
 * onlyBuiltDependencies:  # pnpm 10 数组形态
 *   - esbuild
 * ```
 * 注释（#）、引号包名、行内尾注均可处理；缺失文件返回空集合。
 */
export function parseWorkspaceAllowBuilds(workspaceYamlContent: string | undefined): Set<string> {
    const approved = new Set<string>()
    if (!workspaceYamlContent) {
        return approved
    }

    const lines = workspaceYamlContent.split(/\r?\n/)
    let section: 'allowBuilds' | 'onlyBuiltDependencies' | null = null

    for (const rawLine of lines) {
        const line = stripInlineComment(rawLine).trim()
        if (!line) {
            continue
        }

        // 段首（顶层两段配置：allowBuilds: / onlyBuiltDependencies:）
        if (line === `${ALLOW_BUILDS_KEY}:`) {
            section = 'allowBuilds'
            continue
        }
        if (line === `${ONLY_BUILT_DEPENDENCIES_KEY}:`) {
            section = 'onlyBuiltDependencies'
            continue
        }
        // 顶层其他配置段（packages: / overrides: 等）退出批准段
        if (isTopLevelKey(line)) {
            section = null
            continue
        }
        if (section === null) {
            continue
        }

        if (section === 'allowBuilds') {
            // 形态：`  pkg: true` / `  'pkg': [install]` / `  pkg: install`
            const match = line.match(/^([^:]+):\s*(.+)?$/)
            if (match) {
                const pkg = unquote(match[1].trim())
                const value = (match[2] ?? '').trim()
                // true / 非空脚本列表 / 具体脚本名均视为批准
                if (pkg && value !== 'false') {
                    approved.add(pkg)
                }
            }
        } else if (section === 'onlyBuiltDependencies') {
            // 形态：`  - esbuild` / `  - 'esbuild'`
            const match = line.match(/^-\s*(.+)$/)
            if (match) {
                const pkg = unquote(match[1].trim())
                if (pkg) {
                    approved.add(pkg)
                }
            }
        }
    }
    return approved
}

/** 读取目标仓库的 pnpm-workspace.yaml 批准配置（文件不存在返回空集合）。 */
export function readWorkspaceAllowBuilds(workDir: string): Set<string> {
    const file = join(workDir, 'pnpm-workspace.yaml')
    if (!existsSync(file)) {
        return new Set()
    }
    return parseWorkspaceAllowBuilds(readFileSync(file, 'utf-8'))
}

/**
 * 读取已安装包（node_modules/.pnpm 布局）的 lifecycle 脚本类型。
 * pnpm 布局：`node_modules/.pnpm/{name}@{version}/node_modules/{name}/package.json`
 * （scoped 包的 store 目录为 `@scope+pkg@version`）。
 * 带 peer 依赖的包 store 目录带后缀（`name@version_peer@v...`）——先精确匹配，
 * 未命中时前缀匹配兜底（防 peer 后缀漏披露）。
 * 包未安装（dry-run / install 未执行）时返回 undefined（调用方跳过）。
 */
export function readInstalledPackageScriptTypes(
    workDir: string,
    packageName: string,
    version: string,
): string[] | undefined {
    const pkgJsonPath = resolveStorePackageJson(workDir, packageName, version)
    if (!pkgJsonPath) {
        return undefined
    }
    try {
        const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf-8')) as { scripts?: Record<string, string> }
        const scripts = pkg.scripts ?? {}
        const types = LIFECYCLE_SCRIPT_KEYS.filter((key) => typeof scripts[key] === 'string')
        return types.length > 0 ? types : []
    } catch {
        return undefined
    }
}

/** 解析 pnpm store 内包的 package.json 路径（精确路径 → peer 后缀前缀匹配兜底）。 */
function resolveStorePackageJson(workDir: string, packageName: string, version: string): string | undefined {
    const storeBase = `${packageName.replace('/', '+')}@${version}`
    const exact = join(workDir, 'node_modules', '.pnpm', storeBase, 'node_modules', packageName, 'package.json')
    if (existsSync(exact)) {
        return exact
    }
    // peer 后缀兜底：store 目录形如 `react-dom@18.2.0_react@18.2.0`——前缀匹配首个命中
    const pnpmDir = join(workDir, 'node_modules', '.pnpm')
    if (!existsSync(pnpmDir)) {
        return undefined
    }
    try {
        const match = readdirSync(pnpmDir).find((name) => name.startsWith(`${storeBase}_`))
        if (!match) {
            return undefined
        }
        const peerPath = join(pnpmDir, match, 'node_modules', packageName, 'package.json')
        return existsSync(peerPath) ? peerPath : undefined
    } catch {
        return undefined
    }
}

/**
 * 收集本次运行的供应链信号警示：成功升级的包 ∩ 目标仓库批准列表 ∩ 实际带 lifecycle 脚本。
 * 任一环节缺失（无 workspace.yaml / 包未安装 / 无脚本）自然降级为不披露。
 */
export function collectSupplyChainWarnings(
    workDir: string,
    actions: FixAction[],
): SupplyChainWarning[] {
    const approved = readWorkspaceAllowBuilds(workDir)
    if (approved.size === 0) {
        return []
    }

    // 去重（同包多告警/多 manifest 可能产生多条升级动作；\u0000 分隔防 owner/repo 含 / 歧义）
    const upgraded = new Map<string, { repository: string, packageName: string, version: string }>()
    for (const action of actions) {
        if (action.type !== 'dependency-upgrade' || !action.success || !action.target || !action.toVersion) {
            continue
        }
        const key = `${action.repository}\u0000${action.target}`
        upgraded.set(key, {
            repository: action.repository,
            packageName: action.target,
            version: action.toVersion,
        })
    }

    const warnings: SupplyChainWarning[] = []
    for (const { repository, packageName, version } of upgraded.values()) {
        if (!approved.has(packageName)) {
            continue
        }
        const scriptTypes = readInstalledPackageScriptTypes(workDir, packageName, version)
        if (scriptTypes === undefined || scriptTypes.length === 0) {
            continue
        }
        warnings.push({
            repository,
            packageName,
            version,
            scriptTypes,
        })
    }
    return warnings
}

// ---------------------------------------------------------------------------
// 行级 yaml 辅助（仅覆盖 pnpm-workspace.yaml 批准段所需的最小语义）
// ---------------------------------------------------------------------------

/** 剥离行内注释（# 在引号外才生效；包名含 # 的极端场景由 unquote 顺序保护）。 */
function stripInlineComment(line: string): string {
    // 简单处理：跳过引号内的 #（此处按引号配对逐字符扫描）
    let inSingle = false
    let inDouble = false
    for (let i = 0; i < line.length; i++) {
        const ch = line[i]
        if (ch === '\'' && !inDouble) {
            inSingle = !inSingle
        } else if (ch === '"' && !inSingle) {
            inDouble = !inDouble
        } else if (ch === '#' && !inSingle && !inDouble) {
            return line.slice(0, i)
        }
    }
    return line
}

/** 顶层配置键（两空格缩进为 0 或非空格的键；用于退出批准段）。 */
function isTopLevelKey(line: string): boolean {
    return !line.startsWith(' ') && line.endsWith(':')
}

/** 去除单/双引号包裹。 */
function unquote(value: string): string {
    if (value.length >= 2) {
        const first = value[0]
        const last = value[value.length - 1]
        if ((first === '"' && last === '"') || (first === '\'' && last === '\'')) {
            return value.slice(1, -1)
        }
    }
    return value
}
