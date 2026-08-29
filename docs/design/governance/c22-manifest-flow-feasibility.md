# C22 Manifest Flow 可行性评估（A7b 评估报告）

> **状态**：评估报告（M18.3 P2 commit 3/3 A7b 子任务）；2026-08-29 落地
> **范围**：评估 GitHub App Manifest flow 一键创建 + 自动回调能否在 dependfix 平台实施；输出推荐路径与阻塞项清单
> **关联决策**：M18 P 阶段用户决策（2026-08-29）—— "目前还没规划 Manifest flow 一键创建，可以先考虑文档引导，并评估 Manifest flow 可行性"

## 1. 背景与目标

### 1.1 Manifest flow 概念

GitHub App Manifest flow 是 GitHub 提供的"manifest URL"机制，允许用户通过单个 URL 一键创建 GitHub App + 自动跳转到配置回调 URL：

- 用户访问 manifest URL（含 `manifest` 配置 base64 参数）
- GitHub 展示确认页（应用名 / 权限 / 回调 URL 等）
- 用户确认 → GitHub 自动创建 App + 跳转到回调 URL + 携带 code 参数
- dependfix 后端用 code 换取 GitHub App ID / Installation ID + 私钥
- dependfix 自动填充凭据表单 + 用户只需确认安装（GitHub  → 用户仓库）

**关键优势**：避免用户手动下载 `.pem`、手动输入 App ID / Installation ID。

### 1.2 评估目标

1. 确认 Manifest flow 在 dependfix 平台的实施可行性
2. 识别阻塞项（GHES 版本支持 / OAuth callback 路径 / CSRF 防护等）
3. 推荐是否启动 M19+ 实施，或维持文档引导

## 2. 技术评估

### 2.1 GHES 版本支持

**GitHub.com Manifest flow 支持**：所有公开 GitHub App 可用（无版本限制）。

**GitHub Enterprise Server (GHES) Manifest flow 支持**：
- GHES 3.4+ 支持（[官方文档](https://docs.github.com/en/enterprise-server@3.10/developers/apps/creating-a-github-app-from-a-manifest)）
- GHES 3.3 及以下不支持 Manifest flow
- 自部署场景下需确认目标 GHES 版本范围

**影响**：自部署平台用户若使用 GHES 3.3 及以下，Manifest flow 入口不可用，需 fallback 到文档引导路径。

### 2.2 Manifest URL 构造

GitHub Manifest URL 格式：
```
https://github.com/settings/apps/new?manifest={base64-manifest-json}
```

Manifest JSON 必填字段：
```json
{
  "name": "dependfix-bot",
  "url": "https://platform.example.com",
  "hook_attributes": {"url": "https://platform.example.com/api/webhooks/github-app"},
  "redirect_url": "https://platform.example.com/oauth/github-app/callback",
  "public": false,
  "default_events": ["push"],
  "default_permissions": {
    "contents": "write",
    "pull_requests": "write",
    "metadata": "read"
  }
}
```

**实现复杂度**：中（manifest JSON 模板化 + base64 编码 + URL 拼接；模板可由 dependfix 后端生成并缓存）。

### 2.3 OAuth Callback 路径

依赖 GitHub Manifest flow 的 OAuth-style callback 流程：

```
用户确认 GitHub 创建 App
   ↓
GitHub 跳转 https://platform.example.com/oauth/github-app/callback?code=ABC&state=XYZ
   ↓
dependfix 后端接收 code + state
   ↓
POST https://api.github.com/app-manifests/{code}/conversions
   ↓ Header: Authorization: Basic <base64(CLIENT_ID:CLIENT_SECRET)>
   ↓ Body: 无（code 在 URL path）
   ↓ 响应: { id, name, html_url, pem, webhook_secret, ... }
   ↓
dependfix 后端用 pem 自动创建 Credential 记录（type='github-app'）
   ↓
重定向到平台 UI 显示成功提示
```

**实现复杂度**：高（需要 OAuth state CSRF 防护 + 客户端凭据管理 + 后端轮询 GitHub API）。

### 2.4 CSRF 防护（state 参数）

Manifest flow 的 callback URL 必须包含 `state` 参数防止 CSRF：
- 流程：用户点击 manifest URL → GitHub 重定向到 callback → 携 `state` 参数
- dependfix 后端生成 state（随机字符串），存 session
- callback 接收 state + session 中的 state 比对 → 不匹配拒绝

**依赖**：session 中间件（平台已有 better-auth session）

### 2.5 凭据管理（Client ID / Client Secret）

Manifest flow 转换 API 需 Basic Auth：
- `Authorization: Basic base64(client_id:client_secret)`
- 但 Manifest flow 创建的 GitHub App 没有 client_id/client_secret（只有 private_key）
- **替代方案**：使用 GitHub App 的 private key（RSA）+ JWT signing 调 `POST /app-manifests/{code}/conversions`（[GitHub 官方文档](https://docs.github.com/en/apps/creating-github-apps/creating-github-apps-from-a-manifest)）

**影响**：无需存储 client_id/client_secret，但仍需管理 GitHub App private key（在 manifest 转换前无法获取，需 callback 后用 code 换取）。

### 2.6 私钥管理（callback 后）

`POST /app-manifests/{code}/conversions` 响应包含 `pem` 字段（RSA private key）：
- 凭据 service 解密后立即加密存储到 `Credential.encryptedPrivateKey`（AES-256-GCM，与 M18.1 一致）
- 永不返回明文到前端

## 3. 阻塞项识别

| 阻塞项 | 严重度 | 说明 |
|:---|:---:|:---|
| **GHES 3.3 及以下不支持** | 中 | 自部署用户需 fallback 到文档引导；可在 UI 检测 target GHES 版本后切换入口 |
| **OAuth callback 路由** | 中 | 需新增 `/api/oauth/github-app/callback` endpoint + state CSRF 防护 + session 中间件 |
| **依赖 GitHub.com + GHES 3.4+** | 低 | 大多数自部署用户满足；不满足的用户文档引导 fallback |
| **平台路由与 webhook** | 中 | manifest 配置需 hook_attributes.url（webhook 端点）；M19+ 设计 |
| **OAuth-style redirect 用户体验** | 低 | 用户需在 GitHub 确认页 → dependfix 后端凭据预填；UX 流畅但首次配置略复杂 |

## 4. 推荐路径

### 4.1 推荐：M19+ 启动 Manifest flow 实施（条件触发）

**触发条件**：
1. dependfix 平台用户中 ≥ 5% 自部署 GHES 3.4+ 用户（Manifest flow 才有意义）
2. 文档引导的"5 步配置"反馈支持工单 ≥ 3 起 / 季度（用户配置成本成为痛点）
3. 用户明确反馈"希望一键创建 App"

**实施范围**：
- 后端：新增 `/api/oauth/github-app/callback` endpoint + Manifest 生成 service + GHES 版本探测
- 前端：Credentials 新增 "Create via Manifest" 按钮（GHES 3.4+ 显示）
- 测试：mock GitHub manifest flow 端到端；state CSRF 单元测试；GHES 版本探测集成测试

**预估工作量**：2-3 工作日（1 commit 范围）

### 4.2 不推荐：当前阶段（M18.3）启动实施

**理由**：
1. **用户优先级**：PAT 仍为 80%+ 用户的首选（CLI quickstart / Action input / 单仓调试），Manifest flow 仅对自部署多仓 org 用户有增量价值
2. **GHES 兼容性**：自部署用户若 GHES 版本 ≤ 3.3，Manifest flow 入口无效；需 fallback 增加 UX 复杂度
3. **测试覆盖**：e2e 测试需要真实 GitHub 环境或 mock GitHub manifest flow；M18.4 e2e 阶段未涵盖 Manifest flow 专项测试

### 4.3 当前阶段建议（M18.3）

- ✅ 维持 **文档引导** 为唯一 GitHub App 创建路径（M18.3 commit 2 quick-start 新章节已实施）
- ✅ Manifest flow 暂未实施说明已在 quick-start 中标注
- ⏸ M19+ 评估触发条件达到时启动 Manifest flow 实施

## 5. 触发再评估条件

任一条件满足时，本评估报告需要重新审视：

1. **GHES 版本分布变化**：自部署用户中 GHES 3.4+ 比例 ≥ 30%
2. **用户反馈升级**：≥ 5 起用户工单抱怨 GitHub App 配置步骤繁琐
3. **GitHub 平台变更**：GitHub 调整 Manifest flow 政策或限制
4. **第三方依赖**：dependfix 增加其他 OAuth 流程（如 GitLab App）需要统一 OAuth 框架

## 6. 关联文档

- [C22 PAT 无感升级评估 §4.5 调用点改造](./c22-pat-backward-compat.md) —— GitHub App 凭据创建后流程（已实施）
- [M18.0 PAT 无感升级评估](./c22-pat-backward-compat.md) —— 整体改造范围
- [M18 P 阶段用户决策（2026-08-29）](../../plan/todo.md) —— 暂不实施 Manifest flow 的决策依据

---

**报告版本**：v1（2026-08-29 M18.3 P2 A7b 评估子任务产出）
**下一步**：M18.3 P2 收口（commit 1 + commit 2 + 本评估报告 整体视为 P2 阶段闭环）；M18.4 e2e 全链路验证；M19+ 候选 backlog