/**
 * git 签名语义隔离参数（单一事实源，engine 与平台侧共用）。
 *
 * 宿主 `commit.gpgsign=true` / `push.gpgSign=true` 会让 dependfix 的 commit 带上宿主个人签名
 * （或直接失败）、push 带上 `--signed`（服务端 `receive-pack` 不支持时报
 * `the receiving end does not support --signed push`）。以 `-c <key>=false` 形式仅作用于该次调用
 * 即可隔离，且不写回任何配置文件；`-c` 的优先级高于 repo local / worktree / host global / system。
 *
 * 策略：**不提供签名 opt-in**；完整背景、覆盖面、重开条件与取证口径见 docs/standards/git.md §3.8。
 */

/** commit 侧签名隔离参数。 */
export const GIT_COMMIT_SIGNING_ISOLATION_ARGS = ['-c', 'commit.gpgsign=false'] as const

/** push 侧签名隔离参数——覆盖 push / push --delete 等全部推送调用点。 */
export const GIT_PUSH_SIGNING_ISOLATION_ARGS = ['-c', 'push.gpgSign=false'] as const
