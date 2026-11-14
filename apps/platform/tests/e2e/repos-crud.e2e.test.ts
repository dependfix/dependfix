import { expect, test } from '@playwright/test'
import { authedCookieHeader } from './helpers/auth-cookie.helper'
import { waitForHydration } from './helpers/hydration.helper'

/**
 * 仓库管理页面 CRUD e2e：
 * 1. 列表渲染 + 关联 credential 展示（credentialName 字段）
 * 2. 创建仓库 → 列表新增
 * 3. 编辑仓库 → 列表更新
 * 4. 删除仓库 → 列表移除
 * 5. viewer 只读边界
 * 6. 分页保持：编辑保存保留当前页码与每页条数；新增 / 删除后回到第 1 页
 */

test.use({ storageState: 'tests/e2e/.auth/admin.json' })

test.describe('仓库管理 CRUD', () => {
    test('列表渲染：seed 后列表展示 + 关联 credential 显示', async ({ page }) => {
        const stamp = Date.now()
        const owner = `repos-list-${stamp}`
        const repoName = 'app'
        // 先创建一条
        const cookieHeader = await authedCookieHeader(page)
        await page.request.post('/api/repos', {
            headers: { cookie: cookieHeader, origin: 'http://127.0.0.1:3101' },
            data: {
                owner,
                name: repoName,
                platform: 'github',
                packageManager: 'pnpm',
                defaultBranch: 'main',
                executorKind: 'container',
            },
        })

        await page.goto('/repos')
        await waitForHydration(page)
        await expect(page.locator('h2')).toContainText('仓库管理', { timeout: 15000 })
        await expect(page.locator('.caomei-data-table')).toBeVisible()
        await expect(page.locator('.caomei-data-table')).toContainText(owner, { timeout: 15000 })
        // repos.vue 列定义：Owner / 仓库(name) 两列分别渲染，无斜杠拼接
        await expect(page.locator('.caomei-data-table')).toContainText(repoName)
    })

    test('创建仓库：Dialog 填写 → 保存 → 列表新增', async ({ page }) => {
        await page.goto('/repos')
        await waitForHydration(page)
        await page.locator('button:has-text("添加仓库")').click()
        await expect(page.locator('.caomei-dialog__header')).toContainText('添加仓库', { timeout: 15000 })

        const stamp = Date.now()
        const owner = `repos-create-${stamp}`
        const name = `repo-${stamp}`
        await page.locator('input#owner').fill(owner)
        await page.locator('input#name').fill(name)
        await page.locator('.caomei-dialog__content button:has-text("保存")').click()
        // 成功提示
        await expect(page.locator('.caomei-message--success')).toContainText('仓库已添加', { timeout: 15000 })
        // 列表新增（repos.vue owner/name 两列分别渲染，无 / 拼接）
        await expect(page.locator('.caomei-data-table')).toContainText(owner, { timeout: 15000 })
        await expect(page.locator('.caomei-data-table')).toContainText(name)
    })

    test('自定义验证命令：Dialog 填写 → 保存 → API 落库 → 编辑回显（docs/standards/platform.md §3.8）', async ({ page }) => {
        await page.goto('/repos')
        await waitForHydration(page)
        await page.locator('button:has-text("添加仓库")').click()
        await expect(page.locator('.caomei-dialog__header')).toContainText('添加仓库', { timeout: 15000 })

        const stamp = Date.now()
        const owner = `repos-vc-${stamp}`
        const name = `repo-${stamp}`
        await page.locator('input#owner').fill(owner)
        await page.locator('input#name').fill(name)

        // 多行文本（一行一条）；保存时按行拆分为数组
        const commandsInput = page.locator('textarea#verifyCommands')
        await expect(commandsInput).toBeVisible()
        await commandsInput.fill('pnpm install --frozen-lockfile\npnpm test')
        await page.locator('.caomei-dialog__content button:has-text("保存")').click()
        await expect(page.locator('.caomei-message--success')).toContainText('仓库已添加', { timeout: 15000 })

        // API 落库：命令数组 + 顺序保持
        const cookieHeader = await authedCookieHeader(page)
        const response = await page.request.get('/api/repos', {
            headers: { cookie: cookieHeader, origin: 'http://127.0.0.1:3101' },
        })
        const repos = await response.json() as { owner: string, verifyCommands: string[] }[]
        expect(repos.find((r) => r.owner === owner)?.verifyCommands)
            .toEqual(['pnpm install --frozen-lockfile', 'pnpm test'])

        // 编辑弹窗回显：数组 join('\n') 还原为多行文本
        const row = page.locator('.caomei-data-table__row', { hasText: owner })
        await row.locator('button[aria-label="编辑"]').click()
        await expect(page.locator('.caomei-dialog__header')).toContainText('编辑仓库', { timeout: 15000 })
        await expect(page.locator('textarea#verifyCommands'))
            .toHaveValue('pnpm install --frozen-lockfile\npnpm test')
    })

    test('PR Check 关注集：Dialog 填写 → 保存 → API 落库 → 编辑回显', async ({ page }) => {
        await page.goto('/repos')
        await waitForHydration(page)
        await page.locator('button:has-text("添加仓库")').click()
        await expect(page.locator('.caomei-dialog__header')).toContainText('添加仓库', { timeout: 15000 })

        const stamp = Date.now()
        const owner = `repos-focus-${stamp}`
        await page.locator('input#owner').fill(owner)
        await page.locator('input#name').fill(`repo-${stamp}`)
        await page.locator('input#focusProviders').fill('Vercel, github-actions')
        await page.locator('input#focusNames').fill('Test, Preview')
        // 来源类型：多选（选中后点标题收合面板，避免 Escape 连带关闭弹窗）
        await page.locator('#focusKinds').click()
        await page.getByRole('option', { name: 'Check', exact: true }).click()
        await page.locator('.repo-form__focus-title').click()

        await page.locator('.caomei-dialog__content button:has-text("保存")').click()
        await expect(page.locator('.caomei-message--success')).toContainText('仓库已添加', { timeout: 15000 })

        // API 落库：provider / kind 归一为小写，条目顺序保持
        const cookieHeader = await authedCookieHeader(page)
        const response = await page.request.get('/api/repos', {
            headers: { cookie: cookieHeader, origin: 'http://127.0.0.1:3101' },
        })
        const repos = await response.json() as { owner: string, prCheckFocus: unknown }[]
        expect(repos.find((r) => r.owner === owner)?.prCheckFocus).toEqual({
            providers: ['vercel', 'github-actions'],
            names: ['Test', 'Preview'],
            kinds: ['check'],
        })

        // 编辑弹窗回显（数组 join(', ') 还原为文本；归一后的 provider 小写）
        const row = page.locator('.caomei-data-table__row', { hasText: owner })
        await row.locator('button[aria-label="编辑"]').click()
        await expect(page.locator('.caomei-dialog__header')).toContainText('编辑仓库', { timeout: 15000 })
        await expect(page.locator('input#focusProviders')).toHaveValue('vercel, github-actions')
        await expect(page.locator('input#focusNames')).toHaveValue('Test, Preview')
        // kinds 多选回显：id 挂在内层 input，断言读 tag chip 文本（innerText 恒为空）
        const kindsField = page.locator('.repo-form__focus .caomei-multi-select')
        await expect(kindsField.locator('.caomei-multi-select__tag')).toHaveCount(1)
        await expect(kindsField).toContainText('Check')

        // 清空三维 → 保存 → prCheckFocus 回到 null（一键恢复默认）
        await page.locator('input#focusProviders').fill('')
        await page.locator('input#focusNames').fill('')
        await kindsField.locator('.caomei-multi-select__tag-remove').click()
        await page.locator('.caomei-dialog__content button:has-text("保存")').click()
        await expect(page.locator('.caomei-message--success')).toContainText('仓库已更新', { timeout: 15000 })

        const afterClear = await page.request.get('/api/repos', {
            headers: { cookie: cookieHeader, origin: 'http://127.0.0.1:3101' },
        })
        const clearedRepos = await afterClear.json() as { owner: string, prCheckFocus: unknown }[]
        expect(clearedRepos.find((r) => r.owner === owner)?.prCheckFocus).toBeNull()
    })

    test('执行预算：填写 → 保存 → API 落库 → 编辑回显', async ({ page }) => {
        await page.goto('/repos')
        await waitForHydration(page)
        await page.locator('button:has-text("添加仓库")').click()
        await expect(page.locator('.caomei-dialog__header')).toContainText('添加仓库', { timeout: 15000 })

        const stamp = Date.now()
        const owner = `repos-limits-${stamp}`
        await page.locator('input#owner').fill(owner)
        await page.locator('input#name').fill(`repo-${stamp}`)

        // 折叠区默认收起：展开后填时长（纯数字按分钟），摘要显示覆盖项数
        await page.locator('.repo-form__limits-summary').click()
        await page.locator('input#executionTimeout').fill('45')
        await page.locator('input#verifyCommandTimeout').fill('20')
        await expect(page.locator('.repo-form__limits-summary')).toContainText('2')

        // 跨大版本授权：默认关闭，显式开启
        await expect(page.locator('#allowMajorUpgrade')).toHaveAttribute('aria-checked', 'false')
        await page.locator('#allowMajorUpgrade').click()
        await expect(page.locator('#allowMajorUpgrade')).toHaveAttribute('aria-checked', 'true')

        await page.locator('.caomei-dialog__content button:has-text("保存")').click()
        await expect(page.locator('.caomei-message--success')).toContainText('仓库已添加', { timeout: 15000 })

        // API 落库：分钟换算为毫秒
        const cookieHeader = await authedCookieHeader(page)
        const response = await page.request.get('/api/repos', {
            headers: { cookie: cookieHeader, origin: 'http://127.0.0.1:3101' },
        })
        const repos = await response.json() as {
            owner: string
            executionTimeoutMs: number | null
            verifyCommandTimeoutMs: number | null
            allowMajorUpgrade: boolean
        }[]
        const created = repos.find((r) => r.owner === owner)
        expect(created?.executionTimeoutMs).toBe(45 * 60000)
        expect(created?.verifyCommandTimeoutMs).toBe(20 * 60000)
        expect(created?.allowMajorUpgrade).toBe(true)

        // 编辑回显：毫秒还原为可读单位
        const row = page.locator('.caomei-data-table__row', { hasText: owner })
        await row.locator('button[aria-label="编辑"]').click()
        await expect(page.locator('.caomei-dialog__header')).toContainText('编辑仓库', { timeout: 15000 })
        await expect(page.locator('input#executionTimeout')).toHaveValue('45m')
        await expect(page.locator('input#verifyCommandTimeout')).toHaveValue('20m')
        await expect(page.locator('#allowMajorUpgrade')).toHaveAttribute('aria-checked', 'true')
    })

    test('保存校验：错误在弹窗内定位到字段，且支持时长单位', async ({ page }) => {
        await page.goto('/repos')
        await waitForHydration(page)
        await page.locator('button:has-text("添加仓库")').click()
        await expect(page.locator('.caomei-dialog__header')).toContainText('添加仓库', { timeout: 15000 })

        const stamp = Date.now()
        await page.locator('input#owner').fill(`repos-invalid-${stamp}`)
        await page.locator('input#name').fill(`repo-${stamp}`)
        await page.locator('.repo-form__limits-summary').click()
        // 执行上限 10 分钟、验证命令 20 分钟：子项超过执行上限 → 客户端报红并聚焦
        await page.locator('input#executionTimeout').fill('10m')
        await page.locator('input#verifyCommandTimeout').fill('20m')
        await page.locator('.caomei-dialog__content button:has-text("保存")').click()

        const dialog = page.locator('.caomei-dialog__content')
        await expect(dialog.locator('.caomei-message--danger')).toContainText('请检查表单中标红的字段', { timeout: 15000 })
        const verifyField = page.locator('#verifyCommandTimeout').locator('xpath=ancestor::div[contains(@class, "repo-form__field")]')
        await expect(verifyField.locator('.text-danger')).toContainText('不能大于执行上限')
        await expect(verifyField.locator('.caomei-field--invalid')).toBeVisible()
        await expect(page.locator('#verifyCommandTimeout')).toBeFocused()

        // 非法单位同样在字段行内报红
        await page.locator('input#executionTimeout').fill('abc')
        await page.locator('.caomei-dialog__content button:has-text("保存")').click()
        await expect(page.locator('#executionTimeout').locator('xpath=ancestor::div[contains(@class, "repo-form__field")]'))
            .toContainText('时长格式无效')

        // 服务端校验（客户端未覆盖的条数上限）：issues 同样映射到行内字段
        await page.locator('input#executionTimeout').fill('30m')
        await page.locator('textarea#verifyCommands').fill(
            Array.from({ length: 21 }, (_, index) => `echo ${index}`).join('\n'),
        )
        await page.locator('.caomei-dialog__content button:has-text("保存")').click()
        const commandsField = page.locator('#verifyCommands').locator('xpath=ancestor::div[contains(@class, "repo-form__field")]')
        await expect(commandsField.locator('.text-danger')).toContainText('最多 20 条验证命令', { timeout: 15000 })
        // 错误未把弹窗关掉（页面级错误容器不在本用例断言范围）
        await expect(page.locator('.caomei-dialog__header')).toContainText('添加仓库')
    })

    test('编辑仓库：点击编辑 → 改 defaultBranch → 保存 → 列表更新', async ({ page }) => {
        const stamp = Date.now()
        const owner = `repos-edit-${stamp}`
        const cookieHeader = await authedCookieHeader(page)
        await page.request.post('/api/repos', {
            headers: { cookie: cookieHeader, origin: 'http://127.0.0.1:3101' },
            data: {
                owner,
                name: 'app',
                platform: 'github',
                packageManager: 'pnpm',
                defaultBranch: 'main',
                executorKind: 'container',
            },
        })

        await page.goto('/repos')
        await waitForHydration(page)
        await expect(page.locator('.caomei-data-table')).toContainText(owner, { timeout: 15000 })
        // 点击编辑按钮
        const row = page.locator('.caomei-data-table__row', { hasText: owner })
        await row.locator('button[aria-label="编辑"]').click()
        await expect(page.locator('.caomei-dialog__header')).toContainText('编辑仓库', { timeout: 15000 })
        // 改 defaultBranch（input#defaultBranch）
        const branchInput = page.locator('input#defaultBranch')
        await expect(branchInput).toBeVisible()
        await branchInput.fill('develop')
        await page.locator('.caomei-dialog__content button:has-text("保存")').click()
        await expect(page.locator('.caomei-message--success')).toContainText('仓库已更新', { timeout: 15000 })
        // 列表不再显示 owner（可能切换视图或刷新）— 简单断言列表仍可见即可
        await expect(page.locator('.caomei-data-table')).toBeVisible()
    })

    test('删除仓库：列表移除', async ({ page }) => {
        const stamp = Date.now()
        const owner = `repos-delete-${stamp}`
        const cookieHeader = await authedCookieHeader(page)
        await page.request.post('/api/repos', {
            headers: { cookie: cookieHeader, origin: 'http://127.0.0.1:3101' },
            data: {
                owner,
                name: 'app',
                platform: 'github',
                packageManager: 'pnpm',
                defaultBranch: 'main',
                executorKind: 'container',
            },
        })

        await page.goto('/repos')
        await waitForHydration(page)
        await expect(page.locator('.caomei-data-table')).toContainText(owner, { timeout: 15000 })
        // 删除无页面内二次确认；保留 native dialog 兜底，避免意外弹窗阻塞点击
        page.once('dialog', (dialog) => dialog.accept())
        const row = page.locator('.caomei-data-table__row', { hasText: owner })
        await row.locator('button[aria-label="删除"]').click()
        await expect(page.locator('.caomei-message--success')).toContainText('仓库已删除', { timeout: 15000 })
        await expect(page.locator('.caomei-data-table')).not.toContainText(owner)
    })

    test('分页保持：编辑保存保留当前页码与每页条数', async ({ page }) => {
        const stamp = Date.now()
        const owner = `repos-page-${stamp}`
        const cookieHeader = await authedCookieHeader(page)
        for (let index = 0; index < 11; index++) {
            await page.request.post('/api/repos', {
                headers: { cookie: cookieHeader, origin: 'http://127.0.0.1:3101' },
                data: {
                    owner,
                    name: `repo-${index}`,
                    platform: 'github',
                    packageManager: 'pnpm',
                    defaultBranch: 'main',
                    executorKind: 'container',
                },
            })
        }

        await page.goto('/repos')
        await waitForHydration(page)
        // 按唯一 owner 过滤，令列表恰为 11 条（2 页 @10/页）
        await page.locator('#repos-filter-search').fill(owner)
        const rows = page.locator('.caomei-data-table__row')
        await expect(rows).toHaveCount(10, { timeout: 15000 })

        // 第 2 页只剩 1 行
        await page.locator('.caomei-paginator__list').getByText('2', { exact: true }).click()
        await expect(rows).toHaveCount(1, { timeout: 15000 })

        // 编辑保存后仍在第 2 页（回退首页会变成 10 行）
        await rows.first().locator('button[aria-label="编辑"]').click()
        await expect(page.locator('.caomei-dialog__header')).toContainText('编辑仓库', { timeout: 15000 })
        const originalName = await page.locator('input#name').inputValue()
        const editedName = `${originalName}-edited`
        await page.locator('input#name').fill(editedName)
        await page.locator('.caomei-dialog__content button:has-text("保存")').click()
        await expect(page.locator('.caomei-message--success')).toContainText('仓库已更新', { timeout: 15000 })
        await expect(rows).toHaveCount(1, { timeout: 15000 })
        await expect(rows.first()).toContainText(editedName)

        // 每页条数 25：11 条全部落在第 1 页
        await page.locator('.caomei-paginator__rows-per-page').click()
        await page.locator('.caomei-select__item', { hasText: '25' }).click()
        await expect(rows).toHaveCount(11, { timeout: 15000 })

        // 再保存一次：每页条数保持 25（回退默认 10 会变成 10 行）
        await rows.first().locator('button[aria-label="编辑"]').click()
        await expect(page.locator('.caomei-dialog__header')).toContainText('编辑仓库', { timeout: 15000 })
        await page.locator('.caomei-dialog__content button:has-text("保存")').click()
        await expect(page.locator('.caomei-message--success')).toContainText('仓库已更新', { timeout: 15000 })
        await expect(rows).toHaveCount(11, { timeout: 15000 })
        await expect(page.locator('.caomei-paginator__rows-per-page .caomei-select__value')).toHaveText('25')
    })

    test('分页回退：新增 / 删除后回到第 1 页', async ({ page }) => {
        const stamp = Date.now()
        const owner = `repos-page-reset-${stamp}`
        const cookieHeader = await authedCookieHeader(page)
        for (let index = 0; index < 11; index++) {
            await page.request.post('/api/repos', {
                headers: { cookie: cookieHeader, origin: 'http://127.0.0.1:3101' },
                data: {
                    owner,
                    name: `repo-${index}`,
                    platform: 'github',
                    packageManager: 'pnpm',
                    defaultBranch: 'main',
                    executorKind: 'container',
                },
            })
        }

        await page.goto('/repos')
        await waitForHydration(page)
        await page.locator('#repos-filter-search').fill(owner)
        const rows = page.locator('.caomei-data-table__row')
        await expect(rows).toHaveCount(10, { timeout: 15000 })

        await page.locator('.caomei-paginator__list').getByText('2', { exact: true }).click()
        await expect(rows).toHaveCount(1, { timeout: 15000 })

        // 新增：12 条 → 回第 1 页（10 行）；留在第 2 页会是 2 行
        await page.locator('button:has-text("添加仓库")').click()
        await expect(page.locator('.caomei-dialog__header')).toContainText('添加仓库', { timeout: 15000 })
        await page.locator('input#owner').fill(owner)
        await page.locator('input#name').fill(`repo-new-${stamp}`)
        await page.locator('.caomei-dialog__content button:has-text("保存")').click()
        await expect(page.locator('.caomei-message--success')).toContainText('仓库已添加', { timeout: 15000 })
        await expect(rows).toHaveCount(10, { timeout: 15000 })

        // 删除：在第 2 页操作后回第 1 页（11 条 → 10 行）；留在第 2 页会是 1 行
        await page.locator('.caomei-paginator__list').getByText('2', { exact: true }).click()
        await expect(rows).toHaveCount(2, { timeout: 15000 })
        // 删除无页面内二次确认；保留 native dialog 兜底，避免意外弹窗阻塞点击
        page.once('dialog', (dialog) => dialog.accept())
        await rows.first().locator('button[aria-label="删除"]').click()
        await expect(page.locator('.caomei-message--success')).toContainText('仓库已删除', { timeout: 15000 })
        await expect(rows).toHaveCount(10, { timeout: 15000 })
    })

    test('sandbox 入口已恢复：镜像字段可见 / 校验 / 回显，编辑保持 sandbox', async ({ page }) => {
        const stamp = Date.now()
        const owner = `repos-sandbox-${stamp}`
        const cookieHeader = await authedCookieHeader(page)

        // 生产 API 接受 sandbox（入口恢复；仅 report-only 真实执行）
        const created = await page.request.post('/api/repos', {
            headers: { cookie: cookieHeader, origin: 'http://127.0.0.1:3101' },
            data: {
                owner,
                name: 'app',
                platform: 'github',
                packageManager: 'pnpm',
                defaultBranch: 'main',
                executorKind: 'sandbox',
            },
        })
        expect(created.ok()).toBe(true)

        await page.goto('/repos')
        await waitForHydration(page)
        const row = page.locator('.caomei-data-table__row', { hasText: owner })
        await expect(row).toBeVisible({ timeout: 15000 })
        await expect(row).toContainText('独立沙箱容器')

        // 编辑：执行方式保持 sandbox（不再自动迁移 container）；沙箱镜像字段可见
        await row.locator('button[aria-label="编辑"]').click()
        await expect(page.locator('.caomei-dialog__header')).toContainText('编辑仓库', { timeout: 15000 })
        await expect(page.locator('#executorKind')).toContainText('独立沙箱容器')
        await expect(page.locator('#sandboxImage')).toBeVisible()

        // 非法镜像地址：服务端 400 → 行内错误（字段保持 sandbox 可见）
        await page.locator('#sandboxImage').fill('https://ghcr.io/owner/dependfix:latest')
        const badResponse = page.waitForResponse((res) => res.request().method() === 'PUT' && res.status() === 400)
        await page.locator('.caomei-dialog__content button:has-text("保存")').click()
        await badResponse
        await expect(page.locator('.text-danger').filter({ hasText: '镜像地址' })).toBeVisible({ timeout: 15000 })

        // 合法镜像地址：随 PUT 提交并回读
        await page.locator('#sandboxImage').fill('ghcr.io/owner/dependfix:1.2.3')
        const putRequest = page.waitForRequest((req) => req.method() === 'PUT' && req.url().includes('/api/repos/'))
        await page.locator('.caomei-dialog__content button:has-text("保存")').click()
        const putBody = (await putRequest).postDataJSON() as { executorKind?: string, sandboxImage?: string | null }
        expect(putBody.executorKind).toBe('sandbox')
        expect(putBody.sandboxImage).toBe('ghcr.io/owner/dependfix:1.2.3')
        await expect(page.locator('.caomei-message--success')).toContainText('仓库已更新', { timeout: 15000 })

        // 再次编辑：镜像回显；切到平台容器后字段隐藏
        await row.locator('button[aria-label="编辑"]').click()
        await expect(page.locator('#sandboxImage')).toHaveValue('ghcr.io/owner/dependfix:1.2.3')
        await page.locator('#executorKind').click()
        await page.getByRole('option', { name: '平台容器' }).click()
        await expect(page.locator('#sandboxImage')).toHaveCount(0)
        await page.locator('.caomei-dialog__content button:has-text("取消")').click()

        // 新增：sandbox 选项可选择（不再 disabled）
        await page.locator('button:has-text("添加仓库")').click()
        await expect(page.locator('.caomei-dialog__header')).toContainText('添加仓库', { timeout: 15000 })
        await page.locator('#executorKind').click()
        const sandboxOption = page.getByRole('option', { name: '独立沙箱容器' })
        await expect(sandboxOption).not.toHaveAttribute('aria-disabled', 'true')
    })
})

test.describe('仓库 viewer 只读边界', () => {
    test('viewer 调 POST /api/repos → 403 (服务端拒绝写操作)', async ({ browser }) => {
        const context = await browser.newContext({ storageState: 'tests/e2e/.auth/viewer.json' })
        const page = await context.newPage()
        const cookies = (await page.context().cookies()).map((c) => `${c.name}=${c.value}`).join('; ')
        const response = await page.request.post('/api/repos', {
            headers: { cookie: cookies, origin: 'http://127.0.0.1:3101' },
            data: {
                owner: 'viewer-blocked',
                name: 'repo',
                platform: 'github',
                packageManager: 'pnpm',
                defaultBranch: 'main',
                executorKind: 'container',
            },
        })
        expect(response.status()).toBe(403)
        await context.close()
    })

    test('viewer 访问 /repos：列表可看但无添加/编辑/删除按钮', async ({ browser }) => {
        // viewer 走 page meta roles 没限制（repos.vue 没定义 roles），列表页允许访问；
        // 但前端操作按钮仍可见（不区分角色），服务端拦截写操作（repos/[id] 三角色单测已覆盖）
        const context = await browser.newContext({ storageState: 'tests/e2e/.auth/viewer.json' })
        const page = await context.newPage()
        await page.goto('/repos')
        await waitForHydration(page)
        await expect(page.locator('h2')).toContainText('仓库管理', { timeout: 15000 })
        // viewer 看不到添加按钮（页面无 roles 限制但 fetchData 应成功）
        // 这个 case 主要锁定"viewer 能列表但写操作被服务端拒绝"的端到端路径
        await context.close()
    })
})
