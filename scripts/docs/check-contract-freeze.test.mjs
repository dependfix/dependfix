import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import {
    PATHS,
    checkContractFreeze,
    diffKeys,
    diffTableColumns,
    extractActionInputs,
    extractCliArgs,
    extractConfigProps,
    extractEntityColumns,
    extractEnvVars,
    extractFencedList,
    extractQuickStartFlags,
    extractReportFields,
    extractRuntimeModes,
    parseTableColumnLines,
    toSnakeCase,
} from './check-contract-freeze.mjs'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../..')
const SCRIPT = join(repoRoot, 'scripts/docs/check-contract-freeze.mjs')

const tempDirs = []

afterEach(() => {
    while (tempDirs.length > 0) {
        rmSync(tempDirs.pop(), { recursive: true, force: true })
    }
})

function makeTempRoot() {
    const root = mkdtempSync(join(tmpdir(), 'contract-freeze-'))
    tempDirs.push(root)
    return root
}

/** 把真实仓库的契约事实源复制到临时根，供「清单 → 差异 → 退出码」端到端标定。 */
function copyRealSources(...mutators) {
    const root = makeTempRoot()
    const entries = [
        PATHS.argsDef,
        PATHS.engineConfig,
        PATHS.reportTypes,
        PATHS.action,
        PATHS.entitiesDir,
        ...packageSrcDirs(),
        PATHS.quickStartZh,
        PATHS.quickStartEn,
        PATHS.contractDoc,
    ]
    for (const rel of entries) {
        const target = join(root, rel)
        mkdirSync(dirname(target), { recursive: true })
        cpSync(join(repoRoot, rel), target, { recursive: true })
    }
    for (const mutate of mutators) {
        mutate(root)
    }
    return root
}

/** 真实仓库里各 npm 包的 `src` 目录（相对路径）。 */
function packageSrcDirs() {
    return readdirSync(join(repoRoot, PATHS.packagesSrc))
        .filter((entry) => existsSync(join(repoRoot, PATHS.packagesSrc, entry, 'src')))
        .map((entry) => join(PATHS.packagesSrc, entry, 'src'))
}

/** 改写临时根里的某个文本文件（相对路径）。 */
function editFile(rel, transform) {
    return (root) => {
        const target = join(root, rel)
        writeFileSync(target, transform(readFileSync(target, 'utf8')))
    }
}

describe('toSnakeCase', () => {
    it('与平台 SnakeCaseNamingStrategy 同口径（大小写边界插下划线）', () => {
        expect(toSnakeCase('organizationId')).toBe('organization_id')
        expect(toSnakeCase('ghsaId')).toBe('ghsa_id')
        expect(toSnakeCase('cveIds')).toBe('cve_ids')
        expect(toSnakeCase('prNumber')).toBe('pr_number')
        expect(toSnakeCase('lastUsedAt')).toBe('last_used_at')
    })

    it('大写连写不拆（与平台策略一致，避免契约按另一套换算）', () => {
        expect(toSnakeCase('URLPath')).toBe('urlpath')
    })

    it('连字符 / 空白 / 点归一为下划线', () => {
        expect(toSnakeCase('a-b c.d')).toBe('a_b_c_d')
    })
})

describe('extractFencedList', () => {
    const doc = [
        '### 甲',
        '',
        '```text',
        'a',
        'b',
        '```',
        '',
        '### 乙',
        '',
        '```text',
        '',
        '```',
        '',
        '### 丙',
        '',
        '无清单',
    ].join('\n')

    it('取标题后的第一个 fenced 清单（按行）', () => {
        expect(extractFencedList(doc, '甲')).toEqual(['a', 'b'])
    })

    it('空清单 / 无清单均 fail-closed 返回 null', () => {
        expect(extractFencedList(doc, '乙')).toBeNull()
        expect(extractFencedList(doc, '丙')).toBeNull()
    })

    it('标题不存在返回 null（标题改名即门禁失效，不能静默通过）', () => {
        expect(extractFencedList(doc, '丁')).toBeNull()
    })

    it('代码块内的同名标题不算标题', () => {
        const content = ['```md', '### 甲', '```', '### 甲', '', '```text', 'x', '```'].join('\n')
        expect(extractFencedList(content, '甲')).toEqual(['x'])
    })

    it('标题后先出现别的标题才出现代码块时视为缺失', () => {
        const content = ['### 甲', '', '### 乙', '', '```text', 'x', '```'].join('\n')
        expect(extractFencedList(content, '甲')).toBeNull()
    })
})

describe('parseTableColumnLines', () => {
    it('解析 `表: 列, 列` 行', () => {
        const tables = parseTableColumnLines(['repository: id, owner', 'user: id,email'])
        expect([...tables.keys()]).toEqual(['repository', 'user'])
        expect(tables.get('user')).toEqual(['id', 'email'])
    })

    it('缺冒号的行直接跳过（格式错误由差异比对暴露）', () => {
        expect(parseTableColumnLines(['nonsense']).size).toBe(0)
    })
})

describe('diffKeys / diffTableColumns', () => {
    it('两个方向的差异都报告，且排序稳定', () => {
        expect(diffKeys(['a', 'b', 'c'], ['b', 'c', 'd'])).toEqual({ missing: ['a'], extra: ['d'] })
        expect(diffKeys(['a'], ['a'])).toEqual({ missing: [], extra: [] })
    })

    it('表级增删与列级增删分别报告', () => {
        const expected = new Map([['a', ['id', 'x']], ['b', ['id']]])
        const declared = new Map([['a', ['id', 'y']], ['c', ['id']]])
        expect(diffTableColumns(expected, declared)).toEqual([
            '缺少表: b',
            '清单多出未存在的表: c',
            'a: 缺少列 x',
            'a: 清单多出列 y',
        ])
    })
})

describe('事实源抽取（真实仓库）', () => {
    it('CLI 参数取自 argsDef（含位置参数 mode 与 AI 参数）', () => {
        const keys = extractCliArgs(repoRoot)
        expect(keys).toContain('mode')
        expect(keys).toContain('ai-api-key')
        expect(keys.length).toBeGreaterThanOrEqual(40)
    })

    it('运行模式取自 RUNTIME_MODES', () => {
        expect(extractRuntimeModes(repoRoot)).toEqual(['report-only', 'fix', 'fix-and-pr', 'cleanup-branches'])
    })

    it('Action inputs 取自 action.yml#inputs', () => {
        const keys = extractActionInputs(repoRoot)
        expect(keys).toContain('dependabot-alerts-token')
        expect(keys).toContain('on-baseline-red')
    })

    it('RuntimeConfig 属性按接口成员抽取', () => {
        const keys = extractConfigProps(repoRoot)
        expect(keys).toContain('severityThreshold')
        expect(keys).toContain('deadlineAt')
    })

    it('env 键只认代码字面量（注释示例名与常量名不进契约）', () => {
        const keys = extractEnvVars(repoRoot)
        expect(keys).toContain('DEPENDFIX_AI_API_KEY')
        // 经 `${ENV_PREFIX}NAME` 拼接的键必须由 readEnv 实参补回来
        expect(keys).toContain('DEPENDFIX_MODE')
        // MCP 包读取的变量也在冻结面内
        expect(keys).toContain('DEPENDFIX_MCP_REPORT_DIR')
        // 只出现在 JSDoc「刻意不提供」说明里的名字不是环境变量
        expect(keys).not.toContain('DEPENDFIX_ALLOW_MAJOR_UPGRADE')
        // 仓库内同前缀的常量不是环境变量
        expect(keys).not.toContain('DEPENDFIX_BRANCH_PREFIX')
        expect(keys).not.toContain('DEPENDFIX_CONFIG_PATH')
    })

    it('报告字段按接口成员抽取', () => {
        expect(extractReportFields(repoRoot, 'RunResult')).toContain('prCheckWatch')
        expect(extractReportFields(repoRoot, 'RepositoryResult')).toContain('verificationSkipped')
    })

    it('实体表列含继承列与外键列，且不含关联属性本身', () => {
        const tables = extractEntityColumns(repoRoot)
        expect(tables.size).toBeGreaterThanOrEqual(15)
        const repository = tables.get('repository')
        for (const column of ['id', 'created_at', 'updated_at', 'organization_id', 'default_branch']) {
            expect(repository).toContain(column)
        }
        // `organization` 是关联属性，不是列
        expect(repository).not.toContain('organization')
        // 关联列与同名外键属性列不重复登记
        expect(repository.filter((column) => column === 'organization_id')).toHaveLength(1)
    })

    it('quick-start 表格键位与 argsDef 同集合', () => {
        const args = extractCliArgs(repoRoot)
        const zh = extractQuickStartFlags(readFileSync(join(repoRoot, PATHS.quickStartZh), 'utf8'), PATHS.quickStartZhHeading)
        expect(diffKeys(args, zh)).toEqual({ missing: [], extra: [] })
    })
})

describe('checkContractFreeze', () => {
    it('真实仓库清单与代码零差异（清单漂移即失败）', () => {
        const result = checkContractFreeze(repoRoot)
        for (const list of result.lists) {
            expect(list.error).toBeUndefined()
            expect({ id: list.id, missing: list.missing, extra: list.extra })
                .toEqual({ id: list.id, missing: [], extra: [] })
        }
        for (const entry of result.quickStart) {
            expect(entry.error).toBeUndefined()
            expect({ id: entry.id, missing: entry.missing, extra: entry.extra })
                .toEqual({ id: entry.id, missing: [], extra: [] })
        }
        expect(result.tables).toEqual([])
        expect(result.unsupported).toEqual([])
    })

    it('清单缺键位 → 报告缺失（负例）', () => {
        const root = copyRealSources(editFile(PATHS.contractDoc, (doc) => doc.replace('ai-api-key\n', '')))
        const result = checkContractFreeze(root)
        const cli = result.lists.find((list) => list.id === 'cli-args')
        expect(cli.missing).toEqual(['ai-api-key'])
        expect(cli.extra).toEqual([])
    })

    it('清单多出键位 → 报告多余（负例）', () => {
        const root = copyRealSources(editFile(PATHS.contractDoc, (doc) => doc.replace('```text\nmode\n', '```text\nphantom-flag\nmode\n')))
        const result = checkContractFreeze(root)
        const cli = result.lists.find((list) => list.id === 'cli-args')
        expect(cli.missing).toEqual([])
        expect(cli.extra).toEqual(['phantom-flag'])
    })

    it('小节标题改名 → fail-closed（不是静默通过）', () => {
        const root = copyRealSources(editFile(PATHS.contractDoc, (doc) => doc.replace('### RunResult 字段', '### RunResult 字段（改名）')))
        const result = checkContractFreeze(root)
        const runResult = result.lists.find((list) => list.id === 'report-run-result')
        expect(runResult.error).toContain('未找到小节')
    })

    it('CLI 子进程：差异存在时 exit 1 并给出明细', () => {
        const root = copyRealSources(editFile(PATHS.contractDoc, (doc) => doc.replace('ai-api-key\n', '')))
        const run = spawnSync(process.execPath, [SCRIPT, `--root=${root}`], { encoding: 'utf8' })
        expect(run.status).toBe(1)
        expect(run.stderr).toContain('清单缺少键位（代码已有）: ai-api-key')
    })

    it('CLI 子进程：quick-start 表格缺参数同样 exit 1（导出仅看 lists 的变异会被击杀）', () => {
        const root = copyRealSources(editFile(PATHS.quickStartZh, (doc) => doc.replace('| `--ai-trigger` |', '| `--ai-trigger-renamed` |')))
        const run = spawnSync(process.execPath, [SCRIPT, `--root=${root}`], { encoding: 'utf8' })
        expect(run.status).toBe(1)
        expect(run.stderr).toContain('表格缺少参数（argsDef 已有）: ai-trigger')
    })

    it('CLI 子进程：DB 清单缺列同样 exit 1', () => {
        const root = copyRealSources(editFile(PATHS.contractDoc, (doc) => doc.replace(
            'repository: id, created_at, updated_at, organization_id,',
            'repository: id, created_at, updated_at,',
        )))
        const run = spawnSync(process.execPath, [SCRIPT, `--root=${root}`], { encoding: 'utf8' })
        expect(run.status).toBe(1)
        expect(run.stderr).toContain('repository: 缺少列 organization_id')
    })

    it('CLI 子进程：出现抽取器未覆盖的写法同样 exit 1', () => {
        const root = copyRealSources((target) => {
            const file = join(target, PATHS.engineConfig)
            writeFileSync(file, `${readFileSync(file, 'utf8')}\nconst { DEPENDFIX_PROBE } = process.env\n`)
        })
        const result = checkContractFreeze(root)
        expect(result.unsupported.join('\n')).toContain('env 解构不可抽取')
        const run = spawnSync(process.execPath, [SCRIPT, `--root=${root}`], { encoding: 'utf8' })
        expect(run.status).toBe(1)
        expect(run.stderr).toContain('extractor-coverage')
    })

    it('CLI 子进程：真实仓库 exit 0 且输出逐类 OK', () => {
        const run = spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8' })
        expect(run.status).toBe(0)
        expect(run.stdout).toContain('[check-contract-freeze] OK: db-tables')
    })
})
