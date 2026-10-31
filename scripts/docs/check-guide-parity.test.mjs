import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
    EXEMPTIONS,
    GUIDE_PAIRS,
    HEADING_PAIRS,
    auditExemptions,
    checkGuideParity,
    comparePair,
    countHeadings,
    extractEnvVars,
    extractFlags,
    extractTableKeys,
    headingTitles,
} from './check-guide-parity.mjs'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../..')

const read = (files) => (rel) => files[rel]

describe('countHeadings', () => {
    it('只数指定层级，且不数代码块内的标题', () => {
        const content = ['## A', '### A1', '```md', '## 代码内', '```', '## B'].join('\n')
        expect(countHeadings(content, 2)).toBe(2)
        expect(countHeadings(content, 3)).toBe(1)
    })
})

describe('extractFlags / extractEnvVars', () => {
    it('取 `--flag` 形态，忽略单个连字符与词内连字符', () => {
        const flags = extractFlags('用 `--repo` 与 --dry-run，不要 a--b，也不要 -h')
        expect([...flags].sort()).toEqual(['--dry-run', '--repo'])
    })

    it('取身份证含下划线的大写 token，排除 PR / CLI 这类缩写', () => {
        const env = extractEnvVars('PR 与 CLI 不算；`DEPENDFIX_MODE` 与 GITHUB_TOKEN 算')
        expect([...env].sort()).toEqual(['DEPENDFIX_MODE', 'GITHUB_TOKEN'])
    })

    it('代码块内的键位同样计入（env 示例写在代码块里）', () => {
        const env = extractEnvVars(['```bash', 'export DEPENDFIX_DRY_RUN=true', '```'].join('\n'))
        expect(env.has('DEPENDFIX_DRY_RUN')).toBe(true)
    })
})

describe('extractTableKeys', () => {
    it('取标题后第一张表格的首列键位，跳过表头与分隔行', () => {
        const content = [
            '### Action inputs',
            '',
            '| Input | Required |',
            '|:--|:--|',
            '| `mode` | no |',
            '| `ai-api-key` | no |',
            '',
            '段落结束表格',
        ].join('\n')
        expect([...extractTableKeys(content, 'Action inputs')].sort()).toEqual(['ai-api-key', 'mode'])
    })

    it('没有该标题时返回空集合', () => {
        expect(extractTableKeys('## 别的\n', 'Action inputs').size).toBe(0)
    })
})

describe('comparePair', () => {
    const pair = { id: 'demo', zh: 'zh.md', en: 'en.md', kinds: ['env', 'flag'] }

    it('en 覆盖 zh 的键位且结构不少时无差异', () => {
        HEADING_PAIRS.demo = [['A', 'A']]
        try {
            const result = comparePair(pair, read({
                'zh.md': ['## A', '`DEPENDFIX_MODE` 与 `--repo`'].join('\n'),
                'en.md': ['## A', '`DEPENDFIX_MODE` and `--repo`'].join('\n'),
            }))
            expect(result.missing).toEqual([])
            expect(result.headingGaps).toEqual([])
            expect(result.errors).toEqual([])
        } finally {
            delete HEADING_PAIRS.demo
        }
    })

    it('en 少键位时逐条列出（含类别）', () => {
        HEADING_PAIRS.demo = [['A', 'A']]
        try {
            const result = comparePair(pair, read({
            'zh.md': '## A\n`DEPENDFIX_MODE` `--repo` `--history`\n',
            'en.md': '## A\n`DEPENDFIX_MODE` `--repo`\n',
            }))
            expect(result.missing).toEqual([{ kind: 'flag', key: '--history' }])
        } finally {
            delete HEADING_PAIRS.demo
        }
    })

    it('en 标题结构少于 zh 时报告层级缺口（en 允许更多）', () => {
        HEADING_PAIRS.demo = [['A', 'A']]
        try {
            const result = comparePair(pair, read({
                'zh.md': '## A\n### A1\n',
                'en.md': '## A\n',
            }))
            expect(result.headingGaps).toEqual([{ level: 3, zh: 1, en: 0 }])
        } finally {
            delete HEADING_PAIRS.demo
        }
    })

    it('H2 映射：en 侧小节改名即报（数量相等也拦得住）', () => {
        const mapped = { id: 'demo', zh: 'zh.md', en: 'en.md', kinds: ['flag'] }
        HEADING_PAIRS.demo = [['甲节', 'Section A']]
        try {
            const result = comparePair(mapped, read({
                'zh.md': ['## 甲节', '`--x`'].join('\n'),
                'en.md': ['## Renamed A', '`--x`'].join('\n'),
            }))
            expect(result.headingMapGaps).toEqual([{ zh: '甲节', en: 'Section A' }])
        } finally {
            delete HEADING_PAIRS.demo
        }
    })

    it('H2 映射：zh 侧标题改名时 fail-closed（提示映射过期）', () => {
        const mapped = { id: 'demo2', zh: 'zh.md', en: 'en.md', kinds: ['flag'] }
        HEADING_PAIRS.demo2 = [['旧标题', 'Old title']]
        try {
            const result = comparePair(mapped, read({
                'zh.md': ['## 新标题', '`--x`'].join('\n'),
                'en.md': ['## Old title', '`--x`'].join('\n'),
            }))
            expect(result.errors.join(' ')).toContain('H2 映射过期')
        } finally {
            delete HEADING_PAIRS.demo2
        }
    })

    it('键位类别取不到任何键位时 fail-closed（表格/标题缺失不得静默通过）', () => {
        const result = comparePair(
            { id: 'demo3', zh: 'zh.md', en: 'en.md', kinds: ['action-input'] },
            read({ 'zh.md': '## 别的标题\n', 'en.md': '## Other\n' }),
        )
        expect(result.errors.join(' ')).toContain('未提取到任何键位')
    })

    it('登记过的豁免键位不报（豁免表按 guide:kind:key 索引）', () => {
        EXEMPTIONS['demo:flag:--history'] = '测试用豁免：能力未发布，随下个版本移除'
        HEADING_PAIRS.demo = [['A', 'A']]
        try {
            const result = comparePair(pair, read({
                'zh.md': '## A\n`--history`\n',
                'en.md': '## A\n',
            }))
            expect(result.missing).toEqual([])
            expect([...result.usedExemptions]).toEqual(['demo:flag:--history'])
        } finally {
            delete EXEMPTIONS['demo:flag:--history']
            delete HEADING_PAIRS.demo
        }
    })
})

describe('checkGuideParity（仓库真实指南）', () => {
    let root

    beforeEach(() => {
        root = mkdtempSync(join(tmpdir(), 'guide-parity-'))
    })

    afterEach(() => {
        rmSync(root, { recursive: true, force: true })
    })

    const write = (rel, content) => {
        const file = join(root, rel)
        mkdirSync(dirname(file), { recursive: true })
        writeFileSync(file, content)
    }

    it('仓库内的两对指南保持平价（含非空下限，避免抽取器整体失效时假绿）', () => {
        // 直接读仓库真实文件：本用例在 CI 里就是「平价没被改坏」的守卫
        const results = checkGuideParity(repoRoot)
        expect(results.map((r) => r.id)).toEqual(GUIDE_PAIRS.map((p) => p.id))
        for (const result of results) {
            expect({ id: result.id, errors: result.errors, missing: result.missing, headingGaps: result.headingGaps, headingMapGaps: result.headingMapGaps })
                .toEqual({ id: result.id, errors: [], missing: [], headingGaps: [], headingMapGaps: [] })
        }
        // 抽取器下限：配置指南的 env 变量与 quick-start 的 CLI 参数都必须成规模
        const zhConfig = readFileSync(join(repoRoot, 'docs/guide/configuration.md'), 'utf8')
        const zhQuickStart = readFileSync(join(repoRoot, 'docs/guide/quick-start.md'), 'utf8')
        expect(extractEnvVars(zhConfig).size).toBeGreaterThanOrEqual(40)
        expect(extractFlags(zhQuickStart).size).toBeGreaterThanOrEqual(30)
        expect(headingTitles(zhConfig, 2)).toHaveLength(HEADING_PAIRS.configuration.length)
    })

    it('CLI 负例：删掉一条键位后 exit 1（端到端，覆盖 process.exit 路径）', () => {
        const fixture = mkdtempSync(join(tmpdir(), 'guide-parity-cli-'))
        try {
            for (const pair of GUIDE_PAIRS) {
                for (const rel of [pair.zh, pair.en]) {
                    const file = join(fixture, rel)
                    mkdirSync(dirname(file), { recursive: true })
                    const source = readFileSync(join(repoRoot, rel), 'utf8')
                    // 只在 zh 侧追加一个 en 没有的键位，模拟「zh 新增、en 未同步」
                    const content = rel === pair.zh ? `${source}\n\n\`DEPENDFIX_FAKE_ONLY_ZH\`\n` : source
                    writeFileSync(file, content)

                }
            }
            const script = join(repoRoot, 'scripts/docs/check-guide-parity.mjs')
            const result = spawnSync(process.execPath, [script, `--root=${fixture}`], { encoding: 'utf8' })
            expect(result.status).toBe(1)
            expect(result.stderr).toContain('缺少 env: DEPENDFIX_FAKE_ONLY_ZH')
        } finally {
            rmSync(fixture, { recursive: true, force: true })
        }
    })

    it('豁免表健康度：未命中的豁免会被点名（防止豁免永久沉淀）', () => {
        EXEMPTIONS['demo4:flag:--gone'] = '一次性豁免：缺口已消失'
        try {
            const results = checkGuideParity(repoRoot)
            expect(auditExemptions(results).join(' ')).toContain('豁免未被命中')
        } finally {
            delete EXEMPTIONS['demo4:flag:--gone']
        }
    })

    it('缺章节的临时仓库会被判失败（夹具自证，防止用例假绿）', () => {
        write('docs/guide/configuration.md', '## 来源\n## 全部配置项\n')
        write('docs/i18n/en-US/guide/configuration.md', '## Sources\n')
        write('docs/guide/quick-start.md', '## 安装\n')
        write('docs/i18n/en-US/guide/quick-start.md', '## Installation\n')
        const results = checkGuideParity(root)
        const configuration = results.find((r) => r.id === 'configuration')
        expect(configuration.headingGaps).toEqual([{ level: 2, zh: 2, en: 1 }])
    })
})
