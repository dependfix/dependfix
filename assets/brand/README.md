# dependfix 品牌资产

本目录存放 dependfix 项目级品牌资产（logo / wordmark / favicon），是项目内所有视觉位点的**单一来源（Single Source of Truth）**。

## 目录结构

```
assets/brand/
├── svg/        矢量品牌资产（主源：mark / light / app / navy / lockup / favicon）
└── png/        位图兜底（不渲染 SVG 的平台：favicon / apple-touch-icon / og-image / banner）
```

## 资产清单

### SVG（主源，矢量）

| 文件 | 用途 | 尺寸（viewBox） | 主题 |
|:---|:---|:---:|:---|
| `svg/logo-mark.svg` | 透明背景纯 mark（叠加用） | 128×128 | — |
| `svg/logo-light.svg` | 浅色背景方版（slate-50 底 + teal mark） | 128×128 | light |
| `svg/logo-app.svg` | app icon 风格（teal 饱和底 + 白 mark） | 128×128 | app |
| `svg/logo-navy.svg` | navy 风格变体（深底 + 青 mark） | 128×128 | navy |
| `svg/lockup-light.svg` | 横版带「dependfix」文字-浅色 | 560×128 | light |
| `svg/lockup-dark.svg` | 横版带「dependfix」文字-暗色 | 560×128 | dark |
| `svg/favicon.svg` | 浏览器 favicon（小尺寸深底） | 32×32 | dark |

### PNG（兜底，位图）

| 文件 | 用途 | 尺寸 | 适用平台 |
|:---|:---|:---:|:---|
| `png/favicon-32.png` | 浏览器 favicon PNG 兜底 | 32×32 | 旧浏览器 / 部分桌面 dock |
| `png/favicon-64.png` | 浏览器 favicon PNG 兜底 | 64×64 | 同上（更高分辨率） |
| `png/apple-touch-icon.png` | iOS Safari 主屏图标 | 180×180 | iOS / iPadOS（强制 PNG） |
| `png/og-image.png` | 社交分享卡片 | 1200×630 | Twitter / Facebook / LinkedIn / 微信 |
| `png/banner.png` | README 头部 banner | 1280×640 | GitHub / npm / 不渲染 SVG 的 Markdown 渲染器 |

## 命名规范

- `logo-` 前缀：完整 logo 方版（含背景矩形），可直接作为方块图标使用。
- `lockup-`：横版组合（图标 + 项目名），用于 banner / nav 横排场景。
- `mark`：透明背景纯图形 mark，无背景矩形，可叠加到任意背景。
- 主题后缀（`light` / `dark` / `app` / `navy`）：表示该变体的视觉主题。
- `favicon`：浏览器标签页专用，刻意使用深底以保证标签栏辨识度。

## 引用方式

### 仓库根 `README.md`

使用 `<picture>` 标签：暗色模式浏览器显示 SVG（清晰、矢量），其他场景 fallback 到 PNG banner（兼容老渲染器 / 邮件客户端 / 部分平台）：

```markdown
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./assets/brand/svg/lockup-dark.svg">
  <img alt="dependfix" src="./assets/brand/png/banner.png">
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

Nuxt 静态资源走 `apps/platform/public/`，SVG + PNG 都要复制到此目录下：

```
apps/platform/public/brand/
├── favicon.svg          # SVG 优先
├── favicon-32.png       # PNG 兜底
├── apple-touch-icon.png # iOS 强制 PNG
├── og-image.png         # 社交分享卡片
├── logo-mark.svg
├── lockup-light.svg
└── lockup-dark.svg
```

在 `nuxt.config.ts` 的 `app.head` 中同时声明 SVG + PNG + og:image：

```ts
app: {
    head: {
        meta: [
            { property: 'og:image', content: '/brand/og-image.png' },
            { property: 'og:image:width', content: '1200' },
            { property: 'og:image:height', content: '630' },
            { name: 'twitter:card', content: 'summary_large_image' },
        ],
        link: [
            { rel: 'icon', type: 'image/svg+xml', href: '/brand/favicon.svg' },
            { rel: 'alternate icon', type: 'image/png', sizes: '32x32', href: '/brand/favicon-32.png' },
            { rel: 'apple-touch-icon', sizes: '180x180', href: '/brand/apple-touch-icon.png' },
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

项目**以 SVG 为主，PNG 为必要场景兜底**：

- **SVG**（主源）：矢量无损缩放，文件极小（5 个 logo 平均 600B，lockup 1KB）。覆盖 README / docs / Nuxt / npm 等多端；暗色模式天然支持（`<picture>` / VitePress `light/dark` / CSS 媒体查询）。
- **PNG**（兜底）：覆盖不渲染 SVG 的场景——iOS Safari 主屏图标（强制 PNG）、社交分享卡片（og:image 多数平台接受 PNG）、README 在邮件客户端 / 老 Markdown 渲染器的 fallback。

`.gitignore` 已加例外 `!assets/brand/png/*.png` 和 `!apps/platform/public/brand/*.png`，仅放行品牌资产目录，其他 `*.png` 仍默认忽略。

## 修改流程

任何对 logo 形状、配色、字体的调整都应：

1. 在本地设计稿源（建议统一存放在 `dependfix-logo` 等独立目录，按设计稿与 SVG 双轨管理）。
2. 重新导出对应 SVG 至本目录 `svg/`，保持命名规范。
3. 对需要 PNG 的变体，用 Python（PIL / Pillow）从 SVG 渲染或从原始 PNG 调整尺寸：
   - `favicon-32.png`（32×32）/ `favicon-64.png`（64×64）：从 SVG 渲染或从更大 PNG 缩放
   - `apple-touch-icon.png`（180×180）：iOS 标准尺寸
   - `og-image.png`（1200×630）：Twitter / Facebook 推荐尺寸，可用 lockup SVG letterbox 生成
   - `banner.png`（1280×640）：README banner，从原始 1024×1024 mark 加 lockup 文字生成
4. 同步更新公共目录副本（保持与主源 byte-identical）：
   - `docs/public/brand/` 副本（VitePress 静态资源）
   - `apps/platform/public/brand/` 副本（Nuxt 静态资源，含 SVG + PNG 两套）
5. 检查所有引用位点是否需要同步更新：
   - 仓库根 `README.md`（banner 用 `<picture>` 配 SVG + PNG fallback）
   - `docs/.vitepress/config.ts`（仅 favicon + logo，无 og:image）
   - `apps/platform/nuxt.config.ts`（SVG + PNG 都要声明）+ `apps/platform/app/**`（组件用 SVG）
   - `packages/*/README.md`（如有）
   - 各包 `package.json` 的 `icon` 字段（如已设置）
6. 跑 `pnpm lint:md` 确保新增/修改的 markdown 通过 lint。
7. 跑 `pnpm typecheck` + `pnpm --filter dependfix-docs build` + 视觉回归验证（如涉及 apps/platform）。