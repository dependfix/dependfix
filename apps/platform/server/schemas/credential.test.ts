import { describe, expect, it } from 'vitest'
import { credentialSchema, credentialUpdateSchema } from './credential'

describe('credentialSchema + ownerLogin 字段（M26.2 C67）', () => {
    describe('credentialSchema 创建路径', () => {
        it('classic-pat 接受 ownerLogin（可选）', () => {
            const result = credentialSchema.safeParse({
                name: 'classic',
                type: 'classic-pat',
                token: 'ghp_xxx',
                ownerLogin: 'octocat',
            })
            expect(result.success).toBe(true)
            if (result.success) {
                expect(result.data.ownerLogin).toBe('octocat')
            }
        })

        it('classic-pat 允许省略 ownerLogin（运行时自动发现）', () => {
            const result = credentialSchema.safeParse({
                name: 'classic',
                type: 'classic-pat',
                token: 'ghp_xxx',
            })
            expect(result.success).toBe(true)
            if (result.success) {
                expect(result.data.ownerLogin).toBeUndefined()
            }
        })

        it('fine-grained-pat 必填 ownerLogin（缺失 → Zod 失败）', () => {
            const result = credentialSchema.safeParse({
                name: 'fgp',
                type: 'fine-grained-pat',
                token: 'github_pat_xxx',
            })
            expect(result.success).toBe(false)
        })

        it('fine-grained-pat 提供 ownerLogin 通过', () => {
            const result = credentialSchema.safeParse({
                name: 'fgp',
                type: 'fine-grained-pat',
                token: 'github_pat_xxx',
                ownerLogin: 'my-org',
            })
            expect(result.success).toBe(true)
            if (result.success) {
                expect(result.data.ownerLogin).toBe('my-org')
            }
        })

        it('github-app 接受 ownerLogin（可选）', () => {
            const result = credentialSchema.safeParse({
                name: 'app',
                type: 'github-app',
                appId: '123',
                encryptedPrivateKey: '-----BEGIN PRIVATE KEY-----...',
                installationId: '456',
                ownerLogin: 'my-org',
            })
            expect(result.success).toBe(true)
            if (result.success) {
                expect(result.data.ownerLogin).toBe('my-org')
            }
        })

        it('ownerLogin 空字符串视为缺失（fine-grained-pat 路径）', () => {
            const result = credentialSchema.safeParse({
                name: 'fgp',
                type: 'fine-grained-pat',
                token: 'github_pat_xxx',
                ownerLogin: '',
            })
            expect(result.success).toBe(false)
        })
    })

    describe('credentialUpdateSchema 更新路径', () => {
        it('ownerLogin 可独立更新（任意类型）', () => {
            const result = credentialUpdateSchema.safeParse({
                ownerLogin: 'new-owner',
            })
            expect(result.success).toBe(true)
            if (result.success) {
                expect(result.data.ownerLogin).toBe('new-owner')
            }
        })

        it('ownerLogin 允许 null（清空语义）', () => {
            const result = credentialUpdateSchema.safeParse({
                ownerLogin: null,
            })
            expect(result.success).toBe(true)
        })

        it('ownerLogin 省略表示不修改', () => {
            const result = credentialUpdateSchema.safeParse({})
            expect(result.success).toBe(true)
        })
    })
})
