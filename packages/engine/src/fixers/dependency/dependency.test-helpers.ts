import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// ---------------------------------------------------------------------------
// dependency fixer 测试共享 fixtures（index.test.ts 与 dependency-upgrade.test.ts 共用）
// ---------------------------------------------------------------------------

export interface TempProject {
    dir: string
    pkgPath: string
    lockfilePath: string
}

export function createTempProject(
    deps: Record<string, string>,
    options?: {
        devDeps?: Record<string, string>
        optionalDeps?: Record<string, string>
        withLockfile?: boolean
    },
): TempProject {
    const dir = mkdtempSync(join(tmpdir(), 'dependfix-test-'))
    const pkg: Record<string, unknown> = { name: 'test-project', version: '1.0.0' }
    if (Object.keys(deps).length > 0) {
        pkg.dependencies = deps
    }
    if (options?.devDeps && Object.keys(options.devDeps).length > 0) {
        pkg.devDependencies = options.devDeps
    }
    if (options?.optionalDeps && Object.keys(options.optionalDeps).length > 0) {
        pkg.optionalDependencies = options.optionalDeps
    }
    const pkgPath = join(dir, 'package.json')
    const lockfilePath = join(dir, 'pnpm-lock.yaml')
    writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`)
    if (options?.withLockfile !== false) {
        writeFileSync(lockfilePath, '# mock lockfile\n')
    }
    return { dir, pkgPath, lockfilePath }
}

export function readPackageVersion(project: TempProject, pkgName: string): string | undefined {
    const pkg = JSON.parse(readFileSync(project.pkgPath, 'utf-8')) as Record<string, unknown>
    const deps = pkg.dependencies as Record<string, string> | undefined
    return deps?.[pkgName]
}

export function cleanup(project: TempProject): void {
    try {
        rmSync(project.dir, { recursive: true, force: true })
    } catch {
        /* ignore */
    }
}
