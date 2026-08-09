import type { Role } from './platform'

/**
 * 扩展 Nuxt 页面 meta：支持 `roles` 角色守卫。
 * 用法：`definePageMeta({ middleware: 'auth', roles: ['admin'] })`
 * 校验逻辑见 app/middleware/auth.ts。
 */
declare module '#app' {
    interface PageMeta {
        roles?: Role[]
    }
}
