// 验证命令脚本存在性校验（从 app/helpers 移出的公共层，
// app/helpers 与 helpers 均从此处引用，消除值级循环依赖）。

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/** `pnpm <script>` 形态命令匹配（脚本引用） */
const PNPM_SCRIPT_RE = /^pnpm\s+([a-zA-Z][a-zA-Z0-9:_-]*)$/

/**
 * 校验默认命令链中的脚本引用是否存在。
 *
 * - `pnpm install --frozen-lockfile` 等非脚本命令 → 直接保留
 * - `pnpm lint` 等脚本命令 → 检查 `package.json#scripts` 是否存在对应键
 * - 用户自定义命令（`--commands`）不经过此校验
 */
export function validateVerifyCommands(commands: string[], workDir: string): { valid: string[], skipped: string[] } {
    const pkgJsonPath = join(workDir, 'package.json')
    let pkgScripts: Record<string, string> = {}

    if (existsSync(pkgJsonPath)) {
        try {
            const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf-8')) as { scripts?: Record<string, string> }
            pkgScripts = pkg.scripts ?? {}
        } catch {
            // package.json 解析失败 → 不校验，全部当作有效
            return { valid: commands, skipped: [] }
        }
    }

    const valid: string[] = []
    const skipped: string[] = []

    for (const cmd of commands) {
        const match = PNPM_SCRIPT_RE.exec(cmd)
        if (match) {
            const scriptName = match[1]
            if (pkgScripts[scriptName]) {
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
