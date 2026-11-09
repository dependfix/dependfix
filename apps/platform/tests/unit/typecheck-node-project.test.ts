// typecheck-node-project.test.ts — 锁定平台 typecheck 覆盖生成的 Nuxt node project。
//
// 背景：`nuxt typecheck` 只检查主 project（`.nuxt/tsconfig.json`），`nuxt.config.ts` / `modules/**`
// 所在的 node project 长期不在门禁内。本用例守住脚本与 wrapper 两处声明，
// 防止后续把 `typecheck` 改回单 project 或删掉 `experimentalDecorators` 覆盖（TS5052）。
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const platformRoot = join(import.meta.dirname, '../..')

describe('平台 typecheck 覆盖 node project', () => {
    it('typecheck 脚本包含 node project 检查', () => {
        const pkg = JSON.parse(readFileSync(join(platformRoot, 'package.json'), 'utf8')) as {
            scripts?: Record<string, string>
        }
        expect(pkg.scripts?.typecheck).toContain('-p tsconfig.node.json')
    })

    it('wrapper 继承生成的 node project 并覆盖装饰器选项', () => {
        const tsconfig = JSON.parse(readFileSync(join(platformRoot, 'tsconfig.node.json'), 'utf8')) as {
            extends?: string
            compilerOptions?: { experimentalDecorators?: boolean }
        }
        expect(tsconfig.extends).toBe('./.nuxt/tsconfig.node.json')
        expect(tsconfig.compilerOptions?.experimentalDecorators).toBe(true)
    })
})
