// verification-runner.env-hardening.test.ts — 验证链子进程的环境硬化（真实 spawn，不 mock）。
//
// 背景（2026-11-21）：验证链执行的是目标仓库自带脚本（lint / build / test / postinstall），
// 是平台密钥进入执行环境的最危险面。本文件用真实子进程打印 env 键名，锁定「平台密钥类变量不可见、
// 工具链变量仍在」这一对外可检事实（mock spawn 的用例只能锁定入参，锁不住真实继承）。
import { describe, expect, it } from 'vitest'
import { runVerification } from './verification-runner'

const SECRET_KEYS = ['NUXT_ENCRYPTION_KEY', 'AUTH_SECRET', 'DATABASE_URL', 'SMTP_PASS'] as const

describe('runVerification 的环境硬化（真实子进程）', () => {
    it('目标仓库脚本看不到平台密钥类变量，PATH 保留', async () => {
        const saved = new Map(SECRET_KEYS.map((key) => [key, process.env[key]] as const))
        for (const key of SECRET_KEYS) {
            process.env[key] = `secret-${key}`
        }
        try {
            // 用当前 node 打印 env 键名（跨平台：shell 双引号在 POSIX / cmd 均可用）
            const command = `"${process.execPath}" -e "process.stdout.write(Object.keys(process.env).join(','))"`
            const result = await runVerification({
                workDir: process.cwd(),
                commands: [command],
                commandTimeoutMs: 30_000,
                networkAuditDisabled: true,
            })

            expect(result.success).toBe(true)
            const stdout = result.commandResults[0]?.stdout ?? ''
            for (const key of SECRET_KEYS) {
                expect(stdout).not.toContain(key)
            }
            expect(stdout).toContain('PATH')
        } finally {
            for (const [key, value] of saved) {
                if (value === undefined) {
                    delete process.env[key]
                } else {
                    process.env[key] = value
                }
            }
        }
    })
})
