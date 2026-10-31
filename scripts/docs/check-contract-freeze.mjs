/**
 * check-contract-freeze.mjs —— 1.0 契约冻结清单机检（对应
 * `docs/design/governance/release-1.0-readiness.md` 的 G2 门槛）。
 *
 * 背景：1.0 的对外契约（CLI 参数与模式 / Action inputs / 运行时配置与环境变量 / 报告 JSON 字段 /
 * 平台数据库表列）一旦发布就不能在 1.x 内破坏。清单写在
 * [contract-freeze.md](../docs/guide/contract-freeze.md)，但**手抄清单会漂移**：新增 flag 忘了登记、
 * 删字段没改文档，人工 review 抓不住。本脚本从代码事实源抽取实际键位与清单比对，差异即失败。
 *
 * 事实源（全部由 AST / YAML 解析，不做文本 grep）：
 * - CLI 参数：`packages/cli/src/cli/index.ts` 的 `argsDef` 顶层键（含 `mode` 位置参数）
 * - 运行模式：`packages/engine/src/config/index.ts` 的 `RUNTIME_MODES`
 * - Action inputs：`action.yml#inputs`
 * - 配置项：`RuntimeConfig` 顶层属性 + `DEPENDFIX_*` 环境变量（npm 包源码中 `readEnv` 实参 /
 *   代码字面量 / 属性读取的并集；平台部署变量不在冻结面，见 contract-freeze.md §1）
 * - 报告字段：`RunResult` / `RepositoryResult` 顶层属性
 * - DB 表列：`apps/platform/server/entities/*.ts` 的 `@Entity` 类 → 列（含 BaseEntity 继承列），
 *   列名按平台 `SnakeCaseNamingStrategy` 换算为物理名
 *
 * 同时校验 zh / en quick-start 的 CLI 参数表 == `argsDef` 键位（避免「文档漏参数」回流）。
 *
 * fail-closed 三类：清单小节缺失 / 事实源抽取为空 / 出现抽取器未覆盖的写法（`@Embedded`、
 * `@ManyToMany` 的 join table、env 解构、非常量 `readEnv` 实参）——后者的后果是静默少登记键位，
 * 比对发现不了，所以必须显式失败并要求扩展抽取器。
 *
 * 用法：
 *   node scripts/docs/check-contract-freeze.mjs            # 全量检查
 *   node scripts/docs/check-contract-freeze.mjs --json     # 机读
 *   node scripts/docs/check-contract-freeze.mjs --root=<dir>  # 自测用：改读指定根
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { parse as parseYaml } from 'yaml'
import { getCliArgs, isDirectExecution } from '../shared/cli.mjs'
import { fenceMask } from './md-scan.mjs'
import { extractTableKeys } from './check-guide-parity.mjs'

/** 契约清单文档与各事实源路径（相对仓库根）。 */
export const PATHS = {
    contractDoc: 'docs/guide/contract-freeze.md',
    quickStartZh: 'docs/guide/quick-start.md',
    quickStartEn: 'docs/i18n/en-US/guide/quick-start.md',
    quickStartZhHeading: 'CLI 参数',
    quickStartEnHeading: 'CLI flags',
    argsDef: 'packages/cli/src/cli/index.ts',
    engineConfig: 'packages/engine/src/config/index.ts',
    packagesSrc: 'packages',
    reportTypes: 'packages/core/src/report/types.ts',
    action: 'action.yml',
    entitiesDir: 'apps/platform/server/entities',
    baseEntity: 'apps/platform/server/entities/base-entity.ts',
}

/** 契约清单中的九类键位（heading 为文档内 `####` 标题原文）。 */
export const CONTRACT_LISTS = [
    { id: 'cli-args', heading: 'CLI 参数（argsDef）', source: 'CLI argsDef' },
    { id: 'cli-modes', heading: '运行模式（RUNTIME_MODES）', source: 'RUNTIME_MODES' },
    { id: 'action-inputs', heading: 'action.yml inputs', source: 'action.yml#inputs' },
    { id: 'config-props', heading: 'RuntimeConfig 属性', source: 'RuntimeConfig' },
    { id: 'config-env', heading: '环境变量（DEPENDFIX_ 前缀）', source: 'readEnv / 字面量' },
    { id: 'report-run-result', heading: 'RunResult 字段', source: 'RunResult' },
    { id: 'report-repository-result', heading: 'RepositoryResult 字段', source: 'RepositoryResult' },
]

/** 实体上产生物理列的装饰器（其余装饰器不参与表列契约）。 */
const COLUMN_DECORATORS = new Set([
    'Column',
    'PrimaryColumn',
    'PrimaryGeneratedColumn',
    'CreateDateColumn',
    'UpdateDateColumn',
    'DeleteDateColumn',
    'VersionColumn',
    'ObjectIdColumn',
])

/** 产生外键列的关联装饰器（`@OneToMany` / `@ManyToMany` 不产生本表列）。 */
const RELATION_DECORATORS = new Set(['ManyToOne', 'OneToOne'])

/** 本脚本自身的仓库根（默认根，避免依赖调用方 cwd）。 */
const SCRIPT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

/** 与平台 `apps/platform/server/database/naming-strategy.ts#toSnakeCase` 同源换算。 */
export function toSnakeCase(input) {
    return input
        .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
        .replace(/[-\s.]+/g, '_')
        .toLowerCase()
}

/** 解析 TS 源码文件为 AST（保留父指针，便于按类取装饰器）。 */
function parseFile(filePath) {
    const source = readFileSync(filePath, 'utf8')
    return ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
}

/** 按仓库相对路径解析 TS 源码。 */
function parseTs(repoRoot, relPath) {
    return parseFile(join(repoRoot, relPath))
}

/** 去掉 `as` / `satisfies` / 括号包裹，取真实初始化表达式。 */
function unwrapExpression(node) {
    let current = node
    while (
        current
        && (ts.isAsExpression(current) || ts.isSatisfiesExpression(current)
            || ts.isParenthesizedExpression(current) || ts.isTypeAssertionExpression(current))
    ) {
        current = current.expression
    }
    return current
}

/** 取字符串 / 无插值模板字面量的文本。 */
function literalText(node) {
    if (!node) {
        return undefined
    }
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
        return node.text
    }
    return undefined
}

/** 取对象字面量指定键的字面量值（`{ name: 'x' }`）。 */
function objectLiteralString(node, key) {
    if (!node || !ts.isObjectLiteralExpression(node)) {
        return undefined
    }
    for (const property of node.properties) {
        if (!ts.isPropertyAssignment(property)) {
            continue
        }
        const name = ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)
            ? property.name.text
            : undefined
        if (name === key) {
            return literalText(unwrapExpression(property.initializer))
        }
    }
    return undefined
}

/** 遍历 AST（含类成员装饰器）。 */
function walk(node, visit) {
    visit(node)
    ts.forEachChild(node, (child) => walk(child, visit))
}

/** 取变量声明的初始化表达式（按名称）。 */
function variableInitializer(sourceFile, name) {
    for (const statement of sourceFile.statements) {
        if (!ts.isVariableStatement(statement)) {
            continue
        }
        for (const declaration of statement.declarationList.declarations) {
            if (ts.isIdentifier(declaration.name) && declaration.name.text === name) {
                return declaration.initializer
            }
        }
    }
    return undefined
}

/** 取对象字面量的键名列表（键序保留）。 */
function objectKeys(node) {
    const target = unwrapExpression(node)
    if (!target || !ts.isObjectLiteralExpression(target)) {
        return undefined
    }
    const keys = []
    for (const property of target.properties) {
        if (ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property)) {
            const name = ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)
                ? property.name.text
                : undefined
            if (name !== undefined) {
                keys.push(name)
            }
        }
    }
    return keys
}

/** 取接口声明的顶层属性名（跳过方法签名与索引签名）。 */
function interfaceKeys(sourceFile, interfaceName) {
    for (const statement of sourceFile.statements) {
        if (!ts.isInterfaceDeclaration(statement) || statement.name.text !== interfaceName) {
            continue
        }
        return statement.members
            .filter((member) => ts.isPropertySignature(member) && member.name !== undefined)
            .map((member) => (ts.isIdentifier(member.name) || ts.isStringLiteral(member.name) ? member.name.text : ''))
            .filter((name) => name.length > 0)
    }
    return undefined
}

/** 取数组字面量的字符串元素（`X as const` / `readonly X[]` 均已解包）。 */
function stringArrayElements(node) {
    const target = unwrapExpression(node)
    if (!target || !ts.isArrayLiteralExpression(target)) {
        return undefined
    }
    return target.elements.map((element) => literalText(unwrapExpression(element))).filter((text) => text !== undefined)
}

/** CLI 参数键位（`argsDef` 顶层键，含位置参数 `mode`）。 */
export function extractCliArgs(repoRoot) {
    const sourceFile = parseTs(repoRoot, PATHS.argsDef)
    return objectKeys(variableInitializer(sourceFile, 'argsDef'))
}

/** 运行模式（`RUNTIME_MODES`）。 */
export function extractRuntimeModes(repoRoot) {
    const sourceFile = parseTs(repoRoot, PATHS.engineConfig)
    return stringArrayElements(variableInitializer(sourceFile, 'RUNTIME_MODES'))
}

/** Action inputs（`action.yml#inputs` 顶层键）。 */
export function extractActionInputs(repoRoot) {
    const parsed = parseYaml(readFileSync(join(repoRoot, PATHS.action), 'utf8'))
    const inputs = parsed?.inputs
    if (!inputs || typeof inputs !== 'object') {
        return undefined
    }
    return Object.keys(inputs)
}

/** `RuntimeConfig` 顶层属性。 */
export function extractConfigProps(repoRoot) {
    return interfaceKeys(parseTs(repoRoot, PATHS.engineConfig), 'RuntimeConfig')
}

/** 报告接口顶层字段。 */
export function extractReportFields(repoRoot, interfaceName) {
    return interfaceKeys(parseTs(repoRoot, PATHS.reportTypes), interfaceName)
}

/** 递归列出目录下的 TS 源文件（跳过测试与夹具）。 */
function listTsFiles(dir) {
    const files = []
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry)
        if (statSync(full).isDirectory()) {
            if (entry === '__fixtures__' || entry === 'node_modules') {
                continue
            }
            files.push(...listTsFiles(full))
            continue
        }
        if (!entry.endsWith('.ts') || entry.endsWith('.test.ts') || entry.endsWith('.d.ts')) {
            continue
        }
        files.push(full)
    }
    return files
}

/** 列出各 npm 包的 `src` 目录（`packages/<name>/src`）下的全部 TS 源文件。 */
function listPackageSources(repoRoot) {
    const packagesRoot = join(repoRoot, PATHS.packagesSrc)
    const files = []
    for (const entry of readdirSync(packagesRoot)) {
        const src = join(packagesRoot, entry, 'src')
        if (!existsSync(src) || !statSync(src).isDirectory()) {
            continue
        }
        files.push(...listTsFiles(src))
    }
    return files
}

/**
 * `DEPENDFIX_*` 环境变量键位（npm 包：cli / core / engine / mcp / skills）。
 *
 * 三路取并集，**只认代码里的字面量**（注释里的示例名不是契约，如 `DEPENDFIX_ALLOW_MAJOR_UPGRADE`
 * 只在 JSDoc 里作为「刻意不提供」的反例出现）：
 * ① `readEnv(env, 'NAME')` 的实参（引擎约定所有 env 读取经 `readEnv`，前缀在别处拼接，
 *   直接 grep 源码会漏掉绝大多数键）；
 * ② 源码里写死的完整键名字符串；
 * ③ `env.DEPENDFIX_X` / `process.env.DEPENDFIX_X` 属性读取（未经 `readEnv` 的少数键）。
 * 结尾带下划线的片段（模板字符串前缀残片）不是键位，剔除。
 * 平台部署变量（`DEPENDFIX_ROLE` 等）不在面内：平台不是 npm 包，其变量见配置说明的平台段。
 */
export function extractEnvVars(repoRoot) {
    const prefixSource = parseTs(repoRoot, PATHS.engineConfig)
    const prefix = literalText(variableInitializer(prefixSource, 'ENV_PREFIX')) ?? 'DEPENDFIX_'
    const keys = new Set()
    for (const file of listPackageSources(repoRoot)) {
        walk(parseFile(file), (node) => {
            if (ts.isStringLiteralLike(node) && /^DEPENDFIX_[A-Z0-9_]+$/.test(node.text)) {
                keys.add(node.text)
            }
            if (ts.isPropertyAccessExpression(node) && /^DEPENDFIX_[A-Z0-9_]+$/.test(node.name.text)) {
                keys.add(node.name.text)
            }
            if (!ts.isCallExpression(node) || node.expression.getText() !== 'readEnv') {
                return
            }
            const name = literalText(node.arguments[1])
            if (name) {
                keys.add(`${prefix}${name}`)
            }
        })
    }
    return [...keys].sort()
}

/** 会产生列 / join table / 关系列但抽取器未覆盖的装饰器与读取形态。 */
const UNSUPPORTED_ENTITY_DECORATORS = ['Embedded', 'ManyToMany', 'JoinTable', 'RelationId', 'TreeParent', 'TreeChildren', 'VirtualColumn']

/**
 * 检出抽取器未覆盖的写法（fail-closed）。
 *
 * 这些写法会**静默**产出列或 env 键而比对发现不了（清单与抽取结果都少同一项），
 * 所以一旦出现就失败，要求扩展抽取器，而不是让它悄悄漏登记。
 * @returns {string[]} 人类可读的问题列表（空 = 未命中）
 */
export function detectUnsupportedPatterns(repoRoot) {
    const problems = []
    for (const file of listPackageSources(repoRoot)) {
        walk(parseFile(file), (node) => {
            // `const { DEPENDFIX_X } = process.env` / `= env`：解构读取无法还原键名
            if (ts.isVariableDeclaration(node) && ts.isObjectBindingPattern(node.name) && node.initializer) {
                const text = node.initializer.getText()
                if (/(^|\.)env$/.test(text) || text.endsWith('process.env')) {
                    problems.push(`${file}: env 解构不可抽取（改用 readEnv(env, 'NAME') 或属性读取）`)
                }
            }
            // `readEnv(env, name)`：实参不是字面量，无法还原键名
            if (ts.isCallExpression(node) && node.expression.getText() === 'readEnv'
                && node.arguments.length > 1 && literalText(node.arguments[1]) === undefined) {
                problems.push(`${file}: readEnv 的第二参数不是字面量，无法抽取键名`)
            }
        })
    }
    const entitiesDir = join(repoRoot, PATHS.entitiesDir)
    for (const entry of readdirSync(entitiesDir)) {
        if (!entry.endsWith('.ts') || entry.endsWith('.test.ts')) {
            continue
        }
        walk(parseFile(join(entitiesDir, entry)), (node) => {
            if (!ts.isClassDeclaration(node)) {
                return
            }
            for (const member of node.members) {
                const unsupported = decoratorNames(member).filter((name) => UNSUPPORTED_ENTITY_DECORATORS.includes(name))
                if (unsupported.length > 0) {
                    problems.push(`${join(PATHS.entitiesDir, entry)}: 装饰器 @${unsupported.join(' / @')} 会产生列或 join table，抽取器尚未覆盖`)
                }
            }
        })
    }
    return problems
}

/** 取类声明上的装饰器调用名。 */
function decoratorNames(member) {
    const decorators = ts.canHaveDecorators(member) ? ts.getDecorators(member) ?? [] : []
    return decorators.map((decorator) => {
        const expression = decorator.expression
        if (ts.isCallExpression(expression)) {
            return ts.isIdentifier(expression.expression) ? expression.expression.text : ''
        }
        return ts.isIdentifier(expression) ? expression.text : ''
    })
}

/** 取指定装饰器的调用实参节点。 */
function decoratorArguments(member, name) {
    const decorators = ts.canHaveDecorators(member) ? ts.getDecorators(member) ?? [] : []
    for (const decorator of decorators) {
        const expression = decorator.expression
        if (ts.isCallExpression(expression) && ts.isIdentifier(expression.expression) && expression.expression.text === name) {
            return expression.arguments
        }
    }
    return undefined
}

/** 类声明对应的 `@Entity('table')` 表名。 */
function entityTableName(classDeclaration) {
    const args = decoratorArguments(classDeclaration, 'Entity')
    return args ? literalText(args[0]) : undefined
}

/**
 * 单个类成员产生的物理列名。
 * - 列装饰器：`{ name }` 优先（命名策略同样对自定义名做 snake_case），否则属性名换算
 * - 关联装饰器：`@JoinColumn({ name })`，缺省按策略的 `relationName_referencedColumnName` 推导
 */
function memberColumns(member) {
    const names = decoratorNames(member)
    if (!ts.isPropertyDeclaration(member) || !ts.isIdentifier(member.name)) {
        return []
    }
    const propertyName = member.name.text
    if (names.some((name) => COLUMN_DECORATORS.has(name))) {
        const args = names.map((name) => decoratorArguments(member, name)).find((value) => value !== undefined)
        const custom = objectLiteralString(args?.[0], 'name')
        return [custom ? toSnakeCase(custom) : toSnakeCase(propertyName)]
    }
    if (names.some((name) => RELATION_DECORATORS.has(name))) {
        const joinArgs = decoratorArguments(member, 'JoinColumn')
        const custom = objectLiteralString(joinArgs?.[0], 'name')
        return [custom ? toSnakeCase(custom) : toSnakeCase(`${propertyName}_id`)]
    }
    return []
}

/** `BaseEntity` 的继承列（所有表共有）。 */
export function extractBaseColumns(repoRoot) {
    const sourceFile = parseTs(repoRoot, PATHS.baseEntity)
    const columns = []
    walk(sourceFile, (node) => {
        if (!ts.isClassDeclaration(node) || node.name?.text !== 'BaseEntity') {
            return
        }
        for (const member of node.members) {
            columns.push(...memberColumns(member))
        }
    })
    return columns
}

/** 实体表 → 物理列名（按声明顺序，含继承列）。 */
export function extractEntityColumns(repoRoot) {
    const dir = join(repoRoot, PATHS.entitiesDir)
    const baseColumns = extractBaseColumns(repoRoot)
    const tables = new Map()
    for (const entry of readdirSync(dir).sort()) {
        if (!entry.endsWith('.ts') || entry.endsWith('.test.ts')) {
            continue
        }
        const sourceFile = parseTs(repoRoot, join(PATHS.entitiesDir, entry).replaceAll('\\', '/'))
        walk(sourceFile, (node) => {
            if (!ts.isClassDeclaration(node)) {
                return
            }
            const table = entityTableName(node)
            if (!table) {
                return
            }
            const columns = [...baseColumns]
            for (const member of node.members) {
                columns.push(...memberColumns(member))
            }
            // 关系列常与同名外键属性列重复（`repositoryId` 列 + `repository` 关联的 JoinColumn），按首次出现去重
            tables.set(toSnakeCase(table), [...new Set(columns)])
        })
    }
    return tables
}

/**
 * 取文档中指定 `####` 标题之后的第一个 fenced 清单。
 * fail-closed：标题缺失或代码块为空都返回 `null`（标题改名 = 门禁失效，不能静默通过）。
 */
export function extractFencedList(content, heading) {
    const lines = content.split(/\r?\n/)
    const mask = fenceMask(lines)
    const escaped = heading.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const headingRe = new RegExp(`^#{2,6}\\s+${escaped}\\s*$`)
    const start = lines.findIndex((line, idx) => !mask[idx] && headingRe.test(line))
    if (start < 0) {
        return null
    }
    const items = []
    let opened = false
    for (let i = start + 1; i < lines.length; i++) {
        const line = lines[i]
        if (!mask[i]) {
            if (/^#{1,6}\s/.test(line) && !opened) {
                return null
            }
            continue
        }
        if (!opened) {
            opened = true
            continue
        }
        if (line.trim().startsWith('```')) {
            break
        }
        const value = line.trim()
        if (value.length > 0) {
            items.push(value)
        }
    }
    return items.length > 0 ? items : null
}

/** 文档 DB 小节：`table: col1, col2` 行 → Map。 */
export function parseTableColumnLines(items) {
    const tables = new Map()
    for (const item of items) {
        const separator = item.indexOf(':')
        if (separator <= 0) {
            continue
        }
        const table = item.slice(0, separator).trim()
        const columns = item.slice(separator + 1).split(',').map((column) => column.trim()).filter(Boolean)
        tables.set(table, columns)
    }
    return tables
}

/** 集合差异（顺序无关）。 */
export function diffKeys(expectedKeys, declaredKeys) {
    const expected = new Set(expectedKeys)
    const declared = new Set(declaredKeys)
    return {
        missing: [...expected].filter((key) => !declared.has(key)).sort(),
        extra: [...declared].filter((key) => !expected.has(key)).sort(),
    }
}

/** 表列差异（含表级增删）。 */
export function diffTableColumns(expectedTables, declaredTables) {
    const problems = []
    const expectedNames = new Set(expectedTables.keys())
    const declaredNames = new Set(declaredTables.keys())
    for (const table of [...expectedNames].filter((name) => !declaredNames.has(name)).sort()) {
        problems.push(`缺少表: ${table}`)
    }
    for (const table of [...declaredNames].filter((name) => !expectedNames.has(name)).sort()) {
        problems.push(`清单多出未存在的表: ${table}`)
    }
    for (const table of [...expectedNames].filter((name) => declaredNames.has(name)).sort()) {
        const { missing, extra } = diffKeys(expectedTables.get(table), declaredTables.get(table))
        for (const column of missing) {
            problems.push(`${table}: 缺少列 ${column}`)
        }
        for (const column of extra) {
            problems.push(`${table}: 清单多出列 ${column}`)
        }
    }
    return problems
}

/** quick-start 表格键位（`mode` + `--flag`）→ 去掉 `--` 前缀的键集。 */
export function extractQuickStartFlags(content, heading) {
    const keys = extractTableKeys(content, heading)
    return [...keys].map((key) => key.replace(/^--/, '')).filter((key) => /^[a-z][a-z0-9-]*$/.test(key))
}

/**
 * 全量检查。
 * @returns {{ lists: Array<{ id: string, error?: string, missing: string[], extra: string[] }>, quickStart: Array<{ id: string, error?: string, missing: string[], extra: string[] }>, tables: string[] }}
 */
export function checkContractFreeze(repoRoot) {
    const doc = readFileSync(join(repoRoot, PATHS.contractDoc), 'utf8')
    const actual = {
        'cli-args': () => extractCliArgs(repoRoot),
        'cli-modes': () => extractRuntimeModes(repoRoot),
        'action-inputs': () => extractActionInputs(repoRoot),
        'config-props': () => extractConfigProps(repoRoot),
        'config-env': () => extractEnvVars(repoRoot),
        'report-run-result': () => extractReportFields(repoRoot, 'RunResult'),
        'report-repository-result': () => extractReportFields(repoRoot, 'RepositoryResult'),
    }

    const lists = CONTRACT_LISTS.map((list) => {
        const declared = extractFencedList(doc, list.heading)
        if (declared === null) {
            return { id: list.id, error: `文档未找到小节「${list.heading}」或其后的非空 fenced 清单`, missing: [], extra: [] }
        }
        const expected = actual[list.id]()
        if (!expected || expected.length === 0) {
            return { id: list.id, error: `事实源抽取为空（${list.source}）：源文件移动或结构改名？`, missing: [], extra: [] }
        }
        return { id: list.id, ...diffKeys(expected, declared) }
    })

    const cliArgs = extractCliArgs(repoRoot) ?? []
    const quickStart = [
        { id: 'quick-start-zh', path: PATHS.quickStartZh, heading: PATHS.quickStartZhHeading },
        { id: 'quick-start-en', path: PATHS.quickStartEn, heading: PATHS.quickStartEnHeading },
    ].map((entry) => {
        const content = readFileSync(join(repoRoot, entry.path), 'utf8')
        const declared = extractQuickStartFlags(content, entry.heading)
        if (declared.length === 0) {
            return { id: entry.id, error: `未在「${entry.heading}」表格中提取到 CLI 参数（标题改名或表格缺失？）`, missing: [], extra: [] }
        }
        return { id: entry.id, ...diffKeys(cliArgs, declared) }
    })

    const tableItems = extractFencedList(doc, '表与列（物理名）')
    const unsupported = detectUnsupportedPatterns(repoRoot)
    if (tableItems === null) {
        return {
            lists,
            quickStart,
            tables: ['文档未找到小节「表与列（物理名）」或其后的非空 fenced 清单'],
            unsupported,
        }
    }
    return {
        lists,
        quickStart,
        tables: diffTableColumns(extractEntityColumns(repoRoot), parseTableColumnLines(tableItems)),
        unsupported,
    }
}

if (isDirectExecution(import.meta.url)) {
    const args = getCliArgs()
    const json = args.includes('--json')
    const rootArg = args.find((arg) => arg.startsWith('--root='))
    const result = checkContractFreeze(rootArg ? resolve(rootArg.slice('--root='.length)) : SCRIPT_ROOT)
    const failed = result.lists.filter((list) => list.error || list.missing.length > 0 || list.extra.length > 0)
    const quickStartFailed = result.quickStart.filter((entry) => entry.error || entry.missing.length > 0 || entry.extra.length > 0)

    if (json) {
        console.log(JSON.stringify(result, null, 2))
    } else {
        for (const list of result.lists) {
            if (list.error) {
                console.error(`[check-contract-freeze] FAIL: ${list.id}: ${list.error}`)
                continue
            }
            if (list.missing.length === 0 && list.extra.length === 0) {
                console.log(`[check-contract-freeze] OK: ${list.id}`)
                continue
            }
            console.error(`[check-contract-freeze] FAIL: ${list.id}`)
            for (const key of list.missing) {
                console.error(`  - 清单缺少键位（代码已有）: ${key}`)
            }
            for (const key of list.extra) {
                console.error(`  - 清单多出键位（代码已无）: ${key}`)
            }
        }
        for (const entry of result.quickStart) {
            if (entry.error) {
                console.error(`[check-contract-freeze] FAIL: ${entry.id}: ${entry.error}`)
                continue
            }
            if (entry.missing.length === 0 && entry.extra.length === 0) {
                console.log(`[check-contract-freeze] OK: ${entry.id}`)
                continue
            }
            console.error(`[check-contract-freeze] FAIL: ${entry.id}`)
            for (const key of entry.missing) {
                console.error(`  - 表格缺少参数（argsDef 已有）: ${key}`)
            }
            for (const key of entry.extra) {
                console.error(`  - 表格多出参数（argsDef 已无）: ${key}`)
            }
        }
        if (result.tables.length === 0) {
            console.log('[check-contract-freeze] OK: db-tables')
        } else {
            console.error('[check-contract-freeze] FAIL: db-tables')
            for (const problem of result.tables) {
                console.error(`  - ${problem}`)
            }
        }
        if (result.unsupported.length === 0) {
            console.log('[check-contract-freeze] OK: extractor-coverage')
        } else {
            console.error('[check-contract-freeze] FAIL: extractor-coverage（出现抽取器未覆盖的写法，需扩展抽取器）')
            for (const problem of result.unsupported) {
                console.error(`  - ${problem}`)
            }
        }
    }

    if (failed.length > 0 || quickStartFailed.length > 0 || result.tables.length > 0 || result.unsupported.length > 0) {
        process.exit(1)
    }
}
