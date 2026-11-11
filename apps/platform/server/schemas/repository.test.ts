import { describe, expect, it } from 'vitest'
import { repositorySchema, repositoryUpdateSchema } from './repository'
import { parseSandboxLimits, parseTags, parseVerifyCommands } from '#server/entities/repository'

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

    it('更新：部分字段不注入默认值（PUT 只改 note 不重置执行器与分支）', () => {
        // 历史缺陷：repositoryBase 带 .default()，.partial() 仍会注入默认值 →
        // 只改 note 的 PUT 把 github-action 仓库重置为 container。基线字段集不带默认后不再发生。
        const parsed = repositoryUpdateSchema.parse({ note: 'x' })
        expect(parsed).toEqual({ note: 'x' })
        expect(parsed).not.toHaveProperty('executorKind')
        expect(parsed).not.toHaveProperty('defaultBranch')
        expect(parsed).not.toHaveProperty('packageManager')
        expect(parsed).not.toHaveProperty('platform')
    })

    it('跨大版本授权：更新不注入默认值，显式布尔可解析', () => {
        expect(repositoryUpdateSchema.parse({ note: 'x' })).toEqual({ note: 'x' })
        expect(repositoryUpdateSchema.parse({ allowMajorUpgrade: true })).toEqual({ allowMajorUpgrade: true })
        // 创建侧默认由 API 层补 false（schema 不注入，避免与部分更新语义混淆）
        expect(repositorySchema.parse({ owner: 'a', name: 'b' }).allowMajorUpgrade).toBeUndefined()
    })

    it('创建/更新：执行超时字段边界与交叉校验', () => {
        const ok = repositorySchema.safeParse({
            owner: 'a',
            name: 'b',
            executionTimeoutMs: 2_700_000,
            verifyCommandTimeoutMs: 1_200_000,
        })
        expect(ok.success).toBe(true)

        // 子项大于执行上限 → 拒绝（错误挂在子项字段）
        const cross = repositoryUpdateSchema.safeParse({ executionTimeoutMs: 120_000, verifyCommandTimeoutMs: 600_000 })
        expect(cross.success).toBe(false)
        expect(cross.error?.issues[0]?.path).toEqual(['verifyCommandTimeoutMs'])

        // 下限 / 上限
        expect(repositoryUpdateSchema.safeParse({ executionTimeoutMs: 1_000 }).success).toBe(false)
        expect(repositoryUpdateSchema.safeParse({ cloneTimeoutMs: 10_000 }).success).toBe(false)
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

    it('创建：sandbox 执行器可写入（入口已恢复，仅 report-only 真实执行）', () => {
        const ok = repositorySchema.safeParse({ owner: 'a', name: 'b', executorKind: 'sandbox' })
        expect(ok.success).toBe(true)
        expect(ok.success && ok.data.executorKind).toBe('sandbox')
    })

    it('更新：sandbox 执行器可写入', () => {
        const ok = repositoryUpdateSchema.safeParse({ executorKind: 'sandbox' })
        expect(ok.success).toBe(true)
        expect(ok.success && ok.data.executorKind).toBe('sandbox')
    })

    describe('sandboxLimits（沙箱资源限额覆盖）', () => {
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

        it('创建 / 更新：含未知键（如 gpu）→ fail（strict，避免「配了但静默不生效」）', () => {
            const created = repositorySchema.safeParse({
                owner: 'a',
                name: 'b',
                sandboxLimits: { memoryMb: 2048, gpu: 1 },
            })
            expect(created.success).toBe(false)
            expect(!created.success && created.error.issues.some((issue) => issue.code === 'unrecognized_keys')).toBe(true)
            expect(repositoryUpdateSchema.safeParse({ sandboxLimits: { cpu: 1, gpu: 1 } }).success).toBe(false)
        })
    })

    describe('tags（仓库标签）', () => {
        it('创建：逐项 trim 并去重（保序，重复项不占额度）', () => {
            const ok = repositorySchema.safeParse({
                owner: 'a',
                name: 'b',
                tags: [' frontend ', 'frontend', 'critical', 'critical'],
            })
            expect(ok.success).toBe(true)
            expect(ok.success && ok.data.tags).toEqual(['frontend', 'critical'])
        })

        it('创建：去重后超过 20 个 → fail（重复项不计入容量）', () => {
            const twentyUniqueWithDuplicates = [
                ...Array.from({ length: 20 }, (_, i) => `tag-${i}`),
                'tag-0',
            ]
            expect(repositorySchema.safeParse({ owner: 'a', name: 'b', tags: twentyUniqueWithDuplicates }).success).toBe(true)

            const bad = repositorySchema.safeParse({
                owner: 'a',
                name: 'b',
                tags: Array.from({ length: 21 }, (_, i) => `tag-${i}`),
            })
            expect(bad.success).toBe(false)
        })

        it('创建：空白项 / 超长标签 → fail', () => {
            expect(repositorySchema.safeParse({ owner: 'a', name: 'b', tags: ['   '] }).success).toBe(false)
            expect(repositorySchema.safeParse({ owner: 'a', name: 'b', tags: ['x'.repeat(51)] }).success).toBe(false)
        })

        it('更新：undefined = 不修改 / null 或 [] = 清空', () => {
            expect(repositoryUpdateSchema.safeParse({}).success).toBe(true)
            expect(repositoryUpdateSchema.safeParse({ tags: null }).success).toBe(true)
            expect(repositoryUpdateSchema.safeParse({ tags: [] }).success).toBe(true)
            expect(repositoryUpdateSchema.safeParse({ tags: ['prod'] }).success).toBe(true)
        })

        it('parseTags：与写入侧同源归一（trim + 去重）——存量脏数据读回即重写结果', () => {
            expect(parseTags('[" prod ","prod","  ","critical"]')).toEqual(['prod', 'critical'])
            expect(parseTags(null)).toEqual([])
            expect(parseTags('not-json')).toEqual([])
            expect(parseTags('{"a":1}')).toEqual([])
        })
    })

    describe('parseSandboxLimits（实体辅助函数）', () => {
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

    describe('prCheckFocus（PR Check 告警关注集）', () => {
        it('创建：缺省 / null → success（未配置 = 现状）', () => {
            const ok = repositorySchema.safeParse({ owner: 'a', name: 'b' })
            expect(ok.success).toBe(true)
            expect(ok.success && ok.data.prCheckFocus).toBeUndefined()
            expect(repositorySchema.safeParse({ owner: 'a', name: 'b', prCheckFocus: null }).success).toBe(true)
        })

        it('创建：三维白名单 → success（逐项 trim）', () => {
            const ok = repositorySchema.safeParse({
                owner: 'a',
                name: 'b',
                prCheckFocus: {
                    providers: [' GitHub-Actions ', 'vercel'],
                    names: [' Test '],
                    kinds: ['check', 'deployment'],
                },
            })
            expect(ok.success).toBe(true)
            expect(ok.success && ok.data.prCheckFocus).toEqual({
                providers: ['GitHub-Actions', 'vercel'],
                names: ['Test'],
                kinds: ['check', 'deployment'],
            })
        })

        it('创建：部分维度缺省 → success（空维度 = 不限）', () => {
            expect(repositorySchema.safeParse({
                owner: 'a',
                name: 'b',
                prCheckFocus: { providers: ['vercel'] },
            }).success).toBe(true)
        })

        it('创建：单维度超过 20 项 → fail', () => {
            const bad = repositorySchema.safeParse({
                owner: 'a',
                name: 'b',
                prCheckFocus: { names: Array.from({ length: 21 }, (_, i) => `check-${i}`) },
            })
            expect(bad.success).toBe(false)
        })

        it('创建：空白条目 / 超长条目 → fail', () => {
            expect(repositorySchema.safeParse({
                owner: 'a', name: 'b', prCheckFocus: { providers: ['   '] },
            }).success).toBe(false)
            expect(repositorySchema.safeParse({
                owner: 'a', name: 'b', prCheckFocus: { names: ['x'.repeat(201)] },
            }).success).toBe(false)
        })

        it('创建：非法 kind → fail（仅接受三源枚举）', () => {
            expect(repositorySchema.safeParse({
                owner: 'a', name: 'b', prCheckFocus: { kinds: ['bogus'] },
            }).success).toBe(false)
        })

        it('创建：kind 允许前后空白与重复项（宽容输入，写入侧归一 / 去重）', () => {
            const ok = repositorySchema.safeParse({
                owner: 'a', name: 'b', prCheckFocus: { kinds: [' check ', 'check', 'status'] },
            })
            expect(ok.success).toBe(true)
            expect(ok.success && ok.data.prCheckFocus?.kinds).toEqual(['check', 'check', 'status'])
        })

        it('创建：未知维度（如 state）→ fail（strict，避免「配了但静默不生效」）', () => {
            expect(repositorySchema.safeParse({
                owner: 'a', name: 'b', prCheckFocus: { names: ['Test'], state: ['failure'] },
            }).success).toBe(false)
        })

        it('更新：undefined = 不修改 / null = 清空 / 白名单 = 设置', () => {
            expect(repositoryUpdateSchema.safeParse({}).success).toBe(true)
            expect(repositoryUpdateSchema.safeParse({ prCheckFocus: null }).success).toBe(true)
            expect(repositoryUpdateSchema.safeParse({ prCheckFocus: { names: ['Test'] } }).success).toBe(true)
        })
    })
})
