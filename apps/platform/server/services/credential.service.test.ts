import { describe, expect, it } from 'vitest'
import {
    decryptToken,
    encryptToken,
    getEncryptionKey,
} from './credential.service'

describe('credential.service', () => {
    const key = 'test-encryption-key-32-bytes!!'

    describe('encryptToken / decryptToken', () => {
        it('round-trips a token', () => {
            const plaintext = 'ghp_1234567890abcdef'
            const encrypted = encryptToken(plaintext, key)
            expect(encrypted).not.toContain(plaintext)
            expect(decryptToken(encrypted, key)).toBe(plaintext)
        })

        it('produces iv.authTag.ciphertext format', () => {
            const encrypted = encryptToken('secret', key)
            const parts = encrypted.split('.')
            expect(parts).toHaveLength(3)
            expect(parts[0]).toBeTruthy()
            expect(parts[1]).toBeTruthy()
            expect(parts[2]).toBeTruthy()
        })

        it('produces different ciphertext for same plaintext (random IV)', () => {
            const plaintext = 'same-token'
            const a = encryptToken(plaintext, key)
            const b = encryptToken(plaintext, key)
            expect(a).not.toBe(b)
            expect(decryptToken(a, key)).toBe(plaintext)
            expect(decryptToken(b, key)).toBe(plaintext)
        })

        it('rejects tampered payload (GCM auth tag)', () => {
            const encrypted = encryptToken('secret', key)
            const parts = encrypted.split('.')
            const tampered = parts[0] === 'AA==' ? `AQ==.${parts[1]}.${parts[2]}` : `AA==.${parts[1]}.${parts[2]}`
            expect(() => decryptToken(tampered, key)).toThrow()
        })

        it('rejects malformed payload', () => {
            expect(() => decryptToken('not-a-valid-payload', key)).toThrow('密文格式非法')
        })

        it('fails decryption with wrong key', () => {
            const encrypted = encryptToken('secret', key)
            expect(() => decryptToken(encrypted, 'wrong-key')).toThrow()
        })

        it('throws when encryption key is empty', () => {
            expect(() => encryptToken('secret', '')).toThrow('ENCRYPTION_KEY 未配置')
        })
    })

    describe('getEncryptionKey', () => {
        it('returns configured key', () => {
            const original = process.env.ENCRYPTION_KEY
            process.env.ENCRYPTION_KEY = 'env-key'
            try {
                expect(getEncryptionKey()).toBe('env-key')
            } finally {
                process.env.ENCRYPTION_KEY = original
            }
        })

        it('throws when not configured', () => {
            const original = process.env.ENCRYPTION_KEY
            delete process.env.ENCRYPTION_KEY
            try {
                expect(() => getEncryptionKey()).toThrow('ENCRYPTION_KEY 未配置')
            } finally {
                process.env.ENCRYPTION_KEY = original
            }
        })
    })
})
