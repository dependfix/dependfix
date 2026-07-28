# 当前阶段任务（M0-M1）

> 当前聚焦 M0（基线收敛）和 M1（MVP 单仓库修复）。
> M2 及之后阶段的任务见 [backlog.md](backlog.md)。

## M0: 基线收敛

目标：把项目从模板状态收敛到可承载自动化方案的基础形态。

### T001 建立 Monorepo 项目骨架

- 状态：`已完成`
- 交付物：Monorepo 目录结构与最小入口代码
- [x] packages/core：核心域层（错误、日志、告警模型、过滤器、规划器、报告、工具链、通用工具）
- [x] packages/cli：CLI 入口、配置层、GitHub 集成层、修复器目录、执行器
- [x] pnpm workspace 配置，pnpm-workspace.yaml 迁移 overrides
- [x] `@dependfix/core` 可独立构建（ESM + CJS + dts）
- [x] `dependfix` CLI 包依赖 `@dependfix/core: workspace:*`，可独立构建
- [x] `pnpm build` / `pnpm typecheck` / `pnpm test` 全部通过

### T002 定义核心配置模型

- 状态：`已完成`
- 交付物：配置类型、默认配置、环境变量读取逻辑
- [x] 定义运行模式、严重级别阈值、仓库列表、dry-run 等配置项
- [x] 支持环境变量与 CLI 参数合并
- [x] 缺失关键配置时能输出可读错误

### T003 固定工具链策略

- 状态：`已完成`
- 依赖：T001
- 交付物：ToolchainInfo / ToolchainRecord 类型定义与版本解析逻辑
- [x] 定义运行时 Node 与 pnpm 版本来源优先级（packageManager → 环境变量 → config → runtime）
- [x] 在 `@dependfix/core` 中实现 `resolveToolchainVersions()` 和 `createDefaultToolchain()`
- [x] 设计 lockfile 修复前后的工具链记录字段（ToolchainRecord.before/after）

### T004 定义标准告警模型

- 状态：`已完成`
- 依赖：T001
- 交付物：NormalizedSecurityAlert 类型、严重级别映射、FixStrategy 枚举
- [x] 定义 Dependabot 与 Code Scanning 的共同字段（NormalizedSecurityAlert 接口）
- [x] 定义严重级别映射（SEVERITY_MAP + mapCodeScanningSeverity）
- [x] 定义 fixable、fixStrategy、recommendedVersion 等扩展字段
- [x] 保留 AlertReference 作为向后兼容的简化类型

---

## M1: MVP 单仓库自动修复

目标：跑通单仓库、Node.js / pnpm 生态下的 Dependabot 告警拉取、过滤、修复、验证和报告。

### T101 实现仓库选择能力

- 优先级：`P0`
- 依赖：T002
- [ ] 支持 CLI 传入单个仓库
- [ ] 支持逗号分隔或文件形式传入多个仓库
- [ ] 对非法仓库标识进行校验

### T102 实现 GitHub 客户端封装

- 优先级：`P0`
- 依赖：T002, T004
- [ ] 封装认证初始化
- [ ] 封装仓库基础信息读取
- [ ] 封装安全告警查询接口

### T103 接入 Dependabot Alerts 拉取

- 优先级：`P0`
- 依赖：T102, T004
- [ ] 拉取 open 状态告警
- [ ] 解析受影响包、版本建议、生态类型
- [ ] 转换为标准告警模型

### T104 实现告警过滤与优先级引擎

- 优先级：`P0`
- 依赖：T103
- [ ] 支持 critical/high/medium/all 阈值过滤
- [ ] 支持 fixable 优先
- [ ] 支持每仓库最大处理数限制

### T105 实现依赖升级修复器

- 优先级：`P0`
- 依赖：T103, T104, T003
- [ ] 支持按包名和建议版本执行升级
- [ ] 支持更新 package.json 与 pnpm-lock.yaml
- [ ] 为升级动作记录变更摘要

### T106 实现 pnpm frozen-lockfile 修复器

- 优先级：`P0`
- 依赖：T003, T105
- [ ] 识别 lockfile 漂移类失败
- [ ] 在固定 Node / pnpm 版本下执行 lockfile 修复
- [ ] 对凭证、冲突、版本问题做失败分类

### T107 实现最小验证执行器

- 优先级：`P0`
- 依赖：T105, T106
- [ ] 默认支持 install、lint、build
- [ ] 记录每一步执行耗时与结果

### T108 实现 Markdown / JSON 报告生成

- 优先级：`P0`
- 依赖：T103, T104, T105, T106, T107
- [ ] 输出运行摘要
- [ ] 输出按仓库与按告警的执行明细
- [ ] 输出失败分类与未修复原因

### T109 实现本地运行入口

- 优先级：`P0`
- 依赖：T101, T108
- [ ] 支持 report-only
- [ ] 支持 fix
- [ ] 预留 fix-and-pr 模式参数

---

## MVP 完成判定

满足以下条件时 M1 视为达成：

- [ ] 能手动指定一个仓库执行任务
- [ ] 能拉取 Dependabot alerts 并完成严重级别过滤
- [ ] 能对可升级依赖执行自动修复
- [ ] 能处理典型 `pnpm i --frozen-lockfile` 漂移错误
- [ ] 能执行最小验证并输出成功或失败原因
- [ ] 能生成 Markdown 和 JSON 报告
- [ ] 本地命令链路可稳定复现

---

## 横切任务

### T901 测试与样例数据

- [ ] 准备 Dependabot 告警样例数据
- [ ] 准备 lockfile 漂移失败样例
- [ ] 准备 Code Scanning 样例数据

### T902 单元测试与集成测试

- [ ] 标准化模型与过滤规则单测
- [ ] lockfile 修复器关键路径测试
- [ ] 报告生成器结构测试

### T903 日志、错误码与审计字段统一

- [ ] 定义 runId、repository、alertId、step 等核心字段
- [ ] 定义错误分类与错误码
- [ ] 确保日志中不泄漏敏感信息

### T904 文档同步

> 详细定义见 [backlog.md §横切任务（后续阶段）](backlog.md#横切任务后续阶段)。
