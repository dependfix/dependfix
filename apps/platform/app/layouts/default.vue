<script setup lang="ts">
import { useColorMode } from '~/composables/use-color-mode'
import { authClient } from '~/utils/auth-client'

const { session } = useSession()
const { dark, toggle, initColorMode } = useColorMode()

onMounted(() => {
    initColorMode()
})

const logout = async () => {
    await authClient.signOut()
    await refreshNuxtData()
    await navigateTo('/login')
}
</script>

<template>
    <div class="platform">
        <header class="platform__header">
            <div class="platform__brand">
                <span class="pi pi-shield" aria-hidden="true" />
                <span>dependfix</span>
            </div>
            <nav v-if="session?.user" class="platform__nav">
                <NuxtLink
                    to="/dashboard"
                    class="platform__nav-link"
                    active-class="platform__nav-link--active"
                >
                    仪表板
                </NuxtLink>
                <NuxtLink
                    to="/repos"
                    class="platform__nav-link"
                    active-class="platform__nav-link--active"
                >
                    仓库
                </NuxtLink>
                <NuxtLink
                    to="/alerts"
                    class="platform__nav-link"
                    active-class="platform__nav-link--active"
                >
                    告警
                </NuxtLink>
                <NuxtLink
                    v-if="session?.user?.role !== 'viewer'"
                    to="/schedules"
                    class="platform__nav-link"
                    active-class="platform__nav-link--active"
                >
                    定时计划
                </NuxtLink>
                <NuxtLink
                    to="/credentials"
                    class="platform__nav-link"
                    active-class="platform__nav-link--active"
                >
                    凭据
                </NuxtLink>
                <NuxtLink
                    v-if="session?.user?.role === 'admin'"
                    to="/users"
                    class="platform__nav-link"
                    active-class="platform__nav-link--active"
                >
                    用户
                </NuxtLink>
            </nav>
            <div class="platform__actions">
                <Button
                    :icon="dark ? 'pi pi-sun' : 'pi pi-moon'"
                    text
                    rounded
                    aria-label="切换暗色模式"
                    @click="toggle"
                />
                <template v-if="session?.user">
                    <NuxtLink
                        to="/settings"
                        class="platform__user"
                        title="个人设置"
                    >
                        <img
                            v-if="session.user.image"
                            :src="session.user.image"
                            alt="头像"
                            class="platform__avatar"
                        >
                        <Avatar
                            v-else
                            :label="(session.user.name || session.user.email || '?').slice(0, 1).toUpperCase()"
                            shape="circle"
                            size="small"
                        />
                        <span class="platform__user-name">{{ session.user.name || session.user.email }}</span>
                    </NuxtLink>
                    <Button
                        label="退出登录"
                        severity="secondary"
                        text
                        size="small"
                        @click="logout"
                    />
                </template>
            </div>
        </header>
        <main class="platform__body">
            <div class="platform__content">
                <slot />
            </div>
        </main>
    </div>
</template>
