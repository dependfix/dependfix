#!/usr/bin/env node
/**
 * check-ai-governance：把 [AI 资产治理规范](../docs/standards/ai-governance.md) 的
 * 可机检规则收敛为单一门禁，避免 skill / agent 定义长期只靠人工遵守。
 *
 * 规则面（6 条，与规范 §2.1 / §2.2 / §3 / §5 对应）：
 * 1. `.github/skills/*\/SKILL.md` frontmatter 必填字段：`description` 非空、
 *    `metadata.internal: true`。
 * 2. skill 目录名 kebab-case 且与 frontmatter `name` 一致。
 * 3. `.github/agents/*.agent.md` 文件名 kebab-case + `name` / `description` 非空。
 * 4. `references/` 下每个文件被 SKILL.md 或 references 内索引文档引用
 *    （按路径段 / 文件名 token 匹配，不做裸子串匹配）。
 * 5. skill / agent 文档内相对链接 file-dead = 0（复用 check-docs 的链接抽取器）。
 * 6. 平台副本符号链接 `.claude/.agents/.opencode` 的 `agents` / `skills` 指向 `.github`；
 *    缺失或不是符号链接只给 warning（新工作树未跑 `setup-ai` 属常态，不阻断）。
 *
 * 扫描面只含 `.github/`：不跟随平台软链，避免同一内容扫两遍（规范 §2.2）。
 *
 * 设计原则：
 * - 零依赖、纯函数 + CLI 入口守卫（`isDirectExecution`），vitest import 无副作用
 * - 错误格式 `path:line 问题` 与 check-docs / check-orphan-ids 一致
 * - 退出码：0 通过 / 1 发现问题 / 2 参数错误
 *
 * 用法：
 *   node scripts/check-ai-governance.mjs
 *   node scripts/check-ai-governance.mjs --json
 */

import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs'
import { basename, dirname, join, relative, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { isDirectExecution } from './shared/cli.mjs'
import { LINK_RE, fenceMask } from './docs/md-scan.mjs'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** 规则条数（输出计数用，新增规则须同步本常量与规范）。 */
export const RULE_COUNT = 6

const KEBAB_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const AGENT_FILE_RE = /^([a-z0-9]+(?:-[a-z0-9]+)*)\.agent\.md$/
const PLATFORM_DIRS = ['.claude', '.agents', '.opencode']
const PLATFORM_LINKS = ['agents', 'skills']

/**
 * 解析最小 YAML frontmatter（仅顶层标量与一层 `metadata`）。
 *
 * 只覆盖本仓库 skill / agent 实际使用的形态：`key: value`、`metadata:` 下一层
 * `internal: true`。引号剥除、布尔值统一按字符串返回（调用方按 `'true'` 比较），
 * 避免为零散字段引入 YAML 依赖。
 *
 * @param {string} content 文件原文
 * @returns {{ data: Record<string, string | Record<string, string>>, endLine: number } | null}
 *   `endLine` 为闭合 `---` 的行号（1-based）；无 frontmatter 返回 null
 */
export function parseFrontmatter(content) {
    const lines = content.split(/\r?\n/)
    if (lines[0]?.trim() !== '---') {
        return null
    }
    const data = {}
    let currentKey = null
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i]
        if (line.trim() === '---') {
            return { data, endLine: i + 1 }
        }
        if (!line.trim() || line.trim().startsWith('#')) {
            continue
        }
        const indented = /^\s+/.test(line)
        const match = /^\s*([A-Za-z0-9_-]+):\s*(.*)$/.exec(line)
        if (!match) {
            continue
        }
        const [, key, rawValue] = match
        const value = rawValue.trim().replace(/^(['"])(.*)\1$/, '$2')
        if (indented && currentKey) {
            const parent = data[currentKey]
            if (parent && typeof parent === 'object') {
                parent[key] = value
            }
            continue
        }
        if (!indented) {
            if (value === '') {
                data[key] = {}
                currentKey = key
            } else {
                data[key] = value
                currentKey = null
            }
        }
    }
    return null
}

/** 递归列出目录下所有 `.md`（目录不存在返回空数组）。 */
export function listMarkdownFiles(dir) {
    if (!existsSync(dir) || !statSync(dir).isDirectory()) {
        return []
    }
    const files = []
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry)
        const stat = statSync(full)
        if (stat.isDirectory()) {
            files.push(...listMarkdownFiles(full))
        } else if (entry.endsWith('.md')) {
            files.push(full)
        }
    }
    return files
}

/** 递归列出目录下所有文件（目录不存在返回空数组）。 */
export function listFiles(dir) {
    if (!existsSync(dir) || !statSync(dir).isDirectory()) {
        return []
    }
    const files = []
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry)
        if (statSync(full).isDirectory()) {
            files.push(...listFiles(full))
        } else {
            files.push(full)
        }
    }
    return files
}

function rel(root, file) {
    return relative(root, file).split('\\').join('/')
}

const TOKEN_SPLIT_RE = /[\s()[\]<>"'`，。；：、（）,;]+/

/** 把文本切成 token（链接 / 行内代码 / 路径按分隔符归并），用于引用判定。 */
export function collectTokens(text) {
    return text.split(TOKEN_SPLIT_RE).filter(Boolean)
}

/**
 * 引用判定：候选路径（skill 相对路径 / references 相对路径 / 文件名）与 token
 * 精确相等或以 `/` 结尾命中。避免 `checklist.md` 被子串 `security-checklist.md` 顶替。
 */
function referencesToken(tokens, candidates) {
    return tokens.some((token) => {
        const normalized = token.replace(/^\.\//, '').split('#')[0]
        return candidates.some((candidate) => normalized === candidate || normalized.endsWith(`/${candidate}`))
    })
}

/** 规则 1 + 规则 2 + 规则 4：skills 的 frontmatter、命名与 references 引用。 */
export function checkSkills(root) {
    const skillsDir = join(root, '.github', 'skills')
    const errors = []
    if (!existsSync(skillsDir)) {
        return { errors, count: 0 }
    }
    const entries = readdirSync(skillsDir)
        .filter((entry) => statSync(join(skillsDir, entry)).isDirectory())
        .sort()
    for (const entry of entries) {
        const skillDir = join(skillsDir, entry)
        const skillFile = join(skillDir, 'SKILL.md')
        const relFile = rel(root, skillFile)
        if (!existsSync(skillFile)) {
            errors.push({ file: relFile, message: '缺少 SKILL.md' })
            continue
        }
        if (!KEBAB_RE.test(entry)) {
            errors.push({ file: relFile, message: `目录名不是 kebab-case: ${entry}` })
        }
        const content = readFileSync(skillFile, 'utf8')
        const frontmatter = parseFrontmatter(content)
        if (!frontmatter) {
            errors.push({ file: relFile, line: 1, message: '缺少 YAML frontmatter' })
            continue
        }
        const { name, description } = frontmatter.data
        const metadata = frontmatter.data.metadata
        if (typeof name !== 'string' || !name.trim()) {
            errors.push({ file: relFile, line: 1, message: 'frontmatter name 为空' })
        } else if (name !== entry) {
            errors.push({ file: relFile, line: 1, message: `frontmatter name (${name}) 与目录名不一致` })
        }
        if (typeof description !== 'string' || !description.trim()) {
            errors.push({ file: relFile, line: 1, message: 'frontmatter description 为空' })
        }
        if (typeof metadata !== 'object' || metadata.internal !== 'true') {
            errors.push({ file: relFile, line: 1, message: '缺少 metadata.internal: true' })
        }
        const referencesDir = join(skillDir, 'references')
        const referenceFiles = listFiles(referencesDir)
        const skillTokens = collectTokens(content)
        // 文件名候选仅在全局唯一时参与，避免 references/a/x.md 替 references/b/x.md 过审
        const basenameCounts = new Map()
        for (const file of referenceFiles) {
            basenameCounts.set(basename(file), (basenameCounts.get(basename(file)) ?? 0) + 1)
        }
        const candidatesFor = (file) => {
            const relRef = rel(skillDir, file)
            const relInReferences = rel(referencesDir, file)
            const candidates = [relRef, relInReferences]
            if (basenameCounts.get(basename(file)) === 1) {
                candidates.push(basename(file))
            }
            return candidates
        }
        // 索引源限定为「SKILL.md 一跳可达」的 references 文档：互引孤岛不算已引用
        const indexSources = referenceFiles
            .filter((file) => file.endsWith('.md') && referencesToken(skillTokens, candidatesFor(file)))
            .map((file) => ({ file, tokens: collectTokens(readFileSync(file, 'utf8')) }))
        for (const file of referenceFiles) {
            const candidates = candidatesFor(file)
            const otherIndexTokens = indexSources
                .filter((source) => source.file !== file)
                .map((source) => source.tokens)
            const referenced = [skillTokens, ...otherIndexTokens].some((tokens) => referencesToken(tokens, candidates))
            if (!referenced) {
                errors.push({ file: relFile, message: `references 文件未被引用: ${rel(skillDir, file)}` })
            }
        }
    }
    return { errors, count: entries.length }
}

/** 规则 3：agents 的文件名、frontmatter。 */
export function checkAgents(root) {
    const agentsDir = join(root, '.github', 'agents')
    const errors = []
    if (!existsSync(agentsDir)) {
        return { errors, count: 0 }
    }
    const entries = readdirSync(agentsDir)
        .filter((entry) => entry.endsWith('.md'))
        .sort()
    for (const entry of entries) {
        const file = join(agentsDir, entry)
        const relFile = rel(root, file)
        if (!AGENT_FILE_RE.test(entry)) {
            errors.push({ file: relFile, message: `文件名不是 kebab-case.agent.md: ${entry}` })
        }
        const frontmatter = parseFrontmatter(readFileSync(file, 'utf8'))
        if (!frontmatter) {
            errors.push({ file: relFile, line: 1, message: '缺少 YAML frontmatter' })
            continue
        }
        const { name, description } = frontmatter.data
        if (typeof name !== 'string' || !name.trim()) {
            errors.push({ file: relFile, line: 1, message: 'frontmatter name 为空' })
        }
        if (typeof description !== 'string' || !description.trim()) {
            errors.push({ file: relFile, line: 1, message: 'frontmatter description 为空' })
        }
    }
    return { errors, count: entries.length }
}

/** 规则 5：skill / agent 文档内相对链接 file-dead = 0。 */
export function checkAssetLinks(root) {
    const errors = []
    const files = [
        ...listMarkdownFiles(join(root, '.github', 'skills')),
        ...listMarkdownFiles(join(root, '.github', 'agents')),
    ].sort()
    for (const file of files) {
        const lines = readFileSync(file, 'utf8').split(/\r?\n/)
        const codeMask = fenceMask(lines)
        lines.forEach((line, index) => {
            if (codeMask[index]) {
                return
            }
            const clean = line.replace(/`[^`]*`/g, '')
            for (const match of clean.matchAll(LINK_RE)) {
                const target = match[2]
                if (!target || /^(https?:|mailto:|tel:|www\.|<|#)/.test(target)) {
                    continue
                }
                const [pathPart] = target.split('#')
                if (!pathPart || /^[a-zA-Z]:[\\/]|^\\\\|^\//.test(pathPart)) {
                    continue
                }
                const targetFile = resolve(dirname(file), pathPart)
                if (!existsSync(targetFile)) {
                    errors.push({ file: rel(root, file), line: index + 1, message: `链接目标不存在: ${pathPart}` })
                }
            }
        })
    }
    return { errors, scanned: files.length }
}

/** 规则 6：平台副本符号链接（只给 warning）。 */
export function checkPlatformCopies(root) {
    const warnings = []
    for (const platform of PLATFORM_DIRS) {
        for (const kind of PLATFORM_LINKS) {
            const linkPath = join(root, platform, kind)
            const expected = join(root, '.github', kind)
            let linkStat = null
            try {
                linkStat = lstatSync(linkPath)
            } catch {
                warnings.push({ file: `${platform}/${kind}`, message: `平台副本缺失（可运行 node scripts/setup/setup-ai.mjs 重建）` })
                continue
            }
            if (!linkStat.isSymbolicLink()) {
                warnings.push({ file: `${platform}/${kind}`, message: '平台副本不是符号链接（规范 §2.2 要求 junction）' })
                continue
            }
            if (!existsSync(expected)) {
                warnings.push({ file: `${platform}/${kind}`, message: `源目录 .github/${kind} 缺失，无法核对副本指向` })
                continue
            }
            try {
                if (realpathSync(linkPath) !== realpathSync(expected)) {
                    warnings.push({ file: `${platform}/${kind}`, message: `平台副本未指向 .github/${kind}` })
                }
            } catch {
                warnings.push({ file: `${platform}/${kind}`, message: '平台副本符号链接无法解析' })
            }
        }
    }
    return { warnings }
}

/**
 * 汇总检查：返回 errors / warnings / 计数。
 * @param {string} root 仓库根（测试可注入临时目录）
 */
export function checkAiGovernance(root = REPO_ROOT) {
    const skills = checkSkills(root)
    const agents = checkAgents(root)
    const links = checkAssetLinks(root)
    const platform = checkPlatformCopies(root)
    return {
        errors: [...skills.errors, ...agents.errors, ...links.errors],
        warnings: platform.warnings,
        skills: skills.count,
        agents: agents.count,
        rules: RULE_COUNT,
        scannedLinks: links.scanned,
    }
}

function formatIssue(issue) {
    return `${issue.file}${issue.line ? `:${issue.line}` : ''} ${issue.message}`
}

/** CLI 入口：--json 输出机读结果；--help 打印用法。 */
export function main(argv = process.argv.slice(2)) {
    if (argv.includes('--help') || argv.includes('-h')) {
        console.log('用法: node scripts/check-ai-governance.mjs [--json]')
        return 0
    }
    const unknown = argv.filter((arg) => arg !== '--json')
    if (unknown.length > 0) {
        console.error(`[check-ai-governance] 未知参数: ${unknown.join(' ')}`)
        return 2
    }
    const result = checkAiGovernance(REPO_ROOT)
    if (argv.includes('--json')) {
        console.log(JSON.stringify(result, null, 2))
        return result.errors.length > 0 ? 1 : 0
    }
    for (const warning of result.warnings) {
        console.warn(`[check-ai-governance] 警告：${formatIssue(warning)}`)
    }
    if (result.errors.length > 0) {
        console.error(`[check-ai-governance] ${result.errors.length} 处问题:`)
        for (const error of result.errors) {
            console.error(`  - ${formatIssue(error)}`)
        }
        return 1
    }
    console.log(
        `[check-ai-governance] OK：skills ${result.skills} / agents ${result.agents} / 规则 ${result.rules}（警告 ${result.warnings.length} 项）`,
    )
    return 0
}

if (isDirectExecution(import.meta.url)) {
    process.exit(main())
}
