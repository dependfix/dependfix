/**
 * 发布包清单（单点权威声明）。
 *
 * 新增发布包时只改此文件（+ 对应包 README），引用方自动生效：
 * - scripts/changelog.mjs（包级 CHANGELOG 生成）
 * - scripts/create-changeset.mjs（commit 路径 → 包名映射）
 * - .github/workflows/release.yml（changelog 校验循环）
 * - docs/guide/release.md（发布指南表格由 README 链接引用，无独立清单）
 *
 * 字段说明：
 * - path：包目录（相对仓库根）
 * - pkg：包名（@dependfix/* 或裸名）
 * - changelog：包级 CHANGELOG.md 相对路径（null = 不生成包级日志）
 * - tags：tag 前缀（changesets 发布用 `<pkg>@<version>`）
 * - publishOrder：发布顺序（被依赖方先行；越小越先发布）
 * - rootChangelog：是否作为根级 CHANGELOG 版本锚（主交付物）
 * - publishable：是否纳入发布链路（release.yml 校验 + changeset publish；false = 未就绪包）。
 *   **注意联动**：publishable: false 的包必须在 .changeset/config.json 的 `ignore` 中登记，
 *   否则 changeset publish 会按"本地版本未在 npm registry"将其意外发布（npm 发布不可逆）。
 *   就绪时同步移除两处声明并启用 changelog（先例：@dependfix/mcp，2026-08-09 就绪，
 *   见 docs/plan/backlog.md §T706）。
 * - changelog：包级 CHANGELOG.md 相对路径（null = 不生成包级日志；未就绪包先置 null，
 *   待发布链路就绪后再启用，避免为未发布包生成与已发布段混排的日志）
 */

export const PACKAGES = [
    {
        path: 'packages/core',
        pkg: '@dependfix/core',
        changelog: 'packages/core/CHANGELOG.md',
        tags: { prefix: '@dependfix/core@' },
        publishOrder: 1,
        rootChangelog: false,
        publishable: true,
    },
    {
        path: 'packages/skills',
        pkg: '@dependfix/skills',
        changelog: 'packages/skills/CHANGELOG.md',
        tags: { prefix: '@dependfix/skills@' },
        publishOrder: 2,
        rootChangelog: false,
        publishable: true,
    },
    {
        path: 'packages/cli',
        pkg: 'dependfix',
        changelog: 'packages/cli/CHANGELOG.md',
        tags: { prefix: 'dependfix@' },
        publishOrder: 3,
        rootChangelog: true,
        publishable: true,
    },
    {
        path: 'packages/mcp',
        pkg: '@dependfix/mcp',
        changelog: 'packages/mcp/CHANGELOG.md',
        tags: { prefix: '@dependfix/mcp@' },
        publishOrder: 4,
        rootChangelog: false,
        // 发布链路已就绪（2026-08-09，M7 T706 前置动作，见 docs/plan/backlog.md §T706）：
        // 发布前置完成后已从 .changeset/config.json ignore 同步移除
        publishable: true,
    },
]

/** 按发布顺序排序的包列表（供 release 流程遍历） */
export const PACKAGES_BY_ORDER = [...PACKAGES].sort((a, b) => a.publishOrder - b.publishOrder)

/** 已就绪发布包（publishable: true） */
export const PUBLISHABLE_PACKAGES = PACKAGES.filter((p) => p.publishable)

/** commit 路径 → 包名映射（create-changeset pathToPkg 用） */
export const PKG_PATH_MAP = Object.fromEntries(PACKAGES.map((p) => [p.path, p.pkg]))

/** 主交付物（根级 CHANGELOG 版本锚） */
export const ROOT_PACKAGE = PACKAGES.find((p) => p.rootChangelog)
