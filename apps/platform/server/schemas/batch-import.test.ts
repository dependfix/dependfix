import { describe, expect, it } from 'vitest'
import { batchImportSchema } from './batch-import'

/**
 * 批量导入请求校验定向测试。
 * 校验源与 batch.post.ts 共用（单一校验源），验证与单仓库添加入口的一致性。
 */
describe('batch import schema', () => {
    it('合法项通过（owner/name/defaultBranch 默认值）', () => {
        const ok = batchImportSchema.safeParse({
            repos: [{ owner: 'e2e-owner', name: 'e2e-repo' }],
        })
        expect(ok.success).toBe(true)
        if (ok.success) {
            expect(ok.data.repos[0]!.defaultBranch).toBe('main')
            expect(ok.data.repos[0]!.executorKind).toBe('container')
        }
    })

    it('owner/name 非法字符被拒（与单仓库创建入口一致）', () => {
        const bad = batchImportSchema.safeParse({
            repos: [{ owner: 'bad owner!', name: 'ok-name' }],
        })
        expect(bad.success).toBe(false)
    })

    it('github-action 必须填 workflow 文件（交叉校验与单仓库入口一致）', () => {
        const bad = batchImportSchema.safeParse({
            repos: [{ owner: 'o', name: 'r', executorKind: 'github-action' }],
        })
        expect(bad.success).toBe(false)
        const ok = batchImportSchema.safeParse({
            repos: [{ owner: 'o', name: 'r', executorKind: 'github-action', actionWorkflowFile: 'ci.yml' }],
        })
        expect(ok.success).toBe(true)
    })

    it('空数组拒绝、超过 100 个拒绝', () => {
        expect(batchImportSchema.safeParse({ repos: [] }).success).toBe(false)
        const many = Array.from({ length: 101 }, (_, i) => ({ owner: `o${i}`, name: `r${i}` }))
        expect(batchImportSchema.safeParse({ repos: many }).success).toBe(false)
    })
})
