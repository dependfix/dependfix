import { test, expect } from '@playwright/test'
import { waitForHydration } from './helpers/hydration.helper'

/**
 * 管理后台页面 e2e：复用 global-setup 保存的 admin 认证状态（storageState）。
 */
test.use({ storageState: 'tests/e2e/.auth/admin.json' })

test.describe('仪表板', () => {
    test('统计卡片渲染', async ({ page }) => {
        await page.goto('/dashboard')
        await waitForHydration(page)
        await expect(page.locator('h2')).toContainText('仪表板')
        // 统计区域：仓库数 / 告警总数 / 已修复数 / 最近扫描——C61 后图表卡（dashboard__charts）扩展到 7 张
        await expect(page.locator('.dashboard')).toBeVisible()
        await expect(page.locator('.dashboard__stats .p-card')).toHaveCount(4, { timeout: 15000 })
        // 图表区 3 张卡片（C61 新增 severity/fixRate/topPackages）
        await expect(page.locator('.dashboard__charts .p-card')).toHaveCount(3, { timeout: 15000 })
    })

    test('导航栏渲染完整', async ({ page }) => {
        await page.goto('/dashboard')
        await waitForHydration(page)
        await expect(page.locator('a[href="/dashboard"]')).toBeVisible()
        await expect(page.locator('a[href="/repos"]')).toBeVisible()
        await expect(page.locator('a[href="/alerts"]')).toBeVisible()
        await expect(page.locator('a[href="/credentials"]')).toBeVisible()
        await expect(page.locator('a[href="/users"]')).toBeVisible()
        await expect(page.locator('a[href="/settings"]')).toBeVisible()
    })
})

test.describe('仓库管理', () => {
    test('空态提示', async ({ page }) => {
        await page.goto('/repos')
        await waitForHydration(page)
        await expect(page.locator('h2')).toContainText('仓库管理')
        await expect(page.locator('.p-datatable')).toBeVisible({ timeout: 15000 })
    })

    test('添加仓库表单校验：GitHub Action 必须填 workflow 文件', async ({ page }) => {
        // 唯一仓库名（时间戳）保证用例幂等：重复运行不撞唯一索引
        const stamp = Date.now()
        const owner = `e2e-owner-${stamp}`
        const name = `e2e-repo-${stamp}`
        await page.goto('/repos')
        await waitForHydration(page)
        await page.locator('button:has-text("添加仓库")').click()
        await page.locator('input#owner').fill(owner)
        await page.locator('input#name').fill(name)
        // 切换执行方式为 GitHub Action
        await page.locator('#executorKind').click()
        await page.locator('.p-select-option:has-text("GitHub Action")').click()
        // workflow 输入框条件出现
        await expect(page.locator('input#actionWorkflowFile')).toBeVisible()
        // 不填 workflow 直接保存 → 表单校验失败
        await page.locator('button[type="submit"]').click()
        await expect(page.locator('.p-message-error')).toBeVisible()
        // 填 workflow 后保存成功
        await page.locator('input#actionWorkflowFile').fill('.github/workflows/security.yml')
        await page.locator('button[type="submit"]').click()
        await expect(page.locator('.p-message-success')).toContainText('仓库已添加', { timeout: 15000 })
    })

    test('平台容器模式不显示 workflow 输入框', async ({ page }) => {
        await page.goto('/repos')
        await waitForHydration(page)
        await page.locator('button:has-text("添加仓库")').click()
        await expect(page.locator('input#owner')).toBeVisible()
        await expect(page.locator('input#actionWorkflowFile')).toHaveCount(0)
    })

    test('批量导入对话框渲染（凭据选择 + 空态提示）', async ({ page }) => {
        await page.goto('/repos')
        await waitForHydration(page)
        await page.locator('button:has-text("批量导入")').click()
        await expect(page.locator('.p-dialog-header')).toContainText('批量导入仓库', { timeout: 15000 })
        await expect(page.locator('#importCredential')).toBeVisible()
        // 无凭据时提示先选择
        await expect(page.locator('text=请先选择 GitHub 凭据')).toBeVisible()
    })

    test('批量导入对话框默认不勾选仓库（手滑防护，见 docs/plan/todo.md §PR1 C48）', async ({ page }) => {
        await page.goto('/repos')
        await waitForHydration(page)
        await page.locator('button:has-text("批量导入")').click()
        await expect(page.locator('.p-dialog-header')).toContainText('批量导入仓库', { timeout: 15000 })
        // Dialog 内不应存在任何已勾选 checkbox（默认全空——见 docs/plan/todo.md §PR1 C48）
        await expect(page.locator('.p-dialog input[type="checkbox"]:checked')).toHaveCount(0)
        // 全选 checkbox 仍可见可点：勾上后才有 checked 状态
        const selectAllCheckbox = page.locator('.p-dialog .import-form__list-actions input[type="checkbox"]')
        if (await selectAllCheckbox.count()) {
            await expect(selectAllCheckbox).not.toBeChecked()
        }
    })
})

test.describe('凭据管理', () => {
    test('添加凭据表单含 GitHub 官方文档链接', async ({ page }) => {
        await page.goto('/credentials')
        await waitForHydration(page)
        await expect(page.locator('h2')).toContainText('凭据管理')
        await page.locator('button:has-text("添加凭据")').click()
        await expect(page.locator('input#name')).toBeVisible()
        const docLink = page.locator('a:has-text("GitHub 官方文档")')
        await expect(docLink).toBeVisible()
        await expect(docLink).toHaveAttribute('href', /docs\.github\.com/)
        await expect(docLink).toHaveAttribute('target', '_blank')
    })
})

test.describe('告警视图', () => {
    test('页面渲染与筛选控件', async ({ page }) => {
        await page.goto('/alerts')
        await waitForHydration(page)
        await expect(page.locator('h2')).toContainText('告警')
        // 筛选控件：仓库 / 严重级别 / 来源
        await expect(page.locator('#repo')).toBeVisible({ timeout: 15000 })
        await expect(page.locator('#severity')).toBeVisible()
        await expect(page.locator('#source')).toBeVisible()
    })
})

test.describe('用户管理（admin）', () => {
    test('用户列表渲染并包含测试账号', async ({ page }) => {
        await page.goto('/users')
        await waitForHydration(page)
        await expect(page.locator('h2')).toContainText('用户管理')
        await expect(page.locator('.p-datatable')).toBeVisible({ timeout: 15000 })
        await expect(page.locator('.p-datatable')).toContainText('e2e-admin@dependfix.test')
        await expect(page.locator('.p-datatable')).toContainText('e2e-viewer@dependfix.test')
    })

    test('搜索过滤用户', async ({ page }) => {
        await page.goto('/users')
        await waitForHydration(page)
        await page.locator('.users__search').fill('e2e-viewer')
        await expect(page.locator('.p-datatable')).toContainText('e2e-viewer@dependfix.test', { timeout: 15000 })
        await expect(page.locator('.p-datatable')).not.toContainText('e2e-admin@dependfix.test')
    })

    test('角色分配下拉框可用', async ({ page }) => {
        await page.goto('/users')
        await waitForHydration(page)
        const roleSelects = page.locator('.p-datatable .p-select')
        await expect(roleSelects.first()).toBeVisible({ timeout: 15000 })
    })

    test('自己 row 的 role Select 含 disabled（防止自我降级）', async ({ page }) => {
        await page.goto('/users')
        await waitForHydration(page)
        // 自己 row（当前登录 admin = e2e-admin@dependfix.test）role Select 应禁用
        const selfRow = page.locator('.p-datatable-tbody tr', { hasText: 'e2e-admin@dependfix.test' })
        await expect(selfRow).toBeVisible({ timeout: 15000 })
        // PrimeVue 4 Select（非 editable 形态）把 disabled 写到内部 combobox span 的 aria-disabled，
        // root 不渲染 p-disabled class；定位 role="combobox" 的 span 断言 aria-disabled="true"
        const selfCombobox = selfRow.locator('.p-select span[role="combobox"]')
        await expect(selfCombobox).toHaveAttribute('aria-disabled', 'true')

        // 他人 row（viewer）的 role Select 仍可用
        const otherRow = page.locator('.p-datatable-tbody tr', { hasText: 'e2e-viewer@dependfix.test' })
        await expect(otherRow).toBeVisible({ timeout: 15000 })
        const otherCombobox = otherRow.locator('.p-select span[role="combobox"]')
        await expect(otherCombobox).toHaveAttribute('aria-disabled', 'false')
    })

    test('服务端强制拦截（绕过前端 UI 直接调 API）', async ({ page }) => {
        // 用 page navigation 让 SSR 走完（auth middleware + useSession 填充 session）
        await page.goto('/dashboard')
        await waitForHydration(page)
        // 从 Nuxt 4 payload（__NUXT_DATA__ 脚本）解析 session.userId
        // Nuxt 4 用 devalue 编码：payload 是稀疏数组，每个元素就是 value（不再嵌套 array）
        // user 对象在 payload[15] = {"name":16,"email":17,...,"role":21,"id":12}
        // 其中 role=21 → payload[21] = "admin"；id=12 → payload[12] = "68058d7f7156e1fb"
        const selfUserId = await page.evaluate((): string | null => {
            const el = document.getElementById('__NUXT_DATA__')
            if (!el?.textContent) {
                return null
            }
            const payload: unknown[] = JSON.parse(el.textContent)
            const deref = (v: unknown): unknown => {
                if (typeof v === 'number' && v < payload.length) {
                    return payload[v]
                }
                return v
            }
            for (const item of payload) {
                const isObj = item && typeof item === 'object' && !Array.isArray(item)
                if (!isObj) {
                    continue
                }
                const obj = item as Record<string, unknown>
                if (!('role' in obj) || !('id' in obj)) {
                    continue
                }
                if (deref(obj.role) === 'admin') {
                    const idVal = deref(obj.id)
                    if (typeof idVal === 'string') {
                        return idVal
                    }
                }
            }
            return null
        })
        expect(selfUserId, 'session.userId 应在 Nuxt payload 中').toBeTruthy()
        if (!selfUserId) {
            return
        }

        // 用 page.context().request（继承 storageState cookies）替代 page.request
        const apiReq = page.context().request

        // === 检查 1：self-target set-role → 403 ===
        const setRoleResp = await apiReq.post('/api/auth/admin/set-role', {
            data: { userId: selfUserId, role: 'viewer' },
        })
        expect(setRoleResp.status()).toBe(403)

        // === 检查 2：self-target ban-user → 403 ===
        const banResp = await apiReq.post('/api/auth/admin/ban-user', {
            data: { userId: selfUserId, banReason: 'self-test' },
        })
        expect(banResp.status()).toBe(403)

        // === 检查 3：self-target remove-user → 403 ===
        const removeResp = await apiReq.post('/api/auth/admin/remove-user', {
            data: { userId: selfUserId },
        })
        expect(removeResp.status()).toBe(403)

        // === 检查 4：self-target impersonate-user → 403 ===
        const impersonateResp = await apiReq.post('/api/auth/admin/impersonate-user', {
            data: { userId: selfUserId },
        })
        expect(impersonateResp.status()).toBe(403)

        // === 验证：服务端拒绝后用户角色未变（admin 仍是 admin，未被 ban/删除）===
        // 重新通过 page navigation 触发 SSR middleware 重读 session
        await page.goto('/dashboard')
        await waitForHydration(page)
        const afterUserId = await page.evaluate((): string | null => {
            const el = document.getElementById('__NUXT_DATA__')
            if (!el?.textContent) {
                return null
            }
            const payload: unknown[] = JSON.parse(el.textContent)
            const deref = (v: unknown): unknown => {
                if (typeof v === 'number' && v < payload.length) {
                    return payload[v]
                }
                return v
            }
            for (const item of payload) {
                const isObj = item && typeof item === 'object' && !Array.isArray(item)
                if (!isObj) {
                    continue
                }
                const obj = item as Record<string, unknown>
                if (!('role' in obj) || !('id' in obj)) {
                    continue
                }
                if (deref(obj.role) === 'admin') {
                    const idVal = deref(obj.id)
                    if (typeof idVal === 'string') {
                        return idVal
                    }
                }
            }
            return null
        })
        expect(afterUserId).toBe(selfUserId)
    })

    test('update-user self-target 同样被拦截（防 update-user 绕过）', async ({ page }) => {
        await page.goto('/dashboard')
        await waitForHydration(page)
        const selfUserId = await page.evaluate((): string | null => {
            const el = document.getElementById('__NUXT_DATA__')
            if (!el?.textContent) {
                return null
            }
            const payload: unknown[] = JSON.parse(el.textContent)
            const deref = (v: unknown): unknown => {
                if (typeof v === 'number' && v < payload.length) {
                    return payload[v]
                }
                return v
            }
            for (const item of payload) {
                const isObj = item && typeof item === 'object' && !Array.isArray(item)
                if (!isObj) {
                    continue
                }
                const obj = item as Record<string, unknown>
                if (!('role' in obj) || !('id' in obj)) {
                    continue
                }
                if (deref(obj.role) === 'admin') {
                    const idVal = deref(obj.id)
                    if (typeof idVal === 'string') {
                        return idVal
                    }
                }
            }
            return null
        })
        expect(selfUserId).toBeTruthy()
        if (!selfUserId) {
            return
        }
        const apiReq = page.context().request

        // update-user 自我 target + role demote → 403
        const demoteResp = await apiReq.post('/api/auth/admin/update-user', {
            data: { userId: selfUserId, data: { role: 'viewer' } },
        })
        expect(demoteResp.status()).toBe(403)

        // update-user 自我 target + banned=true → 403
        const banResp = await apiReq.post('/api/auth/admin/update-user', {
            data: { userId: selfUserId, data: { banned: true } },
        })
        expect(banResp.status()).toBe(403)
    })
})

test.describe('个人设置', () => {
    test('五张卡片渲染', async ({ page }) => {
        await page.goto('/settings')
        await waitForHydration(page)
        await expect(page.locator('h2')).toContainText('个人设置')
        await expect(page.locator('.p-card')).toHaveCount(5, { timeout: 15000 })
    })

    test('修改显示名并同步头部', async ({ page }) => {
        await page.goto('/settings')
        await waitForHydration(page)
        const nameInput = page.locator('input#name')
        await expect(nameInput).toBeVisible({ timeout: 15000 })
        await nameInput.fill('E2E Renamed')
        await page.locator('button:has-text("保存资料")').click()
        await expect(page.locator('.p-message-success')).toContainText('个人资料已更新', { timeout: 15000 })
        // 头部用户名同步
        await expect(page.locator('.platform__user-name')).toContainText('E2E Renamed')
    })

    test('修改密码需当前密码', async ({ page }) => {
        await page.goto('/settings')
        await waitForHydration(page)
        await expect(page.locator('#currentPassword input')).toBeVisible({ timeout: 15000 })
        await page.locator('#currentPassword input').fill('wrong-current')
        await page.locator('#newPassword input').fill('NewPassword123')
        await page.locator('#confirmPassword input').fill('NewPassword123')
        await page.locator('button:has-text("修改密码")').click()
        // 错误当前密码 → 报错（better-auth INVALID_PASSWORD）
        await expect(page.locator('.p-message-error')).toBeVisible({ timeout: 15000 })
    })
})
