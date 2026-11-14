import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * DockerAdapter.ensureImage 的预检语义：本地命中短路、缺失拉取、失败返回 false、
 * 拉取超时透传。child_process / promisify 全替换为 spy（不触发真实 docker）。
 */
const execFileMock = vi.hoisted(() => vi.fn())

vi.mock('node:child_process', () => ({ execFile: execFileMock }))
vi.mock('node:util', async (importOriginal) => {
    const actual = await importOriginal<typeof import('node:util')>()
    return {
        ...actual,
        promisify: () => (...args: unknown[]) => execFileMock(...args),
    }
})

const { DockerAdapter } = await import('./runtime-adapter')

beforeEach(() => {
    execFileMock.mockReset()
})

describe('DockerAdapter.ensureImage', () => {
    it('returns true without pulling when the image exists locally', async () => {
        execFileMock.mockResolvedValue({ stdout: '[]', stderr: '' })
        const adapter = new DockerAdapter()

        await expect(adapter.ensureImage('ghcr.io/o/r:1')).resolves.toBe(true)
        expect(execFileMock).toHaveBeenCalledTimes(1)
        expect(execFileMock.mock.calls[0]?.[1]).toEqual(['image', 'inspect', 'ghcr.io/o/r:1'])
    })

    it('pulls when the image is missing and passes the timeout through', async () => {
        execFileMock
            .mockRejectedValueOnce(new Error('No such image'))
            .mockResolvedValueOnce({ stdout: '', stderr: '' })
        const adapter = new DockerAdapter({ dockerBin: 'docker-test' })

        await expect(adapter.ensureImage('ghcr.io/o/r:1', { timeoutMs: 42_000 })).resolves.toBe(true)
        expect(execFileMock).toHaveBeenCalledTimes(2)
        expect(execFileMock.mock.calls[1]?.[0]).toBe('docker-test')
        expect(execFileMock.mock.calls[1]?.[1]).toEqual(['pull', 'ghcr.io/o/r:1'])
        expect(execFileMock.mock.calls[1]?.[2]).toMatchObject({ timeout: 42_000 })
    })

    it('returns false when both inspect and pull fail', async () => {
        execFileMock.mockRejectedValue(new Error('registry unreachable'))
        const adapter = new DockerAdapter()

        await expect(adapter.ensureImage('ghcr.io/o/r:1')).resolves.toBe(false)
        expect(execFileMock).toHaveBeenCalledTimes(2)
    })
})
