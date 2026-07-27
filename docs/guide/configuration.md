# 配置说明

## 配置来源（按优先级）

1. CLI 参数
2. 环境变量
3. 配置文件（`dependfix.config.json` / `dependfix.config.yaml`）
4. 默认值

## 全部配置项

| 配置项 | 环境变量 | 类型 | 默认值 | 说明 |
|--------|---------|------|--------|------|
| `token` | `GITHUB_TOKEN` | `string` | — | GitHub 认证 Token |
| `repositories` | `REPOSITORIES` | `string[]` | `[]` | 目标仓库列表 |
| `owner` | `OWNER` | `string` | — | GitHub owner/org，用于自动发现 |
| `severityThreshold` | `SEVERITY_THRESHOLD` | `string` | `high` | 严重级别阈值 |
| `mode` | `MODE` | `string` | `report-only` | 运行模式 |
| `dryRun` | `DRY_RUN` | `boolean` | `false` | 预演模式 |
| `createPr` | `CREATE_PR` | `boolean` | `false` | 是否创建 PR |
| `maxAlertsPerRepo` | `MAX_ALERTS_PER_REPO` | `number` | `20` | 每仓库最大告警处理数 |
| `maxMajorUpgrades` | `MAX_MAJOR_UPGRADES` | `number` | `3` | 最大 major 升级数 |
| `aiApiKey` | `AI_API_KEY` | `string` | — | AI API Token |
| `aiApiBaseUrl` | `AI_API_BASE_URL` | `string` | — | AI API 地址 |
| `aiModel` | `AI_MODEL` | `string` | — | AI 模型名称 |

## 配置文件示例

```yaml
# dependfix.config.yaml
repositories:
  - owner/repo-a
  - owner/repo-b
severityThreshold: high
mode: fix-and-pr
maxAlertsPerRepo: 10
aiApiBaseUrl: https://api.deepseek.com
aiModel: deepseek-chat
```

## 环境变量

```bash
export GITHUB_TOKEN=ghp_xxx
export SEVERITY_THRESHOLD=high
export MODE=report-only
export AI_API_KEY=sk-xxx
export AI_API_BASE_URL=https://api.deepseek.com
```
