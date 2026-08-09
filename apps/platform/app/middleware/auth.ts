import type { Role } from '~/types/platform'

/**
 * 全局认证 + 角色守卫中间件。
 * 未登录跳转 /login；页面声明 `roles` 时校验当前用户角色（不匹配跳转 /dashboard）。
 * 角色缺失视为无权限（fail-closed），避免越权访问管理页面。
 */
export default defineNuxtRouteMiddleware((to) => {
    const { session } = useSession()

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
