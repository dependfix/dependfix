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

    describe('sandboxLimits（M11 T1005-B 沙箱资源限额覆盖）', () => {
        it('创建：sandboxLimits 缺省 → 默认 undefined（走平台 SANDBOX_DEFAULTS）', () => {
            const ok = repositorySchema.safeParse({ owner: 'a', name: 'b' })
            expect(ok.success).toBe(true)
            expect(ok.success && ok.data.sandboxLimits).toBeUndefined()
        })

        it('创建：sandboxLimits 完整（memoryMb + cpu）→ success', () => {
            const ok = repositorySchema.safeParse({
                owner: 'a',
                name: 'b',
                sandboxLimits: { memoryMb: 4096, cpu: 2.0 },
            })
            expect(ok.success).toBe(true)
            expect(ok.success && ok.data.sandboxLimits).toEqual({ memoryMb: 4096, cpu: 2.0 })
        })

        it('创建：sandboxLimits 部分（仅 memoryMb）→ success', () => {
            const ok = repositorySchema.safeParse({
                owner: 'a',
                name: 'b',
                sandboxLimits: { memoryMb: 8192 },
            })
            expect(ok.success).toBe(true)
            expect(ok.success && ok.data.sandboxLimits).toEqual({ memoryMb: 8192 })
        })

        it('创建：sandboxLimits null（清空）→ success', () => {
            const ok = repositorySchema.safeParse({
                owner: 'a',
                name: 'b',
                sandboxLimits: null,
            })
            expect(ok.success).toBe(true)
        })

        it('创建：memoryMb 越界（下界 < 64）→ fail', () => {
            const bad = repositorySchema.safeParse({
                owner: 'a',
                name: 'b',
                sandboxLimits: { memoryMb: 32 },
            })
            expect(bad.success).toBe(false)
        })

        it('创建：memoryMb 越界（上界 > 32768）→ fail', () => {
            const bad = repositorySchema.safeParse({
                owner: 'a',
                name: 'b',
                sandboxLimits: { memoryMb: 65536 },
            })
            expect(bad.success).toBe(false)
        })

        it('创建：memoryMb 非整数 → fail（int 校验）', () => {
            const bad = repositorySchema.safeParse({
                owner: 'a',
                name: 'b',
                sandboxLimits: { memoryMb: 1024.5 },
            })
            expect(bad.success).toBe(false)
        })

        it('创建：cpu 越界（下界 < 0.1）→ fail', () => {
            const bad = repositorySchema.safeParse({
                owner: 'a',
                name: 'b',
                sandboxLimits: { cpu: 0.05 },
            })
            expect(bad.success).toBe(false)
        })

        it('创建：cpu 越界（上界 > 16）→ fail', () => {
            const bad = repositorySchema.safeParse({
                owner: 'a',
                name: 'b',
                sandboxLimits: { cpu: 32 },
            })
            expect(bad.success).toBe(false)
        })

        it('更新：sandboxLimits 允许 partial 与 null（部分字段缺失合法）', () => {
            expect(repositoryUpdateSchema.safeParse({ sandboxLimits: { cpu: 1.5 } }).success).toBe(true)
            expect(repositoryUpdateSchema.safeParse({ sandboxLimits: null }).success).toBe(true)
            expect(repositoryUpdateSchema.safeParse({}).success).toBe(true) // undefined = 不修改
        })

        it('更新：sandboxLimits 越界 → fail', () => {
            const bad = repositoryUpdateSchema.safeParse({ sandboxLimits: { memoryMb: 100000 } })
            expect(bad.success).toBe(false)
        })
    })
})
