import { afterEach, describe, expect, it, vi } from 'vitest'
import { downloadFile } from './download'

/** 构造 fetch Response 形状（仅覆盖 downloadFile 消费的字段） */
const makeResponse = (init: {
    ok?: boolean
    status?: number
    disposition?: string | null
    jsonBody?: unknown
    jsonThrows?: boolean
}) => ({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    headers: {
        get: (name: string) => (name.toLowerCase() === 'content-disposition' ? (init.disposition ?? null) : null),
    },
    json: vi.fn(async () => {
        if (init.jsonThrows) {
            throw new Error('not json')
        }
        return init.jsonBody
    }),
    blob: vi.fn(async () => new Blob(['payload'])),
})

const setupDom = () => {
    const anchor = { href: '', download: '', click: vi.fn() }
    const appendChild = vi.fn()
    const removeChild = vi.fn()
    const createElement = vi.fn(() => anchor)
    vi.stubGlobal('document', { createElement, body: { appendChild, removeChild } })
    const createObjectURL = vi.fn(() => 'blob:mock')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL })
    return { anchor, appendChild, removeChild, createObjectURL, revokeObjectURL }
}

const flushMacrotask = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('downloadFile', () => {
    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it('成功：按 Content-Disposition（带引号）命名并触发下载', async () => {
        const { anchor, appendChild, removeChild, createObjectURL, revokeObjectURL } = setupDom()
        const fetchMock = vi.fn(async () => makeResponse({ disposition: 'attachment; filename="run-abc.txt"' }))
        vi.stubGlobal('fetch', fetchMock)

        await downloadFile('/api/runs/abc/logs', 'fallback.txt')

        expect(fetchMock).toHaveBeenCalledWith('/api/runs/abc/logs', { credentials: 'same-origin' })
        expect(anchor.download).toBe('run-abc.txt')
        expect(anchor.href).toBe('blob:mock')
        expect(anchor.click).toHaveBeenCalledTimes(1)
        expect(appendChild).toHaveBeenCalledWith(anchor)
        expect(removeChild).toHaveBeenCalledWith(anchor)
        expect(createObjectURL).toHaveBeenCalledTimes(1)
        await flushMacrotask()
        expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock')
    })

    it('成功：Content-Disposition 无引号时仍解析附件名', async () => {
        const { anchor } = setupDom()
        vi.stubGlobal('fetch', vi.fn(async () => makeResponse({ disposition: 'attachment; filename=plain.txt' })))

        await downloadFile('/api/x', 'fallback.txt')

        expect(anchor.download).toBe('plain.txt')
    })

    it('成功：缺少 Content-Disposition 时回退 fallbackFilename', async () => {
        const { anchor } = setupDom()
        vi.stubGlobal('fetch', vi.fn(async () => makeResponse({ disposition: null })))

        await downloadFile('/api/x', 'fallback.txt')

        expect(anchor.download).toBe('fallback.txt')
    })

    it('失败：JSON 错误体（顶层 message）抛出该 message', async () => {
        setupDom()
        vi.stubGlobal('fetch', vi.fn(async () => makeResponse({ ok: false, status: 413, jsonBody: { message: '导出内容超出上限' } })))

        await expect(downloadFile('/api/x', 'fallback.txt')).rejects.toThrow('导出内容超出上限')
    })

    it('失败：JSON 错误体（data.message）抛出该 message', async () => {
        setupDom()
        vi.stubGlobal('fetch', vi.fn(async () => makeResponse({ ok: false, status: 404, jsonBody: { data: { message: '没有可导出的执行日志' } } })))

        await expect(downloadFile('/api/x', 'fallback.txt')).rejects.toThrow('没有可导出的执行日志')
    })

    it('失败：非 JSON 错误体退回 HTTP 状态码', async () => {
        setupDom()
        vi.stubGlobal('fetch', vi.fn(async () => makeResponse({ ok: false, status: 500, jsonThrows: true })))

        await expect(downloadFile('/api/x', 'fallback.txt')).rejects.toThrow('HTTP 500')
    })

    it('失败：非 2xx 时不触发下载', async () => {
        const { anchor, createObjectURL } = setupDom()
        vi.stubGlobal('fetch', vi.fn(async () => makeResponse({ ok: false, status: 401, jsonBody: { message: 'unauthorized' } })))

        await expect(downloadFile('/api/x', 'fallback.txt')).rejects.toThrow('unauthorized')
        expect(anchor.click).not.toHaveBeenCalled()
        expect(createObjectURL).not.toHaveBeenCalled()
    })
})
