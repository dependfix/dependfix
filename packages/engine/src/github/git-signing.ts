/**
 * git 执行语义隔离参数（单一事实源，engine 与平台侧共用）。
 *
 * 两类隔离：
 * 1. **签名语义**：宿主 `commit.gpgsign=true` / `push.gpgSign=true` 会让 dependfix 的 commit 带上宿主个人签名
 *    （或直接失败）、push 带上 `--signed`（服务端 `receive-pack` 不支持时报
 *    `the receiving end does not support --signed push`）。以 `-c <key>=false` 形式仅作用于该次调用
 *    即可隔离，且不写回任何配置文件；`-c` 的优先级高于 repo local / worktree / host global / system。
 *    背景与取证口径见 docs/standards/git.md §3.8。
 * 2. **hooks 语义**：被修复仓库若安装 husky / lint-staged（或自定义 `core.hooksPath`），其 `pre-commit` /
 *    `commit-msg` 钩子会在 dependfix 的自动 commit 时执行。这类钩子依赖 `npx` 与目标仓库完整
 *    `node_modules`，在隔离执行环境下通常不可用——生产实证会以 `npx: not found`（exit 127）中断 commit，
 *    进而触发 `COMMIT_FAILED` 与修复回滚。自动提交不应受目标仓库本地开发钩子约束，故在本次 commit
 *    调用内跳过 `pre-commit` / `commit-msg`。
 *
 * 策略：**不提供签名 / hooks opt-in**。
 */

/** commit 侧签名隔离参数。 */
export const GIT_COMMIT_SIGNING_ISOLATION_ARGS = ['-c', 'commit.gpgsign=false'] as const

/**
 * commit 侧 hooks 隔离参数——须置于 `commit` 子命令**之后**（`--no-verify` 是 commit 的子命令选项，
 * 而 `-c` 是 git 全局选项，二者位置不可互换）。
 *
 * 选型 `--no-verify` 而非 `-c core.hooksPath=<空目录>`：跨平台无需构造/保证目录存在，且同样覆盖
 * husky 的 `core.hooksPath` 重定向场景（实测对 `pre-commit` 非 0 退出与 `core.hooksPath` 两者等效，
 * 见 pr-creator.test.ts 的 hooks 隔离回归）。
 *
 * 边界：`--no-verify` 跳过 `pre-commit` / `commit-msg` / `prepare-commit-msg`，但**不跳过** `post-commit`
 * （git 语义：`post-commit` 在 commit 完成后运行且不能改变结果，其失败不影响 commit 成败）。
 */
export const GIT_COMMIT_HOOKS_ISOLATION_ARGS = ['--no-verify'] as const

/** push 侧签名隔离参数——覆盖 push / push --delete 等全部推送调用点。 */
export const GIT_PUSH_SIGNING_ISOLATION_ARGS = ['-c', 'push.gpgSign=false'] as const
