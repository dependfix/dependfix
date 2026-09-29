import { describe, expect, it } from 'vitest'
import { repositorySchema, repositoryUpdateSchema } from './repository'
import { parseSandboxLimits, parseVerifyCommands } from '#server/entities/repository'

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

    describe('parseSandboxLimits（实体辅助函数，M11 T1005-B）', () => {
        it('null / undefined / 空串 → undefined（走平台 SANDBOX_DEFAULTS）', () => {
            expect(parseSandboxLimits(null)).toBeUndefined()
            expect(parseSandboxLimits(undefined)).toBeUndefined()
            expect(parseSandboxLimits('')).toBeUndefined()
        })

        it('合法 JSON 完整字段 → 完整对象', () => {
            expect(parseSandboxLimits('{"memoryMb":4096,"cpu":2.0}')).toEqual({ memoryMb: 4096, cpu: 2.0 })
        })

        it('合法 JSON 部分字段 → 仅含指定字段', () => {
            expect(parseSandboxLimits('{"memoryMb":8192}')).toEqual({ memoryMb: 8192 })
            expect(parseSandboxLimits('{"cpu":1.5}')).toEqual({ cpu: 1.5 })
        })

        it('非法 JSON → undefined（容错不抛错）', () => {
            expect(parseSandboxLimits('not-json')).toBeUndefined()
            expect(parseSandboxLimits('{unclosed')).toBeUndefined()
        })

        it('非对象（数组 / 字符串 / 数字）→ undefined', () => {
            expect(parseSandboxLimits('[1,2,3]')).toBeUndefined()
            expect(parseSandboxLimits('"hello"')).toBeUndefined()
            expect(parseSandboxLimits('123')).toBeUndefined()
            expect(parseSandboxLimits('null')).toBeUndefined()
        })

        it('字段类型异常（字符串 / null / Infinity）→ 字段被丢弃（不抛错）', () => {
            // 字段裁剪：仅返回 Number.isFinite 的有效字段
            expect(parseSandboxLimits('{"memoryMb":"4096","cpu":1.0}')).toEqual({ cpu: 1.0 })
            expect(parseSandboxLimits('{"memoryMb":null,"cpu":1.0}')).toEqual({ cpu: 1.0 })
            expect(parseSandboxLimits('{"memoryMb":1e999,"cpu":1.0}')).toEqual({ cpu: 1.0 }) // Infinity: JSON.parse 把 1e999 解析为 Infinity（Number.isFinite=false → 字段被丢弃）
        })

        it('多出字段（如 typo "memoryMb_"）→ 被丢弃（仅返回 Zod 契约字段）', () => {
            expect(parseSandboxLimits('{"memoryMb":1024,"cpu":1.0,"memoryMb_":4096,"extra":"x"}'))
                .toEqual({ memoryMb: 1024, cpu: 1.0 })
        })

        it('所有字段都无效 → undefined（避免返回空对象误导下游）', () => {
            expect(parseSandboxLimits('{"memoryMb":"x","cpu":"y"}')).toBeUndefined()
        })
    })

    describe('verifyCommands（平台侧自定义验证命令）', () => {
        it('创建：缺省 → undefined（走引擎默认验证链）', () => {
            const ok = repositorySchema.safeParse({ owner: 'a', name: 'b' })
            expect(ok.success).toBe(true)
            expect(ok.success && ok.data.verifyCommands).toBeUndefined()
        })

        it('创建：命令数组 → success（逐项 trim）', () => {
            const ok = repositorySchema.safeParse({
                owner: 'a',
                name: 'b',
                verifyCommands: ['pnpm install --frozen-lockfile', '  pnpm test  '],
            })
            expect(ok.success).toBe(true)
            expect(ok.success && ok.data.verifyCommands).toEqual(['pnpm install --frozen-lockfile', 'pnpm test'])
        })

        it('创建：null / 空数组 → success（清空语义，走默认链）', () => {
            expect(repositorySchema.safeParse({ owner: 'a', name: 'b', verifyCommands: null }).success).toBe(true)
            expect(repositorySchema.safeParse({ owner: 'a', name: 'b', verifyCommands: [] }).success).toBe(true)
        })

        it('创建：超过 20 条 → fail（容量上限）', () => {
            const bad = repositorySchema.safeParse({
                owner: 'a',
                name: 'b',
                verifyCommands: Array.from({ length: 21 }, (_, i) => `pnpm cmd${i}`),
            })
            expect(bad.success).toBe(false)
        })

        it('创建：含空白项 → fail（拒绝空命令，防误提交空行）', () => {
            const bad = repositorySchema.safeParse({ owner: 'a', name: 'b', verifyCommands: ['pnpm lint', '   '] })
            expect(bad.success).toBe(false)
        })

        it('创建：含换行 / 控制字符 → fail（保持「一项 = 一条命令行」不变量）', () => {
            expect(repositorySchema.safeParse({ owner: 'a', name: 'b', verifyCommands: ['pnpm lint\nrm -rf /'] }).success).toBe(false)
            expect(repositorySchema.safeParse({ owner: 'a', name: 'b', verifyCommands: ['pnpm\tlint'] }).success).toBe(false)
        })

        it('创建：单条超过 500 字符 → fail', () => {
            const bad = repositorySchema.safeParse({ owner: 'a', name: 'b', verifyCommands: [`pnpm ${'x'.repeat(500)}`] })
            expect(bad.success).toBe(false)
        })

        it('更新：undefined = 不修改 / null 或 [] = 清空（与 tags 同语义）', () => {
            expect(repositoryUpdateSchema.safeParse({}).success).toBe(true)
            expect(repositoryUpdateSchema.safeParse({ verifyCommands: null }).success).toBe(true)
            expect(repositoryUpdateSchema.safeParse({ verifyCommands: [] }).success).toBe(true)
            expect(repositoryUpdateSchema.safeParse({ verifyCommands: ['pnpm test'] }).success).toBe(true)
        })
    })

    describe('parseVerifyCommands（实体辅助函数）', () => {
        it('null / undefined / 空串 → 空数组（走引擎默认验证链）', () => {
            expect(parseVerifyCommands(null)).toEqual([])
            expect(parseVerifyCommands(undefined)).toEqual([])
            expect(parseVerifyCommands('')).toEqual([])
        })

        it('合法 JSON 数组 → 命令数组', () => {
            expect(parseVerifyCommands('["pnpm lint","pnpm test"]')).toEqual(['pnpm lint', 'pnpm test'])
        })

        it('非法 JSON → 空数组（容错不抛错）', () => {
            expect(parseVerifyCommands('not-json')).toEqual([])
            expect(parseVerifyCommands('{unclosed')).toEqual([])
        })

        it('非数组（对象 / 字符串 / 数字）→ 空数组', () => {
            expect(parseVerifyCommands('{"a":1}')).toEqual([])
            expect(parseVerifyCommands('"pnpm lint"')).toEqual([])
            expect(parseVerifyCommands('123')).toEqual([])
        })

        it('数组内含非字符串 / 空串项 → 被裁剪，命令项 trim 归一（仅保留有效命令）', () => {
            expect(parseVerifyCommands('["pnpm lint",null,42,"","   ","pnpm test"]')).toEqual(['pnpm lint', 'pnpm test'])
            expect(parseVerifyCommands('["  pnpm test  "]')).toEqual(['pnpm test'])
        })
    })
})
