<script setup lang="ts">
import { computed } from 'vue'
import { Moon, Sun } from '@lucide/vue'
import { useColorMode } from '~/composables/use-color-mode'
import { authClient } from '~/utils/auth-client'

const { session } = useSession()
const { dark, toggle, initColorMode } = useColorMode()

const { locale, setLocale, locales, t } = useI18n()
// 切换语言：setLocale 自动写 i18n_locale cookie，登录/未登录一致（偏好持久化）。
// caomei Select 的 `update:modelValue` 载荷为 OptionValue | null | undefined，非字符串载荷直接忽略。
const switchLocale = async (code: string | number | null | undefined) => {
    if (typeof code !== 'string') return
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

// nav 守卫（DRY：env-events / pr-checks / schedules 三处同款「非 viewer 可见」复用）：
// 与 admin-only 守卫（仅 L100 单处使用）区分，canAccessAdmin 表达「可访问管理面板」。
const canAccessAdmin = computed(() => session.value?.user?.role !== 'viewer')
</script>

<template>
    <div class="platform">
        <header class="platform__header">
            <div class="platform__brand">
                <img
                    src="/brand/logo-mark.svg"
                    alt=""
                    class="platform__brand-logo"
                    aria-hidden="true"
                >
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
                    v-if="canAccessAdmin"
                    to="/pr-checks"
                    class="platform__nav-link"
                    active-class="platform__nav-link--active"
                >
                    {{ t('common.nav.prChecks') }}
                </NuxtLink>
                <NuxtLink
                    v-if="canAccessAdmin"
                    to="/env-events"
                    class="platform__nav-link"
                    active-class="platform__nav-link--active"
                >
                    {{ t('common.nav.envEvents') }}
                </NuxtLink>
                <NuxtLink
                    v-if="canAccessAdmin"
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
                <div class="platform__lang">
                    <CaomeiSelect
                        :model-value="locale"
                        :options="locales"
                        option-label="name"
                        option-value="code"
                        size="sm"
                        @update:model-value="switchLocale"
                    />
                </div>
                <CaomeiButton
                    variant="ghost"
                    rounded
                    :label="t('common.nav.toggleDarkMode')"
                    @click="toggle"
                >
                    <template #icon>
                        <CaomeiIcon :icon="dark ? Sun : Moon" />
                    </template>
                </CaomeiButton>
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
                        <CaomeiAvatar
                            v-else
                            :fallback="(session.user.name || session.user.email || '?').slice(0, 1).toUpperCase()"
                            shape="circle"
                        />
                        <span class="platform__user-name">{{ session.user.name || session.user.email }}</span>
                    </NuxtLink>
                    <CaomeiButton
                        tone="neutral"
                        variant="ghost"
                        size="sm"
                        @click="logout"
                    >
                        {{ t('common.nav.logout') }}
                    </CaomeiButton>
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
