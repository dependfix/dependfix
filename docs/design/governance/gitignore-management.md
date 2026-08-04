# .gitignore 自动管理

> 在 dependfix 运行结束后，自动确保目标仓库的 `.gitignore` 中忽略 `dependfix-reports/` 目录。

---

## 1. 动机

`writeReport()` 在 workDir 下创建 `./dependfix-reports/`，生成 Markdown + JSON 双格式报告。该目录不在任何 `.gitignore` 规则中，导致目标仓库 `git status` 显示 untracked files，用户可能误提交报告文件。

本设计确保**每次运行结束后，目标仓库的 `.gitignore` 自动包含 `dependfix-reports/`**，且：
- 已存在时不重复写入（幂等）
- 目标仓库不是 git 仓库时静默跳过
- 仅追加不修改已有内容

---

## 2. 设计决策

### 2.1 放置阶段

在 `DependfixApp.run()` 收尾阶段，`writeReport()` 调用之后：

```
run() →
  executeMode()        # 核心修复逻辑
  computeSummary()
  buildRunResult()
  writeReport()        # 写入报告文件
  → ensureGitignore()  # [NEW] 确保 .gitignore 忽略报告目录
  log "Run completed"
```

### 2.2 操作原则

| 原则 | 措施 |
|:-----|:-----|
| **幂等** | 按行匹配 `dependfix-reports/`，已存在则跳过 |
| **不侵入** | 仅追加新行，不修改已有内容 |
| **静默降级** | 非 git 仓库、文件不存在、无写权限 → 静默跳过 |
| **带注释** | 追加时带 `# dependfix` 注释分组，方便用户识别来源 |

### 2.3 不适用场景

- **GitHub Action 运行**：workflow 的工作区是临时的，不会被提交，不需要 `.gitignore`
  - `ensureGitignore()` 仍会执行但无害（临时工作区也可能有 `.gitignore`）
- **dry-run 模式**：报告仍会生成但内容为空标记，`.gitignore` 仍可写入（无害）

---

## 3. 实现

### 3.1 新增方法：`DependfixApp.ensureGitignore()`

```typescript
private ensureGitignore(): void {
    try {
        const gitDir = join(this.workDir, '.git')
        if (!existsSync(gitDir)) return // 非 git 仓库

        const gitignorePath = join(this.workDir, '.gitignore')
        const entry = 'dependfix-reports/'

        let content = ''
        if (existsSync(gitignorePath)) {
            content = readFileSync(gitignorePath, 'utf-8')
        }

        // 幂等检查
        const lines = content.split('\n')
        if (lines.some((l) => l.trim() === entry)) return

        // 追加（末尾无换行时补一个）
        const suffix = content.endsWith('\n') ? '' : '\n'
        const block = `${suffix}# dependfix\n${entry}\n`
        writeFileSync(gitignorePath, content + block, 'utf-8')
    } catch {
        // 静默降级：权限不足、磁盘满等
    }
}
```

### 3.2 自身仓库 `.gitignore`

dependfix 仓库自身的 `.gitignore` 也需要添加 `dependfix-reports/`，避免本地调试时产生 untracked files。

---

## 4. 受影响文件

| 文件 | 改动 |
|:-----|:-----|
| `packages/cli/src/app.ts` | 新增 `ensureGitignore()` 私有方法 + `import { existsSync, readFileSync, writeFileSync } from 'node:fs'`（已存在） + `run()` 中调用 |
| `.gitignore` | 追加 `dependfix-reports/` 条目 |

---

## 5. 遗留风险

| 风险 | 级别 | 说明 |
|:-----|:-----|:-----|
| 用户手删 `.gitignore` 中的条目，下次运行又加回来 | 低 | 符合预期行为 |
| monorepo 子目录也有 `.gitignore` 但不是 git 根目录 | 低 | 只检查 `.git` 是否存在，即只在仓库根写入 |
| `.gitignore` 使用复杂 glob 规则 | 无 | 仅追加简单文本，不影响已有规则 |

---

## 6. 验证要点

- [ ] `workDir` 是 git 仓库 → `.gitignore` 新增 `dependfix-reports/`
- [ ] `workDir` 不是 git 仓库 → 静默跳过
- [ ] `.gitignore` 已存在 `dependfix-reports/` → 不重复写入
- [ ] `.gitignore` 不存在 → 创建新文件
- [ ] `writeFileSync` 失败 → 静默降级，不抛异常
- [ ] 追加内容前后带换行，不影响已有条目
