import { spawn } from 'node:child_process'
import { parseDurationMs } from '@dependfix/core'
import { getActiveEgressAudit, getEgressProxyUrl } from './egress-audit'
import {
    startNetworkAudit,
    extractUrlsFromOutput,
    type NetworkAudit,
    type NetworkAuditEntry,
} from './network-audit'
import {
    getAbortReason,
    isAbortRequested,
    killProcessTree,
    STREAM_CLOSE_GRACE_MS,
    trackChildProcess,
    untrackChildProcess,
} from './process-control'
import { sanitizeOutput } from './output-sanitizer'
import { discoverRegistryHosts } from './registry-discovery'

export { sanitizeOutput } from './output-sanitizer'

/**
 * 单条命令的执行结果
 */
export interface CommandResult {
    /** 执行的命令文本 */
    command: string
    /** 退出码（0 = 成功；-1 = 启动失败或超时被杀） */
    exitCode: number
    /** 执行耗时（毫秒） */
    durationMs: number
    /** 是否因超时被中止（默认 false） */
    timedOut?: boolean
    /** 超时兜底落定时是否未能确认直接子进程已退出 */
    terminationUnconfirmed?: boolean
    /** stdout 摘要（截断到 200 行，已脱敏） */
    stdout: string
    /** stderr 摘要（截断到 200 行，已脱敏） */
    stderr: string
}

/**
 * 验证执行参数
 */
export interface VerificationParams {
    /** 工作目录 */
    workDir: string
    /**
     * 要执行的命令序列。
     * 默认: `pnpm install --frozen-lockfile` → `pnpm lint` → `pnpm build` → `pnpm typecheck` → `pnpm test`
     */
    commands?: string[]
    /**
     * 单命令超时（毫秒），超时中止该命令并终止其进程树。
     * 默认 10 分钟（恶意死循环脚本超时中止，防长时间占用）；
     * 未显式提供时读取 `DEPENDFIX_VERIFY_TIMEOUT_MS`（10s-30min，越界回退默认）。
     */
    commandTimeoutMs?: number
    /**
     * 关闭执行期网络外联审计（默认开启）。
     * 审计记录命令输出中的外联 URL + 注入本地审计代理捕获尊重代理的工具外联；
     * 仅当环境无既有代理时注入（覆盖用户代理会破坏其网络行为）。
     */
    networkAuditDisabled?: boolean
    /**
     * 遇首个失败命令后是否立即停止（默认 true，保持修复后验证的短路语义）。
     * 修复前基线采样传 false：完整执行整条链并逐段记录，避免 install 失败遮蔽
     * test 的既有失败（nest-template 形态）。
     */
    stopOnFailure?: boolean
}

/**
 * 验证执行结果
 */
export interface VerificationResult {
    /** 所有命令是否全部成功 */
    success: boolean
    /** 每条命令的详细结果 */
    commandResults: CommandResult[]
    /** 失败的命令（仅 success=false 时填充） */
    failedCommand?: string
    /** 失败详情（仅 success=false 时填充） */
    failure?: string
    /** 执行期网络外联记录（审计开启时；空数组 = 无外联或未捕获到） */
    networkAudit?: NetworkAuditEntry[]
    /** 非白名单外联违规（deny-by-default 拦截记录；空数组 = 无违规或审计关闭） */
    networkViolations?: NetworkAuditEntry[]
}

/**
 * 默认验证命令链（**唯一事实源**——app 层经此导入，消除此前的双副本漂移）。
 *
 * **顺序** install → lint → build → typecheck → test：
 * - 便宜且失败信息明确的命令靠前，先失败可快速短路；test 置于最后（通常是链中最慢一步）。
 * - typecheck 必须排在 build 之后：workspace 包的 `tsc` 依赖前置包已发射的 `dist` 声明
 *   （实测移出 `packages/{core,engine,cli}/dist` 后 `pnpm --filter @dependfix/platform typecheck`
 *   报大量 `TS2307 Cannot find module`）。
 * - typecheck 排在 test 之前：类型错误优先于测试运行短路；修复前基线使用
 *   完整链（`stopOnFailure:false`），不再受首失败前缀覆盖。
 *
 * **为何纳入 typecheck**：改动前的四条命令互不重叠地都不做类型检查——lint 只跑规则
 * （类型解析失败通常降级为规则告警而非错误）、tsdown 的 `dts` 只发射声明、vitest 走 esbuild
 * 转译。实证：消费方 `nodemailer.Transporter` 在依赖升到 10.x 后不再存在（TS2503），
 * 而 install / lint / build / test 四条全绿——类型面破坏被判 `verificationPassed = true`
 * 并交付成 PR，直到目标仓库 CI 才红。**边界**：`"build": "tsc"` 形态的仓库 build 本身即
 * 类型检查，此时本命令为冗余（只增耗时，无害），并非新增防线。
 *
 * **为何纳入 test**：仅 install/lint/build 的矩阵无法捕获「lint/build 通过但测试无法运行或失败」
 * 的破坏。实证：目标仓库把 `decode-uri-component` 升到纯 ESM 版本后，CJS 消费方
 * `query-string@7.1.3` 在 Jest 下无法加载该模块（`SyntaxError: Unexpected token 'export'`），
 * 而 install / lint / build 三条全绿——坏修复被交付成 PR。
 *
 * 无 `typecheck` / `test` 脚本的仓库由 `validateVerifyCommands` 跳过并记 `SCRIPT_NOT_FOUND` 审计，
 * 不会误伤未配置对应脚本的仓库。
 *
 * **已知边界**：脚本语义不实（如 `"typecheck": "tsc --noEmit || true"`）无法机检；
 * 「typecheck / test 长期为红」的仓库由命令级既有失败基线豁免；基线完整链采样全部命令
 * （`sampleVerificationBaseline` 传 `stopOnFailure:false`），修复后验证仍首失败即停；
 * 需 `nuxt prepare` 之类前置步骤的仓库默认链不成立，走 `--commands` / 平台 `verifyCommands` /
 * action `commands` 逃生舱。
 */
export const DEFAULT_VERIFY_COMMANDS = [
    'pnpm install --frozen-lockfile',
    'pnpm lint',
    'pnpm build',
    'pnpm typecheck',
    'pnpm test',
]

/**
 * 单命令超时（10 分钟）：与纳入 test 前保持一致，不因命令数增加而调整。
 * 注意：test 通常是链中最慢一步，大型测试套件超 10 分钟会被判超时 → 该命令计为失败。
 * 修复前即红的既有失败不归因本次改动（命令级基线判定，见 `sampleVerificationBaseline`），
 * 但超时本身仍按失败记录（不作独立超时豁免）。
 *
 * CI 镜像脚本（`--mirror-ci-scripts`）与默认链共用本超时——镜像不引入第二个计时器。
 */
export const DEFAULT_COMMAND_TIMEOUT_MS = 10 * 60 * 1000

/** 验证命令超时覆盖 env（运维面；默认链与 CI 镜像脚本同源）。 */
export const VERIFY_TIMEOUT_ENV = 'DEPENDFIX_VERIFY_TIMEOUT_MS'
/** 允许的最小单命令超时（低于 10s 无实际意义，按配置错误回退默认）。 */
export const MIN_COMMAND_TIMEOUT_MS = 10_000
/** 允许的最大单命令超时（30 分钟，与平台单仓执行上限同量级）。 */
export const MAX_COMMAND_TIMEOUT_MS = 30 * 60 * 1000

/** 已告警的非法 env 原值（避免同一进程内重复刷屏）。 */
let warnedVerificationTimeoutRaw: string | undefined

/**
 * 解析单命令超时：支持纯数字毫秒（历史口径）与 `10m` / `90s` 等单位写法；
 * 解析成功且落在 [10s, 30min] 内才采纳，否则回退默认。
 * 与安装类超时（`fixers/install-timeouts.ts`）同族口径，但两者刻意不同源、互不覆盖。
 */
export function resolveCommandTimeoutMs(
    env: NodeJS.ProcessEnv = process.env,
    fallback: number = DEFAULT_COMMAND_TIMEOUT_MS,
): number {
    const raw = env[VERIFY_TIMEOUT_ENV]?.trim()
    const value = parseDurationMs(raw, { defaultUnit: 'ms' })
    if (raw && (value === undefined || value < MIN_COMMAND_TIMEOUT_MS || value > MAX_COMMAND_TIMEOUT_MS)
        && warnedVerificationTimeoutRaw !== raw) {
        warnedVerificationTimeoutRaw = raw
        console.warn(`[verification] ${VERIFY_TIMEOUT_ENV}="${raw}" 非法或越界，回退 ${fallback}ms`)
    }
    return value !== undefined && value >= MIN_COMMAND_TIMEOUT_MS && value <= MAX_COMMAND_TIMEOUT_MS
        ? value
        : fallback
}

const MAX_OUTPUT_LINES = 200

/**
 * 已知工具链 telemetry 关闭开关（治本实证 2026-08-25 —— Nuxt CLI 默认 telemetry 上报
 * 会向 telemetry.nuxt.com:443 真实外联，被审计代理 deny-by-default 命中，触发 verification
 * 阶段的外联拦截记录。verification 是离线构建验证，不应允许任何匿名 telemetry 上报）。
 *
 * 每条 entry 是 `[varName, disabledValue]`；子进程未设置该变量时注入 `disabledValue`。
 * 父进程已设置时不覆盖（保留用户显式选择，例如测试场景重新开启 telemetry）。
 *
 * 覆盖范围：
 * - `NUXT_TELEMETRY_DISABLED=1` — Nuxt CLI 3.x telemetry 开关（默认开启）
 * - `NEXT_TELEMETRY_DISABLED=1` — Next.js（备查，Nuxt 场景不命中但保留通用化）
 * - `DO_NOT_TRACK=1` — Vercel CLI / Sentry / 通用 DO_NOT_TRACK 协议
 *
 * 未涵盖的工具链：pnpm / npm / yarn 当前无内置 telemetry 上报，无需禁用。
 */
const TELEMETRY_DISABLED_VARS: ReadonlyArray<readonly [string, string]> = [
    ['NUXT_TELEMETRY_DISABLED', '1'],
    ['NEXT_TELEMETRY_DISABLED', '1'],
    ['DO_NOT_TRACK', '1'],
]

/**
 * 压缩验证命令输出为报告可读的摘要（首尾各取若干行，超长中间省略）。
 * 完整输出由日志承载；报告保持紧凑，避免 error 字段失控膨胀。
 */
export function summarizeVerificationOutput(output: string): string {
    const maxLength = 1200
    if (output.length <= maxLength) {
        return output
    }
    const head = output.slice(0, 600).trimEnd()
    const tail = output.slice(-500).trimStart()
    return `${head}\n... (${output.length - head.length - tail.length} chars omitted) ...\n${tail}`
}

/**
 * 构造失败验证命令的 error 描述：`exit code N — <stdout/stderr 摘要>`。
 * 无输出时退化为裸 `exit code N`；超时命令归类为 `timed out after Xms`。
 * stdout/stderr 已在 execCommand 中脱敏、截断 200 行。
 */
export function formatVerificationError(cr: CommandResult): string {
    if (cr.timedOut) {
        return cr.terminationUnconfirmed
            ? `timed out after ${cr.durationMs}ms (termination unconfirmed)`
            : `timed out after ${cr.durationMs}ms`
    }
    const detail = [cr.stdout, cr.stderr].filter(Boolean).join('\n--- stderr ---\n').trim()
    return detail
        ? `exit code ${cr.exitCode} — ${summarizeVerificationOutput(detail)}`
        : `exit code ${cr.exitCode}`
}

/**
 * 按顺序在工作目录执行命令序列，任一命令失败则停止。
 *
 * @example
 * ```ts
 * const result = await runVerification({ workDir: '/repo' })
 * if (!result.success) {
 *     console.error(result.failure)
 * }
 * ```
 */
export async function runVerification(params: VerificationParams): Promise<VerificationResult> {
    const commands = params.commands ?? DEFAULT_VERIFY_COMMANDS
    const stopOnFailure = params.stopOnFailure !== false
    const commandResults: CommandResult[] = []
    let firstFailure: { command: string, failure: string } | undefined

    // 执行期网络外联审计（默认开启；代理仅在环境无既有代理时注入，防覆盖用户代理）。
    // 白名单 = 默认清单 + 环境变量扩展 + workDir 配置面动态发现的 registry host——
    // registry 指向镜像源 / 企业私服时，非白名单 registry 的 CONNECT 被拒会弄挂
    // `pnpm install` 并触发门禁全量回滚（安装链路的合法外联不应被误拦）。
    // 运行级审计（安装链 / 交付命令共用）：存在时直接复用同一代理与记录，不另起第二份
    let audit: NetworkAudit | undefined = getActiveEgressAudit()
    let ownsAudit = false
    if (!audit && !params.networkAuditDisabled) {
        const discovery = discoverRegistryHosts(params.workDir)
        if (discovery.warning) {
            console.warn(`[network-audit] registry 动态发现降级（fail-open）：${discovery.warning}`)
        }
        audit = await startNetworkAudit({ extraAllowedDomains: discovery.hosts }).catch(() => undefined)
        ownsAudit = true
    }
    const hasExistingProxy = Boolean(
        process.env.HTTP_PROXY || process.env.HTTPS_PROXY || process.env.ALL_PROXY
        || process.env.http_proxy || process.env.https_proxy || process.env.all_proxy,
    )
    const proxyUrl = getEgressProxyUrl() ?? (audit && !hasExistingProxy ? audit.proxyUrl : undefined)

    try {
        for (const command of commands) {
            // 运行级取消（平台执行超时 / 运维中止）后不再启动新命令：链的余下命令一律不 spawn，
            // 直接以失败收尾并如实记录"因取消而未执行"（不静默截断）
            if (isAbortRequested()) {
                return {
                    success: false,
                    commandResults,
                    failedCommand: command,
                    failure: `run aborted before "${command}": ${getAbortReason() ?? 'abort requested'}`,
                    ...(audit ? { networkAudit: audit.entries, networkViolations: audit.violations } : {}),
                }
            }
            const result = await execCommand(command, params.workDir, params.commandTimeoutMs, proxyUrl)
            commandResults.push(result)

            // 命令输出 URL 提取（确定性捕获 pnpm/npm registry 外联；仅入 entries，**不阻断 verification**）。
            // 治本（候选方向 3）实证 2026-08-25 run `dependfix-mt8nasq2-0iiiry` —— pnpm 11.x warnings
            // 把 `https://pnpm.io/catalogs` 写进 stderr，Nuxt CLI 把 `https://telemetry.nuxt.com` 写进
            // stdout，这些链接是文本而非真实网络连接；旧逻辑用白名单做 deny-by-default 误判为
            // `network_violation` → 触发 verification fail → 跳过 PR 创建。新逻辑统一入 audit
            // entries 备查，真实外联仍由代理拦截捕获（见上方 `if (audit) { ... }` 的 setup 路径）
            if (audit) {
                const urls = extractUrlsFromOutput(`${result.stdout}\n${result.stderr}`)
                if (urls.length > 0) {
                    const time = new Date().toISOString()
                    const entries: NetworkAuditEntry[] = urls.map((target) => ({
                        time, source: 'command-output', method: 'GET', target,
                    }))
                    audit.addEntries(entries)
                }
            }

            if (result.exitCode !== 0 || result.timedOut) {
                const failure = result.timedOut
                    ? `command "${command}" timed out after ${result.durationMs}ms`
                    : `command "${command}" exited with code ${result.exitCode}`
                firstFailure ??= { command, failure }
                if (stopOnFailure) {
                    return {
                        success: false,
                        commandResults,
                        failedCommand: command,
                        failure,
                        ...(audit ? { networkAudit: audit.entries, networkViolations: audit.violations } : {}),
                    }
                }
            }
        }
    } finally {
        // 仅停止自建的审计：运行级审计由 DependfixApp 统一收口（后续命令仍要用同一代理）
        if (audit && ownsAudit) {
            await audit.stop().catch(() => { /* 停止失败静默 */ })
        }
    }

    if (firstFailure) {
        return {
            success: false,
            commandResults,
            failedCommand: firstFailure.command,
            failure: firstFailure.failure,
            ...(audit ? { networkAudit: audit.entries, networkViolations: audit.violations } : {}),
        }
    }

    return {
        success: true,
        commandResults,
        ...(audit ? { networkAudit: audit.entries, networkViolations: audit.violations } : {}),
    }
}

/**
 * 构造 verification 子进程环境变量：
 * - **基础**：`process.env` 全量复制（含 PATH 等系统变量），不丢失用户 shell 环境
 * - **telemetry 默认禁用**：注入 `NUXT_TELEMETRY_DISABLED=1` 等（父进程未设置时）；
 *   已设置时不覆盖，保留用户显式选择
 * - **审计代理**：`proxyUrl` 提供时附加 HTTP_PROXY/HTTPS_PROXY/ALL_PROXY/NO_PROXY
 *   重写；`proxyUrl` 为 undefined 时不动 HTTP_PROXY（用户既有代理不覆盖）
 */
function buildSpawnEnv(proxyUrl?: string): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = { ...process.env }
    for (const [name, value] of TELEMETRY_DISABLED_VARS) {
        if (env[name] === undefined || env[name] === '') {
            env[name] = value
        }
    }
    if (proxyUrl) {
        env.HTTP_PROXY = proxyUrl
        env.HTTPS_PROXY = proxyUrl
        env.ALL_PROXY = proxyUrl
        env.NO_PROXY = ''
        env.no_proxy = ''
    }
    return env
}

/**
 * 执行单条 shell 命令，捕获 stdout/stderr（截断到 200 行）并脱敏。
 * 超过超时时间后中止命令并终止其进程树（防死循环脚本孙进程残留）。
 *
 * env 构造（治本实证 2026-08-25）：
 * - **总是构造**（不再 `undefined` 让子进程继承父环境）——为了精确控制 telemetry 禁用与代理注入
 * - **telemetry 默认禁用**：`NUXT_TELEMETRY_DISABLED=1` 等注入；父进程已设置时不覆盖
 * - **审计代理**：`proxyUrl` 提供时附加 HTTP_PROXY 等；用户既有代理时**不**覆盖父环境代理
 *   （覆盖会破坏用户网络行为，稳定性优先 —— 与既有 `skips proxy injection` 行为一致）
 */
function execCommand(
    command: string,
    workDir: string,
    timeoutMs: number = resolveCommandTimeoutMs(),
    proxyUrl?: string,
): Promise<CommandResult> {
    return new Promise((resolve) => {
        const startTime = Date.now()
        let timedOut = false
        const cp = spawn(command, {
            cwd: workDir,
            shell: true,
            stdio: 'pipe',
            // POSIX 下创建独立进程组，超时时可终止整个进程树
            detached: process.platform !== 'win32',
            env: buildSpawnEnv(proxyUrl),
        })

        const stdoutChunks: string[] = []
        const stderrChunks: string[] = []

        // 受管登记：运行级取消（`requestAbort`）时按进程树终止（防僵尸命令与新仓库争抢资源）
        trackChildProcess(cp.pid)

        let settled = false
        let exited = false
        let closeGraceTimer: NodeJS.Timeout | undefined

        const timer = setTimeout(() => {
            timedOut = true
            killProcessTree(cp.pid)
            cp.kill('SIGKILL')
            settleAfterStreamGrace(-1)
        }, timeoutMs)

        function finish(exitCode: number, errorMessage?: string): void {
            if (settled) {
                return
            }
            settled = true
            clearTimeout(timer)
            if (closeGraceTimer) {
                clearTimeout(closeGraceTimer)
            }
            untrackChildProcess(cp.pid)
            const stdout = truncateLines(stdoutChunks.join(''), MAX_OUTPUT_LINES)
            const stderr = errorMessage ?? truncateLines(stderrChunks.join(''), MAX_OUTPUT_LINES)
            resolve({
                command,
                exitCode,
                durationMs: Date.now() - startTime,
                timedOut,
                terminationUnconfirmed: timedOut && !exited ? true : undefined,
                stdout: sanitizeOutput(stdout),
                stderr: sanitizeOutput(stderr),
            })
        }

        /**
         * 子进程退出后等待 stdio 关闭的有界窗口：验证链同样可能派生持有管道的孙进程
         * （测试 runner / 构建 watcher），只等 `close` 会让单命令超时无限延后。
         */
        function settleAfterStreamGrace(exitCode: number): void {
            if (settled) {
                return
            }
            if (closeGraceTimer) {
                clearTimeout(closeGraceTimer)
            }
            closeGraceTimer = setTimeout(() => {
                // 直接子进程已退出，但进程组内可能仍有幸存孙进程：落定前再收一次
                killProcessTree(cp.pid)
                cp.stdout?.destroy?.()
                cp.stderr?.destroy?.()
                finish(exitCode)
            }, STREAM_CLOSE_GRACE_MS)
        }

        cp.stdout.on('data', (data: Buffer) => {
            stdoutChunks.push(data.toString('utf-8'))
        })

        cp.stderr.on('data', (data: Buffer) => {
            stderrChunks.push(data.toString('utf-8'))
        })

        cp.on('error', (err) => {
            finish(-1, err.message)
        })

        cp.on('exit', (code) => {
            exited = true
            settleAfterStreamGrace(code ?? -1)
        })

        cp.on('close', (code) => {
            finish(code ?? -1)
        })
    })
}

/** 截断文本到指定行数 */
function truncateLines(text: string, maxLines: number): string {
    const lines = text.split('\n')
    if (lines.length <= maxLines) {
        return text
    }
    return `${lines.slice(0, maxLines).join('\n')}\n... (truncated, ${lines.length - maxLines} more lines)`
}
