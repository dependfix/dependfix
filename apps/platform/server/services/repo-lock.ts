/**
 * 进程内同仓库互斥锁（FIFO 队列）。
 *
 * 用途：同步执行模型下同一仓库同时只允许一个扫描——防止容器执行器
 * 并发写同一 workDir（M6 单实例；M7 T702（见 docs/plan/backlog.md）换 BullMQ 队列承接多实例/优先级）。
 */
const repoLocks = new Map<string, Promise<void>>()

/** 串行执行：同一 repositoryId 的调用排队，前一个完成前不启动下一个。 */
export const withRepoLock = async <T>(repositoryId: string, fn: () => Promise<T>): Promise<T> => {
    const prev = repoLocks.get(repositoryId) ?? Promise.resolve()
    let release: () => void = () => { /* 初始 noop，Promise 构造后替换为真实 resolve */ }
    const current = new Promise<void>((resolve) => {
        release = resolve
    })
    // 链式排队：新请求等待上一个完成
    repoLocks.set(repositoryId, current)
    await prev
    try {
        return await fn()
    } finally {
        release()
        // 若队列中无后续请求（当前即队尾），清理锁
        if (repoLocks.get(repositoryId) === current) {
            repoLocks.delete(repositoryId)
        }
    }
}
