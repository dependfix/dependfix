import { describe, expect, it } from 'vitest'
import { computePemFingerprint, validateGithubAppId, validatePemSize } from './pem'

/**
 * PEM utility 单测（M18.3 commit 1 audit 反馈 W1）。
 *
 * 覆盖：
 * - `computePemFingerprint`：合法 PEM（PKCS#1 / PKCS#8 / SEC1）→ valid=true + keyType；非法 header / 空 base64 / 超 16KB → valid=false + error
 * - `validatePemSize`：边界 16384 / 16385 字节
 * - `validateGithubAppId`：合法（`1` / `123456`）/ 非法（`0` / `-1` / `abc` / `1.5` / 空串 / 超 16 位）
 */

// 真实的测试 RSA 私钥（仅用于格式校验；不在仓库提交真实凭据）
const RSA_PEM = `-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEAxZxZ7BqHKJ9QsWbX8bFqHsK3p4QyjQJYxJ0gQjQJYxJ0gQjQJ
YxJ0gQjQJYxJ0gQjQJYxJ0gQjQJYxJ0gQjQJYxJ0gQjQJYxJ0gQjQJYxJ0gQjQJ
YxJ0gQjQJYxJ0gQjQJYxJ0gQjQJYxJ0gQjQJYxJ0gQjQJYxJ0gQjQJYxJ0gQjQJ
YxJ0gQjQJYxJ0gQjQJYxJ0gQjQJYxJ0gQjQJYxJ0gQjQJYxJ0gQjQJYxJ0gQjQJ
YxJ0gQjQJYxJ0gQjQJYxJ0gQjQJYxJ0gQjQJYxJ0gQjQJYxJ0gQjQJYxJ0gQjQJ
-----END RSA PRIVATE KEY-----`

const EC_PEM = `-----BEGIN EC PRIVATE KEY-----
MHcCAQEExLJXu7vZxkW+qPLzWG+7EBgJEPvzZ9hCNwIBAgECBIIBXT2VYNTIuGKn
-----END EC PRIVATE KEY-----`

const PKCS8_PEM = `-----BEGIN PRIVATE KEY-----
MIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQDFnFnsGocon1Cx
-----END PRIVATE KEY-----`

describe('computePemFingerprint', () => {
    it('RSA private key (PKCS#1) → valid=true + keyType=rsa', async () => {
        const result = computePemFingerprint(RSA_PEM)
        expect(result.valid).toBe(true)
        expect(result.keyType).toBe('rsa')
    })

    it('EC private key (SEC1) → valid=true + keyType=ec', async () => {
        const result = computePemFingerprint(EC_PEM)
        expect(result.valid).toBe(true)
        expect(result.keyType).toBe('ec')
    })

    it('PKCS#8 private key → valid=true + keyType=unknown（需 ASN.1 解析）', async () => {
        const result = computePemFingerprint(PKCS8_PEM)
        expect(result.valid).toBe(true)
        expect(result.keyType).toBe('unknown')
    })

    it('缺少 PEM header → valid=false', async () => {
        const result = computePemFingerprint('not a PEM file')
        expect(result.valid).toBe(false)
        expect(result.error).toMatch(/BEGIN PRIVATE KEY/)
    })

    it('空字符串 → valid=false', async () => {
        const result = computePemFingerprint('')
        expect(result.valid).toBe(false)
    })

    it('base64 内容为空 → valid=false', async () => {
        const emptyPem = `-----BEGIN RSA PRIVATE KEY-----
-----END RSA PRIVATE KEY-----`
        const result = computePemFingerprint(emptyPem)
        expect(result.valid).toBe(false)
        expect(result.error).toMatch(/base64 内容为空/)
    })

    it('超 16KB → valid=false', async () => {
        const largePem = `-----BEGIN RSA PRIVATE KEY-----\n${'A'.repeat(20_000)}\n-----END RSA PRIVATE KEY-----`
        const result = computePemFingerprint(largePem)
        expect(result.valid).toBe(false)
        expect(result.error).toMatch(/PEM 文件过大/)
    })
})

describe('validatePemSize', () => {
    it('16384 bytes → valid=true（边界）', () => {
        // 构造恰好 16384 字符的 PEM（含 header / footer / 换行）
        const header = '-----BEGIN RSA PRIVATE KEY-----' // 31 字符
        const footer = '-----END RSA PRIVATE KEY-----' // 29 字符
        const overhead = header.length + footer.length + 2 // 2 个换行符
        const content = 'A'.repeat(16384 - overhead)
        const pem = `${header}\n${content}\n${footer}`
        expect(pem.length).toBe(16384)
        const result = validatePemSize(pem)
        expect(result.valid).toBe(true)
    })

    it('16385 bytes → valid=false（边界外）', () => {
        const header = '-----BEGIN RSA PRIVATE KEY-----'
        const footer = '-----END RSA PRIVATE KEY-----'
        const overhead = header.length + footer.length + 2
        const content = 'A'.repeat(16385 - overhead + 1) // +1 故意超界
        const pem = `${header}\n${content}\n${footer}`
        expect(pem.length).toBeGreaterThan(16384)
        const result = validatePemSize(pem)
        expect(result.valid).toBe(false)
        expect(result.error).toMatch(/PEM 文件过大/)
    })

    it('空字符串 → valid=true（无下限）', () => {
        const result = validatePemSize('')
        expect(result.valid).toBe(true)
    })
})

describe('validateGithubAppId', () => {
    it('合法 ID 1 → valid=true', () => {
        const result = validateGithubAppId('1', 'App ID')
        expect(result.valid).toBe(true)
    })

    it('合法 ID 123456 → valid=true', () => {
        const result = validateGithubAppId('123456', 'App ID')
        expect(result.valid).toBe(true)
    })

    it('合法 16 位 ID → valid=true（边界）', () => {
        const result = validateGithubAppId('1234567890123456', 'Installation ID')
        expect(result.valid).toBe(true)
    })

    it('ID 0 → valid=false（必须 ≥ 1）', () => {
        const result = validateGithubAppId('0', 'App ID')
        expect(result.valid).toBe(false)
        expect(result.error).toMatch(/格式非法/)
    })

    it('负数 -1 → valid=false', () => {
        const result = validateGithubAppId('-1', 'App ID')
        expect(result.valid).toBe(false)
    })

    it('非数字 abc → valid=false', () => {
        const result = validateGithubAppId('abc', 'App ID')
        expect(result.valid).toBe(false)
    })

    it('小数 1.5 → valid=false', () => {
        const result = validateGithubAppId('1.5', 'App ID')
        expect(result.valid).toBe(false)
    })

    it('空字符串 → valid=false', () => {
        const result = validateGithubAppId('', 'App ID')
        expect(result.valid).toBe(false)
    })

    it('超 16 位 ID → valid=false', () => {
        const result = validateGithubAppId('12345678901234567', 'App ID')
        expect(result.valid).toBe(false)
    })

    it('前导 0 → valid=false（正则要求首位非 0）', () => {
        const result = validateGithubAppId('0123456', 'App ID')
        expect(result.valid).toBe(false)
    })

    it('错误消息包含字段名', () => {
        const result = validateGithubAppId('abc', 'App ID')
        expect(result.error).toContain('App ID')
    })
})
