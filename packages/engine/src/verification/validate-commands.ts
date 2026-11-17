// 验证命令脚本存在性校验（从 app/helpers 移出的公共层，
// app/helpers 与 helpers 均从此处引用，消除值级循环依赖）。

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/** `pnpm <script>` 形态命令匹配（脚本引用） */
const PNPM_SCRIPT_RE = /^pnpm\s+([a-zA-Z][a-zA-Z0-9:_-]*)$/

/**
 * 读取 `package.json#scripts`。
 *
 * 返回 `undefined` 表示**解析失败**（文件存在但不可解析）：调用方须各自决定降级口径
 * （验证链容错为「全部有效」，CI 镜像计划保守为「无脚本」）。
 * 文件不存在时返回空映射（与重构前口径一致：脚本引用被 skip，非脚本命令照常执行）。
 * 合并为一个读取器是为了让两处使用同一份解析实现，不出现「一处接受、一处拒绝」的漂移。
 */
export function readPackageScripts(workDir: string): Record<string, string> | undefined {
    const pkgJsonPath = join(workDir, 'package.json')
    if (!existsSync(pkgJsonPath)) {
        return {}
    }
    try {
        const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf-8')) as { scripts?: unknown }
        if (typeof pkg.scripts !== 'object' || pkg.scripts === null) {
            return {}
        }
        const scripts: Record<string, string> = {}
        for (const [name, command] of Object.entries(pkg.scripts as Record<string, unknown>)) {
            if (typeof command === 'string' && command.trim().length > 0) {
                scripts[name] = command
            }
        }
        return scripts
    } catch {
        return undefined
    }
}

/**
 * 校验默认命令链中的脚本引用是否存在。
 *
 * - `pnpm install --frozen-lockfile` 等非脚本命令 → 直接保留
 * - `pnpm lint` 等脚本命令 → 检查 `package.json#scripts` 是否存在对应键
 * - 用户自定义命令（`--commands`）不经过此校验
 */
export function validateVerifyCommands(commands: string[], workDir: string): { valid: string[], skipped: string[] } {
    const pkgScripts = readPackageScripts(workDir)
    // package.json 缺失 / 解析失败 → 不校验，全部当作有效（失败交给命令自身暴露）
    if (!pkgScripts) {
        return { valid: commands, skipped: [] }
    }

    const valid: string[] = []
    const skipped: string[] = []

    for (const cmd of commands) {
        const match = PNPM_SCRIPT_RE.exec(cmd)
        if (match) {
            const scriptName = match[1]
            if (Object.hasOwn(pkgScripts, scriptName) && pkgScripts[scriptName]) {
                valid.push(cmd)
            } else {
                skipped.push(cmd)
            }
        } else {
            // 非脚本命令（如 `pnpm install --frozen-lockfile`）→ 直接保留
            valid.push(cmd)
        }
    }

    return { valid, skipped }
}

/**
 * 只读 lint 与写模式 lint 的命令别名（基线走只读链时的**既有失败等价**）。
 *
 * 基线采样把 `pnpm lint` 换成只读的 `pnpm lint:check`（写模式 `--fix` 会改工作区），
 * 但「修复前即红」豁免与 quick-verify 的「已知红不重跑」都按**命令名全等**匹配——
 * 不做别名会让只读链的既有失败失效，导致合法修复被回滚。
 */
export function expandLintCommandAliases(commands: Iterable<string>): Set<string> {
    const set = new Set(commands)
    if (set.has('pnpm lint:check')) {
        set.add('pnpm lint')
    }
    return set
}
