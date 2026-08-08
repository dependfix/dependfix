import {
    createCipheriv,
    createDecipheriv,
    createHash,
    randomBytes,
} from 'node:crypto'

/**
 * 凭据加密服务：AES-256-GCM。
 * 设计要点：
 * - 平台级密钥 ENCRYPTION_KEY 派生 32 字节密钥（sha256），长度兼容 16/24/32 字节输入
 * - 密文格式 `{iv}.{authTag}.{ciphertext}`（均为 base64，GCM 自带完整性校验）
 * - 解密仅在执行时 worker 内存中进行（credential service 解密后传 Executor，用后即弃）
 */

const IV_LENGTH = 12

/** 派生 32 字节密钥（ENCRYPTION_KEY 可为任意长度，sha256 定长） */
const deriveKey = (encryptionKey: string): Buffer => {
    if (!encryptionKey) {
        throw new Error('[credential] ENCRYPTION_KEY 未配置，无法加解密凭据。请设置平台级密钥（ENCRYPTION_KEY）')
    }
    return createHash('sha256').update(encryptionKey).digest()
}

/**
 * AES-256-GCM 加密。
 * @param plaintext 明文 token
 * @param encryptionKey 平台级密钥（ENCRYPTION_KEY）
 * @returns `{iv}.{authTag}.{ciphertext}`（base64 拼接，可安全存 DB）
 */
export const encryptToken = (plaintext: string, encryptionKey: string): string => {
    const key = deriveKey(encryptionKey)
    const iv = randomBytes(IV_LENGTH)
    const cipher = createCipheriv('aes-256-gcm', key, iv)
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
    const authTag = cipher.getAuthTag()
    return [
        iv.toString('base64'),
        authTag.toString('base64'),
        ciphertext.toString('base64'),
    ].join('.')
}

/**
 * AES-256-GCM 解密。
 * @param payload `{iv}.{authTag}.{ciphertext}`（encryptToken 产物）
 * @param encryptionKey 平台级密钥
 * @returns 明文 token
 */
export const decryptToken = (payload: string, encryptionKey: string): string => {
    const parts = payload.split('.')
    if (parts.length !== 3) {
        throw new Error('[credential] 密文格式非法（预期 `{iv}.{authTag}.{ciphertext}`）')
    }
    const iv = parts[0]!
    const authTag = parts[1]!
    const ciphertext = parts[2]!
    const key = deriveKey(encryptionKey)
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'))
    decipher.setAuthTag(Buffer.from(authTag, 'base64'))
    const plaintext = Buffer.concat([
        decipher.update(Buffer.from(ciphertext, 'base64')),
        decipher.final(),
    ])
    return plaintext.toString('utf8')
}

/**
 * 运行时获取平台级加密密钥（供服务端使用，缺失时抛错）。
 * 注意：该密钥永不进入 Executor 执行进程（见 executor-sandbox.md §3 契约要点 1）。
 */
export const getEncryptionKey = (): string => {
    const key = process.env.ENCRYPTION_KEY ?? ''
    if (!key) {
        throw new Error('[credential] ENCRYPTION_KEY 未配置，无法加解密凭据')
    }
    return key
}
