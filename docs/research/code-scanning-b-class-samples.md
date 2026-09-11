# GitHub Code Scanning B 类规则样本报告

> **任务**：M28.3 / C15（[todo.md §M28.3](../../docs/plan/todo.md)）—— 在已实现 A/B/C 分层基础上做真实仓库样本核对（B 类规则 id 格式与变体分布 + 误判率）
> **采集脚本**：[packages/engine/src/code-scanning/scripts/sample-collector.mjs](../../packages/engine/src/code-scanning/scripts/sample-collector.mjs)
> **种子仓库**：32 个跨 js/ts / py / java / go / ruby 5 语言

## TL;DR

- 总仓库数：32
- 含 Code Scanning alerts 的仓库数：0
- 总告警数：0
- 唯一 B/C 类规则 id 数：0

## 按语言分组统计

| 语言 | 仓库数 | 含 alerts 仓库 | 唯一 rule_id |
|------|--------|---------------|--------------|
| js | 7 | 0 | 0 |
| ts | 1 | 0 | 0 |
| py | 6 | 0 | 0 |
| java | 6 | 0 | 0 |
| go | 6 | 0 | 0 |
| ruby | 6 | 0 | 0 |

## 全局 Top 20 高频 rule_id

| rule_id | 出现仓库数 |
|---------|------------|

## 按语言 Top 10 高频 rule_id

## B 类规则分级核对

基于样本统计，识别 SUGGESTED_RULES（rule-config.ts B 类默认）未覆盖的高频 rule_id：

### SUGGESTED_RULES 当前覆盖范围

- `no-unused-vars`
- `js/sql-injection` / `js/xss` / `js/path-injection` / `js/command-line-injection` / `js/insecure-randomness` / `js/weak-cryptographic-algorithm` / `js/missing-rate-limiting` / `js/clear-text-storage-of-sensitive-data` / `js/clear-text-transmission-of-sensitive-data` / `js/hardcoded-credentials`
- `py/sql-injection` / `py/path-injection` / `py/command-line-injection` / `py/insecure-default-file-permissions`
- `java/sql-injection` / `java/path-injection` / `java/command-line-injection`

### 未覆盖语言 / 规则

- `go/*`：SUGGESTED_RULES 未覆盖（rule-config.ts 注释明确"其余语言 Go/Ruby/csharp/cpp 落 C 类兜底"）
- `ruby/*`：SUGGESTED_RULES 未覆盖
- `csharp/*` / `cpp/*`：未列入种子仓库

### 待对齐建议

基于样本统计后给出（按需）：
- `go/sql-injection` / `go/command-line-injection` / `go/path-injection` 等加入 SUGGESTED_RULES
- `ruby/sql-injection` / `ruby/command-line-injection` 等加入 SUGGESTED_RULES
- `js/*` 变体（如 `js/regex-injection` / `js/unsafe-deserialization` 等）按需

## 数据明细

共 32 条样本，每条结构：

```json
{
  "owner": "facebook",
  "repo": "react",
  "language": "js",
  "has_code_scanning": true,
  "alert_count": 42,
  "unique_rule_count": 15,
  "rule_ids": ["js/...", "..."],
  "severity_breakdown": { "warning": 30, "error": 12 }
}
```

## 关联文档

- [packages/engine/src/code-scanning/rule-config.ts](../../packages/engine/src/code-scanning/rule-config.ts)
- [packages/engine/src/code-scanning/rule-classifier.ts](../../packages/engine/src/code-scanning/rule-classifier.ts)
- [packages/engine/src/github/code-scanning-fetcher.ts](../../packages/engine/src/github/code-scanning-fetcher.ts)
