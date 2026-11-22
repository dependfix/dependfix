import { defineNitroPlugin } from 'nitropack/runtime'
import { formatLogStartupLine, getLoggerState, getWinstonLogger, logger } from '#server/utils/logger'
import { captureLifecycleEvent, flushObservability } from '#server/utils/observability'
import { installProcessErrorHandlers } from '#server/utils/process-log'

/**
 * 进程级日志通道收口（HTTP 与队列 worker 两个进程都执行）。
 *
 * 职责：
 * 1. 安装未捕获异常 / 未处理 Promise 拒绝钩子（记录到错误文件后 exit(1)，不吞异常）
 * 2. 打印一行启动行（日志落点 / 级别 / 进程角色），便于 `docker logs` 直接核对
 * 3. nitro 关闭时卸载钩子并关闭文件流（dev 热重载 / 优雅停止都会走到）
 *
 * 分类：属于 `NON_HTTP_ONLY_PLUGINS`（worker 侧同样是执行面，必须能落盘），
 * 见 docs/standards/platform.md §10.6 与 §10.9。
 */
export default defineNitroPlugin((nitroApp) => {
    const uninstall = installProcessErrorHandlers()
    const state = getLoggerState()
    logger.info(formatLogStartupLine(state))
    // 可观测性启动事件（DSN 未配置时为 no-op）：确认进程角色与日志落点，便于与 Sentry release 对齐
    captureLifecycleEvent('platform_started', 'info', {
        role: state.env.PROCESS_ROLE,
        logDir: state.logDir,
        fileLogging: state.fileLogging,
        level: state.env.LOG_LEVEL,
    })

    nitroApp.hooks.hook('close', async () => {
        uninstall()
        // 关闭 transport 以冲刷缓冲并释放文件句柄（容器优雅停止时避免丢尾部日志）
        try {
            getWinstonLogger().close()
        } catch {
            // 关闭失败不阻断退出
        }
        // 冲刷待发送的 Sentry 事件（本插件两进程共用：worker 侧同样需要，observability 插件是 HTTP-only）
        await flushObservability(2000)
    })
})
