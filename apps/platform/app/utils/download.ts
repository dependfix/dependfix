/**
 * 触发浏览器下载同源附件端点。
 *
 * 用原生 `fetch`（`credentials: 'same-origin'`）而非 `$fetch`，以便读取非 2xx 的错误响应体
 * （服务端错误响应体的本地化 message 位于顶层 `message`，`data` 仅含 `code`）；成功后按
 * `Content-Disposition` 解析附件名（回退 `fallbackFilename`）并触发下载。
 *
 * 失败时抛出携带服务端 message 的 `Error`，供调用方展示本地化提示。
 */
const parseFilename = (disposition: string | null): string | null => {
    if (!disposition) {
        return null
    }
    const match = /filename="?([^";]+)"?/.exec(disposition)
    return match?.[1] ?? null
}

export const downloadFile = async (url: string, fallbackFilename: string): Promise<void> => {
    const response = await fetch(url, { credentials: 'same-origin' })
    if (!response.ok) {
        let message = ''
        try {
            const body = await response.json() as { message?: string, data?: { message?: string } }
            message = body?.data?.message ?? body?.message ?? ''
        } catch {
            // 非 JSON 错误体（如网关错误页）：退回状态码
        }
        throw new Error(message || `HTTP ${response.status}`)
    }

    const filename = parseFilename(response.headers.get('content-disposition')) ?? fallbackFilename
    const blob = await response.blob()
    const objectUrl = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = objectUrl
    anchor.download = filename
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    // 延迟释放：个别浏览器在 click() 同步返回后仍读取 object URL，立即 revoke 可能中断下载
    setTimeout(() => URL.revokeObjectURL(objectUrl), 0)
}
