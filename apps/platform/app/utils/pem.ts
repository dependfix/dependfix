/**
 * PEM 私钥客户端格式校验（M18.3 GitHub App 路径）。
 *
 * 用途：credentials.vue 表单上传 PEM 文件时，浏览器端校验格式合法性 +
 * 私钥类型识别（RSA / EC）。
 *
 * 范围限制（M18.3 锁定方案）：
 * - **不**计算公钥 SHA256 指纹（与 GitHub App 设置页对照需 ASN.1 解析提取公钥 SPKI DER，超出本阶段范围）
 * - 用户需自行用 openssl 命令比对 GitHub 指纹：
 *   `openssl rsa -in PATH_TO_PEM_FILE -pubout -outform DER | openssl sha256 -binary | openssl base64`
 *
 * 安全边界：仅校验 PEM 格式（不持有私钥内容，解析后丢弃）。
 */

/** PEM 解析结果 */
export interface PemParseResult {
    /** 解析成功标记 */
    valid: boolean
    /** 私钥类型（rsa / ec 等） */
    keyType?: 'rsa' | 'ec' | 'unknown'
    /** 错误消息（valid=false 时填入） */
    error?: string
}

/**
 * 校验 PEM 格式（不支持计算公钥指纹，详见模块 JSDoc）。
 *
 * 校验内容：
 * 1. PEM header 是否为合法私钥头（`BEGIN PRIVATE KEY` / `BEGIN RSA PRIVATE KEY` / `BEGIN EC PRIVATE KEY`）
 * 2. 大小 ≤ 16KB（防恶意超长文件）
 * 3. base64 内容非空
 * 4. 私钥类型识别（从 PEM header 判断）
 */
export function computePemFingerprint(pem: string): PemParseResult {
    // 函数名保留为 `computePemFingerprint` 以兼容已有调用方签名；
    // 当前仅做格式校验（不计算指纹）—— fingerprint 字段保留但不使用
    if (!pem.includes('BEGIN PRIVATE KEY') && !pem.includes('BEGIN RSA PRIVATE KEY') && !pem.includes('BEGIN EC PRIVATE KEY')) {
        return {
            valid: false,
            error: 'PEM 内容非法：缺少 BEGIN PRIVATE KEY / RSA PRIVATE KEY / EC PRIVATE KEY 头',
        }
    }

    // 大小校验
    const sizeCheck = validatePemSize(pem)
    if (!sizeCheck.valid) {
        return sizeCheck
    }

    // 提取 base64 内容（仅做非空校验）
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

    // 检测私钥类型（从 PEM header 判断）
    let keyType: 'rsa' | 'ec' | 'unknown' = 'unknown'
    if (pem.includes('BEGIN RSA PRIVATE KEY')) {
        keyType = 'rsa'
    } else if (pem.includes('BEGIN EC PRIVATE KEY')) {
        keyType = 'ec'
    }
    // BEGIN PRIVATE KEY（PKCS#8 格式）需要 ASN.1 解析才能判断 key type；
    // 此处简化为 unknown；服务端 credential.service 可做精确校验（M19+ 实施）

    return {
        valid: true,
        keyType,
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
// （base64ToBytes / bytesToBase64 已在 M18.3 commit 1 audit reject 后清理——
// 当前 computePemFingerprint 仅做格式校验 + 类型识别，不需要 ASN.1 解析或 SHA256 计算；
// 公钥指纹需用 openssl 命令（见模块 JSDoc）由用户自行计算与 GitHub 对照）
