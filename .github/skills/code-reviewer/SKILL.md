---
name: code-reviewer
description: 审查 git 变更、Review Gate、merge ready、发布前审计以及代码、文档、配置、脚本质量门禁时使用。输出结构化 Pass 或 Reject 结论、问题分级（blocker/warning/suggest）、最低验证矩阵、证据链和复查基线；当用户提到 review、code review、审查、review gate、merge ready、blocker、evidence、pass、reject 时触发。
---

# Code Reviewer

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

### Step 1: 建立审查上下文 ⚠️ REQUIRED

- 读取 git diff、变更文件清单、Todo 验收点和已有验证结果。
- 没有 diff 时明确指出"当前没有可审查改动"，要求用户指定 staged changes、提交范围或文件范围。
- 先识别关键入口与高风险区域：鉴权、数据写入、外部调用、构建配置、规范文档和 agent / skill 定义。

### Step 2: 判定改动类型与最低验证要求 ⚠️ REQUIRED

- 先确定变更类型，再映射到最低验证层级（参见 [AI 协作规范 §2.2 验证分级矩阵](../../../docs/standards/ai-collaboration.md)）。
- 代码改动默认至少包含 `lint` 和 `typecheck`；文档改动补链接和路径检查。
- 测试不是所有场景都一刀切全量执行，按风险选择定向/全量/coverage/E2E。
- 若实际证据低于最低层级，直接判定为 `Reject`。

### Step 2.5: 按风险分级分配审查深度（控制用时）⚠️ REQUIRED

审查投入与改动风险匹配，不应对所有改动一视同仁长时间分析；证据获取遵循"翻源码是最后手段"。分级表与证据优先级见 [AI 协作规范 §1.3 证据获取手段优先级与审查按风险分级](../../../docs/standards/ai-collaboration.md)，要点：

- **高风险**（发布流程、安全/鉴权、外部调用、数据写入、配置与依赖变更、agent/skill 定义）→ 深度审计（验证矩阵 + 针对性实证 + 全量 checklist）；
- **中风险**（常规业务逻辑、测试补强）→ 标准审查（正确性 + 边界 + 测试覆盖）；
- **低风险**（文档措辞、简单配置、重命名）→ 快速审查（一致性 + 明显错误即可），不应拖长审查时长；
- 优先采用任务方提供的已查证事实与本地实验证据，翻源码仅限需要最终实锤且无外部参考的场景。

### Step 3: 收集并延续审查证据

- 默认把临时审查记录写入 `artifacts/review-gate/`（纳入 `.gitignore`），文件名 `<date>-<scope>.md`。
- 多轮 review 复用同一份记录，按 `Round 1`、`Round 2` 追加，保留未关闭问题编号与复查结论。
- 证据记录至少包含：变更范围、已执行验证、结果摘要、问题分级、Gate 结论、未覆盖边界、后续补跑计划。

### Step 4: 执行结构化审查

- 使用 references/ 中的四份 checklist 逐项覆盖：正确性、安全、架构（SOLID）、可维护性、测试充分性。
- 优先寻找会阻塞放行的问题，而不是按文件顺序复述 diff。
- 重点检查：遗漏 mock、异常吞掉、权限边界缺失、证据链不闭环、超出当前 Todo 范围的静默扩写。

### Step 5: 判定问题分级

| 级别 | 含义 |
|:----:|------|
| **blocker** | 明显 correctness bug、安全漏洞、关键验证缺失、与 Todo/规范冲突 |
| **warning** | 较高回归风险、测试覆盖不足、结构边界模糊或证据不完整 |
| **suggest** | 非阻塞的可维护性、可读性、删除计划或后续优化建议 |

> 兼容映射：`blocker ≈ P0/P1`、`warning ≈ P2`、`suggest ≈ P3`

### Step 6: 给出 Review Gate 结论 ⚠️ REQUIRED

- 只有所有 `blocker` 关闭且最低验证矩阵满足时，才允许给 `Pass`。
- `Reject` 必须明确写出失败原因、缺失证据、待修问题和复查基线。
- 对多轮 review，必须说明"本轮新增问题""本轮已关闭问题""仍待复查问题"。

### Step 7: 确认后续动作

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
