# 经验归档分片：§九十四 - §九十五（执行结果可信与交付链残余）

> 本分片自 2026-11-25 M66 归档批次起启用（[§79-§85 分片](./experience-archive-§79-§85-ops-release.md) 收录至 §九十三、400 行贴顶）。章节编号**全局唯一、跨文件稳定**，分片仅按范围切分不影响锚点；L3 主题索引见 [experience-archive.md](./experience-archive.md)。

---

## 九十四、M66 归档批次经验沉淀（等价路径检出 / 版本线归因 / 取证口径 / 三态可判读 / 未复现处置）

**批次**：M66（2026-11-25 归档）。**准入依据**：③ 同类复现（视觉取证口径第 2 次订正、兜底回滚路径被上游回滚掩盖）+ ④ 工具 / 环境陷阱（Playwright `=all` 不写盘、子进程 stdio flush、版本化 override 失败线归因）。

1. **等价路径检出与删除建议**——启动期检出「多余目录」并给 `rm -rf` 提示时，纯字符串比较会漏掉尾斜杠 / `./` 段 / 软链，告警里的删除命令可能指向**正在使用**的目录。做法：先做字符串等值快速返回，再用 `readlink -f` 比较真实路径；解析失败时偏保守（多提示一条、不漏报）；命令加引号并附「先用 `pnpm store path` 确认」。落点：`apps/platform/docker/entrypoint.sh`、[pnpm store 治理 §7](./pnpm-store-hygiene.md)。
2. **版本化 override 的失败线必须在回滚前归因**——`rollback` 会把本次已修好的另一条版本线也还原，事后按 lockfile 重算会把单线形态误判成多线，提升永不触发。做法：install 后立即快照失败线（selector major + 该线目标 + 低于目标的实例）；selector 解析覆盖 `8` / `^8` / `~8` / 无 selector（通用 key 覆盖全部实例），跳过 `parent>pkg`。落点：[dependency-fixer-records §12.19](./../modules/dependency-fixer-records.md)、`fixers/dependency/peer-only-promotion.ts`。
3. **兜底 / 回滚分支必须配变异标定**——新增的还原路径常被上游自带回滚掩盖（删掉本模块的实例回读，用例仍全绿）。做法：为每条新增回滚构造「install 成功但实例仍不足」形态，删掉该路径必须至少一例变红；审计结论写 mutation 读数。落点：`peer-only-promotion.test.ts`。
4. **子进程输出断言须等 stdio close**——`exit` 事件早于 stdout / stderr flush，「恰一条 warn」这类计数断言会偶发少一条。做法：`waitExit` 等两个管道 `close`（200ms 上限，防后台子进程继承管道挂住）；「零输出」改为「不输出某告警」以匹配真实语义。落点：`apps/platform/docker/entrypoint.test.mjs`。
5. **视觉取证里 `=all` 不是强制重写**——Playwright 对**内容未变化**的快照同样不写盘，连续 N 轮 sha 不变只证明文件没被改写。做法：删除目标基线后重建（缺快照无条件写盘）并记录 mtime / sha；对比路径自带两帧重试，update 路径直接落首帧。落点：[testing §6.7](../../standards/testing.md)、`tests/visual/README.md`。
6. **未复现的抖动不要硬造稳定化代码**——写「分数像素对齐」后截图逐字节不变（浏览器本就按设备像素对齐），说明假设不成立。做法：先做可证伪实验（几何读数 + 位移注入截图），假设不成立即撤掉 helper，改为「复核未复现 + 归因订正 + 复现取证步骤」入账，不引入无证据的测试侧改动。落点：`tests/visual/README.md`。
7. **关闭 PR 后先回收副作用、再写旁路审计**——关闭后写审计失败会让「回收 head 分支」永不执行（下一轮 PR 已 closed、不会重入）。做法：先回收（自身吞掉删除失败并落清理审计）再写关闭审计；回收守卫 = 本仓 + `dependfix/auto-fix-*` + `head.sha === PRCheck.headSha`。落点：`services/pr-feedback/{service,branch-cleanup}.ts`。
8. **失败细分在发生点做，不做事后模糊解析**——push 现场按 git 关键短语白名单落结构化 code：non-FF / 凭据 → deterministic，网络 → transient（进入 retry / batch-resume），5xx 只认 HTTP 语境，未命中保持 unknown。落点：[run-failure-taxonomy §7](./run-failure-taxonomy.md)、`executor/platform-delivery.ts`。
9. **未交付结论只统计未交付对象**——run 级 `alertsFixed` 会把已正常交付仓库的修复算成「未交付」。做法：汇总只取**被跳过仓库自身**的 `fixed` 之和，为 0 时不输出该结论行；报告与运行详情共用同一交付影响文案。落点：`packages/core/src/report/markdown-generator.ts`、`app/utils/run-view.ts`。

- **落点**：`apps/platform/docker/entrypoint.sh`、`packages/engine/src/fixers/dependency/peer-only-promotion.ts`、`apps/platform/server/services/pr-feedback/`、`apps/platform/server/services/executor/platform-delivery.ts`、`packages/core/src/report/markdown-generator.ts`、`apps/platform/app/utils/run-view.ts`、[testing §6.7](../../standards/testing.md)、`apps/platform/tests/visual/README.md`。

---

## 九十五、M67 归档批次经验沉淀（派生兜底掩盖显式写入 / 平台配置四段接线）

**批次**：M67（2026-11-26 归档）。**准入依据**：③ 同类复现（「测试全绿但接线缺失」在 M22.6 构建产物门控与 M64 §九十二 执行参数三段接线已出现）+ ② 决策需溯源（平台接管交付的内部 `deliveryOwner` 字段为什么存在）。

1. **派生兜底会掩盖显式写入丢失**——同一结论既可由显式记录、又可由属性派生时，集成测试的断言只证明「最终形态正确」，删掉显式写入用例仍绿。做法：在**写入函数**上做直调单测并断言 sink（Map 键/值 / 计数 / 去向），再对每条删改做变异标定；集成用例只负责路径组合。落点：`packages/engine/src/app/{alert-outcomes.ts,not-fixable-outcome.test.ts}`、`packages/core/src/report/alert-outcomes.ts`。
2. **平台仓库级配置必须四段各一条断言**——「实体/迁移 → API → orchestrator ctx → executor 消费点」任一段都可能静默丢字段（本次 B1：执行器单测手写 ctx 全绿，orchestrator 未透传导致运行时恒默认值）。做法：每段至少一条断言，并在最终消费点断言「配置值 → 引擎参数」；JSON 快照扩展字段同时断言写入端与读取渲染端；本模式与 §九十二「参数解析 → 接线 → 消费点」同族，本次扩为四段。落点：`apps/platform/server/services/scan-orchestrator.test.ts`、`executor/container-executor-engine-config.test.ts`、`app/utils/run-view.test.ts`。

- **落点**：`packages/engine/src/app/`、`packages/core/src/report/`、`apps/platform/server/services/scan-orchestrator.service.ts`、`apps/platform/server/services/executor/`、`apps/platform/app/utils/run-view.ts`、[development §5.1.45](../../standards/development.md)（契约字段逐段核对，既有 L2；本次为执行缺口）。
