<script setup lang="ts">
import { useColorMode } from '~/composables/use-color-mode'
import { authClient } from '~/utils/auth-client'

const { session } = useSession()
const { dark, toggle, initColorMode } = useColorMode()

const { locale, setLocale, locales, t } = useI18n()
// 切换语言：setLocale 自动写 i18n_locale cookie，登录/未登录一致（偏好持久化）
const switchLocale = async (code: string) => {
    await setLocale(code as typeof locale.value)
}

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
                    {{ t('common.nav.dashboard') }}
                </NuxtLink>
                <NuxtLink
                    to="/repos"
                    class="platform__nav-link"
                    active-class="platform__nav-link--active"
                >
                    {{ t('common.nav.repos') }}
                </NuxtLink>
                <NuxtLink
                    to="/scans"
                    class="platform__nav-link"
                    active-class="platform__nav-link--active"
                >
                    {{ t('common.nav.scans') }}
                </NuxtLink>
                <NuxtLink
                    to="/alerts"
                    class="platform__nav-link"
                    active-class="platform__nav-link--active"
                >
                    {{ t('common.nav.alerts') }}
                </NuxtLink>
                <NuxtLink
                    v-if="session?.user?.role !== 'viewer'"
                    to="/pr-checks"
                    class="platform__nav-link"
                    active-class="platform__nav-link--active"
                >
                    {{ t('prChecks.title') }}
                </NuxtLink>
                <NuxtLink
                    v-if="session?.user?.role !== 'viewer'"
                    to="/env-events"
                    class="platform__nav-link"
                    active-class="platform__nav-link--active"
                >
                    {{ t('common.nav.envEvents') }}
                </NuxtLink>
                <NuxtLink
                    v-if="session?.user?.role !== 'viewer'"
                    to="/schedules"
                    class="platform__nav-link"
                    active-class="platform__nav-link--active"
                >
                    {{ t('common.nav.schedules') }}
                </NuxtLink>
                <NuxtLink
                    to="/batch-runs"
                    class="platform__nav-link"
                    active-class="platform__nav-link--active"
                >
                    {{ t('common.nav.batchRuns') }}
                </NuxtLink>
                <NuxtLink
                    to="/credentials"
                    class="platform__nav-link"
                    active-class="platform__nav-link--active"
                >
                    {{ t('common.nav.credentials') }}
                </NuxtLink>
                <NuxtLink
                    v-if="session?.user?.role === 'admin'"
                    to="/users"
                    class="platform__nav-link"
                    active-class="platform__nav-link--active"
                >
                    {{ t('common.nav.users') }}
                </NuxtLink>
            </nav>
            <div class="platform__actions">
                <Select
                    :model-value="locale"
                    :options="locales"
                    option-label="name"
                    option-value="code"
                    size="small"
                    class="platform__lang"
                    @update:model-value="switchLocale"
                />
                <Button
                    :icon="dark ? 'pi pi-sun' : 'pi pi-moon'"
                    text
                    rounded
                    :aria-label="t('common.nav.toggleDarkMode')"
                    @click="toggle"
                />
                <template v-if="session?.user">
                    <NuxtLink
                        to="/settings"
                        class="platform__user"
                        :title="t('common.nav.userSettings')"
                    >
                        <img
                            v-if="session.user.image"
                            :src="session.user.image"
                            :alt="t('common.nav.userAvatar')"
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
                        :label="t('common.nav.logout')"
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
