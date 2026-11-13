import { expect, test } from '@playwright/test'

/**
 * 沙箱 fix 真实执行（gated，需真实凭据）。
 *
 * 启用前提（全部满足才执行）：
 * - `SANDBOX_E2E=true` + `SANDBOX_E2E_TOKEN`（可读 Dependabot alerts 的 token）
 * - `SANDBOX_IMAGE` 指向含 `/app/sandbox/` 自包含入口的镜像（建议先用 `pnpm --filter dependfix build:sandbox` 重建）
 * - `SANDBOX_E2E_REPO`（默认 `dependfix/dependfix`）存在可读告警
 *
 * 断言：mode=fix + executorKind=sandbox 时运行在容器内完成 clone / 安装 / 修复 / 验证，
 * 状态 completed 且 error 为 null（降级会记 degraded + errorJson，故该断言即证明未降级）。
 * 本用例不创建 PR（mode=fix 只做本地修复与验证）。
 */
test.use({ storageState: 'tests/e2e/.auth/admin.json' })
test.use({ trace: 'off' })

const enabled = process.env.SANDBOX_E2E === 'true'
const token = process.env.SANDBOX_E2E_TOKEN
const targetRepo = process.env.SANDBOX_E2E_REPO ?? 'dependfix/dependfix'

test.describe('sandbox fix real execution (gated)', () => {
    test.skip(!enabled, 'SANDBOX_E2E is not enabled')
    test.skip(!token, 'SANDBOX_E2E_TOKEN is required')

    test('fix 在沙箱内完成 clone / 安装 / 修复 / 验证（未降级）', async ({ page }) => {
        test.setTimeout(35 * 60_000)
        const stamp = Date.now()
        const [owner = '', name = ''] = targetRepo.split('/')
        expect(owner && name).toBeTruthy()
        const cookieHeader = (await page.context().cookies()).map((c) => `${c.name}=${c.value}`).join('; ')
        const headers = { cookie: cookieHeader, origin: 'http://127.0.0.1:3101' }

        const listRes = await page.request.get('/api/repos', { headers })
        const existing = (await listRes.json() as { id: string, owner: string, name: string }[])
            .find((item) => item.owner === owner && item.name === name)
        if (existing) {
            const deleted = await page.request.delete(`/api/repos/${existing.id}`, { headers })
            expect(deleted.ok()).toBe(true)
        }
        const credentialList = await page.request.get('/api/credentials', { headers })
        for (const item of await credentialList.json() as { id: string, name: string }[]) {
            if (item.name.startsWith('sandbox-fix-e2e-')) {
                await page.request.delete(`/api/credentials/${item.id}`, { headers })
            }
        }

        const credentialRes = await page.request.post('/api/credentials', {
            headers,
            data: { name: `sandbox-fix-e2e-${stamp}`, type: 'classic-pat', token },
        })
        expect(credentialRes.ok()).toBe(true)
        const credential = await credentialRes.json() as { id: string }

        const repoRes = await page.request.post('/api/repos', {
            headers,
            data: {
                owner,
                name,
                defaultBranch: 'main',
                packageManager: 'pnpm',
                executorKind: 'sandbox',
                credentialId: credential.id,
            },
        })
        expect(repoRes.ok()).toBe(true)
        const repository = await repoRes.json() as { id: string }

        const response = await page.request.post(`/api/repos/${repository.id}/scan`, {
            headers,
            data: { mode: 'fix', severityThreshold: 'all', executorKind: 'sandbox' },
        })
        expect(response.ok()).toBe(true)
        const run = await response.json() as {
            executorKind: string
            status: string
            summary: { alertsFound?: number } | null
            error: { code: string } | null
        }

        expect(run.executorKind).toBe('sandbox')
        expect(run.error).toBeNull()
        expect(run.status).toBe('completed')
        expect(run.summary?.alertsFound ?? 0).toBeGreaterThan(0)
    })
})
