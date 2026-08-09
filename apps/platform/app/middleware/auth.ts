import type { Role } from '~/types/platform'

/**
 * 全局认证 + 角色守卫中间件。
 * 未登录跳转 /login；页面声明 `roles` 时校验当前用户角色（不匹配跳转 /dashboard）。
 * 角色缺失视为无权限（fail-closed），避免越权访问管理页面。
 *
 * 关键：useSession() 基于 useAsyncData 异步填充，middleware 必须 await 数据就绪
 * 才能读取会话——否则 SSR 首屏时 session 恒为 undefined，所有受保护页面被误跳 /login
 * （浏览器验证 Blocker-1 实证：API 会话有效但页面全部 302 回登录页）。
 */
const waitForSessionReady = async (isPending: Ref<boolean>): Promise<void> => {
    if (!isPending.value) {
        return
    }
    await new Promise<void>((resolve) => {
        const stop = watch(isPending, (value) => {
            if (!value) {
                stop()
                resolve()
            }
        })
    })
}

export default defineNuxtRouteMiddleware(async (to) => {
    const { session, isPending } = useSession()
    await waitForSessionReady(isPending)

    if (!session.value?.user) {
        return navigateTo('/login')
    }

    const requiredRoles = to.meta.roles as Role[] | undefined
    if (requiredRoles?.length) {
        const userRole = session.value.user.role as Role | null | undefined
        if (!userRole || !requiredRoles.includes(userRole)) {
            return navigateTo('/dashboard')
        }
    }
})
