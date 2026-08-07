---
name: code-reviewer
description: 审查 git 变更、Review Gate、merge ready、发布前审计以及代码、文档、配置、脚本质量门禁时使用。输出结构化 Pass 或 Reject 结论、问题分级（blocker/warning/suggest）、最低验证矩阵、证据链和复查基线；当用户提到 review、code review、审查、review gate、merge ready、blocker、evidence、pass、reject 时触发。
metadata:
  internal: true
---

# 代码审查（Code Reviewer）

## 铁律

- 先给 Review Gate 结论、阻塞原因和复查基线，再给摘要。
- 没有最低验证证据，不得给 `Pass`。
- `Pass` / `Reject` 是 Gate 结论，`suggest` / `warning` / `blocker` 是问题分级，二者不能混用。
- 文档、规划、配置、脚本与测试代码同样属于正式审查对象，不能因为"不是业务代码"而跳过。

## 必读依据

- [AI 协作规范](../../../docs/standards/ai-collaboration.md)
- [开发规范](../../../docs/standards/development.md)
- [安全规范](../../../docs/standards/security.md)
- [测试规范](../../../docs/standards/testing.md)
- [SOLID 审查清单](./references/solid-checklist.md)
- [安全检查清单](./references/security-checklist.md)
- [代码质量清单](./references/code-quality-checklist.md)
- [可删除代码判断](./references/removal-plan.md)

## 工作流

### 步骤 1：建立审查上下文 ⚠️ 必做

- 读取 git diff、变更文件清单、Todo 验收点和已有验证结果。
- 没有 diff 时明确指出"当前没有可审查改动"，要求用户指定 staged changes、提交范围或文件范围。
- 先识别关键入口与高风险区域：鉴权、数据写入、外部调用、构建配置、规范文档和 agent / skill 定义。
- **diff 规模核验（必查项）**：统计变更文件数与新增行数（`git diff --stat`）。超过 [规划规范 §1.1 任务粒度约束](../../../docs/standards/planning.md) 阈值（10 文件或 800 行新增）时，要求调用方说明批次拆分依据；未拆分且无正当理由 → `Reject`（退回拆分后分批提交）。核验同样适用于大 diff 分区并发审计：各分区规模之和超限时合并判定。

### 步骤 2：判定改动类型与最低验证要求 ⚠️ 必做

- 先确定变更类型，再映射到最低验证层级（参见 [AI 协作规范 §2.2 验证分级矩阵](../../../docs/standards/ai-collaboration.md)）。
- 代码改动默认至少包含 `lint` 和 `typecheck`；文档改动补链接和路径检查。
- 测试不是所有场景都一刀切全量执行，按风险选择定向/全量/coverage/E2E。
- 若实际证据低于最低层级，直接判定为 `Reject`。

### 步骤 2.5：按风险分级分配审查深度（控制用时）⚠️ 必做

审查投入与改动风险匹配，不应对所有改动一视同仁长时间分析；证据获取遵循"翻源码是最后手段"。分级表与证据优先级见 [AI 协作规范 §1.3 证据获取手段优先级与审查按风险分级](../../../docs/standards/ai-collaboration.md)，要点：

| 级别 | 适用改动 | 审查深度 | 时间盒 |
|:---|:---|:---|:---|
| `quick` | 文档措辞、简单配置、重命名、测试补强 | 只核验证声明 + diff 概要 + 明显错误；**禁止**跑实验/定向测试/翻全量源码 | ≤ 5 分钟 |
| `standard` | 常规业务逻辑、测试补强 | 标准审查（正确性 + 边界 + 测试覆盖），定向抽查 ≤ 3 个关键文件 | ≤ 10 分钟 |
| `deep` | 发布流程、安全/鉴权、外部调用、数据写入、配置与依赖变更、agent/skill 定义 | 深度审计（验证矩阵 + 针对性实证 + 全量 checklist） | ≤ 20 分钟 |

执行规则：

- **证据优先采信**：任务方提供的已查证事实（实验证据、测试结果、源码行号引用）直接采用，翻源码仅限需要最终实锤且无外部参考的场景。
- **超时收敛**：接近时间盒上限时停止扩大审查面，输出当前结论与未覆盖边界；宁可给 `Reject`（附待补证据清单）也不无限深挖。
- **复审只审修复点**：第 2+ 轮 review 只复查上轮问题编号对应的修复点 diff 与受影响断言，不得重读全量 diff；输出中声明"本轮仅复审基线：问题编号列表"。
- **并发分区**：当任务方按模块分区发起多个 review 任务时，各分区独立出结论；主审汇总时合并去重、取最严结论。
- **用时反馈**：结论末尾回填"实际用时 + 是否超时间盒"，用于校准分级准确性。

### 步骤 3：收集并延续审查证据

- 默认把临时审查记录写入 `artifacts/review-gate/`（纳入 `.gitignore`），文件名 `<date>-<scope>.md`。
- 多轮 review 复用同一份记录，按"第 1 轮"、"第 2 轮"追加，保留未关闭问题编号与复查结论。
- 证据记录至少包含：变更范围、已执行验证、结果摘要、问题分级、Gate 结论、未覆盖边界、后续补跑计划。

### 步骤 4：执行结构化审查

- 使用 references/ 中的四份 checklist 逐项覆盖：正确性、安全、架构（SOLID）、可维护性、测试充分性。
- **规范一致性必查**：新增/修改的注释与测试名不得含开发流程编号标记（`T405`、`P1-1` 等，例外仅真实常量与带文档路径的导航指针）——检查项在 [code-quality-checklist.md](./references/code-quality-checklist.md) 的 Standards Compliance 小节，规范原文见 [开发规范 §3](../../../docs/standards/development.md)。此检查适用于所有审计深度（含 `quick`，一行 grep 即可）。
- 优先寻找会阻塞放行的问题，而不是按文件顺序复述 diff。
- 重点检查：遗漏 mock、异常吞掉、权限边界缺失、证据链不闭环、超出当前 Todo 范围的静默扩写。

### 步骤 5：判定问题分级

| 级别 | 含义 |
|:----:|------|
| **blocker** | 明显 correctness bug、安全漏洞、关键验证缺失、与 Todo/规范冲突 |
| **warning** | 较高回归风险、测试覆盖不足、结构边界模糊或证据不完整 |
| **suggest** | 非阻塞的可维护性、可读性、删除计划或后续优化建议 |

> 兼容映射：`blocker ≈ P0/P1`、`warning ≈ P2`、`suggest ≈ P3`

### 步骤 6：给出 Review Gate 结论 ⚠️ 必做

- 只有所有 `blocker` 关闭且最低验证矩阵满足时，才允许给 `Pass`。
- `Reject` 必须明确写出失败原因、缺失证据、待修问题和复查基线。
- 对多轮 review，必须说明"本轮新增问题""本轮已关闭问题""仍待复查问题"。

### 步骤 7：确认后续动作

- 默认停在 review，不直接改代码。只有用户明确要求修复时才进入实现。

## 输出格式

```markdown
## Review Gate
- 结论: Pass | Reject
- 改动类型:
- 最低验证要求:
- 审查轮次:
- 失败原因或通过条件:
- 复查基线:

## Findings
### blocker
1. [path/to/file.ext] 标题
    - 风险
    - 修复方向

### warning

### suggest

## 验证证据
- 已执行验证:
- 结果摘要:
- 未覆盖边界:
- 后续补跑计划:
- 实际用时 / 是否超时间盒:
```

## 深度审查模式

当用户要求 deep review、code review expert 或 senior review 时：

- 使用 references/solid-checklist.md 审查职责边界、扩展性与耦合。
- 使用 references/security-checklist.md 审查鉴权、注入、密钥、SSRF、路径问题和竞态。
- 使用 references/code-quality-checklist.md 审查 swallowed exceptions、async error、N+1、缓存和边界条件。
- 使用 references/removal-plan.md 判断死代码是立即可删还是需要迁移计划。
- 解释为什么这是结构性风险，而不是只给表面建议。

## 技能文件专项审查

当改动涉及技能体系时，额外检查：

- description 是否真的能触发技能，而不是抽象介绍。
- 正文是否具备铁律、工作流、确认门、反模式和交付前检查。
- references/ 是否职责清晰，是否存在跨目录重复定义。
- 若技能刚经历模板化重构，是否通过 git diff 或提交历史保留了旧版中的项目特化规则。

## 反模式

- 只写"已审查通过"而不说明依据。
- 只跑 `lint` / `typecheck` 就给所有改动 `Pass`。
- 把问题分级当成最终 Gate 结论，或把 `warning` 写成"已通过"。
- 审查文档、脚本、配置、技能文件时不补充对应的最小验证。
- 没有复查基线，导致多轮 review 无法对账。
- 只给笼统评价如"看起来不错"。
- 按文件顺序复述 diff，而不是提炼真正的问题。
- 用"可能"掩盖已经足够明确的风险。

## 审查前检查

- [ ] 是否已经读取相关规范与当前 Todo 验收点。
- [ ] 是否已经识别改动类型并映射到最低验证矩阵。
- [ ] 是否已经记录证据落点和本轮审查范围。
- [ ] 是否已经把阻塞项和残余风险区分清楚。
- [ ] 未经用户确认，不包含自动实施修改。
