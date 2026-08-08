import { describe, expect, it } from 'vitest'
import { repositorySchema, repositoryUpdateSchema } from './repository'

describe('repository schemas', () => {
    it('创建：owner/name 必填，默认值生效', () => {
        const ok = repositorySchema.safeParse({ owner: 'a', name: 'b' })
        expect(ok.success).toBe(true)
        expect(ok.success && ok.data.platform).toBe('github')
        expect(repositorySchema.safeParse({}).success).toBe(false)
    })

    it('创建：github-action 必须填写 actionWorkflowFile', () => {
        const bad = repositorySchema.safeParse({ owner: 'a', name: 'b', executorKind: 'github-action' })
        expect(bad.success).toBe(false)
        const ok = repositorySchema.safeParse({
            owner: 'a',
            name: 'b',
            executorKind: 'github-action',
            actionWorkflowFile: 'ci.yml',
        })
        expect(ok.success).toBe(true)
    })

    it('更新：允许部分字段（空对象合法）', () => {
        expect(repositoryUpdateSchema.safeParse({}).success).toBe(true)
        expect(repositoryUpdateSchema.safeParse({ note: 'x' }).success).toBe(true)
    })

    it('更新：交叉校验仅当 executorKind=github-action 时生效', () => {
        const bad = repositoryUpdateSchema.safeParse({ executorKind: 'github-action' })
        expect(bad.success).toBe(false)
        const ok = repositoryUpdateSchema.safeParse({ executorKind: 'github-action', actionWorkflowFile: 'ci.yml' })
        expect(ok.success).toBe(true)
        expect(repositoryUpdateSchema.safeParse({ actionWorkflowFile: 'ci.yml' }).success).toBe(true)
    })
})
