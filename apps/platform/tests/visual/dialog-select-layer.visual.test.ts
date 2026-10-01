import { expect, type Locator, type Page, test } from '@playwright/test'
import { waitForHydration } from '../e2e/helpers/hydration.helper'
import {
    VISUAL_THEMES,
    applyTheme,
    expectThemeApplied,
    expectViewportScreenshot,
    waitForVisualStable,
} from './helpers/visual'

/**
 * 弹窗内 Select 下拉面板「裁剪 / 层级」回归（docs/plan/todo.md §M34.2 / §M34.3）。
 *
 * 背景：用户报告弹窗（`CaomeiDialog`）内 Select 展开时下拉面板被裁剪 / 层级错误。
 * 本文件含两类断言：
 *   1) 客观几何 / 层叠断言（不依赖"肉眼看截图"）——锁死四条不变量：
 *      面板经 `SelectPortal` 挂载到 body（不是弹窗后代，否则会被弹窗 `overflow` 裁剪）、
 *      面板四边在视口内、面板中心点的命中元素属于面板自身（层级高于弹窗与遮罩）、
 *      面板祖先链上不存在 `overflow != visible` 的裁剪容器；外加一条缺陷检出断言
 *      （面板有效定位层 z 必须高于弹窗内容 z）。
 *   2) 展开态视觉基线——门户面板不在弹窗子树内，故用**视口级**截图（`expectViewportScreenshot`）
 *      覆盖弹窗 + 遮罩 + 门户面板的合成结果，锁住浮层外观（层级 / 位置 / 尺寸 / 配色）的像素级漂移。
 *      截图口径：动态区域以用例 `data-visual-mask` 标记 + helper 的 `dynamicMask(page)`（选择器
 *      `[data-visual-mask]`）统一遮蔽；本用例的面板与表单内容均为静态 fixtures、无标记元素，
 *      故遮蔽为空集——**弹出层必须整块入镜**，不得靠遮蔽掩盖浮层差异。
 *
 * 同时把诊断快照（rect / z-index / overflow 链 / available-height）与截图落到 `artifacts/`
 * （gitignored），作为升级前后对比与上游 issue 的证据。
 */

/** 打开仓库表单弹窗（其 `packageManager` Select 使用静态 options，不依赖 fixtures 数据）。 */
async function openRepoFormDialog(page: Page): Promise<Locator> {
    await page.goto('/repos')
    await waitForHydration(page)
    await page.getByRole('button', { name: '添加仓库' }).click()
    const dialog = page.locator('.caomei-dialog__content')
    await expect(dialog).toBeVisible()
    return dialog
}

/** 采集面板与宿主弹窗的层叠 / 裁剪诊断（一次 evaluate 取齐，避免多次往返的时序漂移）。 */
async function readLayerDiagnostics(page: Page): Promise<Record<string, unknown>> {
    return page.evaluate(() => {
        const round = (rect: DOMRect): { x: number, y: number, w: number, h: number } => ({
            x: Math.round(rect.left),
            y: Math.round(rect.top),
            w: Math.round(rect.width),
            h: Math.round(rect.height),
        })
        const panel = document.querySelector('.caomei-select__content') as HTMLElement | null
        if (!panel) {
            return { found: false }
        }
        const rect = panel.getBoundingClientRect()
        const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
        const dialog = document.querySelector('.caomei-dialog__content') as HTMLElement | null
        const overlay = document.querySelector('.caomei-dialog__overlay') as HTMLElement | null
        const clippingAncestors: { selector: string, overflow: string, rect: { x: number, y: number, w: number, h: number } }[] = []
        let node: HTMLElement | null = panel.parentElement
        while (node) {
            const style = getComputedStyle(node)
            if (style.overflow !== 'visible' || style.overflowX !== 'visible' || style.overflowY !== 'visible') {
                clippingAncestors.push({
                    selector: `${node.tagName.toLowerCase()}.${node.className || '(no-class)'}`,
                    overflow: `${style.overflow}/${style.overflowX}/${style.overflowY}`,
                    rect: round(node.getBoundingClientRect()),
                })
            }
            node = node.parentElement
        }
        const root = getComputedStyle(document.documentElement)
        const panelStyle = getComputedStyle(panel)
        // 真正的浮层宿主：自面板向上第一个非 static 定位元素（Reka 的 SelectContent 根）
        let layer: HTMLElement | null = panel
        while (layer && getComputedStyle(layer).position === 'static') {
            layer = layer.parentElement
        }
        const layerChain: string[] = []
        let cursor: HTMLElement | null = panel.parentElement
        let depth = 0
        while (cursor && depth < 6) {
            const style = getComputedStyle(cursor)
            layerChain.push(
                `${cursor.tagName.toLowerCase()}.${cursor.className || '(no-class)'} `
                + `position=${style.position} z=${style.zIndex} `
                + `data-reka=${cursor.getAttribute('data-reka-select-content') ?? '-'} `
                + `inline=(${(cursor.getAttribute('style') ?? '').slice(0, 140)})`,
            )
            cursor = cursor.parentElement
            depth++
        }
        // 仅当祖先矩形不能容纳面板时才是真裁剪；body/root 的 overflow:hidden 属外壳常态
        const realClippingAncestors = clippingAncestors.filter(({ rect: r }) => !(
            r.x <= rect.left && r.y <= rect.top
            && r.x + r.w >= rect.right && r.y + r.h >= rect.bottom
        ))
        return {
            found: true,
            panelRect: round(rect),
            viewport: { w: window.innerWidth, h: window.innerHeight },
            fullyInViewport: rect.left >= 0
                && rect.top >= 0
                && rect.right <= window.innerWidth
                && rect.bottom <= window.innerHeight,
            panelZ: panelStyle.zIndex,
            panelPosition: panelStyle.position,
            layerSelector: layer ? `${layer.tagName.toLowerCase()}.${layer.className || '(no-class)'}` : null,
            layerPosition: layer ? getComputedStyle(layer).position : null,
            layerZ: layer ? getComputedStyle(layer).zIndex : null, layerChain,
            panelOuterHtml: panel.outerHTML.slice(0, 400),
            hitElement: hit ? `${hit.tagName.toLowerCase()}.${hit.className || '(no-class)'}` : null,
            hitInsidePanel: !!hit && (panel.contains(hit) || hit === panel),
            portaledToBody: panel.closest('.caomei-dialog__content') === null,
            panelParent: panel.parentElement?.className || null,
            dialogZ: dialog ? getComputedStyle(dialog).zIndex : null,
            overlayZ: overlay ? getComputedStyle(overlay).zIndex : null,
            selectZVar: root.getPropertyValue('--caomei-select-z-index').trim(),
            dropdownZVar: root.getPropertyValue('--caomei-z-dropdown').trim(),
            modalZVar: root.getPropertyValue('--caomei-z-modal').trim(),
            availableHeight: panelStyle.getPropertyValue('--reka-select-content-available-height').trim(),
            availableWidth: panelStyle.getPropertyValue('--reka-select-content-available-width').trim(),
            triggerWidthVar: panelStyle.getPropertyValue('--reka-select-trigger-width').trim(),
            wrapperInlineStyle: layer?.getAttribute('style') ?? null,
            panelInlineStyle: panel.getAttribute('style') ?? null,
            triggerRect: (() => {
                const trigger = document.querySelector('.caomei-dialog__content .caomei-select') as HTMLElement | null
                return trigger ? round(trigger.getBoundingClientRect()) : null
            })(),
            clippingAncestors,
            realClippingAncestors,
        }
    })
}

test.describe('弹窗内 Select 层叠回归', () => {
    test('下拉面板不被裁剪且层级高于弹窗', async ({ page }) => {
        await applyTheme(page, 'light')
        const dialog = await openRepoFormDialog(page)

        // 静态 options 的 packageManager 选择器（弹窗内第一个 Select）
        const firstTrigger = dialog.locator('.caomei-select').first()
        await expect(firstTrigger).toBeVisible()
        await expect(firstTrigger).toBeEnabled()
        await firstTrigger.click()
        const panel = page.locator('.caomei-select__content')
        // 时序硬化：触发器 hydration 完成后点击仍可能早于门户挂载，给面板单独放宽等待
        await expect(panel).toBeVisible({ timeout: 10000 })
        await waitForVisualStable(page)

        const diagnostics = await readLayerDiagnostics(page)
        // 诊断随报告留痕（attachment），不向 stdout 输出；失败时可在报告 / CI artifact 中查看
        await test.info().attach('dialog-select-diagnostics', {
            body: JSON.stringify(diagnostics, null, 2),
            contentType: 'application/json',
        })
        await test.info().attach('dialog-select-panel', {
            body: await page.screenshot(),
            contentType: 'image/png',
        })

        // ---- 以下四项为「环境不变量守卫」：0.3.0 缺陷态同样成立（由降级复跑固化），
        //      用于防止未来改用非 portal 实现 / 引入裁剪容器 / 面板越出视口 ----
        expect(diagnostics.found, '下拉面板未挂载').toBe(true)
        expect(diagnostics.panelRect).toMatchObject({ w: expect.any(Number), h: expect.any(Number) })
        expect((diagnostics.panelRect as { h: number }).h, '面板高度为 0').toBeGreaterThan(0)
        expect(diagnostics.portaledToBody, '面板未挂载到 body（会受弹窗 overflow 裁剪）').toBe(true)
        expect(diagnostics.fullyInViewport, '面板超出视口（被视口裁剪）').toBe(true)
        expect(diagnostics.hitInsidePanel, `面板中心命中元素不是面板自身：${String(diagnostics.hitElement)}`).toBe(true)
        expect(diagnostics.realClippingAncestors, '面板被祖先容器裁剪').toEqual([])
        // ---- 唯一「缺陷检出断言」：0.3.0 下必失败（1000 < 1001），0.5.0 下通过（1050 > 1001）
        //      层级序：面板「有效定位层」z 必须高于弹窗内容 z。
        // 0.3.0：面板层 z=1000（--caomei-z-overlay）< 弹窗内容 z=1001（--caomei-z-modal）
        // → 面板与遮罩同级、低于模态，能否可见取决于 DOM 顺序（本场景侥幸可见，其它流程会被盖住）；
        // 0.5.0：面板层 z=1050（--caomei-z-dropdown）> 弹窗内容 1001，层级关系确定。
        expect(
            Number(diagnostics.layerZ),
            `面板层 z=${String(diagnostics.layerZ)} 未高于弹窗内容 z=${String(diagnostics.dialogZ)}`,
        ).toBeGreaterThan(Number(diagnostics.dialogZ))
    })

    test('弹窗底部 Select（executorKind）翻转后仍不被裁剪', async ({ page }) => {
        await applyTheme(page, 'light')
        const dialog = await openRepoFormDialog(page)

        // 弹窗内最后一个 Select（表单底部，贴近弹窗/视口下沿 → 触发向上翻转路径）
        const lastSelect = dialog.locator('.caomei-select').last()
        await lastSelect.scrollIntoViewIfNeeded()
        await expect(lastSelect).toBeEnabled()
        await lastSelect.click()
        const panel = page.locator('.caomei-select__content')
        await expect(panel).toBeVisible({ timeout: 10000 })
        await waitForVisualStable(page)

        const diagnostics = await readLayerDiagnostics(page)
        await test.info().attach('dialog-select-diagnostics', {
            body: JSON.stringify(diagnostics, null, 2),
            contentType: 'application/json',
        })
        await test.info().attach('dialog-select-panel', {
            body: await page.screenshot(),
            contentType: 'image/png',
        })

        expect(diagnostics.found, '下拉面板未挂载').toBe(true)
        expect((diagnostics.panelRect as { h: number }).h, '面板高度为 0').toBeGreaterThan(0)
        expect(diagnostics.fullyInViewport, '面板超出视口（被视口裁剪）').toBe(true)
        expect(diagnostics.hitInsidePanel, `面板中心命中元素不是面板自身：${String(diagnostics.hitElement)}`).toBe(true)
        expect(diagnostics.realClippingAncestors, '面板被祖先容器裁剪').toEqual([])
    })
})

test.describe('弹窗内 Select 展开态视觉基线', () => {
    /* 展开态的像素级兜底：上面的几何 / 层叠断言锁「面板在不在正确层且不被裁剪」，
       本组锁「面板长什么样」（位置 / 尺寸 / 配色 / 与遮罩的叠色）。两主题各一张，
       因为层级与配色 token 分主题；视口截图口径见 helpers/visual.ts 的 expectViewportScreenshot。 */
    for (const theme of VISUAL_THEMES) {
        test(`弹窗内首个 Select 展开（${theme}）`, async ({ page }) => {
            await applyTheme(page, theme)
            const dialog = await openRepoFormDialog(page)

            const firstTrigger = dialog.locator('.caomei-select').first()
            await expect(firstTrigger).toBeEnabled()
            await firstTrigger.click()
            const panel = page.locator('.caomei-select__content')
            await expect(panel).toBeVisible({ timeout: 10000 })
            /* 基线前先断言面板「有选项且已挂到 body（非弹窗子树）」：门户挂载失败或选项未渲染时，
               截图会落成「只有弹窗 + 遮罩」的形态，基线被静默改成缺面板的形态（假绿）。 */
            await expect(panel.locator('[role="option"]').first()).toBeVisible()
            await expect(page.locator('.caomei-dialog__content .caomei-select__content')).toHaveCount(0)
            await waitForVisualStable(page)
            await expectThemeApplied(page, theme)
            await expectViewportScreenshot(page, `dialog-select-open-${theme}.png`)
        })
    }
})
