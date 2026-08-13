# 安全开发规范 (Security Development Standards)

## 0. 事实源与边界 (Source & Scope)

本文档定义具体的开发安全控制措施和技术要求，与 `AGENTS.md` 的安全规范为引用关系。

## 1. 身份验证与授权 (Authentication & Authorization)

- **严格鉴权**: 所有涉及用户数据的 API 必须校验会话。
- **权限最小化**: 严格区分角色权限，使用包含性校验而非判等逻辑。
- **密码安全**: 严禁明文存储密码，使用 better-auth 默认安全哈希机制。

## 2. 数据安全 (Data Security)

- **输入校验**: 所有 API 输入使用 `zod` 校验，严禁直接信任原始输入。
- **防止注入**: 使用 TypeORM 参数化查询，严禁拼接 SQL 字符串。
- **敏感信息屏蔽**: API 返回前必须脱敏（隐藏密码、Token 等字段）。
- **Secrets 管理**: 严禁将密钥、Token 提交至 Git，必须使用 `.env`。

## 3. Web 安全防护 (Web Protection)

- **XSS 防护**: 默认使用 Vue 模板转义。`v-html` 使用须严格审计。
- **CSRF 防护**: 确保 API 使用 SameSite Cookie 策略或 CSRF Token。
- **CORS 策略**: 生产环境严禁 `Access-Control-Allow-Origin: *`。

## 4. 日志与监控 (Logging & Monitoring)

- **日志审计**: 重要操作（登录、删除、权限变更）必须记录审计日志。
- **无敏感信息日志**: 日志中严禁包含密码、Token 等信息。

## 5. 依赖与供应链安全 (Dependency & Supply Chain Security)

### 5.1 依赖管理

- **定期更新**: 关注依赖包安全漏洞公告。
- **最小化依赖**: 引入新包需经过必要性评估。
- **依赖升级纪律**: 依赖升级时检查版本发布时间、diff，在沙箱中验证。

### 5.2 供应链信任边界（AI 推荐包与外部工具引入必查）

AI 生成的代码与自动化引入的依赖/工具是独立投毒面，引入前按以下条款核验：

- **AI 推荐包来源验证**: AI 推荐的依赖包约 20% 在官方 registry 中不存在（斯坦福 57.6 万样本研究）——安装前必须查官方 registry 页面（npm / PyPI 等），警惕 typosquatting 拼写相近包。
- **钉版本 + 锁文件**: 新增依赖必须锁定精确版本并提交锁文件（pnpm-lock.yaml 等）；CI 中 GitHub Actions 必须钉不可变版本（如 setup-uv v8 起无 major tag）。
- **外部工具/技能来源可信**: 引入 MCP server、agent、skill 或 `git+https` 依赖前，核对来源仓库 URL 与维护组织，只装官方组织或自有仓库；警惕"伪装成有用文档/技能"的诱导信任（TrustFall 模式）。
- **最小权限**: MCP server 与自动化 agent 不运行于 root、不挂载全盘、数据库端口不暴露公网。
- **依赖审计进 CI**: 依赖审计（pnpm audit 等）必须进入 CI 门禁，本地抽查不能代替。

## 6. 终端命令与自动化安全 (CLI & Automation)

- **空路径规避**: 严禁将空字符串或未定义变量作为路径参数传给删除命令。
- **路径校验**: 文件/目录删除操作前必须验证目标路径有效性。

## 7. AI 输出安全

- **代码质量门**: AI 生成的代码必须通过 lint/typecheck 校验。
- **影响范围限制**: AI 单次 patch 修改文件数有限制。
- **人工审核**: AI 输出置信度低于阈值时仅输出建议，不自动提交。

## 8. 不可简化清单

- 输入校验：所有 API 输入必须经过 `zod` 校验
- 鉴权逻辑：涉及用户数据的接口必须有正确的权限边界
- XSS 防护：用户输入渲染前必须转义或清理
- SQL 注入防护：必须使用参数化查询
- 敏感信息脱敏：API 返回前必须隐藏密码、Token 等
- 错误处理：关键操作异常不能静默吞掉
- 国际化文本：UI 文本必须使用 `$t()` 包裹

## 9. 相关文档

- [开发规范](./development.md)
- [API 规范](./api.md)
- [Git 规范](./git.md)
