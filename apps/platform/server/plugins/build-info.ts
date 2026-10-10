import { defineNitroPlugin } from 'nitropack/runtime'
import { formatBuildInfoLine, resolveBuildInfo, resolveStartedAt } from '#server/utils/build-info'

/**
 * 启动期打印部署产物版本戳（stdout）：`docker logs` 可直接核对运行态 version / commit，
 * 无需请求健康端点。口径见 docs/standards/platform.md §10.7。
 */
export default defineNitroPlugin(() => {
    const config = useRuntimeConfig()
    console.info(formatBuildInfoLine(resolveBuildInfo(config), resolveStartedAt()))
})
