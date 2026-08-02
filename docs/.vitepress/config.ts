import { defineConfig } from 'vitepress'

// https://vitepress.dev/reference/site-config
export default defineConfig({
    title: 'dependfix',
    description: '自动化处理 Dependabot / Code Scanning 安全告警',
    lang: 'zh-CN',
    lastUpdated: true,
    cleanUrls: true,
    ignoreDeadLinks: true,

    themeConfig: {
        search: {
            provider: 'local',
        },
        nav: [
            { text: '首页', link: '/' },
            { text: '快速开始', link: '/guide/quick-start' },
            { text: '架构设计', link: '/design/architecture' },
            { text: '路线图', link: '/plan/roadmap' },
        ],
        sidebar: {
            '/guide/': [
                {
                    text: '指南',
                    items: [
                        { text: '快速开始', link: '/guide/quick-start' },
                        { text: '技术栈详解', link: '/guide/tech-stack' },
                        { text: '配置说明', link: '/guide/configuration' },
                        { text: '发布指南', link: '/guide/release' },
                        { text: 'AI 协同开发', link: '/guide/ai-development' },
                    ],
                },
            ],
            '/design/': [
                {
                    text: '设计文档',
                    items: [
                        { text: '系统架构', link: '/design/architecture' },
                        { text: '数据模型', link: '/design/data-model' },
                        { text: '安全设计', link: '/design/security' },
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
                        { text: '竞品分析', link: '/research/competitive-research' },
                        { text: '竞品分析 2026-07', link: '/research/competitive-research-2026-07' },
                        { text: '成本估算', link: '/research/cost-estimate' },
                        { text: '战略思考', link: '/research/strategy' },
                    ],
                },
            ],
        },
        socialLinks: [
            { icon: 'github', link: 'https://github.com/dependfix/dependfix' },
        ],
        footer: {
            message: 'Released under the MIT License.',
            copyright: 'Copyright © 2026 CaoMeiYouRen',
        },
    },
})
