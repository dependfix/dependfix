import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
    RULE_CONFIG_ENV,
    loadRulesConfigFromEnv,
    loadRulesConfigFromFile,
    resetActiveRulesConfig,
    setActiveRulesConfig,
} from './rule-config'
import { classifyRule, suggestionFor } from './rule-classifier'

// 跨测试共享临时目录；每次测试自清理
let tmpDir: string
let stderrSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'rule-config-test-'))
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
})

afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
    stderrSpy.mockRestore()
    resetActiveRulesConfig()
})

function writeConfig(content: string): string {
    const path = join(tmpDir, 'rules.json')
    writeFileSync(path, content, 'utf-8')
    return path
}

describe('loadRulesConfigFromFile', () => {
    it('loads and compiles a valid JSON config', () => {
        const path = writeConfig(JSON.stringify({
            rules: [
                { id: 'eol-last', class: 'auto-fixable' },
                { id: 'js/x', class: 'suggested', suggestion: 'fix X' },
            ],
        }))

        const result = loadRulesConfigFromFile(path)

        expect(result).not.toBeNull()
        expect(result?.autoFixable.has('eol-last')).toBe(true)
        expect(result?.suggested.get('js/x')).toBe('fix X')
    })

    it('returns null when file does not exist', () => {
        const result = loadRulesConfigFromFile(join(tmpDir, 'nonexistent.json'))
        expect(result).toBeNull()
        // 错误路径 → stderr 写入（不静默降级）
        expect(stderrSpy).toHaveBeenCalled()
        const message = stderrSpy.mock.calls.map((c) => String(c[0])).join('')
        expect(message).toContain('cannot read')
    })

    it('returns null on invalid JSON and writes to stderr', () => {
        const path = writeConfig('{ not valid json }')
        const result = loadRulesConfigFromFile(path)

        expect(result).toBeNull()
        expect(stderrSpy).toHaveBeenCalled()
        const message = stderrSpy.mock.calls.map((c) => String(c[0])).join('')
        expect(message).toContain('invalid JSON')
    })

    it('returns null on schema validation failure and writes to stderr', () => {
        // duplicate id across classes → reject
        const path = writeConfig(JSON.stringify({
            rules: [
                { id: 'js/x', class: 'auto-fixable' },
                { id: 'js/x', class: 'suggested', suggestion: 'foo' },
            ],
        }))
        const result = loadRulesConfigFromFile(path)

        expect(result).toBeNull()
        expect(stderrSpy).toHaveBeenCalled()
        const message = stderrSpy.mock.calls.map((c) => String(c[0])).join('')
        expect(message).toContain('invalid config schema')
    })

    it('loaded config can drive classifyRule via setActiveRulesConfig', () => {
        const path = writeConfig(JSON.stringify({
            rules: [
                { id: 'my-org/custom-fix', class: 'auto-fixable' },
                { id: 'my-org/review-needed', class: 'suggested', suggestion: '人工审查该私有规则' },
            ],
        }))
        const compiled = loadRulesConfigFromFile(path)
        expect(compiled).not.toBeNull()
        setActiveRulesConfig(compiled!)

        expect(classifyRule('my-org/custom-fix')).toBe('auto-fixable')
        expect(classifyRule('my-org/review-needed')).toBe('suggested')
        expect(suggestionFor('my-org/review-needed')).toBe('人工审查该私有规则')
        // 默认 A 类已替换为自定义：eol-last 不再是 A 类
        expect(classifyRule('eol-last')).toBe('report-only')
    })
})

describe('loadRulesConfigFromEnv', () => {
    it('returns null when env var is unset', () => {
        expect(loadRulesConfigFromEnv({})).toBeNull()
    })

    it('returns null when env var is empty/whitespace', () => {
        expect(loadRulesConfigFromEnv({ [RULE_CONFIG_ENV]: '' })).toBeNull()
        expect(loadRulesConfigFromEnv({ [RULE_CONFIG_ENV]: '   ' })).toBeNull()
    })

    it('returns null when path does not exist and writes to stderr', () => {
        const result = loadRulesConfigFromEnv({
            [RULE_CONFIG_ENV]: join(tmpDir, 'missing.json'),
        })

        expect(result).toBeNull()
        expect(stderrSpy).toHaveBeenCalled()
        const message = stderrSpy.mock.calls.map((c) => String(c[0])).join('')
        expect(message).toContain(RULE_CONFIG_ENV)
        expect(message).toContain('non-existent')
    })

    it('loads config when env points to a valid file', () => {
        const path = writeConfig(JSON.stringify({
            rules: [{ id: 'env-only-rule', class: 'suggested', suggestion: 'env rule' }],
        }))
        const result = loadRulesConfigFromEnv({ [RULE_CONFIG_ENV]: path })

        expect(result).not.toBeNull()
        expect(result?.suggested.get('env-only-rule')).toBe('env rule')
    })

    it('env value is trimmed before lookup', () => {
        const path = writeConfig(JSON.stringify({
            rules: [{ id: 'trim-rule', class: 'suggested', suggestion: 'trimmed' }],
        }))
        const result = loadRulesConfigFromEnv({ [RULE_CONFIG_ENV]: `  ${path}  ` })

        expect(result).not.toBeNull()
        expect(result?.suggested.has('trim-rule')).toBe(true)
    })
})
