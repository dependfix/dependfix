// env-hardening.ts — 执行子进程环境的平台密钥过滤（单一事实源）。
//
// 背景：平台与引擎同进程运行，执行子进程缺省继承 `process.env`——平台自身密钥
// （Nuxt 运行时密钥、Better Auth 密钥、数据库连接串、SMTP 凭据、AI / Redis 凭据）
// 会随目标仓库的安装 / 验证脚本可见，与安全规范 §5.3「平台密钥不进执行进程」冲突。
//
// 本模块独立于 `process-control`（受管子进程登记 / 取消），因为后者在大量测试中被整体
// mock；执行原语（受管命令 / 验证链 / 平台 git / 直接 spawn 调用点）都从这里取同一实现，
// 避免「mock 掉 process-control 就丢掉过滤」的假通过。
//
// 边界：只约束**平台进程的继承面**，不清洗目标仓库自带的同名变量。

/**
 * 平台密钥类环境变量的默认拒绝前缀（大小写不敏感）。
 *
 * `DEPENDFIX_AI_` 刻意不在完整键名清单里单独出现（以本模块常量为唯一来源），
 * 避免被 env 契约抽取器误当作可配置变量。
 */
export const DEFAULT_DENIED_ENV_PREFIXES = [
    'NUXT_',
    'BETTER_AUTH_',
    'AUTH_',
    'DATABASE_',
    'SMTP_',
    'DEPENDFIX_AI_',
    'REDIS_',
] as const

/**
 * 具名拒绝键：不属任何前缀但属平台凭据。
 *
 * 刻意**不**包含 `NPM_TOKEN` / `NODE_AUTH_TOKEN`：私有 registry 安装依赖它们，
 * 过滤会让 `pnpm install` 在目标仓库失败；平台侧应改用 `pnpm_config_*`
 * 或目标仓库 `.npmrc` 的带外凭据注入。
 */
export const DEFAULT_DENIED_ENV_KEYS = ['GITHUB_TOKEN', 'GH_TOKEN'] as const

/** 工具链必需的环境变量（大小写不敏感；命中保留清单时优先于拒绝前缀）。 */
export const DEFAULT_PRESERVED_ENV_KEYS = [
    'PATH',
    'HOME',
    'HTTP_PROXY',
    'HTTPS_PROXY',
    'ALL_PROXY',
    'NO_PROXY',
    'NODE_EXTRA_CA_CERTS',
    // telemetry 开关不是密钥，但属工具链行为开关（验证链会主动注入，安装链不应被误删）
    'NUXT_TELEMETRY_DISABLED',
    'NEXT_TELEMETRY_DISABLED',
    'DO_NOT_TRACK',
] as const

/** 工具链必需的变量前缀（registry / store 配置等）。 */
export const DEFAULT_PRESERVED_ENV_PREFIXES = ['PNPM_CONFIG_', 'NPM_CONFIG_'] as const

/** 审计代理的 NO_PROXY 基线：代理自身与本地服务不经二次转发。 */
export const AUDIT_LOOPBACK_NO_PROXY = '127.0.0.1,localhost,::1'

/**
 * 合并用户已有 NO_PROXY 与审计回环项（去重、保序：用户项在前）。
 *
 * 运行级代理 env（`egress-audit`）与受管命令 / 验证链共用同一实现——此前验证链在
 * 注入代理时把 `NO_PROXY` 置空，受管命令路径又会整体覆盖审计回环项，两端语义不一致。
 */
export function mergeNoProxy(existing?: string): string {
    const entries = new Set<string>()
    for (const item of [...(existing ?? '').split(','), ...AUDIT_LOOPBACK_NO_PROXY.split(',')]) {
        const trimmed = item.trim()
        if (trimmed) {
            entries.add(trimmed)
        }
    }
    return [...entries].join(',')
}

/** 判定某个环境变量键是否应从执行子进程环境中移除。 */
export function isDeniedEnvKey(key: string): boolean {
    const upper = key.toUpperCase()
    if ((DEFAULT_PRESERVED_ENV_KEYS as readonly string[]).includes(upper)) {
        return false
    }
    if (DEFAULT_PRESERVED_ENV_PREFIXES.some((prefix) => upper.startsWith(prefix))) {
        return false
    }
    if ((DEFAULT_DENIED_ENV_KEYS as readonly string[]).includes(upper)) {
        return true
    }
    return DEFAULT_DENIED_ENV_PREFIXES.some((prefix) => upper.startsWith(prefix))
}

/** 本次运行被过滤过的环境变量名（去重后只计数，不对外暴露键名）。 */
const filteredEnvKeyNames = new Set<string>()

/** 至少过滤过一次的受管命令数。 */
let envFilteredCommandCount = 0

/** 记录一次过滤（有命中才计入命令数，避免「过滤 0 个」也抬高命令计数）。 */
export function recordEnvFiltering(filteredNames: string[]): void {
    if (filteredNames.length === 0) {
        return
    }
    envFilteredCommandCount++
    for (const name of filteredNames) {
        filteredEnvKeyNames.add(name.toUpperCase())
    }
}

/** 运行级环境硬化快照：被过滤的变量个数 + 命中命令数（未命中时为 `undefined`）。 */
export function getEnvHardeningSnapshot(): { filteredKeys: number, filteredCommands: number } | undefined {
    if (filteredEnvKeyNames.size === 0) {
        return undefined
    }
    return {
        filteredKeys: filteredEnvKeyNames.size,
        filteredCommands: envFilteredCommandCount,
    }
}

/** 复位运行级计数（每次构造 `DependfixApp` 时调用）。 */
export function resetEnvHardeningState(): void {
    filteredEnvKeyNames.clear()
    envFilteredCommandCount = 0
}

/**
 * 过滤执行子进程环境：移除平台密钥类变量，保留工具链变量与其余变量。
 *
 * 只返回「移除了几个键」，**不返回键名**——调用方把它写进运行结果 / 报告时不会泄露
 * 平台密钥的命名（键名本身也是攻击面的提示）。同时记入运行级计数。
 */
export function sanitizeCommandEnv(env: NodeJS.ProcessEnv = process.env): {
    env: NodeJS.ProcessEnv
    filteredKeys: number
} {
    const sanitized: NodeJS.ProcessEnv = {}
    const filteredNames: string[] = []
    for (const [key, value] of Object.entries(env)) {
        if (isDeniedEnvKey(key)) {
            filteredNames.push(key)
            continue
        }
        sanitized[key] = value
    }
    recordEnvFiltering(filteredNames)
    return { env: sanitized, filteredKeys: filteredNames.length }
}
