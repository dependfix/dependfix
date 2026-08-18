import { describe, expect, it } from 'vitest'
import { DockerAdapter, SANDBOX_DEFAULTS, SpyRuntimeAdapter, type ContainerSpec, type RuntimeAdapter } from './runtime-adapter'

describe('SANDBOX_DEFAULTS', () => {
    it('uses 100:100 user (rootless default)', () => {
        expect(SANDBOX_DEFAULTS.user).toBe('100:100')
    })

    it('defaults to 2 GiB memory and 1.0 CPU (platform-wide baseline; repo-level override via ContainerSpec)', () => {
        expect(SANDBOX_DEFAULTS.memoryMb).toBe(2048)
        expect(SANDBOX_DEFAULTS.cpu).toBe(1.0)
    })

    it('uses runc runtime by default (overridable via SANDBOX_RUNTIME env)', () => {
        expect(SANDBOX_DEFAULTS.runtime).toBe(process.env.SANDBOX_RUNTIME ?? 'runc')
    })

    it('defaults to network none (subsequent application-layer proxy carries whitelisted traffic)', () => {
        expect(SANDBOX_DEFAULTS.network).toBe('none')
    })
})

describe('DockerAdapter.buildRunArgs (snapshot verification — catch assembly bugs pre-integration)', () => {
    it('assembles minimal spec with all defaults', () => {
        const adapter = new DockerAdapter()
        const args = adapter.buildRunArgs({ image: 'alpine:3', workDir: '/work' }, ['echo', 'hi'])
        expect(args).toEqual([
            'run',
            '--rm',
            '--runtime', 'runc',
            '--user', '100:100',
            '--network', 'none',
            '--memory', '2048m',
            '--cpus', '1',
            '-w', '/work',
            'alpine:3',
            'echo', 'hi',
        ])
    })

    it('honors explicit user / runtime / memoryMb / cpu overrides', () => {
        const adapter = new DockerAdapter()
        const args = adapter.buildRunArgs({
            image: 'node:20',
            workDir: '/app',
            user: '500:500',
            runtime: 'sysbox-runc',
            memoryMb: 4096,
            cpu: 2.5,
        }, ['node', 'index.js'])
        expect(args).toContain('--runtime')
        expect(args[args.indexOf('--runtime') + 1]).toBe('sysbox-runc')
        expect(args[args.indexOf('--user') + 1]).toBe('500:500')
        expect(args[args.indexOf('--memory') + 1]).toBe('4096m')
        expect(args[args.indexOf('--cpus') + 1]).toBe('2.5')
    })

    it('uses --mount for readonly volumes and --volume for writable mounts', () => {
        const adapter = new DockerAdapter()
        const args = adapter.buildRunArgs({
            image: 'alpine:3',
            workDir: '/work',
            mounts: [
                { src: '/host/work', dst: '/work', readonly: false },
                { src: '/host/config', dst: '/etc/config', readonly: true },
            ],
        }, ['true'])
        // 顺序：可写 → --volume src:dst；只读 → --mount type=bind,source=src,target=dst,readonly
        const volumeIdx = args.indexOf('--volume')
        expect(args[volumeIdx + 1]).toBe('/host/work:/work')
        const mountIdx = args.indexOf('--mount')
        expect(args[mountIdx + 1]).toBe('type=bind,source=/host/config,target=/etc/config,readonly')
    })

    it('places env vars after mounts but before image and cmd (preserves docker CLI semantics)', () => {
        const adapter = new DockerAdapter()
        const args = adapter.buildRunArgs({
            image: 'alpine:3',
            workDir: '/work',
            mounts: [{ src: '/host/work', dst: '/work' }],
            env: { GITHUB_TOKEN: 'ghp_x', NODE_ENV: 'production' },
        }, ['pnpm', 'install'])
        const imageIdx = args.indexOf('alpine:3')
        const tokenIdx = args.indexOf('GITHUB_TOKEN=ghp_x')
        const nodeEnvIdx = args.indexOf('NODE_ENV=production')
        // env 在镜像之前（docker run 要求 image 前是 options）
        expect(tokenIdx).toBeGreaterThan(-1)
        expect(nodeEnvIdx).toBeGreaterThan(-1)
        expect(imageIdx).toBeGreaterThan(tokenIdx)
        expect(imageIdx).toBeGreaterThan(nodeEnvIdx)
    })

    it('omits --rm when autoRemove=false', () => {
        const adapter = new DockerAdapter()
        const args = adapter.buildRunArgs({
            image: 'alpine:3',
            workDir: '/work',
            autoRemove: false,
        }, ['true'])
        expect(args).not.toContain('--rm')
    })
})

describe('DockerAdapter', () => {
    describe('isAvailable', () => {
        it('returns true when adapter reports available', async () => {
            const spy = new SpyRuntimeAdapter({ available: true })
            expect(await spy.isAvailable()).toBe(true)
        })

        it('returns false when adapter reports unavailable', async () => {
            const spy = new SpyRuntimeAdapter({ available: false })
            expect(await spy.isAvailable()).toBe(false)
        })

        it('returns false on docker daemon unreachable (real path, no throw)', async () => {
            // 指向不存在的 docker 二进制模拟 daemon 不可用
            const adapter = new DockerAdapter({ dockerBin: '/nonexistent/docker-binary-for-test' })
            const available = await adapter.isAvailable()
            expect(available).toBe(false)
        })
    })

    describe('run spec / cmd forwarding', () => {
        it('forwards spec and cmd to adapter (no transformation)', async () => {
            const spy = new SpyRuntimeAdapter({ result: { stdout: 'ok', stderr: '', exitCode: 0 } })
            const spec: ContainerSpec = {
                image: 'dependfix-platform:latest',
                workDir: '/work',
                mounts: [{ src: '/host/work', dst: '/work', readonly: false }],
                env: { GITHUB_TOKEN: 'ghp_test' },
                memoryMb: 1024,
                cpu: 0.5,
            }
            await spy.run(spec, ['node', 'index.js'])
            expect(spy.calls).toHaveLength(1)
            const call = spy.calls[0]
            expect(call).toBeDefined()
            expect(call?.spec.image).toBe('dependfix-platform:latest')
            expect(call?.cmd).toEqual(['node', 'index.js'])
        })

        it('returns stderr exit code 1 as structured result (no throw)', async () => {
            // 模拟命令退出码非 0（docker pull 镜像缺失场景）
            const spy = new SpyRuntimeAdapter({
                result: { stdout: '', stderr: 'manifest unknown', exitCode: 1 },
            })
            const result = await spy.run(
                { image: 'missing:latest', workDir: '/work' },
                ['sh', '-c', 'exit 1'],
            )
            expect(result.exitCode).toBe(1)
            expect(result.stderr).toBe('manifest unknown')
        })

        it('propagates daemon errors as throws (not exitCode)', async () => {
            // Spy 抛错模拟 docker daemon 不可达（ENOTCONN / ENOENT 等）
            const adapterError = new Error('docker daemon not reachable')
            const spy = new SpyRuntimeAdapter({ result: adapterError })
            await expect(spy.run({ image: 'x:latest', workDir: '/work' }, ['echo', 'hi']))
                .rejects.toThrow('docker daemon not reachable')
        })
    })

    describe('env injection security boundary', () => {
        it('container env var injection contract — passed via spec.env (not cmd)', async () => {
            // 安全契约：sandbox-executor 应通过 spec.env 而非 cmd 传 token
            const spy = new SpyRuntimeAdapter()
            const spec: ContainerSpec = {
                image: 'x:latest',
                workDir: '/work',
                env: { GITHUB_TOKEN: 'SECRET-TOKEN-VALUE' },
            }
            await spy.run(spec, ['pnpm', 'audit'])
            // 验证：cmd 中不应出现 token
            const call = spy.calls[0]
            expect(call).toBeDefined()
            expect(call?.cmd).toEqual(['pnpm', 'audit'])
            expect(JSON.stringify(call?.cmd)).not.toContain('SECRET-TOKEN-VALUE')
            // 验证：env 字段包含 token（spec.env 是 sandbox-executor 注入 env var 的字段）
            expect(call?.spec.env?.GITHUB_TOKEN).toBe('SECRET-TOKEN-VALUE')
        })
    })

    describe('runtime abstraction (decision: not bound to rootless)', () => {
        it('adapter implements RuntimeAdapter contract', () => {
            // 编译期类型契约已在 TS 类型系统检查；运行时校验方法名存在
            const adapter: RuntimeAdapter = new SpyRuntimeAdapter()
            expect(typeof adapter.isAvailable).toBe('function')
            expect(typeof adapter.run).toBe('function')
            expect(adapter.name).toBe('spy')
        })

        it('runtime field is configurable (future Sysbox / Kata migration path)', async () => {
            // spec.runtime 是 OCI runtime 兼容契约——未来切 Sysbox 仅改 'sysbox-runc'
            const spy = new SpyRuntimeAdapter()
            const spec: ContainerSpec = {
                image: 'x:latest',
                workDir: '/work',
                runtime: 'sysbox-runc',
            }
            await spy.run(spec, ['echo'])
            const call = spy.calls[0]
            expect(call).toBeDefined()
            expect(call?.spec.runtime).toBe('sysbox-runc')
        })
    })
})
