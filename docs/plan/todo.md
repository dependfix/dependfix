# 当前阶段任务

> **M11 全部闭环（2026-08-20）**：C58 + C-ENV-CHANGE-ALERT + T1005 + C28 + C53-后-A/B/C + C56/C57 全部闭环 → 22 commits 总投入；详见 [backlog.md §M11](backlog.md#m11-业务可见性--沙箱落地--安全文档2026-08-20-已闭环) 摘要表 + [archive/todo-archive-phases-m11.md](archive/todo-archive-phases-m11.md) 详细归档（含 commit 引用 / 决策记录 / 历史教训）。
>
> **2026-08-20 e2e 修复批次（C62/C63/C64 + chore）**：闭环 CI run 32382730911 code-scanning #23/#24/#25 + CI run 32383730911 6 个 e2e 失败 + 本机 e2e 实测暴露的 PrimeVue 4 + Nuxt hydration 兼容性 → 全量 platform e2e **54 passed / 2 skipped / 0 failed**。详见 [todo-archive.md §2026-08-20 e2e 修复批次](todo-archive.md#2026-08-20-e2e-修复批次-c62-c63-c64-chore)。
>
> **本批次 ahead 8 commits**（C63/C64 + chore 8 个 commits ahead of origin/master；C62 三 commits `0b5a1b5` / `2e9d9a8` / `f457a9a` 已随 M11 收口批次推送至 origin/master，详见本表下方"已随 M11 推送"清单）：
>
> | # | commit | 内容 |
> |:--|:--|:--|
> | 1 | `384dec8` | fix(platform): env-events 筛选按钮 class 与 filter-field 区分（C63-1） |
> | 2 | `f41c794` | test(platform): e2e global-setup 增加 viewer.json 生成（C63-2） |
> | 3 | `646b256` | test(platform): alerts-rowgroup e2e 加 /api/alerts mock 闭环 rowGroup 依赖（C63-3） |
> | 4 | `8ea7b12` | test(platform): env-events e2e mock 全部前移到 goto 之前（C63-4） |
> | 5 | `de28ae4` | fix(platform): alerts expandedPackages 类型订正为数组（C64-1） |
> | 6 | `1ab7155` | test(platform): env-events DataTable wrapper class 订正到 PrimeVue 4（C64-2） |
> | 7 | `6f6fe5b` | test(platform): alerts-rowgroup e2e mock 闭环 + PrimeVue hydration fixme（C64-3） |
> | 8 | `3290ee5` | chore: 根 .gitignore 补加 test-results/ + playwright-report/ |
>
> **C62 三 commits 已随 M11 收口批次推送至 origin/master**（不在 ahead 列表）：
>
> | # | commit | 内容 |
> |:--|:--|:--|
> | C62-1 | `0b5a1b5` | fix(scripts): check-docs HTML 注释正则补全未配对分支（CodeQL #25） |
> | C62-2 | `2e9d9a8` | test(engine): verification-runner URL 断言改用精确主机名匹配（CodeQL #24） |
> | C62-3 | `f457a9a` | test(engine): network-audit URL 断言改用精确主机名匹配（CodeQL #23） |
>
> **审计闭环（C62/C63/C64 批次）**：
> - CodeQL 告警修复（CI run 32382730911 / C62 三 commits）：quick Pass（lint 0 / typecheck 0 / 定向单测 74 pass / 编号扫描零新增）
> - e2e 6 失败修复（CI run 32383730911 / C63 四 commits）：standard Pass（0 blocker / 3 warning / 4 suggest，全为本批次范围外既有行为或非阻塞风险）
> - 本机 e2e PrimeVue 兼容性修复（C64 三 commits）：standard Pass（0 blocker / 0 warning / 1 suggest）
>
> **验证矩阵（最终）**：platform e2e **54 passed / 2 skipped / 0 failed** / engine 单测全绿 / branches 80%+ 维持 / lint 0 error / typecheck 0 error / build ✨
>
> **M11 阶段全部闭环**：P2 三项（T1005-B + C28 + C53-后-A）+ P1 T1005-A/C + P3 C53-后-B/C + C56/C57 + C58 + C-ENV-CHANGE-ALERT 全部归档。

> **近期归档批次（主窗口保留 4 个）**：[todo-archive.md](todo-archive.md)——**[§2026-08-20 e2e 修复批次](todo-archive.md#2026-08-20-e2e-修复批次-c62-c63-c64-chore)**（本批次共 11 commits：8 ahead C63/C64+chore + 3 已随 M11 推送的 C62；C62 code-scanning #23/#24/#25 + C63 e2e 6 失败修复 + C64 PrimeVue 4 兼容性 + chore .gitignore）+ **[§2026-08-20 平台 UI 增强 C59-C61](todo-archive.md#2026-08-20-平台-ui-增强c59-c60-c61)** + **[§2026-08-20 M11 推进批次](todo-archive.md#2026-08-20-m11-推进批次业务可见性--沙箱落地--安全文档--通知基建)**。**更早期归档分片**：[archive/todo-archive-phases-m11.md](archive/todo-archive-phases-m11.md)（M9 / 2026-08-19 PR1-PR3 / 2026-08-19 C54+C55 / M11 详细段）+ [archive/todo-archive-phases-m6-m7-t711.md](archive/todo-archive-phases-m6-m7-t711.md)（M6 / M7.1 / M7.2 / T711 / M8 — 2026-08-20 neat-freak 批次 + M8 补入）+ [archive/todo-archive-phases-m0-m1.md](archive/todo-archive-phases-m0-m1.md)（M0 / M1）+ [archive/todo-archive-phases-m2-m55.md](archive/todo-archive-phases-m2-m55.md)（M2-M5.5）

> **未完成项目（backlog 仍活跃）**：详见 [backlog.md](backlog.md)——
> - **已延期 / 暂缓**：T705（生产部署 / PostgreSQL+Helm+Sentry）、T703（跨平台 Git / GitLab+Bitbucket）、C30（Docker CI 暂缓）
> - **远期登记**：C33 MCP P3 / C36 服务端 API 错误消息 i18n / C37 语言偏好多设备同步 / D1-D8 多组织 / SAML 2.0 SSO / B1-B2 PR 关闭评论 / T905 worktree 预案 / C21-C24 Code Quality / C34 存量规范盘点 / T701-e2e 管理端点集成测试
> - **本批次新增 known-issue（PrimeVue 4 + Nuxt hydration）**：2 个 alerts-rowgroup rowGroup 测试 `.fixme` 标记 —— 修复路径：迁移 alerts 加载到 `useAsyncData` 让 SSR 阶段就有数据，或升级 PrimeVue 到修复版本；详见 [todo-archive.md §2026-08-20 e2e 修复批次 / C64-3](todo-archive.md#2026-08-20-e2e-修复批次-c62-c63-c64-chore)
>
> **T705 / T703 已延期（2026-08-12 用户指示）**：生产级部署（PostgreSQL/Helm/Sentry）与跨平台 Git（GitLab/Bitbucket）暂缓排期，详见 [backlog.md §M7.2](backlog.md#m72-平台能力深化)

---

## 待人工验收（真实环境，随可用性推进）

- **T701 真实凭据 3 项**：真实 GitHub/Google OAuth 登录闭环（需 OAuth App 凭据）、真实 IdP OIDC 登录闭环（需 RFC 9207 iss 回显支持）、构建期配置凭据后按钮显示路径实测——[archive/todo-archive-phases-m6-m7-t711.md §M7.1](archive/todo-archive-phases-m6-m7-t711.md#m71-认证与用户体系已归档)
- **T702 HTTP 层状态流转**：pending→running→completed + 前端轮询体验（需后台服务/staging 或 CI redis service）
- **T704 async 定时触发**：BullMQ upsertJobScheduler 短间隔 every 集成测试（需 Redis >= 5）；Schedule CRUD e2e 补覆盖（当前单测 44 例，e2e 未覆盖）
- **发布管线收尾（P3）**：release:auto-version 完整流程待 schedule 启用后首个 cron 裁决；main 副作用路径测试观察项

## 已知边界

- **npx skills GitHub 源端到端验证**（M5.5 遗留，本机 clone github.com 网络受限）依赖 CI 端到端裁决
- 其他 backlog 项详见 [backlog.md](backlog.md)，不在 todo.md 重复列出


