# 路线图阶段详情：M53

> 本分片由 2026-11-01 M53 阶段归档批次从 [roadmap.md](../roadmap.md) 迁出；正文保留规划与收口口径，相对链接按新位置重指。
> 对应阶段正文与证据见 [todo-archive-phases-m53.md](todo-archive-phases-m53.md)。

---

## M53: 发布工程（1.0-G 批次 / 2026-10-31 规划 / 2026-11-01 已闭环 + 归档）

M53 承接 1.0 台账 G 批次的**可提前执行部分**：G2 契约冻结与迁移指南（M53.1）、G7 运维实测与发布自动化预演（M53.2）、G8 指标脚本 + G5 mutation 扩面（M53.3）、发布链预演与安装/升级实测（M53.4，**不真发**）、G3 真实环境矩阵执行框架（M53.5，实跑待外部资源）。用户 2026-10-31 决策：范围取 5 原子，`0.6.1` 只预演不真发，M52 残余只并入 zh CLI 表。

**不在本阶段闭环**：G3 实跑（OAuth / IdP / staging / 测试仓 / AI Key 与预算待用户提供）、G4 CI 窗口（20 连绿或 2 周无红，时间项）、`@v1`（需 1.0.0 已发布）、1.0.0 发布本身。

**执行特点**：每原子按「工具 / 契约 → 实测或内容 → 收口登记」多段提交；阶段首父链 **40 commits**，唯一 diff **69 文件 / +6168 −550**；审计以分区 standard/deep 为主，M53.2 与 M53.4 均经历 Reject → 收口 → Pass。执行期命中并修复 3 处运维 / 发布链阻断缺陷（worker 队列消费者启动点、WAL 备份、Docker 预算与派发判据）与 1 条 code scanning high（alert 30）。**2026-11-01 追加临时待办**（登录页第三方登录按钮品牌化，4 commits）与 **Google OAuth 暂不可测**口径（无可用 Google 账号，先只测 GitHub）同批登记。

**收口口径**：5 原子 + 1 批追加全部闭环；`gates:docs` 保持 20 项；契约冻结 / G7 / G8 / G5 mutation 证据可复算；G3 只到「执行框架 + G3.8 partial」，不写成通过；0.6.1 只预演未真发。推送后 CI 全绿（Test / CodeQL / Docs），Code Scanning 开放告警 0，Dependabot 开放 2 条（medium / low，不阻断）。残余（G3 实跑资源、G4 / G8 窗口、Docker 远端镜像复核、1.0 是否接受 Google 未测）已登记 [backlog.md](../backlog.md) / [release-1.0-readiness.md](../../design/governance/release-1.0-readiness.md)；下一阶段为 **1.0.0 发布窗口决策**（待规划）。
