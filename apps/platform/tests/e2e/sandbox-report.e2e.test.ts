import { expect, test } from '@playwright/test'

/**
 * 沙箱 report-only 真实执行（gated）。
 *
 * 启用前提（全部满足才执行，否则跳过并显示原因）：
 * - `SANDBOX_E2E=true`
 * - `SANDBOX_E2E_TOKEN`：可读取目标仓库 Dependabot alerts 的 GitHub token
 * - 平台进程可达 rootless Docker daemon（`SandboxExecutor.isAvailable()`），且 `SANDBOX_IMAGE`
 *   指向已含 `/app/sandbox/` 自包含入口的镜像（默认三源候选；测试环境按需 SANDBOX_IMAGE 覆盖）
 * - `SANDBOX_E2E_REPO`（默认 `dependfix/dependfix`）存在可读告警
 *
 * 断言：同一仓库分别用 container / sandbox 跑 report-only，两者告警数一致；
 * sandbox 运行状态为 completed 且 error 为 null（降级时 status=degraded + errorJson 非空，故该断言即证明未降级）。
 *
 * 拓扑说明：Playwright webServer 是宿主裸进程；沙箱**不挂载宿主目录**（结果经 stdout 哨兵回传），
 * 因此该用例与「平台容器 + 宿主 daemon」的路径映射无关，不构成部署形态盲区。
 */
test.use({ storageState: 'tests/e2e/.auth/admin.json' })
// 该用例会把真实 token 放进凭据创建请求体；禁止 trace 落盘，避免 CI artifact 泄漏
test.use({ trace: 'off' })

const enabled = process.env.SANDBOX_E2E === 'true'
const token = process.env.SANDBOX_E2E_TOKEN
const targetRepo = process.env.SANDBOX_E2E_REPO ?? 'dependfix/dependfix'

test.describe('sandbox report-only real execution (gated)', () => {
    test.skip(!enabled, 'SANDBOX_E2E is not enabled')
    test.skip(!token, 'SANDBOX_E2E_TOKEN is required')

    test('container 与 sandbox 的 report-only 告警数一致', async ({ page }) => {
        const stamp = Date.now()
        const [owner, name] = targetRepo.split('/')
        expect(owner && name).toBeTruthy()
        const cookieHeader = (await page.context().cookies()).map((c) => `${c.name}=${c.value}`).join('; ')
        const headers = { cookie: cookieHeader, origin: 'http://127.0.0.1:3101' }

        // e2e 库跨轮持久：先移除同 owner/name 的既有仓库与历史凭据，避免 409 重复 / 凭据累积
        const listRes = await page.request.get('/api/repos', { headers })
        const existing = (await listRes.json() as { id: string, owner: string, name: string }[])
            .find((item) => item.owner === owner && item.name === name)
        if (existing) {
            const deleted = await page.request.delete(`/api/repos/${existing.id}`, { headers })
            expect(deleted.ok()).toBe(true)
        }
        const credentialList = await page.request.get('/api/credentials', { headers })
        for (const item of await credentialList.json() as { id: string, name: string }[]) {
            if (item.name.startsWith('sandbox-e2e-')) {
                await page.request.delete(`/api/credentials/${item.id}`, { headers })
            }
        }

        const credentialRes = await page.request.post('/api/credentials', {
            headers,
            data: { name: `sandbox-e2e-${stamp}`, type: 'classic-pat', token },
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

        const runWith = async (executorKind: 'container' | 'sandbox') => {
            const response = await page.request.post(`/api/repos/${repository.id}/scan`, {
                headers,
                data: { mode: 'report-only', severityThreshold: 'all', executorKind },
            })
            expect(response.ok()).toBe(true)
            return await response.json() as {
                id: string
                executorKind: string
                status: string
                summary: { alertsFound?: number } | null
                error: { code: string } | null
            }
        }

        const containerRun = await runWith('container')
        expect(containerRun.status).toBe('completed')
        expect(containerRun.executorKind).toBe('container')
        expect(containerRun.summary?.alertsFound).toBeGreaterThan(0)

        const sandboxRun = await runWith('sandbox')
        expect(sandboxRun.executorKind).toBe('sandbox')
        expect(sandboxRun.error).toBeNull()
        expect(sandboxRun.status).toBe('completed')
        expect(sandboxRun.summary?.alertsFound).toBe(containerRun.summary?.alertsFound)
    })
})
