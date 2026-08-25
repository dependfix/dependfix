/**
 * 发布包清单（单点权威声明）。
 *
 * 新增发布包时只改此文件（+ 对应包 README），引用方自动生效：
 * - scripts/changelog.mjs（包级 CHANGELOG 生成）
 * - scripts/create-release-plan.mjs（commit 路径 → 包名映射）
 * - .github/workflows/release.yml（changelog 校验循环）
 * - docs/guide/release.md（发布指南表格由 README 链接引用，无独立清单）
 *
 * 字段说明：
 * - path：包目录（相对仓库根）
 * - pkg：包名（@dependfix/* 或裸名）
 * - changelog：包级 CHANGELOG.md 相对路径（null = 不生成包级日志）
 * - tags：tag 前缀（release:publish 发布用 `<pkg>@<version>`）
 * - publishOrder：发布顺序（被依赖方先行；越小越先发布）
 * - rootChangelog：是否作为根级 CHANGELOG 版本锚（主交付物）
 * - publishable：是否纳入发布链路（release:version/publish 仅消费 publishable: true
 *   的包；false = 未就绪包，天然不进发布链路，无需其他联动。注：release:plan 的
 *   PKG_PATH_MAP 为全量映射，未就绪包条目由 release:version 的 KNOWN_PKGS 硬校验拦截）。
 *   就绪时置 true 并启用 changelog（先例：@dependfix/mcp，2026-08-09 就绪，
 *   见 docs/plan/backlog.md §T706）。
 * - npmPublishable：是否发布到 npm。缺省 true（已有 5 个 npm 包行为不变）；
 *   显式 false 时 release:publish 跳过 pnpm publish 但仍创建 git tag（用于
 *   "版本号 + CHANGELOG + git tag"三件套而 docker-only 的发布单元，如
 *   apps/platform，见 docs/plan/todo.md §T1310）
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
        path: 'packages/engine',
        pkg: '@dependfix/engine',
        changelog: 'packages/engine/CHANGELOG.md',
        tags: { prefix: '@dependfix/engine@' },
        publishOrder: 2,
        rootChangelog: false,
        // 拆包调整完成（2026-08-09，见 docs/plan/todo.md 进行中任务），发布链路就绪
        publishable: true,
    },
    {
        path: 'packages/skills',
        pkg: '@dependfix/skills',
        changelog: 'packages/skills/CHANGELOG.md',
        tags: { prefix: '@dependfix/skills@' },
        publishOrder: 3,
        rootChangelog: false,
        publishable: true,
    },
    {
        path: 'packages/cli',
        pkg: 'dependfix',
        changelog: 'packages/cli/CHANGELOG.md',
        tags: { prefix: 'dependfix@' },
        publishOrder: 4,
        rootChangelog: true,
        publishable: true,
    },
    {
        path: 'packages/mcp',
        pkg: '@dependfix/mcp',
        // 拆包调整完成（2026-08-09，依赖切换至 engine），发布链路就绪
        changelog: 'packages/mcp/CHANGELOG.md',
        tags: { prefix: '@dependfix/mcp@' },
        publishOrder: 5,
        rootChangelog: false,
        publishable: true,
    },
    {
        // docker-only 发布单元：纳入 release 链路驱动版本号 + CHANGELOG + git tag，
        // 但不发布到 npm（见 §T1310）。npmPublishable: false → release:publish
        // 跳过 pnpm publish 但仍创建 @dependfix/platform@<version> annotated tag，
        // release.yml 完成后主动 workflow_dispatch docker.yml 传 platform_version
        // 打 platform-x.y.z docker tag
        path: 'apps/platform',
        pkg: '@dependfix/platform',
        changelog: 'apps/platform/CHANGELOG.md',
        tags: { prefix: '@dependfix/platform@' },
        publishOrder: 6,
        rootChangelog: false,
        publishable: true,
        npmPublishable: false,
    },
]

/** 按发布顺序排序的包列表（供 release 流程遍历） */
export const PACKAGES_BY_ORDER = [...PACKAGES].sort((a, b) => a.publishOrder - b.publishOrder)

/** 已就绪发布包（publishable: true） */
export const PUBLISHABLE_PACKAGES = PACKAGES.filter((p) => p.publishable)

/** 进入 npm 发布链路（npmPublishable !== false）的包：subset of PUBLISHABLE_PACKAGES */
export const NPM_PUBLISHABLE_PACKAGES = PUBLISHABLE_PACKAGES.filter((p) => p.npmPublishable !== false)

/** commit 路径 → 包名映射（create-release-plan pathToPkg 用） */
export const PKG_PATH_MAP = Object.fromEntries(PACKAGES.map((p) => [p.path, p.pkg]))

/** 主交付物（根级 CHANGELOG 版本锚） */
export const ROOT_PACKAGE = PACKAGES.find((p) => p.rootChangelog)
