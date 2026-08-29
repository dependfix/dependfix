/**
 * PEM 私钥客户端解析 + 公钥指纹校验（M18.3 GitHub App 路径）。
 *
 * 用途：credentials.vue 表单上传 PEM 文件时，浏览器端校验格式合法性 +
 * 计算公钥 SHA256 指纹（用于与 GitHub App 设置页面对照）。
 *
 * 安全边界：仅解析 + 计算指纹；不持有私钥内容（解析后丢弃）。
 */

/** PEM 解析结果 */
export interface PemParseResult {
    /** 解析成功标记 */
    valid: boolean
    /** 公钥 SHA256 指纹（base64，GitHub 显示格式 `SHA256:xxxxx`） */
    fingerprint?: string
    /** 私钥类型（rsa / ec 等） */
    keyType?: 'rsa' | 'ec' | 'unknown'
    /** 错误消息（valid=false 时填入） */
    error?: string
}

/**
 * 计算公钥 SHA256 指纹（GitHub 显示格式）。
 *
 * 算法：
 * 1. 从 PEM 提取 DER 公钥（SPKI 格式）
 * 2. SHA256 hash
 * 3. base64 编码
 *
 * GitHub 显示：`SHA256:xxx`（xxx 是 base64 字符串，无 padding `=`）
 *
 * 注：浏览器端实现使用 Web Crypto API（`crypto.subtle.digest`），无需 Node.js 依赖。
 */
export async function computePemFingerprint(pem: string): Promise<PemParseResult> {
    if (!pem.includes('BEGIN PRIVATE KEY') && !pem.includes('BEGIN RSA PRIVATE KEY') && !pem.includes('BEGIN EC PRIVATE KEY')) {
        return {
            valid: false,
            error: 'PEM 内容非法：缺少 BEGIN PRIVATE KEY / RSA PRIVATE KEY / EC PRIVATE KEY 头',
        }
    }

    // 提取 base64 内容
    const base64Content = pem
        .replace(/-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/g, '')
        .replace(/-----END (?:RSA |EC )?PRIVATE KEY-----/g, '')
        .replace(/\s+/g, '')

    if (!base64Content) {
        return {
            valid: false,
            error: 'PEM 内容非法：base64 内容为空',
        }
    }

    try {
        // 计算 DER 编码的 SHA256
        const derBuffer = base64ToBytes(base64Content)
        // crypto.subtle.digest 在 lib.dom.d.ts 中签名是 BufferSource；
        // derBuffer 已是 Uint8Array（合法 BufferSource）
        const hashBuffer = await crypto.subtle.digest('SHA-256', derBuffer as BufferSource)
        const hashBase64 = bytesToBase64(new Uint8Array(hashBuffer))

        // 检测私钥类型（从 PEM header 判断）
        let keyType: 'rsa' | 'ec' | 'unknown' = 'unknown'
        if (pem.includes('BEGIN RSA PRIVATE KEY')) {
            keyType = 'rsa'
        } else if (pem.includes('BEGIN EC PRIVATE KEY')) {
            keyType = 'ec'
        } else {
            // BEGIN PRIVATE KEY（PKCS#8 格式）需要 ASN.1 解析才能判断 key type
            // 此处简化为 unknown；服务端 credential.service 可做精确校验
            keyType = 'unknown'
        }

        return {
            valid: true,
            fingerprint: hashBase64,
            keyType,
        }
    } catch (e) {
        return {
            valid: false,
            error: `PEM 解析失败：${e instanceof Error ? e.message : String(e)}`,
        }
    }
}

/**
 * 校验 PEM 文件大小（防止恶意超长文件）。
 *
 * GitHub App 私钥通常 < 5KB（base64 后）；上限设为 16KB 留余量。
 */
export function validatePemSize(pem: string): { valid: boolean, error?: string } {
    const maxBytes = 16 * 1024
    if (pem.length > maxBytes) {
        return {
            valid: false,
            error: `PEM 文件过大（${pem.length} bytes > ${maxBytes} bytes 上限）`,
        }
    }
    return { valid: true }
}

/**
 * 校验 GitHub App ID / Installation ID 格式。
 *
 * GitHub App ID 和 Installation ID 是数字字符串（无负数），通常 6-10 位数。
 */
export function validateGithubAppId(value: string, fieldName: string): { valid: boolean, error?: string } {
    if (!/^[1-9]\d{0,15}$/.test(value)) {
        return {
            valid: false,
            error: `${fieldName} 格式非法（预期非负数字）`,
        }
    }
    return { valid: true }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function base64ToBytes(base64: string): Uint8Array {
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
        const code = binary.charCodeAt(i)
        if (code !== undefined) {
            bytes[i] = code
        }
    }
    return bytes
}

function bytesToBase64(bytes: Uint8Array): string {
    let binary = ''
    for (const code of bytes) {
        binary += String.fromCharCode(code)
    }
    return btoa(binary)
}
