import { defineConfig } from 'vitepress'

// VitePress 多语言配置（todo.md §M26.3 + [docs-and-readme-i18n.md §6.1](../design/governance/docs-and-readme-i18n.md)）。
//
// 参照 momei 模式：
// - rewrites 把 `i18n/en-US/*` 重写为对外 URL `/*`（保留 `en-US/` 物理目录镜像但不暴露内部组织）
// - locales 配 root (zh-CN) + 'en-US'
// - nav + sidebar 每个 locale 都配（与 momei 一致）
//
// https://vitepress.dev/reference/site-config
const zhNav = [
    { text: '首页', link: '/' },
    { text: '快速开始', link: '/guide/quick-start' },
    { text: '架构设计', link: '/design/governance/architecture' },
    { text: '路线图', link: '/plan/roadmap' },
]
const enNav = [
    { text: 'Home', link: '/en-US/' },
    { text: 'Quick Start', link: '/en-US/guide/quick-start' },
    { text: 'Architecture', link: '/en-US/design/governance/architecture' },
    { text: 'Roadmap', link: '/en-US/plan/roadmap' },
]

const zhSidebar = {
    '/guide/': [
        {
            text: '指南',
            items: [
                { text: '快速开始', link: '/guide/quick-start' },
                { text: '技术栈详解', link: '/guide/tech-stack' },
                { text: '配置说明', link: '/guide/configuration' },
                { text: 'PR 自动合并配置', link: '/guide/auto-merge' },
                { text: '发布指南', link: '/guide/release' },
                { text: 'AI 协同开发', link: '/guide/ai-development' },
            ],
        },
    ],
    '/design/': [
        {
            text: '模块设计（packages）',
            items: [
                { text: '模块索引', link: '/design/packages/index' },
                { text: '系统架构', link: '/design/governance/architecture' },
                { text: '数据模型', link: '/design/packages/data-model' },
                { text: '依赖分组升级', link: '/design/packages/dependency-grouping' },
                { text: 'pnpm audit fallback', link: '/design/packages/pnpm-audit-fallback' },
            ],
        },
        {
            text: '专项设计与治理（governance）',
            items: [
                { text: '治理索引', link: '/design/governance/index' },
                { text: '安全设计', link: '/design/governance/security' },
                { text: 'GitHub Action 工作流', link: '/design/governance/github-action-workflow' },
                { text: 'MCP Server 设计（M6）', link: '/design/governance/mcp-server' },
                { text: '平台 AI 研判集成设计', link: '/design/governance/platform-ai-integration' },
            ],
        },
    ],
    '/plan/': [
        {
            text: '规划',
            items: [
                { text: '路线图', link: '/plan/roadmap' },
                { text: '当前任务', link: '/plan/todo' },
                { text: '待办积压', link: '/plan/backlog' },
            ],
        },
    ],
    '/standards/': [
        {
            text: '项目规范',
            items: [
                { text: '规范索引', link: '/standards/' },
                { text: 'AI 协作规范', link: '/standards/ai-collaboration' },
                { text: 'AI 资产治理', link: '/standards/ai-governance' },
                { text: '开发规范', link: '/standards/development' },
                { text: '测试规范', link: '/standards/testing' },
                { text: '文档规范', link: '/standards/documentation' },
                { text: '安全规范', link: '/standards/security' },
                { text: 'Git 规范', link: '/standards/git' },
                { text: '规划规范', link: '/standards/planning' },
                { text: 'API 规范', link: '/standards/api' },
                { text: '性能规范', link: '/standards/performance' },
            ],
        },
    ],
    '/research/': [
        {
            text: '调研',
            items: [
                { text: '调研规范', link: '/research/README' },
                { text: '竞品分析（2026-07）', link: '/research/2026-07-26-competitive-research' },
                { text: 'GITHUB_TOKEN 调研（2026-08）', link: '/research/2026-08-04-github-token-dependabot-bug-or-design' },
                { text: '发布工具对比（2026-08）', link: '/research/2026-08-02-release-tools-comparison' },
                { text: '成本估算（2026-06）', link: '/research/2026-06-01-cost-estimate' },
                { text: '战略思考（2026-07）', link: '/research/2026-07-26-strategy' },
            ],
        },
    ],
}

const enSidebar = {
    '/en-US/guide/': [
        {
            text: 'Guide',
            items: [
                { text: 'Quick Start', link: '/en-US/guide/quick-start' },
                { text: 'Tech Stack', link: '/en-US/guide/tech-stack' },
                { text: 'Configuration', link: '/en-US/guide/configuration' },
            ],
        },
    ],
    '/en-US/design/': [
        {
            text: 'Architecture & Governance',
            items: [
                { text: 'Governance Index', link: '/en-US/design/governance/index' },
                { text: 'Architecture', link: '/en-US/design/governance/architecture' },
                { text: 'Spec & Doc Governance', link: '/en-US/design/governance/spec-and-doc-governance' },
                { text: 'Platform AI Integration', link: '/en-US/design/governance/platform-ai-integration' },
            ],
        },
    ],
    '/en-US/plan/': [
        {
            text: 'Planning',
            items: [
                { text: 'Roadmap', link: '/en-US/plan/roadmap' },
            ],
        },
    ],
    '/en-US/standards/': [
        {
            text: 'Standards',
            items: [
                { text: 'i18n Standard', link: '/en-US/standards/i18n' },
            ],
        },
    ],
}

// rewrites 把 docs/i18n/en-US/* 重写为对外 URL /en-US/*（去掉内部 i18n/ 前缀）
const translatedDocSourcePattern = /^i18n\/(en-US)\//

export default defineConfig({
    title: 'dependfix',
    description: '自动化处理 Dependabot / Code Scanning 安全告警',
    lang: 'zh-CN',
    lastUpdated: true,
    cleanUrls: true,
    ignoreDeadLinks: true,
    // 文档站 favicon 与品牌资产（与仓库根 assets/brand/svg/ 同步；
    // 复制而非符号链接，避免 Windows + WSL 跨平台 symlink 兼容问题）
    head: [
        ['link', { rel: 'icon', type: 'image/svg+xml', href: '/brand/favicon.svg' }],
    ],

    rewrites(id) {
        return id.replace(translatedDocSourcePattern, '$1/')
    },

    locales: {
        root: {
            label: '简体中文',
            lang: 'zh-CN',
            title: 'dependfix',
            description: '自动化处理 Dependabot / Code Scanning 安全告警',
            themeConfig: {
                logo: { src: '/brand/logo-mark.svg', alt: 'dependfix' },
                search: { provider: 'local' },
                nav: zhNav,
                sidebar: zhSidebar,
                socialLinks: [
                    { icon: 'github', link: 'https://github.com/dependfix/dependfix' },
                ],
                footer: {
                    message: 'Released under the MIT License.',
                    copyright: 'Copyright © 2026 CaoMeiYouRen',
                },
            },
        },
        'en-US': {
            label: 'English',
            lang: 'en-US',
            title: 'dependfix',
            description: 'Auto-fix GitHub Dependabot / Code Scanning security alerts',
            themeConfig: {
                logo: { src: '/brand/logo-mark.svg', alt: 'dependfix' },
                search: { provider: 'local' },
                nav: enNav,
                sidebar: enSidebar,
                socialLinks: [
                    { icon: 'github', link: 'https://github.com/dependfix/dependfix' },
                ],
                footer: {
                    message: 'Released under the MIT License.',
                    copyright: 'Copyright © 2026 CaoMeiYouRen',
                },
            },
        },
    },
})
