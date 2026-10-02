import { defineNitroPlugin } from 'nitropack/runtime'
import { bootstrapDatabase } from '#server/utils/database-bootstrap'

/**
 * 启动期数据库引导插件：显式初始化 DataSource 并输出就绪日志。
 * 核心逻辑与运行形态见 `#server/utils/database-bootstrap`。
 */
export default defineNitroPlugin(() => {
    // Nitro 插件不阻塞监听：此处与首次请求共享 ensureDatabaseInitialized 的 single-flight promise，
    // 迁移仍是幂等的；migrate-only 模式在该 promise 完成后退出进程。
    void bootstrapDatabase().catch((error) => {
        console.error('[database] 启动期引导异常（非致命）:', error)
        // 迁移专用模式是宿主脚本的一次性容器调用，异常必须显式失败退出（避免容器挂起）
        if (process.env.DEPENDFIX_MIGRATIONS_ONLY === 'true') {
            process.exit(1)
        }
    })
})
