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
      details: "通过 uses: dependfix/dependfix@v1.1.0 一行接入 CI，支持定时、手动、PR 触发，可自定义验证命令。"
      link: /guide/quick-start
    - title: AI 研判 breaking change
      details: 跨大版本升级时自动采集 Changelog，多 provider 研判（DeepSeek / OpenAI），输出结构化 patch 与安全门建议。
      link: /guide/quick-start
    - title: 本地无 token 回退
      details: 无 GITHUB_TOKEN 时自动回退 pnpm audit 数据源（--alerts-source pnpm-audit），单机离线即可扫描。
      link: /design/modules/pnpm-audit-fallback
    - title: 独立管理平台
      details: Nuxt 全栈 Web UI：仓库/凭据管理、扫描触发、仪表板、RunDetailDialog、PR Check 监测；支持 Docker 一键部署。
      link: /design/governance/architecture
    - title: 自动修复 frozen-lockfile
      details: 7 类 pnpm i --frozen-lockfile 失败分类 + 多策略修复链（按文档审计与供应链信号披露）。
      link: /design/modules/pnpm-lockfile-fixer
    - title: 安全与治理
      details: PR 内容指纹去重（关旧开新）+ Token 不落盘 + 凭据最小权限注入 + 出子白名单审计 + 危险 PR 阈值阻断；安全设计入口见治理索引。
      link: /design/governance/index
    - title: 架构与数据模型
      details: 模块边界、依赖分组升级、依赖图与执行矩阵；系统级设计见架构文档。
      link: /design/governance/architecture
    - title: 路线图
      details: M0-M61 已全部归档；**1.0.0 已于 2026-11-07 发布**（npm 5 包 + `v1.0.0` + `@v1` + 镜像 `platform-1.0.0`）；**M60 平台减法与沙箱可用性已于 2026-11-15 归档**（5 原子：页面体量 / 死代码 / 筛选与级别单源 / 沙箱自检与 opt-in / 启用排障文档；M60.4 gated 真实容器取证仍为未证实项）；**M61 文档与 AI 治理（第四期）已于 2026-11-16 归档**（6 原子：归档链接前缀治本 / 大文档保序拆分 / 文档体量回归 / AI 资产机检门禁 / skill 分发面准确性 / 文档口径收口；`gates:docs` 扩至 21 项）；**M62 运行日志复盘与执行成本收口已于 2026-11-16 规划（进行中）**（6 原子：红仓库 baseline 短路 / 命令级 OOM 分层 / 跨 major 判定前移 / 只读验证链 / 安装失败逐告警结论 / 收尾未 settle 假超时）；1.0 门槛终态见 design/governance/release-1.0-readiness，插队容量治理规则见规划规范 §3.1.1。
      link: /plan/roadmap
    - title: 当前任务
      details: 查看下一阶段规划与归档历史、验收指标与依赖；待办积压与已知边界。
      link: /plan/todo
    - title: 项目规范
      details: AI 协作、开发、测试、文档、安全、Git、规划、API、平台、i18n 等 13 项规范的索引入口。
      link: /standards/index
---