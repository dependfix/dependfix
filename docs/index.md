---
# https://vitepress.dev/reference/default-theme-home-page
layout: home

hero:
    name: "dependfix"
    text: "自动修复 GitHub 安全告警"
    tagline: "Dependabot / Code Scanning 告警的批量、可控修复与 PR 自动创建"
    actions:
        - theme: brand
          text: 快速开始
          link: /guide/quick-start
        - theme: alt
          text: GitHub
          link: https://github.com/dependfix/dependfix

features:
    - title: CLI 一键使用
      details: report-only / fix / fix-and-pr / cleanup-branches 四类命令，npx 零依赖上手，支持 owner / topic 多仓库治理。
      link: /guide/quick-start
    - title: GitHub Action 集成
      details: "通过 uses: dependfix/dependfix@v1 一行接入 CI，支持定时、手动、PR 触发，可自定义验证命令。"
      link: /guide/quick-start
    - title: AI 研判 breaking change
      details: 跨大版本升级时自动采集 Changelog，多 provider 研判（DeepSeek / OpenAI），输出结构化 patch 与安全门建议。
      link: /guide/quick-start
    - title: 本地无 token 回退
      details: 无 GITHUB_TOKEN 时自动回退 pnpm audit 数据源（--alerts-source pnpm-audit），单机离线即可扫描。
      link: /design/packages/pnpm-audit-fallback
    - title: 独立管理平台
      details: Nuxt 全栈 Web UI：仓库/凭据管理、扫描触发、仪表板、RunDetailDialog、PR Check 监测；支持 Docker 一键部署。
      link: /design/governance/architecture#平台架构-apps-platform
    - title: Agent Skill / MCP Server
      details: dependfix-remediator skill 让 AI 助手（Claude Code / Copilot / Cursor）对话式驱动修复；MCP Server 暴露扫描/修复能力给 AI 工具。
      link: /design/governance/mcp-server
    - title: 自动修复 frozen-lockfile
      details: 7 类 pnpm i --frozen-lockfile 失败分类 + 多策略修复链（按文档审计与供应链信号披露）。
      link: /design/packages/pnpm-lockfile-fixer
    - title: 安全与治理
      details: PR 内容指纹去重（关旧开新）+ Token 不落盘 + 凭据最小权限注入 + 出子白名单审计 + 危险 PR 阈值阻断。
      link: /design/governance/security
    - title: 架构与数据模型
      details: 模块边界、依赖分组升级、依赖图与执行矩阵；系统级设计见架构文档。
      link: /design/governance/architecture
    - title: 路线图
      details: M0-M22 已全部闭环归档（2026-09-01）；当前阶段任务与未来规划见路线图与 todo。
      link: /plan/roadmap
    - title: 当前任务
      details: 查看进行中的开发任务、验收指标与依赖；待办积压与归档历史。
      link: /plan/todo
    - title: 项目规范
      details: AI 协作、开发、测试、文档、安全、Git、规划、API 等 10 项规范的索引入口。
      link: /standards/index
---