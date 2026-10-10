import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
    clearRegistryDiscoveryCache,
    discoverRegistryHosts,
    extractRegistryHostsFromConfig,
    isValidRegistryHost,
    registryHostFromUrl,
} from './registry-discovery'

beforeEach(() => {
    clearRegistryDiscoveryCache()
})

// ---------------------------------------------------------------------------
// isValidRegistryHost（动态来源的 host 形态校验）
// ---------------------------------------------------------------------------

describe('isValidRegistryHost', () => {
    it('accepts multi-label domains, single-label hosts and ipv4', () => {
        expect(isValidRegistryHost('registry.npmmirror.com')).toBe(true)
        expect(isValidRegistryHost('localhost')).toBe(true)
        expect(isValidRegistryHost('npm.jsr.io')).toBe(true)
        expect(isValidRegistryHost('192.168.1.10')).toBe(true)
        expect(isValidRegistryHost('a-b.example.com')).toBe(true)
    })

    it('rejects wildcard, path, port, scheme and empty values', () => {
        expect(isValidRegistryHost('*')).toBe(false)
        expect(isValidRegistryHost('*.example.com')).toBe(false)
        expect(isValidRegistryHost('evil.com/path')).toBe(false)
        expect(isValidRegistryHost('localhost:4873')).toBe(false)
        expect(isValidRegistryHost('https://evil.com')).toBe(false)
        expect(isValidRegistryHost('')).toBe(false)
    })

    it('rejects overlong, underscored and hyphen-edged labels', () => {
        expect(isValidRegistryHost(`${'x'.repeat(300)}.com`)).toBe(false)
        expect(isValidRegistryHost('evil_registry.com')).toBe(false)
        expect(isValidRegistryHost('-evil.com')).toBe(false)
        expect(isValidRegistryHost('evil-.com')).toBe(false)
    })
})

// ---------------------------------------------------------------------------
// registryHostFromUrl（从配置值提取 host）
// ---------------------------------------------------------------------------

describe('registryHostFromUrl', () => {
    it('strips protocol, path and port', () => {
        expect(registryHostFromUrl('https://registry.npmmirror.com/')).toBe('registry.npmmirror.com')
        expect(registryHostFromUrl('http://localhost:4873')).toBe('localhost')
        expect(registryHostFromUrl('https://npm.jsr.io/@jsr')).toBe('npm.jsr.io')
    })

    it('strips userinfo before host extraction', () => {
        expect(registryHostFromUrl('https://user:pass@registry.example.com/')).toBe('registry.example.com')
        expect(registryHostFromUrl('https://token@registry.example.com/')).toBe('registry.example.com')
    })

    it('lowercases the host', () => {
        expect(registryHostFromUrl('https://REGISTRY.NPMMIRROR.COM/')).toBe('registry.npmmirror.com')
    })

    it('returns undefined for invalid hosts', () => {
        expect(registryHostFromUrl('')).toBeUndefined()
        expect(registryHostFromUrl('https://')).toBeUndefined()
        expect(registryHostFromUrl('not a url')).toBeUndefined()
    })
})

// ---------------------------------------------------------------------------
// extractRegistryHostsFromConfig（pnpm config list --json 解析结果抽取）
// ---------------------------------------------------------------------------

describe('extractRegistryHostsFromConfig', () => {
    it('picks bare registry and scoped @scope:registry keys', () => {
        const hosts = extractRegistryHostsFromConfig({
            registry: 'https://registry.npmmirror.com/',
            '@jsr:registry': 'https://npm.jsr.io/',
        })
        expect(hosts).toEqual(['registry.npmmirror.com', 'npm.jsr.io'])
    })

    it('deduplicates identical hosts and drops invalid values', () => {
        const hosts = extractRegistryHostsFromConfig({
            registry: 'https://registry.npmmirror.com/',
            '@a:registry': 'https://registry.npmmirror.com/',
            '@b:registry': 'https://',
            '@c:registry': 'not a url',
        })
        expect(hosts).toEqual(['registry.npmmirror.com'])
    })

    it('ignores non-string values and non-registry keys', () => {
        const hosts = extractRegistryHostsFromConfig({
            registry: 'https://registry.npmjs.org/',
            'strict-ssl': true,
            'store-dir': '/tmp/store',
            '//registry.npmjs.org/:_authToken': 'secret',
        })
        expect(hosts).toEqual(['registry.npmjs.org'])
    })

    it('returns empty array for non-object input', () => {
        expect(extractRegistryHostsFromConfig(undefined)).toEqual([])
        expect(extractRegistryHostsFromConfig(null)).toEqual([])
        expect(extractRegistryHostsFromConfig('registry')).toEqual([])
        expect(extractRegistryHostsFromConfig(['a'])).toEqual([])
    })
})

// ---------------------------------------------------------------------------
// discoverRegistryHosts（发现主流程 + 回退链 + 缓存）
// ---------------------------------------------------------------------------

describe('discoverRegistryHosts', () => {
    it('discovers hosts from pnpm config json output', () => {
        const runCommand = vi.fn(() => JSON.stringify({
            registry: 'https://registry.npmmirror.com/',
            '@jsr:registry': 'https://npm.jsr.io/',
        }))
        const result = discoverRegistryHosts('/tmp/repo', { runCommand })

        expect(result.source).toBe('pnpm-config')
        expect(result.hosts).toEqual(['registry.npmmirror.com', 'npm.jsr.io'])
        expect(result.warning).toBeUndefined()
        expect(runCommand).toHaveBeenCalledWith('pnpm', ['config', 'list', '--json'], expect.objectContaining({ cwd: '/tmp/repo' }))
    })

    it('tolerates json wrapped in extra output lines', () => {
        const runCommand = vi.fn(() => `Progress: done\n${JSON.stringify({ registry: 'https://mirror.example.com/' })}\n`)
        const result = discoverRegistryHosts('/tmp/repo', { runCommand })
        expect(result.hosts).toEqual(['mirror.example.com'])
    })

    it('falls back to env registry when pnpm config fails', () => {
        const runCommand = vi.fn(() => {
            throw new Error('pnpm: command not found')
        })
        const result = discoverRegistryHosts('/tmp/repo', {
            runCommand,
            env: { npm_config_registry: 'http://localhost:4873/' },
        })

        expect(result.source).toBe('env')
        expect(result.hosts).toEqual(['localhost'])
        expect(result.warning).toContain('读取 pnpm 配置失败')
    })

    it('falls back to upper-case env variable', () => {
        const runCommand = vi.fn(() => {
            throw new Error('boom')
        })
        const result = discoverRegistryHosts('/tmp/repo', {
            runCommand,
            env: { NPM_CONFIG_REGISTRY: 'https://mirror.example.com/' },
        })
        expect(result.hosts).toEqual(['mirror.example.com'])
    })

    it('returns empty hosts with warning when output is unparsable', () => {
        const runCommand = vi.fn(() => 'not json at all')
        const result = discoverRegistryHosts('/tmp/repo', { runCommand, env: {} })

        expect(result.source).toBe('none')
        expect(result.hosts).toEqual([])
        expect(result.warning).toContain('不可解析')
    })

    it('warns when config parses but declares no registry key', () => {
        const runCommand = vi.fn(() => JSON.stringify({ 'strict-ssl': true }))
        const result = discoverRegistryHosts('/tmp/repo', { runCommand, env: {} })

        expect(result.source).toBe('none')
        expect(result.hosts).toEqual([])
        expect(result.warning).toContain('未声明 registry 键')
    })

    it('keeps the failure warning free of stderr detail and newlines', () => {
        const runCommand = vi.fn(() => {
            const err = new Error('Command failed: pnpm config list\n/tmp/secret/path\n') as NodeJS.ErrnoException
            err.code = 'ENOENT'
            throw err
        })
        const result = discoverRegistryHosts('/tmp/repo', { runCommand, env: {} })

        expect(result.warning).toContain('ENOENT')
        expect(result.warning).not.toContain('/tmp/secret/path')
        expect(result.warning?.includes('\n')).toBe(false)
    })

    it('caps the cache size for a long-lived process', () => {
        const runCommand = vi.fn(() => JSON.stringify({ registry: 'https://mirror.example.com/' }))
        for (let i = 0; i < 65; i++) {
            discoverRegistryHosts(`/tmp/repo-${i}`, { runCommand })
        }
        // 超上限整体清空：早期条目已不在缓存，需重新发现
        discoverRegistryHosts('/tmp/repo-0', { runCommand })
        expect(runCommand).toHaveBeenCalledTimes(66)
    })

    it('caches the result per workDir', () => {
        const runCommand = vi.fn(() => JSON.stringify({ registry: 'https://mirror.example.com/' }))
        discoverRegistryHosts('/tmp/repo', { runCommand })
        discoverRegistryHosts('/tmp/repo', { runCommand })

        expect(runCommand).toHaveBeenCalledTimes(1)
    })

    it('ignores cache across different workDirs', () => {
        const runCommand = vi.fn(() => JSON.stringify({ registry: 'https://mirror.example.com/' }))
        discoverRegistryHosts('/tmp/repo-a', { runCommand })
        discoverRegistryHosts('/tmp/repo-b', { runCommand })
        expect(runCommand).toHaveBeenCalledTimes(2)
    })
})
