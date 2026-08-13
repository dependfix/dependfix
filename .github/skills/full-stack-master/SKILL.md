---
name: full-stack-master
description: 全局一体化开发与协作工作流技能，覆盖需求评估、开发、测试、质量、文档、提交等全链路阶段，实现 PDTFC+ 循环自动化及分工合作优化。
metadata:
  internal: true
---

# Full Stack Master Workflow Skill

## 一、能力定位

- **工作流自动编排**：串联需求→设计→开发→审计→测试→文档→提交的全链路。
- **技能聚合**：集成所有核心技能，按阶段分派。
- **可复用与可拓展**：支持新场景接入，支持多项目切换。

## 二、强制参考文档

在执行任何写操作前，必须确保已读取并理解：

- **全周期基石**：[AGENTS.md](../../../AGENTS.md)、[AI 协作规范](../../../docs/standards/ai-collaboration.md)、[Git 规范](../../../docs/standards/git.md)
- **规划与任务**：[路线图](../../../docs/plan/roadmap.md)、[当前任务](../../../docs/plan/todo.md)、[规划规范](../../../docs/standards/planning.md)
- **开发与设计**：[开发规范](../../../docs/standards/development.md)、[API 规范](../../../docs/standards/api.md)、[架构设计](../../../docs/design/governance/architecture.md)
- **安全与质量**：[安全规范](../../../docs/standards/security.md)、[测试规范](../../../docs/standards/testing.md)

## 三、统一执行原则

- 编排遵循四步顺序：先暴露假设 → 选最小方案 → 限制改动范围 → 最小验证决定是否扩写。
- 具体执行口径以 [AI 协作规范](../../../docs/standards/ai-collaboration.md) 和 [开发规范](../../../docs/standards/development.md) 为准。

## 四、PDTFC+ 标准工作流

### P (Plan) — 需求分析与规划

1. **读取文档**：确认 `todo.md`、`roadmap.md`、当前验收标准与必要规范。
2. **范围核对**：判断事项是否属于当前待办；若不属，先完成插队或延期分流。
3. **方案设计**：输出受影响文件清单、验证矩阵和阶段交接顺序。
4. **任务落点**：仅对允许执行的事项进入 Do。

- **技能**：`requirement-analyst`、`context-analyzer`

### D (Do) — 开发实现

1. **单一主责**：同一事项同一时点只保留一个实现主责。
2. **核心实现**：遵循开发规范；涉及持久化优先处理数据模型，再落业务逻辑。
3. **规范一致性自检**：注释与测试名不得引入规划/任务/审计编号标记（`T405`、`P1-1` 等，例外仅真实常量与带文档路径的导航指针，见 [开发规范 §3](../../../docs/standards/development.md)）；新实现与既有规范冲突时先对照规范再定写法（教训见 [经验归档 §十六](../../../docs/design/governance/experience-archive.md)）。
4. **批次拆分**：预计本次改动超出 [规划规范 §1.1 任务粒度约束](../../../docs/standards/planning.md) 阈值时，先返回 P 阶段把任务拆为多个原子条目，按"可独立验证"顺序分批实现、分批审计、分批提交；合规核验在 review 阶段强制（见 [code-reviewer](../code-reviewer/SKILL.md) 检查点）。
5. **范围闸门**：发现新的优化点或非阻塞事项时，返回 P 阶段重新分流。

- **技能**：按需使用对应技术栈 skill（`nuxt`、`vue` 等）

### A (Audit) — 审计放行（强制）

1. **强制入口**：D 阶段完成后立即加载本项目 `code-reviewer` skill（[code-reviewer](../code-reviewer/SKILL.md)，禁止全局同名版本）执行完整审查。
2. **审查范围**：代码、文档、配置、脚本均须审查。
3. **审计任务携带已查证事实**：把调研结论、实验证据、源码行号引用写进审计 prompt，避免审计者从头翻源码（证据优先级见 [AI 协作规范 §1.3 证据获取手段优先级](../../../docs/standards/ai-collaboration.md)）。
4. **显式声明审计深度**：审计 prompt 必须显式声明 `audit-depth`（`quick` / `standard` / `deep`，分级与时间盒见 [AI 协作规范 §1.3 分级审计执行协议](../../../docs/standards/ai-collaboration.md)）与理由，并携带**审计启动时间戳**（宿主系统时钟）；未声明时审计按 `deep` 防御执行，会显著拖长用时——小改动必须主动声明 `quick`。
4b. **真实用时实测**：发起审计 task 前用宿主系统时钟记录启动时间戳，审计返回后实测 elapsed，将"实际用时 / 是否超时间盒"回填审计结论与证据记录——agent 自报用时为 LLM 估算值，不得作为时间盒核验依据（见 [AI 协作规范 §1.3 真实用时实测](../../../docs/standards/ai-collaboration.md)）。
5. **复审只审修复点**：第 2+ 轮只移交上轮问题编号对应的修复 diff，不重发全量 diff。
6. **并发审计（仅大改动）**：diff 文件数 > 8 或涉及 ≥ 2 个独立模块时，按模块分区并行发起多个审计任务，汇总取最严结论；小改动不得并发。
7. **退回策略**：发现 blocker 退回 D 或回流 P。

- **技能**：[code-reviewer](../code-reviewer/SKILL.md)、[security-guardian](../security-guardian/SKILL.md)

### V (Validate) — 浏览器与流程验证

1. 涉及页面渲染、交互流程时，使用 `ui-validator` 完成浏览器验证。
2. 无 UI 面影响时显式记录跳过原因。

- **技能**：`ui-validator`

### T (Test) — 测试与回归

1. 根据改动类型和预算选择定向/全量/coverage 验证。
2. 测试暴露的代码改动必须回到 D 并重新经过 A 阶段。

- **技能**：[test-engineer](../test-engineer/SKILL.md)、[code-reviewer](../code-reviewer/SKILL.md)

### F (Finish) — 文档收口与分批提交

1. **文档同步**：更新 `todo.md` 状态，按需同步相关文档。
2. **分批提交**：每个原子条目独立提交，规模约束与拆分规则见 [规划规范 §1.1 任务粒度约束](../../../docs/standards/planning.md)；每批加载 `conventional-committer` skill，确认 A 阶段已放行且 lint/typecheck/测试通过，生成 Conventional Commits 消息并 `git commit`。
3. **推送禁令**：不自动 push。

- **技能**：`documentation-specialist`、`conventional-committer`

## 五、需求挖掘方法论

1. **逐级递进**：先锁定整体结构和目标，再深入实现细节。
2. **单点突破**：一次一个问题，待用户回答后再追问。
3. **循环校验**：回答不清晰时换一种表述方式确认。
4. **意图抽离**：分析"想要什么"背后的"为什么"。

## 六、安全检查与异常处理

- 强行插入 typecheck、lint 等质量关卡。
- 对迭代中途新增事项强制执行"先规划、后实现"。
- 明确安全等级和数据保护点。
