import { describe, expect, it, vi } from 'vitest'
import { diffSnapshots, extractSnapshot, resolvePreviousTag, run } from './check-api-v1-contract.mjs'

const markdown = (snapshot) => `# doc\n<!-- api-v1-snapshot:start -->\n\`\`\`json\n${JSON.stringify(snapshot)}\n\`\`\`\n<!-- api-v1-snapshot:end -->\n`

describe('extractSnapshot', () => {
    it('parses the snapshot block', () => {
        expect(extractSnapshot(markdown({ fields: { run: ['id'] }, pagination: { max: 500 } })))
            .toEqual({ fields: { run: ['id'] }, pagination: { max: 500 } })
    })

    it('throws when the block is missing or invalid', () => {
        expect(() => extractSnapshot('# empty')).toThrow(/缺少/)
        expect(() => extractSnapshot('<!-- api-v1-snapshot:start -->\n```json\n{bad\n```\n<!-- api-v1-snapshot:end -->')).toThrow()
    })
})

describe('diffSnapshots', () => {
    it('allows additive fields and reordering', () => {
        expect(diffSnapshots(
            { fields: { run: ['id', 'status'] }, pagination: { max: 500 } },
            { fields: { run: ['status', 'id', 'owner'] }, pagination: { max: 500 } },
        )).toEqual([])
    })

    it('reports removed fields and lowered pagination limits', () => {
        const problems = diffSnapshots(
            { fields: { run: ['id', 'status'] }, pagination: { max: 500 } },
            { fields: { run: ['id'] }, pagination: { max: 200 } },
        )
        expect(problems).toContain('字段被删除：run.status')
        expect(problems).toContain('分页上限下调：max 500 → 200')
    })

    it('reports a removed pagination key', () => {
        expect(diffSnapshots(
            { fields: { run: ['id'] }, pagination: { max: 500, logsMax: 200 } },
            { fields: { run: ['id'] }, pagination: { max: 500 } },
        )).toContain('分页键被删除：logsMax')
    })

    it('reports a removed field group', () => {
        expect(diffSnapshots({ fields: { logs: ['view'] } }, { fields: {} })).toEqual(['字段组被删除：logs'])
    })
})

describe('run', () => {
    const current = { fields: { run: ['id'] }, pagination: { max: 500 } }

    it('skips when no tag is available', () => {
        const log = vi.fn()
        const status = run({
            readFile: () => markdown(current),
            git: () => { throw new Error('no tags') },
            log,
            error: vi.fn(),
        })
        expect(status).toBe(0)
        expect(log).toHaveBeenCalledWith(expect.stringContaining('skipped'))
    })

    it('fails when a field was removed relative to the previous tag', () => {
        const git = vi.fn((_cmd, args) => {
            if (args[0] === 'describe') {
                return 'v1.0.0\n'
            }
            return markdown({ fields: { run: ['id', 'status'] }, pagination: { max: 500 } })
        })
        const error = vi.fn()
        const status = run({ readFile: () => markdown(current), git, log: vi.fn(), error })
        expect(status).toBe(1)
        expect(error).toHaveBeenCalledWith(expect.stringContaining('run.status'))
    })

    it('passes with the same snapshot', () => {
        const git = vi.fn((_cmd, args) => args[0] === 'describe' ? 'v1.0.0\n' : markdown(current))
        expect(run({ readFile: () => markdown(current), git, log: vi.fn(), error: vi.fn() })).toBe(0)
    })

    it('resolvePreviousTag returns null on failure', () => {
        expect(resolvePreviousTag(() => {
            throw new Error('nope')
        })).toBeNull()
    })
})
