# M68 运行面安全与镜像供应链（2026-11-26 规划 / 2026-11-28 归档）

## 当前阶段

M68 运行面安全与镜像供应链（2026-11-26 规划，5 原子）：独立 installer 容器与 runtime 工具链移出 + 运行面漏洞检测最小周检 + 沙箱镜像双架构自包含冒烟与安全姿态 + 镜像构建去重与发布构建复用 + 发布安全输出采集时点。

执行顺序、容量基线与验收标准见 [todo 归档分片](todo-archive-phases-m68.md)（原 `todo.md` 正文已迁出）；上一阶段详情见 [roadmap 分片](roadmap-phases-m67.md)。

---

## 归档结论

- M68.1 / M68.2 / M68.3 / M68.5 四原子全部闭环 + M68.4 第一期（AC1 构建去重）闭环；M68.4 AC2 / AC3 按用户 2026-11-27 裁决移出当前阶段，转 backlog 等下次发版窗口；dependabot PR #279（typescript-eslint 8.73.0）同步暂缓。
- 阶段窗口首父链 45 commits（`671f0b65^..e26e8fa9`），唯一 diff 64 文件 / +3543 −217（2026-11-27 实测）；规划容量 18-26 commits / 26-42 files / 1,200-2,220 行，逐原子实际容量与 Review Gate 轮次见 [todo 归档分片](todo-archive-phases-m68.md)。
- 阶段关键读数：平台镜像 slim 408MB / full 832MB（变更前 207,292,005 B）；运行面周检首跑命中 `apk:zlib 1.3.2-r1 < 1.4-r0`（CVE-2026-4738），改用构建期 `apk upgrade` 后对已发布 `latest` 复跑 PASS；沙箱双架构拉取式冒烟四组合（amd64 / arm64 × `sandbox` / `sandbox-full`）实测绿，2026-11-27 又完成 GHCR 私有包 `GITHUB_TOKEN` 登录链路 CI 实证（run `46026162768`）；构建去重把每架构构建腿 9 → 3 且三 registry digest 逐字一致。
- 残余落点：M68.4 AC2 / AC3 → [backlog §M68 阶段残余](../backlog.md#m68-阶段残余-2026-11-28-登记-持续观察) 与候选池「发布窗口发布构建复用取证」；PR #279 迁移 → 候选池「typescript-eslint 8.73.0 新规则迁移」；发布轮不验证沙箱镜像 / 周检窗口 ≤ 7 天 → backlog 已知边界同段。
