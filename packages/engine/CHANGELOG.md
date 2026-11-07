# @dependfix/engine

## [1.0.0](https://github.com/dependfix/dependfix/compare/@dependfix/engine@0.6.0...@dependfix/engine@1.0.0) (2026-11-06)

### ⚙️ 依赖更新

* bump `@dependfix/core` to 1.0.0 (was 0.7.0)

### 首个稳定版

* 1.0.0 首个稳定版：本包随 1.0 契约冻结一并发布（迁移说明见仓库根 `docs/guide/contract-freeze.md`）

# [0.6.0](https://github.com/dependfix/dependfix/compare/@dependfix/engine@0.5.0...@dependfix/engine@0.6.0) (2026-11-01)


### ✨ 新功能

* **core:** 新增告警级修复结果契约与引擎产出 ([1d5e187](https://github.com/dependfix/dependfix/commit/1d5e187))
* **engine:** 交付类 git 调用改为受管异步 ([860e275](https://github.com/dependfix/dependfix/commit/860e275))
* **engine:** 回滚与单元 checkpoint 走受管异步并定义取消期语义 ([62d232f](https://github.com/dependfix/dependfix/commit/62d232f))
* **engine:** 基线红交付降级配置项（skip / issue / draft） ([2cfa1c1](https://github.com/dependfix/dependfix/commit/2cfa1c1))
* **engine:** 基线红的交付降级（草稿 PR API + 记录与载体） ([67a7596](https://github.com/dependfix/dependfix/commit/67a7596))
* **engine:** 运行级剩余预算检查 ([4651f22](https://github.com/dependfix/dependfix/commit/4651f22))
* **monorepo:** 统一 PR Check 结论口径并按 workflow run 收敛同名轮次 ([2a9a588](https://github.com/dependfix/dependfix/commit/2a9a588))


### 🐛 Bug 修复

* **cli:** 订正 ai-api-key 优先级与 max-repos 负数口径 ([def958b](https://github.com/dependfix/dependfix/commit/def958b))
* **engine:** 区分已启动后被取消的 git 失败文案 ([f6d8911](https://github.com/dependfix/dependfix/commit/f6d8911))
* **engine:** 收口交付异步化的取消、预算与编码边界 ([11c1427](https://github.com/dependfix/dependfix/commit/11c1427))


### 📦 代码重构

* **engine:** 拆分 git 身份与部分源汇总辅助模块 ([1313774](https://github.com/dependfix/dependfix/commit/1313774))

# [0.5.0](https://github.com/dependfix/dependfix/compare/@dependfix/engine@0.4.0...@dependfix/engine@0.5.0) (2026-10-28)


### ⚡ 性能优化

* **engine:** 版本化 overrides 合批，单仓安装次数由每包一次压到一次 ([9f747fe](https://github.com/dependfix/dependfix/commit/9f747fe))


### ✨ 新功能

* **core:** 在运行汇总中新增环境性失败计数 ([c313255](https://github.com/dependfix/dependfix/commit/c313255))
* **engine:** buildVersionedOverrides 支持路径级 override（parent>child） ([4e04090](https://github.com/dependfix/dependfix/commit/4e04090))
* **engine:** M30.4 C74 getCommitAuthor() 接线（仅 App 路径） ([61acfae](https://github.com/dependfix/dependfix/commit/61acfae))
* **engine:** overrides 保护名单（按仓库粒度，防破坏性 override 复发） ([4e3a2b5](https://github.com/dependfix/dependfix/commit/4e3a2b5)), closes [#1095](https://github.com/dependfix/dependfix/issues/1095)
* **engine:** pnpm-audit-fetcher 解析依赖链路径 findings[].paths[] ([8d9315c](https://github.com/dependfix/dependfix/commit/8d9315c))
* **engine:** pnpm-workspace 覆盖写入改为定点编辑 ([6178859](https://github.com/dependfix/dependfix/commit/6178859))
* **engine:** PR 正文展示家族锁步 ([ca4a95a](https://github.com/dependfix/dependfix/commit/ca4a95a))
* **engine:** PR 正文披露跳过与截断分组 ([37c9306](https://github.com/dependfix/dependfix/commit/37c9306))
* **engine:** 交付前排除安装产物，避免依赖目录进入修复提交 ([083b7a6](https://github.com/dependfix/dependfix/commit/083b7a6))
* **engine:** 交付拒绝路径写入专属失败类别 ([97683eb](https://github.com/dependfix/dependfix/commit/97683eb))
* **engine:** 交付提交按路径集合收口 ([fdc1e8a](https://github.com/dependfix/dependfix/commit/fdc1e8a))
* **engine:** 出站白名单扩充镜像站并从配置面动态发现 registry ([380e8f4](https://github.com/dependfix/dependfix/commit/380e8f4))
* **engine:** 区分 Dependabot alerts 未启用与获取失败 ([6fd6aad](https://github.com/dependfix/dependfix/commit/6fd6aad))
* **engine:** 单元 checkpoint 与选择性回滚 ([dd19521](https://github.com/dependfix/dependfix/commit/dd19521))
* **engine:** 受管进程执行基座与安装超时口径单一事实源 ([70585b3](https://github.com/dependfix/dependfix/commit/70585b3))
* **engine:** 启动日志输出版本与构建 commit 回执 ([abed1ad](https://github.com/dependfix/dependfix/commit/abed1ad))
* **engine:** 基线采样改为完整命令链 ([d76dcea](https://github.com/dependfix/dependfix/commit/d76dcea))
* **engine:** 家族锁步接入常规 / 成员 / 跨线升级路径 ([8ff42a7](https://github.com/dependfix/dependfix/commit/8ff42a7))
* **engine:** 将 CI 脚本镜像接入验证链与基线 ([c527f56](https://github.com/dependfix/dependfix/commit/c527f56))
* **engine:** 将尝试上限判定接入修复链与 PR 标记 ([21ae012](https://github.com/dependfix/dependfix/commit/21ae012))
* **engine:** 按原因累加跳过并计算告警级未修复数 ([54942da](https://github.com/dependfix/dependfix/commit/54942da))
* **engine:** 接入 PR check 回环与报告字段 ([ff8fa60](https://github.com/dependfix/dependfix/commit/ff8fa60))
* **engine:** 支持目标仓库专属配置并落地中央优先合并 ([40ac252](https://github.com/dependfix/dependfix/commit/40ac252))
* **engine:** 新增 PR check 等待状态机与处置 ([1b37a35](https://github.com/dependfix/dependfix/commit/1b37a35))
* **engine:** 新增 PR check 等待配置与 CLI 开关 ([3ef294e](https://github.com/dependfix/dependfix/commit/3ef294e))
* **engine:** 新增交付提交集合判定与路径白名单 ([71ccef1](https://github.com/dependfix/dependfix/commit/71ccef1))
* **engine:** 新增依赖家族锁步规则与 registry 版本解析 ([5fb836b](https://github.com/dependfix/dependfix/commit/5fb836b))
* **engine:** 新增同告警尝试上限判定模块 ([1daf5f4](https://github.com/dependfix/dependfix/commit/1daf5f4))
* **engine:** 新增家族锁步升级编排 ([88c5274](https://github.com/dependfix/dependfix/commit/88c5274))
* **engine:** 新增尝试指纹、关闭 PR 索引与 retry-failed 开关 ([c600eb6](https://github.com/dependfix/dependfix/commit/c600eb6))
* **engine:** 新增验证回滚粒度配置 ([a0b5adf](https://github.com/dependfix/dependfix/commit/a0b5adf))
* **engine:** 既有失败基线判定与交付门禁归因 ([5a544da](https://github.com/dependfix/dependfix/commit/5a544da))
* **engine:** 解析 CI 脚本并生成有界镜像计划 ([979a977](https://github.com/dependfix/dependfix/commit/979a977))
* **engine:** 解析目标仓库 workflow 并比对验证口径 ([8888999](https://github.com/dependfix/dependfix/commit/8888999))
* **engine:** 记录验证口径并对齐 PR 正文与运行报告 ([612a457](https://github.com/dependfix/dependfix/commit/612a457))
* **engine:** 运行级取消接入编排层与验证链 ([0efe5e7](https://github.com/dependfix/dependfix/commit/0efe5e7))
* **engine:** 零告警仓库按需跳过修复前基线采样 ([d5e5883](https://github.com/dependfix/dependfix/commit/d5e5883))
* **engine:** 默认验证链纳入 test 命令 ([b414312](https://github.com/dependfix/dependfix/commit/b414312))
* **engine:** 默认验证链纳入 typecheck 阻断类型面假绿交付 ([4a47ef8](https://github.com/dependfix/dependfix/commit/4a47ef8))


### 🐛 Bug 修复

* **engine:** .gitignore 幂等判定与 git 语义对齐消除重复追加 ([6a258d8](https://github.com/dependfix/dependfix/commit/6a258d8))
* **engine:** git 边界收口非仓库目录语义与 push 侧钩子隔离 ([8a6c84e](https://github.com/dependfix/dependfix/commit/8a6c84e))
* **engine:** M29.4 审计修复（双重计数 / 设计文档失准 / 间接路径补测） ([1a73abc](https://github.com/dependfix/dependfix/commit/1a73abc))
* **engine:** M30.1 C87 跳过类审计条目不影响退出码 ([41a13ab](https://github.com/dependfix/dependfix/commit/41a13ab))
* **engine:** override 写入后校验 lockfile 生效 ([873735d](https://github.com/dependfix/dependfix/commit/873735d))
* **engine:** pnpm overrides key 语义归一化，消除 pkg@^1 / pkg@1 重复写法 ([b7ded32](https://github.com/dependfix/dependfix/commit/b7ded32))
* **engine:** 保持单包 toVersion 口径并让取消态回退短路 ([823dd07](https://github.com/dependfix/dependfix/commit/823dd07))
* **engine:** 区分 lockfile 已合规与修复生效的日志语义 ([1a557e1](https://github.com/dependfix/dependfix/commit/1a557e1))
* **engine:** 区分告警源未启用与获取失败并给出源准确文案 ([00a11ff](https://github.com/dependfix/dependfix/commit/00a11ff))
* **engine:** 升级失败就地留痕并清理失效归因指针 ([7f01d3b](https://github.com/dependfix/dependfix/commit/7f01d3b))
* **engine:** 受管执行补跨平台 shell 与中止证据标识 ([242ab29](https://github.com/dependfix/dependfix/commit/242ab29))
* **engine:** 告警源全失败判据改为无成功源且存在失败源 ([1b947ad](https://github.com/dependfix/dependfix/commit/1b947ad))
* **engine:** 告警源失败信号去重与 token 指引三源合一 ([340ca85](https://github.com/dependfix/dependfix/commit/340ca85))
* **engine:** 安装与验证命令超时有界落定 ([0db37e2](https://github.com/dependfix/dependfix/commit/0db37e2))
* **engine:** 安装基线失败时跳过依赖安装链 ([312ada2](https://github.com/dependfix/dependfix/commit/312ada2))
* **engine:** 安装失败证据补进程信号与 err.message 回退并共享抽取 ([9ccd60d](https://github.com/dependfix/dependfix/commit/9ccd60d))
* **engine:** 容器内安装失败保留进程级信号并改判环境性失败不归因 ([4fee403](https://github.com/dependfix/dependfix/commit/4fee403))
* **engine:** 尝试标记解析改为线性扫描（code scanning） ([a71a3cb](https://github.com/dependfix/dependfix/commit/a71a3cb))
* **engine:** 收敛按全部实例且 noOp 修复不计交付 ([ec2c22b](https://github.com/dependfix/dependfix/commit/ec2c22b))
* **engine:** 既有基线失败不再将运行判为失败 ([e5c59b8](https://github.com/dependfix/dependfix/commit/e5c59b8))
* **engine:** 环境性安装失败不再归因目标仓库 ([0d1dd45](https://github.com/dependfix/dependfix/commit/0d1dd45))
* **engine:** 自动 commit 跳过目标仓库 git hooks，消除 husky 阻断交付 ([cb5c146](https://github.com/dependfix/dependfix/commit/cb5c146))
* **engine:** 补 quick-verify 失败留痕的失败命令与原因 ([701f55f](https://github.com/dependfix/dependfix/commit/701f55f))
* **engine:** 补全失败评论表格单元格的转义（code scanning） ([43bad2c](https://github.com/dependfix/dependfix/commit/43bad2c))
* **engine:** 补齐安装失败 stdout 证据与诊断提示 ([d6bc68a](https://github.com/dependfix/dependfix/commit/d6bc68a))
* **engine:** 路径级 override 跨告警取 max + JSDoc 归位 ([e8e5f32](https://github.com/dependfix/dependfix/commit/e8e5f32))
* **engine:** 隔离 tsdown dts 共享 chunk 修复入口声明错位 ([644f9f0](https://github.com/dependfix/dependfix/commit/644f9f0))
* **engine:** 隔离宿主 git 签名配置，避免 commit 失败或带个人签名 ([fd2280b](https://github.com/dependfix/dependfix/commit/fd2280b))
* **engine:** 隔离宿主 git 签名配置对 push 的污染 ([f6150b0](https://github.com/dependfix/dependfix/commit/f6150b0))
* **engine:** 零修复与安装既有失败不交付 ([eb9f094](https://github.com/dependfix/dependfix/commit/eb9f094))
* **engine:** 非 git 工作目录跳过本地提交并显式探测仓库 ([53b6ffb](https://github.com/dependfix/dependfix/commit/53b6ffb))


### 📦 代码重构

* **engine:** M30.2 C86 repo-fix.ts 行数拆分至 803 行 ([6923fdc](https://github.com/dependfix/dependfix/commit/6923fdc))
* **engine:** 抽出告警升级与跨线升级步骤 ([4a358bd](https://github.com/dependfix/dependfix/commit/4a358bd))
* **engine:** 抽分配置校验与错误提示模块治理 max-lines ([9226ddd](https://github.com/dependfix/dependfix/commit/9226ddd))
* **engine:** 拆出收尾与基线采样交接面模块 ([7d96dcf](https://github.com/dependfix/dependfix/commit/7d96dcf))
* **engine:** 统一 manifest 依赖升级的一次写盘路径 ([c15bf8a](https://github.com/dependfix/dependfix/commit/c15bf8a))
* **engine:** 锁文件修复调用方适配异步签名 ([7a91501](https://github.com/dependfix/dependfix/commit/7a91501))
* **engine:** 验证链拆分独立模块 verify-project ([4ed008e](https://github.com/dependfix/dependfix/commit/4ed008e))
* **engine:** 默认验证链收敛为唯一事实源 ([fbed8e7](https://github.com/dependfix/dependfix/commit/fbed8e7))


### 💥 BREAKING CHANGES

* **engine:** @dependfix/engine 的 tryLockfileRepair 由同步改为异步（返回 Promise）。

# [0.4.0](https://github.com/dependfix/dependfix/compare/@dependfix/engine@0.3.0...@dependfix/engine@0.4.0) (2026-09-18)


### ✨ 新功能

* **core,engine:** NormalizedSecurityAlert 接口 + fetcher 透传 GHSA + CVE ([b6e7716](https://github.com/dependfix/dependfix/commit/b6e7716))
* **engine,core:** NormalizedSecurityAlert 新增 upstreamId 字段（M20.1） ([acb2d35](https://github.com/dependfix/dependfix/commit/acb2d35))
* **engine:** AppAuthProvider + InstallationTokenCache 完整实施 + 单测补强 ([adf370a](https://github.com/dependfix/dependfix/commit/adf370a))
* **engine:** Code Scanning 真实仓库样本采集脚本 + 报告模板（M28.3 / C15） ([99302b5](https://github.com/dependfix/dependfix/commit/99302b5))
* **engine:** per-source 错误隔离汇总（M19.5 C8） ([a20ea02](https://github.com/dependfix/dependfix/commit/a20ea02))
* **engine:** 新增 AuthProvider 接口契约 + PatAuthProvider 单测 ([e9b9c0a](https://github.com/dependfix/dependfix/commit/e9b9c0a))
* **engine:** 新增发现规模上限 max-repos（C23） ([c998d58](https://github.com/dependfix/dependfix/commit/c998d58))
* **engine:** 重复 PR 自动评论 + duplicate label（B1） ([5839771](https://github.com/dependfix/dependfix/commit/5839771))
* **platform:** M26.3 C69 包 README 双语化 ([bb61814](https://github.com/dependfix/dependfix/commit/bb61814))
* **platform:** 执行日志捕获与展示（Winston + MemoryLogger + Axiom） ([59f70d5](https://github.com/dependfix/dependfix/commit/59f70d5))


### 🐛 Bug 修复

* **engine:** execFileSync 替换 fixers/pnpm execRepair（Code Scanning RG-W02） ([a77e557](https://github.com/dependfix/dependfix/commit/a77e557))
* **engine:** execFileSync 替换 pr-creator.ts execSync（Code Scanning RG-W01） ([0a83c74](https://github.com/dependfix/dependfix/commit/0a83c74))
* **engine:** M18.4 测试层补强 + app-provider auth 字段 bug 修复 ([b5c23a0](https://github.com/dependfix/dependfix/commit/b5c23a0))
* **engine:** M24.4 RG-W02 治理债清理（fixers/pnpm execSync 替换） ([aaf8e7b](https://github.com/dependfix/dependfix/commit/aaf8e7b))
* **engine:** runCodeScanningFixes 批处理 + 测试覆盖 ([eaaa997](https://github.com/dependfix/dependfix/commit/eaaa997))
* **engine:** W3 修复 stageAndCommit host 全局 git config 干扰 bug ([6866eb7](https://github.com/dependfix/dependfix/commit/6866eb7))
* **engine:** 修复 M18.1 commit 1 audit Reject 阻断问题 ([0866830](https://github.com/dependfix/dependfix/commit/0866830))
* **engine:** 修复 pr-creator 中的命令注入漏洞 ([2d3419b](https://github.com/dependfix/dependfix/commit/2d3419b))
* **engine:** 修复 quickVerifyProject 在缺少 setup 步骤时 lint OOM ([7810ae4](https://github.com/dependfix/dependfix/commit/7810ae4))


### 📦 代码重构

* **engine+test+mcp+platform:** 调用点改造为 auth 路径 ([67a1a2f](https://github.com/dependfix/dependfix/commit/67a1a2f))
* **engine:** commit author 动态化（pr-creator stageAndCommit 接受可选 author） ([e84ff58](https://github.com/dependfix/dependfix/commit/e84ff58))
* **engine:** 引入 AuthProvider 抽象层 + PatAuthProvider 基础实施 ([026078a](https://github.com/dependfix/dependfix/commit/026078a))
* **platform:** 引擎降级为 fix+commit + 平台接管 push/PR 交付 ([3738dbf](https://github.com/dependfix/dependfix/commit/3738dbf))

# [0.3.0](https://github.com/dependfix/dependfix/compare/@dependfix/engine@0.1.3...@dependfix/engine@0.3.0) (2026-08-26)


### ✨ 新功能

* **engine:** cgroup v2 资源限制（执行期宿主侧硬性 OOM/CPU 上限） ([a85fb03](https://github.com/dependfix/dependfix/commit/a85fb03))
* **engine:** Code Scanning 规则分类支持配置文件覆盖 ([792e8c8](https://github.com/dependfix/dependfix/commit/792e8c8))
* **engine:** 供应链信号披露收集与 PR 警示区（T804） ([ed2f239](https://github.com/dependfix/dependfix/commit/ed2f239))
* **engine:** 凭据权限面启动检查与本地模式执行风险提示（T803） ([ad3fbb1](https://github.com/dependfix/dependfix/commit/ad3fbb1))
* **engine:** 执行期网络外联审计（T805） ([2d4b253](https://github.com/dependfix/dependfix/commit/2d4b253))
* **engine:** 接入 GitHub Code Quality findings 数据源 ([b0f6e84](https://github.com/dependfix/dependfix/commit/b0f6e84))
* **engine:** 网络审计代理升级为出站白名单拦截（deny-by-default） ([c68029a](https://github.com/dependfix/dependfix/commit/c68029a))
* **engine:** 识别 pnpm minimumReleaseAge 错误码并输出可读失败提示 ([aa75415](https://github.com/dependfix/dependfix/commit/aa75415))
* **platform:** A 模式 ContainerExecutor 创建 PR + 状态机 dispatched ([46b7c15](https://github.com/dependfix/dependfix/commit/46b7c15))


### 🐛 Bug 修复

* **engine:** cgroup 集成测试加可写探测门控（GitHub-hosted runner 优雅 skip） ([3963af0](https://github.com/dependfix/dependfix/commit/3963af0))
* **engine:** network-audit 默认白名单追加 rolldown.rs ([2104b9f](https://github.com/dependfix/dependfix/commit/2104b9f)), closes [#41](https://github.com/dependfix/dependfix/issues/41)
* **engine:** pnpm-audit legacy patched_versions range 前缀剥离（假跳过修复） ([ff9c66d](https://github.com/dependfix/dependfix/commit/ff9c66d))
* **engine:** 修复 pnpm audit 版本提取正则 ReDoS（CodeQL 告警 22） ([e62a1c3](https://github.com/dependfix/dependfix/commit/e62a1c3))
* **engine:** 显式指定 pnpm audit 官方 registry 防止镜像站漏报 ([0dccfa6](https://github.com/dependfix/dependfix/commit/0dccfa6))
* **engine:** 治本 network-audit 命令输出 URL 误判与 telemetry 默认禁用 ([0f08c40](https://github.com/dependfix/dependfix/commit/0f08c40))
* **engine:** 验证命令单命令超时中止并归类（T802） ([af30313](https://github.com/dependfix/dependfix/commit/af30313))


### 📦 代码重构

* **engine:** helpers.test.ts 按被测域拆分（lint:max-lines 解除） ([95693e0](https://github.com/dependfix/dependfix/commit/95693e0))

## 0.1.3 (2026-08-12)

### 🐛 Bug 修复

* **engine:** 清理 lint 警告（未使用参数、动态删除与 IO 组拆分） ([8f95a2e](https://github.com/dependfix/dependfix/commit/8f95a2e))
* **engine:** 验证失败时附 stdout/stderr 摘要提升可观测性 ([36aa07f](https://github.com/dependfix/dependfix/commit/36aa07f))
* **engine:** overrides 生成先判定大版本冲突并与已有条目取 max 合并 ([2d5cc0c](https://github.com/dependfix/dependfix/commit/2d5cc0c))
* **security:** 修复 CodeQL 告警（Actions 权限 / shell 参数化 / ReDoS / 表格转义） ([34e5575](https://github.com/dependfix/dependfix/commit/34e5575))
* **types:** strict 迁移修复（null/undefined 收窄与类型对齐） ([50c9dac](https://github.com/dependfix/dependfix/commit/50c9dac))

### 📦 代码重构

* **engine:** 拆包批次 2（fixers/config/report/multirepo 迁入 engine） ([7f83971](https://github.com/dependfix/dependfix/commit/7f83971))
* **engine:** 拆包批次 3（app/helpers/ai/runners 等迁入 engine，cli 薄壳化） ([b5a736f](https://github.com/dependfix/dependfix/commit/b5a736f))
* **engine:** 拆包批次 4（mcp/platform 切换 engine 依赖，恢复发布链路） ([74f821a](https://github.com/dependfix/dependfix/commit/74f821a))
* **engine:** 拆出 @dependfix/engine 共享执行引擎（批次 1：github/code-scanning 迁移） ([7191609](https://github.com/dependfix/dependfix/commit/7191609))
* **engine:** processRepoForFix 拆分为步骤管线（repo-fix/repo-alerts 模块） ([660362f](https://github.com/dependfix/dependfix/commit/660362f))
