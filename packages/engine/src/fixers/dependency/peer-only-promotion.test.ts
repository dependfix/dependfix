import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// peer-only 回退（提升 manifest 直接依赖）的集成用例。
// 从 dependency-upgrade.test.ts 拆出：该文件已接近 max-lines 上限，且本组用例的夹具
// （importers / peer 后缀 lockfile + 两次 install 的时序）与本组强相关，集中更易维护。

const { mockExecSync, mockRunTrackedCommand } = vi.hoisted(() => ({
    mockExecSync: vi.fn(),
    mockRunTrackedCommand: vi.fn(),
}))

vi.mock('node:child_process', () => ({
    execSync: mockExecSync,
}))

vi.mock('../../runners/process-control', () => ({
    runTrackedCommand: mockRunTrackedCommand,
}))

/** 受管命令成功结果（安装类调用缺省 mock）。 */
function okInstallOutcome(): import('../../runners/process-control').TrackedCommandResult {
    return {
        started: true,
        exitCode: 0,
        signal: null,
        timedOut: false,
        aborted: false,
        errno: null,
        stdout: '',
        stderr: '',
        durationMs: 0,
    }
}

import { cleanup, createTempProject } from './dependency.test-helpers'
import { parseSelectorMajor as parseSelectorMajorForTest } from './peer-only-promotion'
import { applyVersionedOverrides, collectFailingOverrideLines, overrideTransitiveDependency, promotePeerOnlyDirectDependency } from './index'

// ---------------------------------------------------------------------------
// peer-only 回退到 manifest 直接依赖提升
//
// 夹具口径：overrides 对 peer-only 实例无效（第一次 install 不动 lockfile），
// 只有「提升声明该包的 manifest 直接依赖」的第二次 install 才会把实例拉到目标版本。
// ---------------------------------------------------------------------------

/** 带 peer-only 实例的 lockfile（成员 manifest 声明 vite，但只以 peer 身份被安装）。 */
function writePeerOnlyLockfile(lockfilePath: string, memberDir: string): void {
    writeFileSync(lockfilePath, [
        `lockfileVersion: '9.0'`,
        '',
        'importers:',
        '  .: {}',
        `  ${memberDir}:`,
        '    devDependencies:',
        '      vite:',
        '        specifier: ^8.3.0',
        '        version: 8.3.1',
        '',
        'packages:',
        '  vite@8.3.1(vitest@3.0.0):',
        '    resolution: {integrity: sha512-peer}',
        '',
    ].join('\n'))
}

function writePromotedLockfile(lockfilePath: string, memberDir: string): void {
    writeFileSync(lockfilePath, [
        `lockfileVersion: '9.0'`,
        '',
        'importers:',
        '  .: {}',
        `  ${memberDir}:`,
        '    devDependencies:',
        '      vite:',
        `        specifier: ^8.3.3`,
        '        version: 8.3.3',
        '',
        'packages:',
        '  vite@8.3.3:',
        '    resolution: {integrity: sha512-fixed}',
        '',
    ].join('\n'))
}

describe('peer-only 回退：提升 manifest 直接依赖', () => {
    beforeEach(() => {
        mockExecSync.mockReset()
        mockExecSync.mockReturnValue(Buffer.from(''))
        mockRunTrackedCommand.mockReset()
    })

    it('override 未覆盖 peer-only 时自动提升成员 manifest 直接依赖并验证通过', async () => {
        const project = createTempProject({})
        mkdirSync(join(project.dir, 'packages', 'app'), { recursive: true })
        const memberPkgPath = join(project.dir, 'packages', 'app', 'package.json')
        writeFileSync(memberPkgPath, `${JSON.stringify({
            name: 'app',
            version: '1.0.0',
            devDependencies: { vite: '^8.3.0' },
        }, null, 2)}\n`)
        writePeerOnlyLockfile(project.lockfilePath, 'packages/app')
        const rootBefore = readFileSync(project.pkgPath, 'utf-8')

        let installCalls = 0
        mockRunTrackedCommand.mockImplementation(async () => {
            installCalls += 1
            // 第一次 = override 安装（peer-only 实例不跟随）；第二次 = 提升后的安装
            if (installCalls === 2) {
                writePromotedLockfile(project.lockfilePath, 'packages/app')
            }
            return okInstallOutcome()
        })

        const result = await overrideTransitiveDependency({
            packageName: 'vite',
            targetVersion: '8.3.3',
            workDir: project.dir,
        })

        expect(result.success).toBe(true)
        expect(result.promotion?.status).toBe('promoted')
        expect(result.promotion?.manifestFile).toBe('packages/app/package.json')
        expect(result.fromVersion).toBe('^8.3.0')
        expect(result.toVersion).toBe('^8.3.3')
        // 声明被提升到目标版本，且 override 写入已回滚（根 manifest 逐字节不变）
        const memberPkg = JSON.parse(readFileSync(memberPkgPath, 'utf-8')) as { devDependencies: Record<string, string> }
        expect(memberPkg.devDependencies.vite).toBe('^8.3.3')
        expect(readFileSync(project.pkgPath, 'utf-8')).toBe(rootBefore)
        // 快照 / 备份文件不残留
        expect(() => readFileSync(`${memberPkgPath}.promote.bak`, 'utf-8')).toThrow()
        expect(() => readFileSync(`${project.lockfilePath}.promote.bak`, 'utf-8')).toThrow()

        cleanup(project)
    })

    it('无可提升 manifest 时落 needs-manual，附文件与版本建议', async () => {
        const project = createTempProject({})
        // 无 importer 声明、根 manifest 也不声明 → 没有可提升的直接依赖
        writeFileSync(project.lockfilePath, [
            `lockfileVersion: '9.0'`,
            '',
            'importers:',
            '  .: {}',
            '',
            'packages:',
            '  vite@8.3.1(vitest@3.0.0):',
            '    resolution: {integrity: sha512-peer}',
            '',
        ].join('\n'))
        const rootBefore = readFileSync(project.pkgPath, 'utf-8')
        mockRunTrackedCommand.mockResolvedValue(okInstallOutcome())

        const result = await overrideTransitiveDependency({
            packageName: 'vite',
            targetVersion: '8.3.3',
            workDir: project.dir,
        })

        expect(result.success).toBe(false)
        expect(result.manualReview).toBe(true)
        expect(result.promotion?.status).toBe('needs-manual')
        expect(result.error).toContain('no manifest declares "vite" as a direct dependency')
        expect(result.error).toContain('8.3.3')
        expect(readFileSync(project.pkgPath, 'utf-8')).toBe(rootBefore)

        cleanup(project)
    })

    it('多个 manifest 同时声明时落 needs-manual（不自动多写，避免半族状态）', async () => {
        const project = createTempProject({})
        for (const dir of ['packages/a', 'packages/b']) {
            mkdirSync(join(project.dir, dir), { recursive: true })
            writeFileSync(join(project.dir, dir, 'package.json'), `${JSON.stringify({
                name: dir.replace('packages/', ''),
                version: '1.0.0',
                devDependencies: { vite: '^8.3.0' },
            }, null, 2)}\n`)
        }
        writeFileSync(project.lockfilePath, [
            `lockfileVersion: '9.0'`,
            '',
            'importers:',
            '  .: {}',
            '  packages/a:',
            '    devDependencies:',
            '      vite:',
            '        specifier: ^8.3.0',
            '        version: 8.3.1',
            '  packages/b:',
            '    devDependencies:',
            '      vite:',
            '        specifier: ^8.3.0',
            '        version: 8.3.1',
            '',
            'packages:',
            '  vite@8.3.1(vitest@3.0.0):',
            '    resolution: {integrity: sha512-peer}',
            '',
        ].join('\n'))
        mockRunTrackedCommand.mockResolvedValue(okInstallOutcome())

        const result = await overrideTransitiveDependency({
            packageName: 'vite',
            targetVersion: '8.3.3',
            workDir: project.dir,
        })

        expect(result.success).toBe(false)
        expect(result.manualReview).toBe(true)
        expect(result.promotion?.status).toBe('needs-manual')
        expect(result.error).toContain('multiple manifests declare "vite"')
        expect(result.error).toContain('packages/a/package.json')
        expect(result.error).toContain('packages/b/package.json')

        cleanup(project)
    })

    it('单 plan 版本化 override 的 peer-only 同样回退到提升直接依赖', async () => {
        const project = createTempProject({})
        mkdirSync(join(project.dir, 'packages', 'app'), { recursive: true })
        const memberPkgPath = join(project.dir, 'packages', 'app', 'package.json')
        writeFileSync(memberPkgPath, `${JSON.stringify({
            name: 'app',
            version: '1.0.0',
            devDependencies: { vite: '^8.3.0' },
        }, null, 2)}\n`)
        writePeerOnlyLockfile(project.lockfilePath, 'packages/app')
        const rootBefore = readFileSync(project.pkgPath, 'utf-8')

        let installCalls = 0
        mockRunTrackedCommand.mockImplementation(async () => {
            installCalls += 1
            if (installCalls === 2) {
                writePromotedLockfile(project.lockfilePath, 'packages/app')
            }
            return okInstallOutcome()
        })

        const result = await applyVersionedOverrides({
            packageName: 'vite',
            versionedOverrides: { 'vite@8': '^8.3.3' },
            workDir: project.dir,
        })

        expect(result.success).toBe(true)
        expect(result.promotion?.status).toBe('promoted')
        expect(result.warning).toContain('promoted direct dependency')
        const memberPkg = JSON.parse(readFileSync(memberPkgPath, 'utf-8')) as { devDependencies: Record<string, string> }
        expect(memberPkg.devDependencies.vite).toBe('^8.3.3')
        expect(readFileSync(project.pkgPath, 'utf-8')).toBe(rootBefore)

        cleanup(project)
    })

    it('提升安装失败时成员 manifest 与 lockfile 逐字节恢复，不残留快照', async () => {
        const project = createTempProject({})
        mkdirSync(join(project.dir, 'packages', 'app'), { recursive: true })
        const memberPkgPath = join(project.dir, 'packages', 'app', 'package.json')
        writeFileSync(memberPkgPath, `${JSON.stringify({
            name: 'app',
            version: '1.0.0',
            devDependencies: { vite: '^8.3.0' },
        }, null, 2)}\n`)
        writePeerOnlyLockfile(project.lockfilePath, 'packages/app')
        const memberBefore = readFileSync(memberPkgPath, 'utf-8')
        const lockBefore = readFileSync(project.lockfilePath, 'utf-8')
        const rootBefore = readFileSync(project.pkgPath, 'utf-8')

        let installCalls = 0
        mockRunTrackedCommand.mockImplementation(async () => {
            installCalls += 1
            if (installCalls === 2) {
                throw Object.assign(new Error('install failed'), { stderr: 'ERR_PNPM_LOCKFILE_MISMATCH' })
            }
            return okInstallOutcome()
        })

        const result = await overrideTransitiveDependency({
            packageName: 'vite',
            targetVersion: '8.3.3',
            workDir: project.dir,
        })

        expect(result.success).toBe(false)
        expect(result.manualReview).toBe(true)
        expect(result.promotion?.status).toBe('needs-manual')
        expect(result.error).toContain('failed')
        expect(readFileSync(memberPkgPath, 'utf-8')).toBe(memberBefore)
        expect(readFileSync(project.lockfilePath, 'utf-8')).toBe(lockBefore)
        expect(readFileSync(project.pkgPath, 'utf-8')).toBe(rootBefore)
        expect(() => readFileSync(`${memberPkgPath}.promote.bak`, 'utf-8')).toThrow()

        cleanup(project)
    })
})


// ---------------------------------------------------------------------------
// 回滚 / 兜底 / 版本线护栏
// ---------------------------------------------------------------------------

function writeMemberManifest(workDir: string, dir: string, version: string): string {
    mkdirSync(join(workDir, dir), { recursive: true })
    const path = join(workDir, dir, 'package.json')
    writeFileSync(path, `${JSON.stringify({
        name: dir.replace('packages/', ''),
        version: '1.0.0',
        devDependencies: { vite: version },
    }, null, 2)}\n`)
    return path
}

describe('peer-only 提升的护栏与兜底', () => {
    beforeEach(() => {
        mockExecSync.mockReset()
        mockExecSync.mockReturnValue(Buffer.from(''))
        mockRunTrackedCommand.mockReset()
    })

    it('提升安装成功但实例仍不足：逐字节还原并落需人工，不谎报成功', async () => {
        const project = createTempProject({})
        const memberPkgPath = writeMemberManifest(project.dir, 'packages/app', '^8.3.0')
        writePeerOnlyLockfile(project.lockfilePath, 'packages/app')
        const memberBefore = readFileSync(memberPkgPath, 'utf-8')
        const lockBefore = readFileSync(project.lockfilePath, 'utf-8')
        mockRunTrackedCommand.mockResolvedValue(okInstallOutcome())

        const result = await overrideTransitiveDependency({
            packageName: 'vite',
            targetVersion: '8.3.3',
            workDir: project.dir,
        })

        expect(result.success).toBe(false)
        expect(result.manualReview).toBe(true)
        expect(result.promotion?.status).toBe('needs-manual')
        expect(result.error).toContain('did not cover instance(s) 8.3.1')
        expect(readFileSync(memberPkgPath, 'utf-8')).toBe(memberBefore)
        expect(readFileSync(project.lockfilePath, 'utf-8')).toBe(lockBefore)
        expect(() => readFileSync(`${memberPkgPath}.promote.bak`, 'utf-8')).toThrow()

        cleanup(project)
    })

    it('importers 指向的 manifest 缺失：落需人工且零快照残留', async () => {
        const project = createTempProject({})
        // importers 声明 packages/app，但目录里没有 manifest（成员被删 / 锁文件落后）
        writePeerOnlyLockfile(project.lockfilePath, 'packages/app')
        mockRunTrackedCommand.mockResolvedValue(okInstallOutcome())

        const result = await overrideTransitiveDependency({
            packageName: 'vite',
            targetVersion: '8.3.3',
            workDir: project.dir,
        })

        expect(result.success).toBe(false)
        expect(result.promotion?.status).toBe('needs-manual')
        expect(result.error).toContain('cannot read packages/app/package.json')
        expect(() => readFileSync(`${project.lockfilePath}.promote.bak`, 'utf-8')).toThrow()

        cleanup(project)
    })

    it('importers 缺失时回退根 manifest 声明并提升成功', async () => {
        const project = createTempProject({}, { devDeps: { vite: '^8.3.0' } })
        // 旧 lockfile：无 importers 段，只有 peer 实例
        writeFileSync(project.lockfilePath, [
            `lockfileVersion: '9.0'`,
            '',
            'packages:',
            '  vite@8.3.1(vitest@3.0.0):',
            '    resolution: {integrity: sha512-peer}',
            '',
        ].join('\n'))

        // 直接调用提升：第一次 install 就是提升安装
        mockRunTrackedCommand.mockImplementation(async () => {
            writeFileSync(project.lockfilePath, [
                `lockfileVersion: '9.0'`,
                '',
                'packages:',
                '  vite@8.3.3:',
                '    resolution: {integrity: sha512-fixed}',
                '',
            ].join('\n'))
            return okInstallOutcome()
        })

        const result = await promotePeerOnlyDirectDependency({
            workDir: project.dir,
            packageName: 'vite',
            targetVersion: '8.3.3',
        })

        expect(result.status).toBe('promoted')
        expect(result.manifestFile).toBe('package.json')
        const pkg = JSON.parse(readFileSync(project.pkgPath, 'utf-8')) as { devDependencies: Record<string, string> }
        expect(pkg.devDependencies.vite).toBe('^8.3.3')

        cleanup(project)
    })

    it('清单 YAML 不可解析时 fail-open：不抛异常，且按实例回读判需人工', async () => {
        const project = createTempProject({}, { devDeps: { vite: '^8.3.0' } })
        // YAML 结构损坏（无 importers），但实例行仍可被版本回读识别
        writeFileSync(project.lockfilePath, [
            'lockfileVersion: [unclosed',
            '  vite@8.3.1(vitest@3.0.0):',
            '    resolution: {integrity: sha512-peer}',
            '',
        ].join('\n'))
        mockRunTrackedCommand.mockResolvedValue(okInstallOutcome())

        const result = await promotePeerOnlyDirectDependency({
            workDir: project.dir,
            packageName: 'vite',
            targetVersion: '8.3.3',
        })

        expect(result.status).toBe('needs-manual')
        expect(result.reason).toContain('did not cover instance(s) 8.3.1')

        cleanup(project)
    })

    it('单 plan 多 key 时只用未达标版本线的目标，不写另一条线', async () => {
        const project = createTempProject({})
        const memberPkgPath = writeMemberManifest(project.dir, 'packages/app', '^8.3.0')
        writeFileSync(project.lockfilePath, [
            `lockfileVersion: '9.0'`,
            '',
            'importers:',
            '  .: {}',
            '  packages/app:',
            '    devDependencies:',
            '      vite:',
            '        specifier: ^8.3.0',
            '        version: 8.3.1',
            '',
            'packages:',
            '  vite@5.4.21:',
            '    resolution: {integrity: sha512-v5}',
            '  vite@8.3.1(vitest@3.0.0):',
            '    resolution: {integrity: sha512-peer}',
            '',
        ].join('\n'))

        let installCalls = 0
        mockRunTrackedCommand.mockImplementation(async () => {
            installCalls += 1
            if (installCalls === 2) {
                writeFileSync(project.lockfilePath, [
                    `lockfileVersion: '9.0'`,
                    '',
                    'importers:',
                    '  .: {}',
                    '  packages/app:',
                    '    devDependencies:',
                    '      vite:',
                    '        specifier: ^8.3.3',
                    '        version: 8.3.3',
                    '',
                    'packages:',
                    '  vite@5.4.21:',
                    '    resolution: {integrity: sha512-v5}',
                    '  vite@8.3.3:',
                    '    resolution: {integrity: sha512-fixed}',
                    '',
                ].join('\n'))
            }
            return okInstallOutcome()
        })

        const result = await applyVersionedOverrides({
            packageName: 'vite',
            versionedOverrides: { 'vite@5': '^5.4.21', 'vite@8': '^8.3.3' },
            workDir: project.dir,
        })

        expect(result.success).toBe(true)
        expect(result.promotion?.status).toBe('promoted')
        expect(result.toVersion).toBe('^8.3.3')
        const memberPkg = JSON.parse(readFileSync(memberPkgPath, 'utf-8')) as { devDependencies: Record<string, string> }
        expect(memberPkg.devDependencies.vite).toBe('^8.3.3')

        cleanup(project)
    })

    it('候选声明 major 与目标 major 不一致时不提升（不跨 major）', async () => {
        const project = createTempProject({})
        const memberPkgPath = writeMemberManifest(project.dir, 'packages/app', '^7.0.0')
        writePeerOnlyLockfile(project.lockfilePath, 'packages/app')
        const memberBefore = readFileSync(memberPkgPath, 'utf-8')
        mockRunTrackedCommand.mockResolvedValue(okInstallOutcome())

        const result = await overrideTransitiveDependency({
            packageName: 'vite',
            targetVersion: '8.3.3',
            workDir: project.dir,
        })

        expect(result.success).toBe(false)
        expect(result.promotion?.status).toBe('needs-manual')
        expect(result.error).toContain('cross-major promotion is out of scope')
        expect(readFileSync(memberPkgPath, 'utf-8')).toBe(memberBefore)

        cleanup(project)
    })

    it('workspace yaml 形态：提升成功且 pnpm-workspace.yaml 与备份零残留', async () => {
        const project = createTempProject({})
        const memberPkgPath = writeMemberManifest(project.dir, 'packages/app', '^8.3.0')
        writeFileSync(join(project.dir, 'pnpm-workspace.yaml'), [
            'packages:',
            '  - "packages/*"',
            '',
        ].join('\n'))
        const workspaceBefore = readFileSync(join(project.dir, 'pnpm-workspace.yaml'), 'utf-8')
        writePeerOnlyLockfile(project.lockfilePath, 'packages/app')

        let installCalls = 0
        mockRunTrackedCommand.mockImplementation(async () => {
            installCalls += 1
            if (installCalls === 2) {
                writePromotedLockfile(project.lockfilePath, 'packages/app')
            }
            return okInstallOutcome()
        })

        const result = await overrideTransitiveDependency({
            packageName: 'vite',
            targetVersion: '8.3.3',
            workDir: project.dir,
        })

        expect(result.success).toBe(true)
        expect(result.promotion?.status).toBe('promoted')
        expect(readFileSync(join(project.dir, 'pnpm-workspace.yaml'), 'utf-8')).toBe(workspaceBefore)
        // 三方备份（override 链 / 提升链）均不残留
        for (const residue of [
            `${memberPkgPath}.promote.bak`,
            `${project.lockfilePath}.promote.bak`,
            `${memberPkgPath}.bak`,
            `${project.lockfilePath}.bak`,
            `${join(project.dir, 'pnpm-workspace.yaml')}.bak`,
        ]) {
            expect(() => readFileSync(residue, 'utf-8')).toThrow()
        }

        cleanup(project)
    })
})

describe('peer-only 提升：版本线 / selector / 环境性', () => {
    beforeEach(() => {
        mockExecSync.mockReset()
        mockExecSync.mockReturnValue(Buffer.from(''))
        mockRunTrackedCommand.mockReset()
    })

    it('多 key 单 plan：另一条线需 override 升级时仍按失败线提升（回滚前归因）', async () => {
        const project = createTempProject({})
        const memberPkgPath = writeMemberManifest(project.dir, 'packages/app', '^8.3.0')
        writeFileSync(project.lockfilePath, [
            `lockfileVersion: '9.0'`,
            '',
            'importers:',
            '  .: {}',
            '  packages/app:',
            '    devDependencies:',
            '      vite:',
            '        specifier: ^8.3.0',
            '        version: 8.3.1',
            '',
            'packages:',
            '  vite@5.4.20:',
            '    resolution: {integrity: sha512-v5}',
            '  vite@8.3.1(vitest@3.0.0):',
            '    resolution: {integrity: sha512-peer}',
            '',
        ].join('\n'))

        const lockAfterOverride = [
            `lockfileVersion: '9.0'`,
            '',
            'importers:',
            '  .: {}',
            '  packages/app:',
            '    devDependencies:',
            '      vite:',
            '        specifier: ^8.3.3',
            '        version: 8.3.3',
            '',
            'packages:',
            '  vite@5.4.21:',
            '    resolution: {integrity: sha512-v5}',
            '  vite@8.3.1(vitest@3.0.0):',
            '    resolution: {integrity: sha512-peer}',
            '',
        ].join('\n')
        const lockAfterPromotion = lockAfterOverride.replace('vite@8.3.1(vitest@3.0.0):', 'vite@8.3.3:')

        let installCalls = 0
        mockRunTrackedCommand.mockImplementation(async () => {
            installCalls += 1
            writeFileSync(project.lockfilePath, installCalls === 1 ? lockAfterOverride : lockAfterPromotion)
            return okInstallOutcome()
        })

        const result = await applyVersionedOverrides({
            packageName: 'vite',
            versionedOverrides: { 'vite@5': '^5.4.21', 'vite@8': '^8.3.3' },
            workDir: project.dir,
        })

        expect(result.success).toBe(true)
        expect(result.promotion?.status).toBe('promoted')
        expect(result.toVersion).toBe('^8.3.3')
        const memberPkg = JSON.parse(readFileSync(memberPkgPath, 'utf-8')) as { devDependencies: Record<string, string> }
        expect(memberPkg.devDependencies.vite).toBe('^8.3.3')

        cleanup(project)
    })

    it('selector 写作 ^8（与 8 等价）时同样能定位失败线', async () => {
        const project = createTempProject({})
        const memberPkgPath = writeMemberManifest(project.dir, 'packages/app', '^8.3.0')
        writePeerOnlyLockfile(project.lockfilePath, 'packages/app')

        let installCalls = 0
        mockRunTrackedCommand.mockImplementation(async () => {
            installCalls += 1
            if (installCalls === 2) {
                writePromotedLockfile(project.lockfilePath, 'packages/app')
            }
            return okInstallOutcome()
        })

        const result = await applyVersionedOverrides({
            packageName: 'vite',
            versionedOverrides: { 'vite@^8': '^8.3.3' },
            workDir: project.dir,
        })

        expect(result.success).toBe(true)
        expect(result.promotion?.status).toBe('promoted')
        const memberPkg = JSON.parse(readFileSync(memberPkgPath, 'utf-8')) as { devDependencies: Record<string, string> }
        expect(memberPkg.devDependencies.vite).toBe('^8.3.3')

        cleanup(project)
    })

    it('提升安装的环境性失败透传 environmental（不记需人工）', async () => {
        const project = createTempProject({})
        writeMemberManifest(project.dir, 'packages/app', '^8.3.0')
        writePeerOnlyLockfile(project.lockfilePath, 'packages/app')

        let installCalls = 0
        mockRunTrackedCommand.mockImplementation(async () => {
            installCalls += 1
            if (installCalls === 2) {
                // OOM / 信号终止形态：环境性失败（不归因仓库）
                throw Object.assign(new Error('killed'), { signal: 'SIGKILL' })
            }
            return okInstallOutcome()
        })

        const result = await overrideTransitiveDependency({
            packageName: 'vite',
            targetVersion: '8.3.3',
            workDir: project.dir,
        })

        expect(result.success).toBe(false)
        expect(result.environmental).toBe(true)
        expect(result.manualReview).toBeUndefined()
        expect(result.promotion?.status).toBe('needs-manual')

        cleanup(project)
    })
})

describe('peer-only 提升：无 selector 的通用 key', () => {
    beforeEach(() => {
        mockExecSync.mockReset()
        mockExecSync.mockReturnValue(Buffer.from(''))
        mockRunTrackedCommand.mockReset()
    })

    it('单 major 通用 key（pkg: ^x）同样能定位失败线并提升', async () => {
        const project = createTempProject({})
        const memberPkgPath = writeMemberManifest(project.dir, 'packages/app', '^8.3.0')
        writeFileSync(project.lockfilePath, [
            `lockfileVersion: '9.0'`,
            '',
            'importers:',
            '  .: {}',
            '  packages/app:',
            '    devDependencies:',
            '      vite:',
            '        specifier: ^8.3.0',
            '        version: 8.3.1',
            '',
            'packages:',
            '  vite@8.3.0:',
            '    resolution: {integrity: sha512-direct}',
            '  vite@8.3.1(vitest@3.0.0):',
            '    resolution: {integrity: sha512-peer}',
            '',
        ].join('\n'))

        const lockFixed = [
            `lockfileVersion: '9.0'`,
            '',
            'importers:',
            '  .: {}',
            '  packages/app:',
            '    devDependencies:',
            '      vite:',
            '        specifier: ^8.3.3',
            '        version: 8.3.3',
            '',
            'packages:',
            '  vite@8.3.3:',
            '    resolution: {integrity: sha512-fixed}',
            '',
        ].join('\n')

        // 第一次安装把直接实例拉到目标（通用 key 覆盖全部实例），peer 实例不跟随；
        // 第二次（提升后的安装）才拉齐 peer
        const lockAfterOverride = lockFixed.replace(
            '  vite@8.3.3:',
            '  vite@8.3.1(vitest@3.0.0):',
        )
        let installCalls = 0
        mockRunTrackedCommand.mockImplementation(async () => {
            installCalls += 1
            writeFileSync(project.lockfilePath, installCalls === 1 ? lockAfterOverride : lockFixed)
            return okInstallOutcome()
        })

        const result = await applyVersionedOverrides({
            packageName: 'vite',
            versionedOverrides: { vite: '^8.3.3' },
            workDir: project.dir,
        })

        expect(result.success).toBe(true)
        expect(result.promotion?.status).toBe('promoted')
        const memberPkg = JSON.parse(readFileSync(memberPkgPath, 'utf-8')) as { devDependencies: Record<string, string> }
        expect(memberPkg.devDependencies.vite).toBe('^8.3.3')

        cleanup(project)
    })

    it('scoped 包的无 selector key 不被包名里的 @ 误判为 selector（端到端提升）', async () => {
        const project = createTempProject({})
        mkdirSync(join(project.dir, 'packages', 'app'), { recursive: true })
        const memberPkgPath = join(project.dir, 'packages', 'app', 'package.json')
        writeFileSync(memberPkgPath, `${JSON.stringify({
            name: 'app',
            version: '1.0.0',
            devDependencies: { '@scope/pkg': '^2.0.1' },
        }, null, 2)}\n`)
        writeFileSync(project.lockfilePath, [
            `lockfileVersion: '9.0'`,
            '',
            'importers:',
            '  .: {}',
            '  packages/app:',
            '    devDependencies:',
            '      "@scope/pkg":',
            '        specifier: ^2.0.1',
            '        version: 2.0.1',
            '',
            'packages:',
            '  \'@scope/pkg@2.0.1(vitest@3.0.0)\':',
            '    resolution: {integrity: sha512-peer}',
            '',
        ].join('\n'))

        const lockFixed = [
            `lockfileVersion: '9.0'`,
            '',
            'importers:',
            '  .: {}',
            '  packages/app:',
            '    devDependencies:',
            '      "@scope/pkg":',
            '        specifier: ^2.0.2',
            '        version: 2.0.2',
            '',
            'packages:',
            '  \'@scope/pkg@2.0.2\':',
            '    resolution: {integrity: sha512-fixed}',
            '',
        ].join('\n')
        const lockAfterOverride = lockFixed.replace(
            '  \'@scope/pkg@2.0.2\':',
            '  \'@scope/pkg@2.0.1(vitest@3.0.0)\':',
        )

        let installCalls = 0
        mockRunTrackedCommand.mockImplementation(async () => {
            installCalls += 1
            writeFileSync(project.lockfilePath, installCalls === 1 ? lockAfterOverride : lockFixed)
            return okInstallOutcome()
        })

        const lines = collectFailingOverrideLines(project.lockfilePath, '@scope/pkg', { '@scope/pkg': '^2.0.2' })
        expect(parseSelectorMajorForTest('@scope/pkg')).toBe(-1)
        expect(parseSelectorMajorForTest('^2')).toBe(2)

        const result = await applyVersionedOverrides({
            packageName: '@scope/pkg',
            versionedOverrides: { '@scope/pkg': '^2.0.2' },
            workDir: project.dir,
        })

        expect(result.success).toBe(true)
        expect(result.promotion?.status).toBe('promoted')
        // 通用 key 的失败线不按 selector 解析（major 由目标版本定）
        expect(lines.every((line) => line.unversioned === true)).toBe(true)
        const memberPkg = JSON.parse(readFileSync(memberPkgPath, 'utf-8')) as { devDependencies: Record<string, string> }
        expect(memberPkg.devDependencies['@scope/pkg']).toBe('^2.0.2')

        cleanup(project)
    })
})
