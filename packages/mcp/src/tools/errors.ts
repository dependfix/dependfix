// 统一 tool 错误模板（复用收口）：
// - requireToken：GITHUB_TOKEN 检查。返回 token 字符串或错误对象；
//   调用方用 `typeof token !== 'string'` 守卫收窄（项目未开 strictNullChecks，
//   truthiness 判别收窄不生效，typeof 守卫是兼容形式）。
// - toToolError：任意错误 → ok:false（统一 Error.message / String 转换）
// 各 tool 的返回联合类型均含 `{ ok: false, error: string }` 分支，可安全返回。

export type ToolError = { ok: false, error: string }

export const requireToken = (): string | ToolError => {
    const token = process.env.GITHUB_TOKEN
    if (!token) {
        return { ok: false, error: 'GITHUB_TOKEN not set（请配置环境变量）' }
    }
    return token
}

export const toToolError = (error: unknown): ToolError => ({
    ok: false,
    error: error instanceof Error ? error.message : String(error),
})
