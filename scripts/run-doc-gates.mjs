/**
 * run-doc-gates.mjs —— 文档与治理门禁总入口（`pnpm run gates:docs`）
 *
 * 背景：`test.yml` 的文档门禁曾只接在 Test job，`release.yml` 与 `regression:weekly` 各自只跑
 * 其中一部分，导致「Test 因文档门禁变红、但 release 仍可手动发版 / 周回归仍绿」的口径缺口。
 * 本脚本把 Test job 的文档门禁集合收敛为单点声明（`DOC_GATES`），供：
 * - `release.yml`：发布前与 Test 同集合校验
 * - `scripts/regression/run-periodic-regression.mjs`：weekly / pre-release / phase-close profile
 *
 * 顺序即执行顺序（静态检查在前、docs 构建与 fallback 在后）；任一失败立即非零退出。
 *
 * 用法：
 *   pnpm run gates:docs
 */

import { execFileSync } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { isDirectExecution } from './shared/cli.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/**
 * 文档与治理门禁集合（与 `test.yml` 的对应步骤同名）。
 * 新增 / 删除门禁时同步 `test.yml`；`scripts/run-doc-gates.test.mjs` 会校验两侧一致。
 */
export const DOC_GATES = [
    // 便宜且稳定的静态检查优先（失败最早暴露）
    'check:doc-governance',
    'check:doc-size',
    'check:mergify',
    'check:orphan-ids',
    'check:standards-redundant:strict',
    'check:experience-landing',
    'check:verify-chain',
    'check:docs',
    'docs:check:guides',
    'check:readme-i18n',
    'docs:check:i18n',
    'i18n:check:anchor',
    'i18n:audit:missing',
    'lint:md:check',
    // 较慢的 i18n lint 与 docs 构建在后；fallback 依赖构建产物
    'lint:i18n',
    'docs:build',
    'docs:check:anchors',
    'docs:check:fallback',
]

/**
 * 构造跨平台执行命令：Windows 上 `pnpm` 是 `.cmd` shim，Node 直接 spawn 会 EINVAL
 * （与 regression runner 同口径，统一走 cmd.exe）。
 */
export function buildPnpmCommand(script, platform = process.platform) {
    return platform === 'win32'
        ? { file: 'cmd.exe', args: ['/d', '/s', '/c', `pnpm run ${script}`] }
        : { file: 'pnpm', args: ['run', script] }
}

/** 默认执行器：pnpm 子进程（stdio 直通），返回退出码；无法启动时输出原因并返回 1。 */
export function runPnpmScript(
    script,
    {
        cwd = repoRoot,
        platform = process.platform,
        exec = execFileSync,
        error = (line) => console.error(line),
    } = {},
) {
    const { file, args } = buildPnpmCommand(script, platform)
    try {
        exec(file, args, { cwd, stdio: 'inherit' })
        return 0
    } catch (failure) {
        if (typeof failure?.status !== 'number') {
            error(`[gates:docs] 无法执行 pnpm run ${script}：${failure?.code ?? failure?.message ?? failure}`)
        }
        return typeof failure?.status === 'number' ? failure.status : 1
    }
}

/**
 * 顺序执行全部门禁；返回退出码（0 = 全部通过）。
 * runner / log / error 可注入，便于单测。
 */
export function runDocGates({
    gates = DOC_GATES,
    runner = (script) => runPnpmScript(script),
    log = (line) => console.log(line),
    error = (line) => console.error(line),
} = {}) {
    for (const gate of gates) {
        log(`▶ [gates:docs] pnpm run ${gate}`)
        let status
        try {
            status = runner(gate)
        } catch (failure) {
            error(`[gates:docs] FAIL: pnpm run ${gate}（runner 抛错：${failure?.message ?? failure}）`)
            return 1
        }
        if (status !== 0) {
            error(`[gates:docs] FAIL: pnpm run ${gate}（exit ${status}）`)
            return status || 1
        }
    }
    log(`[gates:docs] OK：${gates.length} 项通过`)
    return 0
}

/* v8 ignore start -- CLI 入口守卫：与 logger 等脚本同惯例（进程级副作用不可在单测内触发） */
if (isDirectExecution(import.meta.url)) {
    // 用 exitCode 而非 process.exit：让 stdio 缓冲自然冲刷，避免末行输出被截断
    process.exitCode = runDocGates()
}
/* v8 ignore stop */
