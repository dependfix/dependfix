# 仓库名自动推断（`--repo` 缺省值）

> 当用户在 git 仓库内运行 dependfix 时，从未指定 `--repo` 参数中自动推断 `owner/repo`。

---

## 1. 动机

当前用法要求每次都显式传 `--repo`：

```bash
dependfix fix --repo CaoMeiYouRen/auto-backup-database --severity-threshold high
```

多数场景下，用户已经在目标仓库目录中执行命令，`git remote get-url origin` 已经包含了所需信息。要求手工重复输入既繁琐又易出错。

---

## 2. 设计目标

- **零配置**：在 git 仓库内运行 `dependfix fix` 即可，无需 `--repo`
- **显式优先**：已提供 `--repo` 时不做推断
- **静默降级**：推断失败时回退到现有错误提示（"Missing target repositories"）
- **GitHub 优先**：当前只支持 GitHub remote URL 格式，其他平台留空

---

## 3. 推断逻辑

### 3.1 触发条件

```
resolveRuntimeConfig()
  → resolveRepoList(reposFromCli + reposFromEnv, reposFile)
  → repos 为空 AND reposFile 为空
    → inferRepoFromGitRemote(cwd)
```

推断仅在 **CLI 和 env 都未提供仓库列表** 时触发。

### 3.2 `inferRepoFromGitRemote(workDir?: string): string | null`

```
git remote get-url origin
  → https://github.com/CaoMeiYouRen/dependfix.git  → CaoMeiYouRen/dependfix
  → git@github.com:CaoMeiYouRen/dependfix.git      → CaoMeiYouRen/dependfix
  → https://gitlab.com/foo/bar.git                  → null (非 GitHub)
  → 无 origin / 不在 git 仓库                        → null
```

### 3.3 URL 解析

| remote URL | 解析结果 |
|:-----------|:---------|
| `https://github.com/owner/repo.git` | `owner/repo` |
| `https://github.com/owner/repo` | `owner/repo` |
| `git@github.com:owner/repo.git` | `owner/repo` |
| `ssh://git@github.com/owner/repo.git` | `owner/repo` |
| `https://gitlab.com/owner/repo.git` | `null`（非 GitHub） |

正则：

```typescript
const GITHUB_REMOTE_RE = /github\.com[:/]([^/]+)\/([^/\s.]+?)(?:\.git)?\s*$/
```

### 3.4 命令执行

```typescript
import { execSync } from 'node:child_process'

function inferRepoFromGitRemote(workDir: string): string | null {
    try {
        const url = execSync('git remote get-url origin', {
            cwd: workDir,
            encoding: 'utf-8',
            stdio: 'pipe',
        }).trim()

        const match = GITHUB_REMOTE_RE.exec(url)
        return match ? `${match[1]}/${match[2]}` : null
    } catch {
        return null
    }
}
```

---

## 4. 集成点

`packages/cli/src/config/index.ts` — `resolveRuntimeConfig()` 函数内：

```typescript
export function resolveRuntimeConfig(options: ResolveRuntimeConfigOptions = {}): RuntimeConfig {
    // ... existing env + cli merge ...

    let repositories = resolveRepoList(
        [...(envConfig.repositories ?? []), ...(cliOverrides.repositories ?? [])],
        cliOverrides.reposFilePath,
    )

    // 自动推断：所有来源都未提供仓库时，从 git remote 提取
    if (repositories.length === 0) {
        const inferred = inferRepoFromGitRemote(options.workDir ?? process.cwd())
        if (inferred) {
            repositories = [inferred]
        }
    }

    const config: RuntimeConfig = {
        mode,
        severityThreshold: ...,
        repositories,
        // ...
    }
}
```

### 4.1 `ResolveRuntimeConfigOptions` 扩展

新增可选字段：

```typescript
export interface ResolveRuntimeConfigOptions {
    env?: NodeJS.ProcessEnv
    cliOverrides?: CliConfigOverrides
    workDir?: string  // NEW — 默认 process.cwd()
}
```

---

## 5. 受影响文件

| 文件 | 改动 |
|:-----|:-----|
| `packages/cli/src/config/index.ts` | 新增 `inferRepoFromGitRemote()` + 集成到 `resolveRuntimeConfig()` |
| `packages/cli/src/config/index.test.ts` | 新增推断逻辑测试 |
| `packages/cli/src/app.ts` | `resolveRuntimeConfig({ ..., workDir: this.workDir })` 传递 workDir |
| `docs/guide/quick-start.md` | `--repo` 标记为可选（有 git remote 时） |

---

## 6. 边界与异常

| 场景 | 行为 |
|:-----|:-----|
| 已提供 `--repo` | 不触发推断 |
| 已设置 env var | 不触发推断 |
| 不在 git 仓库内 | `git` 命令失败 → 返回 `null` → 走现有 "Missing repositories" 错误 |
| 有多个 remote | 只取 `origin`，用户可通过 `--repo` 覆盖 |
| remote 是 GitHub Enterprise（自定义域名） | 正则不匹配 → 返回 `null` → 需手动 `--repo` |
| 仓库名含特殊字符 | URL 编码由 `git` 处理，正则匹配原始字符 |

---

## 7. 验证要点

- [ ] 在 GitHub 仓库内运行 `dependfix fix`，无需 `--repo`
- [ ] HTTPS / SSH 两种 remote 格式均正确解析
- [ ] `--repo` 显式指定时覆盖推断结果
- [ ] 非 git 目录 → 仍然报 "Missing target repositories"
- [ ] GitLab remote → 跳过推断，报 "Missing target repositories"
