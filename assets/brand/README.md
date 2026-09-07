# dependfix 品牌资产

本目录存放 dependfix 项目级品牌资产（logo / wordmark / favicon），是项目内所有视觉位点的**单一来源（Single Source of Truth）**。

## 目录结构

```
assets/brand/
└── svg/        所有矢量品牌资产（SVG 格式）
```

## 资产清单

| 文件 | 用途 | 尺寸（viewBox） | 主题 |
|:---|:---|:---:|:---|
| `svg/logo-mark.svg` | 透明背景纯 mark（叠加用） | 128×128 | — |
| `svg/logo-light.svg` | 浅色背景方版（slate-50 底 + teal mark） | 128×128 | light |
| `svg/logo-app.svg` | app icon 风格（teal 饱和底 + 白 mark） | 128×128 | app |
| `svg/logo-navy.svg` | navy 风格变体（深底 + 青 mark） | 128×128 | navy |
| `svg/lockup-light.svg` | 横版带「dependfix」文字-浅色 | 560×128 | light |
| `svg/lockup-dark.svg` | 横版带「dependfix」文字-暗色 | 560×128 | dark |
| `svg/favicon.svg` | 浏览器 favicon（小尺寸深底） | 32×32 | dark |

## 命名规范

- `logo-` 前缀：完整 logo 方版（含背景矩形），可直接作为方块图标使用。
- `lockup-`：横版组合（图标 + 项目名），用于 banner / nav 横排场景。
- `mark`：透明背景纯图形 mark，无背景矩形，可叠加到任意背景。
- 主题后缀（`light` / `dark` / `app` / `navy`）：表示该变体的视觉主题。
- `favicon`：浏览器标签页专用，刻意使用深底以保证标签栏辨识度。

## 引用方式

### 仓库根 `README.md`

使用 `<picture>` 标签实现明暗主题自动切换（GitHub 已支持）：

```markdown
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./assets/brand/svg/lockup-dark.svg">
  <img alt="dependfix" src="./assets/brand/svg/lockup-light.svg">
</picture>
```

### `docs/.vitepress/config.ts`

VitePress 公开路径由 `docs/public/` 提供，因此需要把 SVG 复制到此目录下。
引用走 `themeConfig.logo.src`：

```ts
themeConfig: {
    logo: { src: '/brand/logo-mark.svg', alt: 'dependfix' },
}
```

teal-600 主色在浅色与深色主题下都可辨识，故不需要 `{ light, dark }` 切换。

### `apps/platform`（Nuxt 4）

Nuxt 静态资源走 `apps/platform/public/`，同样需要把 SVG 复制到此目录下：

```
apps/platform/public/brand/
├── favicon.svg
├── logo-mark.svg
├── lockup-light.svg
└── lockup-dark.svg
```

在 `nuxt.config.ts` 的 `app.head` 中引用：

```ts
app: {
    head: {
        link: [
            { rel: 'icon', type: 'image/svg+xml', href: '/brand/favicon.svg' },
        ],
    },
}
```

组件内直接 `<img src="/brand/logo-mark.svg">`；auth 页用 `<picture>` 切 lockup。

## 设计要点

- **主色**：teal-600 系列，与 PrimeVue 主题 `primary[600]` 和 SCSS `$color-primary-dark` 完全对齐。
- **背景色**：浅底（slate-50）/ 饱和 teal（app 风格）/ navy 深底（slate-950）三种。
- **形状**：六边形（Dependabot 视觉语言）+ 对勾（修复语义）。
- **字体**：lockup 使用 DejaVu Sans Bold（与 npm 生态兼容）；如需替换需同步更新所有 lockup 文件。

具体 hex 色值见各 SVG 文件源码（每条 `fill=` / `stroke=` 属性即一个色值锚点）。

## 文件格式策略

项目**仅使用 SVG**，不提交 PNG 位图：

- 矢量无损缩放，文件极小（5 个 logo 平均 600B，lockup 1KB）。
- 单一主源覆盖 README / docs / Nuxt / npm 等多端。
- 暗色模式天然支持（`<picture>` / VitePress `light/dark` / CSS 媒体查询）。
- `.gitignore` 已忽略 `*.png`，不破坏项目历史规范。

如果未来需要 PNG（如 iOS apple-touch-icon），在 `assets/brand/png/` 下新增目录即可，不影响现有结构。

## 修改流程

任何对 logo 形状、配色、字体的调整都应：

1. 在本地设计稿源（建议统一存放在 `dependfix-logo` 等独立目录，按设计稿与 SVG 双轨管理）。
2. 重新导出对应 SVG 至本目录 `svg/`，保持命名规范。
3. 检查所有引用位点是否需要同步更新：
   - 仓库根 `README.md`
   - `docs/.vitepress/config.ts`
   - `apps/platform/nuxt.config.ts` + `apps/platform/app/**`
   - `packages/*/README.md`（如有）
   - 各包 `package.json` 的 `icon` 字段（如已设置）
4. 跑 `pnpm lint:md` 确保新增/修改的 markdown 通过 lint。
5. 跑 `pnpm typecheck` + 视觉回归验证（如涉及 apps/platform）。