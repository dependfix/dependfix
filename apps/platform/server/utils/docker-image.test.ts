import { describe, expect, it } from 'vitest'
import { isValidDockerImage, normalizeDockerImage } from './docker-image'

describe('docker image reference', () => {
    it('accepts registry paths, tags and digests', () => {
        for (const image of [
            'dependfix-platform:latest',
            'ghcr.io/dependfix/dependfix:2.0.0',
            'registry.cn-hangzhou.aliyuncs.com/caomeiyouren/dependfix:platform-1.0.0',
            'localhost:5000/team/dependfix',
            `dependfix@sha256:${'a'.repeat(64)}`,
            'ghcr.io/owner/repo:v1.2.3-beta.1',
        ]) {
            expect(isValidDockerImage(image), image).toBe(true)
        }
    })

    it('rejects protocols, whitespace, empty segments and traversal', () => {
        for (const image of [
            'https://ghcr.io/o/r:1',
            'ghcr.io//o/r:1',
            'ghcr.io/o/../r:1',
            'ghcr.io/o/r latest',
            ':latest',
            'ghcr.io/o/r:',
            'Dependfix:latest',
            'a'.repeat(256),
        ]) {
            expect(isValidDockerImage(image), image).toBe(false)
        }
    })

    it('normalizes blank values to null', () => {
        expect(normalizeDockerImage('  ghcr.io/o/r:1 ')).toBe('ghcr.io/o/r:1')
        expect(normalizeDockerImage('   ')).toBeNull()
        expect(normalizeDockerImage(undefined)).toBeNull()
    })
})
