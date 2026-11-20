/**
 * check-api-v1-contract.mjs —— v1 只读契约快照守卫。
 *
 * 1. 读取 `docs/guide/api-v1.md` 的快照块并校验 JSON 合法；
 * 2. 与上一 tag 的同段快照比对：**字段只增不删、不改类型**，删除即非零退出；
 * 3. 浅克隆 / 无 tag 时显式打印 skipped（发布环境应保证 tag 可用）。
 *
 * 用法：pnpm run check:api-v1-contract
 */

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { isDirectExecution } from './shared/cli.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DOC_PATH = 'docs/guide/api-v1.md'
const SNAPSHOT_PATTERN = /<!-- api-v1-snapshot:start -->\s*```json\s*([\s\S]*?)```\s*<!-- api-v1-snapshot:end -->/

/** 从文档中提取快照 JSON；缺失或非法时抛错 */
export function extractSnapshot(markdown) {
    const match = SNAPSHOT_PATTERN.exec(markdown)
    if (!match) {
        throw new Error('api-v1.md 缺少 api-v1-snapshot 块')
    }
    const parsed = JSON.parse(match[1])
    if (!parsed || typeof parsed !== 'object' || !parsed.fields || typeof parsed.fields !== 'object') {
        throw new Error('api-v1 快照缺少 fields')
    }
    return parsed
}

/**
 * 比较上一版与当前快照：返回问题列表（空 = 通过）。
 * 规则：每个字段集合的已有字段必须仍存在（顺序可变），pagination 不允许下调。
 */
export function diffSnapshots(previous, current) {
    const problems = []
    for (const [type, fields] of Object.entries(previous.fields ?? {})) {
        const currentFields = current.fields?.[type]
        if (!Array.isArray(currentFields)) {
            problems.push(`字段组被删除：${type}`)
            continue
        }
        for (const field of fields) {
            if (!currentFields.includes(field)) {
                problems.push(`字段被删除：${type}.${field}`)
            }
        }
    }
    for (const [key, value] of Object.entries(previous.pagination ?? {})) {
        const currentValue = current.pagination?.[key]
        if (typeof currentValue !== 'number') {
            problems.push(`分页键被删除：${key}`)
            continue
        }
        if (typeof value === 'number' && currentValue < value) {
            problems.push(`分页上限下调：${key} ${value} → ${currentValue}`)
        }
    }
    return problems
}

/** 取上一 tag（失败返回 null） */
export function resolvePreviousTag(git = execFileSync, cwd = repoRoot) {
    try {
        return git('git', ['describe', '--tags', '--abbrev=0'], { cwd, encoding: 'utf8' }).trim() || null
    } catch {
        return null
    }
}

export function run({
    cwd = repoRoot,
    readFile = (file) => readFileSync(path.join(cwd, file), 'utf8'),
    git = execFileSync,
    log = (line) => console.log(line),
    error = (line) => console.error(line),
} = {}) {
    let current
    try {
        current = extractSnapshot(readFile(DOC_PATH))
    } catch (failure) {
        error(`[api-v1-contract] FAIL：${failure.message}`)
        return 1
    }

    const tag = resolvePreviousTag(git, cwd)
    if (!tag) {
        log('[api-v1-contract] skipped：未找到可用 tag（浅克隆？发布环境应 fetch tags）')
        return 0
    }
    let previous
    try {
        previous = extractSnapshot(git('git', ['show', `${tag}:${DOC_PATH}`], { cwd, encoding: 'utf8' }))
    } catch (failure) {
        // 上一 tag 没有该文档（首次引入）视为无基线
        log(`[api-v1-contract] skipped：${tag} 无 ${DOC_PATH}（${failure.message.split('\n')[0]}）`)
        return 0
    }
    const problems = diffSnapshots(previous, current)
    if (problems.length > 0) {
        for (const problem of problems) {
            error(`[api-v1-contract] FAIL：${problem}`)
        }
        return 1
    }
    log(`[api-v1-contract] OK：与 ${tag} 比对无字段删除 / 分页下调`)
    return 0
}

/* v8 ignore start -- CLI 入口守卫 */
if (isDirectExecution(import.meta.url)) {
    process.exitCode = run()
}
/* v8 ignore stop */
