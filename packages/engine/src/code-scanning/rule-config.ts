import { existsSync, readFileSync } from 'node:fs'

// ---------------------------------------------------------------------------
// Code Scanning 规则分类配置
//
// 解决硬编码常量表（rule-classifier.AUTO_FIXABLE_RULES / SUGGESTED_RULES）
// 不可配置的痛点：运营 / 平台 / 私有仓库可按 CodeQL 规则集演化新增的规则 id
// 自定义白名单与建议规则，无需发版即可调整。
//
// 设计目标：
// - 默认行为等价当前常量表（向后兼容）；不传 env / 无文件 → 走默认值
// - 配置文件格式简单可手写（JSON）
// - 非法配置：降级默认 + console.warn（不静默、不中断流程）
// - 单测可注入：setActiveRulesConfig + resetActiveRulesConfig
//
// 文件结构（JSON）：
// {
//   "rules": [
//     { "id": "eol-last", "class": "auto-fixable" },
//     { "id": "js/sql-injection", "class": "suggested", "suggestion": "..." },
//     ...
//   ]
// }
//
// env 覆盖：CODE_SCANNING_RULES_CONFIG_PATH = 配置文件绝对/相对路径
// ---------------------------------------------------------------------------

export type RuleClass = 'auto-fixable' | 'suggested' | 'report-only'

export interface RuleConfigEntry {
    /** 规则 id（如 `js/sql-injection`，trim 后用于匹配；空串非法） */
    id: string
    /** 分类 */
    class: RuleClass
    /** B 类建议文本（A/C 类可省略） */
    suggestion?: string
}

export interface RulesConfigFile {
    rules: RuleConfigEntry[]
}

/** 编译后的内部表示：高性能查找（A 类 Set / B 类 Map） */
export interface CompiledRulesConfig {
    autoFixable: ReadonlySet<string>
    suggested: ReadonlyMap<string, string>
}

/** 默认规则配置（编译后；与既有常量表等价，单点声明保持向后兼容） */
export const DEFAULT_RULES_CONFIG: CompiledRulesConfig = {
    autoFixable: new Set<string>(['eol-last']),
    suggested: new Map<string, string>([
        ['no-unused-vars', '删除未使用的变量/导入；注意导出引用与副作用（import 副作用场景），确认后手动删除'],
        ['js/sql-injection', '使用参数化查询（PreparedStatement / query builder），禁止字符串拼接 SQL'],
        ['js/xss', '输出前 HTML 转义；innerHTML / document.write 场景用 DOMPurify 等清洗库'],
        ['js/path-injection', '校验用户输入路径在预期目录内（path.resolve + 前缀校验），禁止直接拼接文件路径'],
        ['js/command-line-injection', '避免 shell 字符串拼接，使用参数数组（child_process.spawn(args)）'],
        ['js/insecure-randomness', '安全随机数使用 crypto.randomBytes / Web Crypto，禁止 Math.random'],
        ['js/weak-cryptographic-algorithm', '升级为强算法（AES-256-GCM / Argon2 / SHA-256+），安全场景禁用 MD5/SHA-1'],
        ['js/missing-rate-limiting', '为认证/敏感接口添加限流（如 express-rate-limit）'],
        ['js/clear-text-storage-of-sensitive-data', '敏感数据加密存储（AES-256-GCM），禁止明文落盘'],
        ['js/clear-text-transmission-of-sensitive-data', '启用 TLS（HTTPS/WSS），禁止明文传输敏感数据'],
        ['js/hardcoded-credentials', '凭证移入环境变量/密钥管理服务（GitHub Secrets / Vault），禁止硬编码'],
        ['py/sql-injection', '使用参数化查询（sqlite3 占位符 / SQLAlchemy 参数绑定），禁止字符串拼接 SQL'],
        ['py/path-injection', '校验并规范化用户输入路径（os.path.realpath + 目录前缀校验）'],
        ['py/command-line-injection', '使用参数数组（subprocess.run(args)），禁止 shell=True 字符串拼接'],
        ['py/insecure-default-file-permissions', '创建文件时显式设置权限（os.open mode / umask）'],
        ['java/sql-injection', '使用 PreparedStatement 参数绑定，禁止字符串拼接 SQL'],
        ['java/path-injection', '校验用户输入路径（Path.normalize() + startsWith 检查），禁止直接拼接'],
        ['java/command-line-injection', '使用 ProcessBuilder 参数列表，禁止 shell 字符串拼接'],
    ]),
}

/**
 * 解析 JSON 配置输入为编译后配置。
 *
 * 校验规则（全部失败均降级返回 null，由调用方走默认）：
 * - 顶层必须是对象，含 `rules` 数组
 * - 每个 entry 必须含非空 `id`（trim 后）、合法 `class`
 * - 同 id 在多个 class 中出现 → 拒绝（disjointness 不变量）
 * - suggested 必须含 `suggestion` 字段且非空
 *
 * @returns 解析成功 → 编译后配置；失败 → null（调用方降级）
 */
export function parseRulesConfig(input: unknown): CompiledRulesConfig | null {
    if (!input || typeof input !== 'object') {
        return null
    }
    const file = input as Partial<RulesConfigFile>
    if (!Array.isArray(file.rules)) {
        return null
    }

    const autoFixable = new Set<string>()
    const suggested = new Map<string, string>()
    const seenIds = new Set<string>()

    for (const raw of file.rules) {
        if (!raw || typeof raw !== 'object') {
            return null
        }
        const id = typeof raw.id === 'string' ? raw.id.trim() : ''
        if (!id) {
            return null
        }
        if (seenIds.has(id)) {
            // 同 id 在多 class 中重复 → 拒绝（disjointness 违规）
            return null
        }
        seenIds.add(id)

        const cls = raw.class
        if (cls !== 'auto-fixable' && cls !== 'suggested' && cls !== 'report-only') {
            return null
        }

        if (cls === 'auto-fixable') {
            autoFixable.add(id)
            // A 类的 suggestion 字段若存在则忽略（B 类专属）
        } else if (cls === 'suggested') {
            const suggestion = typeof raw.suggestion === 'string' ? raw.suggestion.trim() : ''
            if (!suggestion) {
                return null
            }
            suggested.set(id, suggestion)
        } else {
            // report-only：仅占位（不进入查找集合），明确忽略 suggestion
        }
    }

    return { autoFixable, suggested }
}

/**
 * 从 JSON 文件路径加载并编译。读取失败 / 解析失败 / 校验失败 → 返回 null（调用方降级）。
 */
export function loadRulesConfigFromFile(configPath: string): CompiledRulesConfig | null {
    let content: string
    try {
        content = readFileSync(configPath, 'utf-8')
    } catch (error) {
        process.stderr.write(`[rule-config] cannot read ${configPath}: ${error instanceof Error ? error.message : String(error)}\n`)
        return null
    }

    let parsed: unknown
    try {
        parsed = JSON.parse(content)
    } catch (error) {
        process.stderr.write(`[rule-config] invalid JSON in ${configPath}: ${error instanceof Error ? error.message : String(error)}\n`)
        return null
    }

    const compiled = parseRulesConfig(parsed)
    if (!compiled) {
        process.stderr.write(`[rule-config] invalid config schema in ${configPath}, falling back to defaults\n`)
    }
    return compiled
}

/** 环境变量名：Code Scanning 规则分类配置文件路径 */
export const RULE_CONFIG_ENV = 'CODE_SCANNING_RULES_CONFIG_PATH'

/**
 * 从 env 读取 `RULE_CONFIG_ENV` 并尝试加载。
 *
 * - env 未设或空 → 返回 null（调用方继续走默认）
 * - 路径不存在 → 返回 null
 * - 加载失败 → 返回 null（错误已写入 stderr）
 */
export function loadRulesConfigFromEnv(env: NodeJS.ProcessEnv): CompiledRulesConfig | null {
    const path = env[RULE_CONFIG_ENV]?.trim()
    if (!path) {
        return null
    }
    if (!existsSync(path)) {
        process.stderr.write(`[rule-config] ${RULE_CONFIG_ENV} points to non-existent path: ${path}\n`)
        return null
    }
    return loadRulesConfigFromFile(path)
}

// ---------------------------------------------------------------------------
// Module-level active config（classifyRule / suggestionFor 读取此状态）
// ---------------------------------------------------------------------------

let activeConfig: CompiledRulesConfig = DEFAULT_RULES_CONFIG

/** 获取当前生效的配置（classifyRule / suggestionFor 内部使用） */
export function getActiveRulesConfig(): CompiledRulesConfig {
    return activeConfig
}

/**
 * 替换为自定义配置。
 *
 * **使用协议**：运行时模块初始化时（如 AppContext 装配）调用一次；
 * 测试可临时覆盖后通过 `resetActiveRulesConfig` 恢复。频繁切换会破坏
 * `code-scanning-fetcher` 的可预测行为（同一规则在不同 fetch 中分类不同）。
 */
export function setActiveRulesConfig(config: CompiledRulesConfig): void {
    activeConfig = config
}

/** 重置为默认配置（测试 cleanup + 运行时 fallback） */
export function resetActiveRulesConfig(): void {
    activeConfig = DEFAULT_RULES_CONFIG
}
