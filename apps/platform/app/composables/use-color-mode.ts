import { ref, type Ref } from 'vue'

interface ColorModeState {
    dark: Ref<boolean>
    isDark: () => boolean
    toggle: () => void
    initColorMode: () => void
}

/**
 * 暗色模式切换（PrimeVue darkModeSelector: '.dark'）。
 * 通过 <html> 上的 .dark class 切换，偏好持久化到 localStorage。
 */
const dark = ref(false)

export function useColorMode(): ColorModeState {
    const isDark = (): boolean => document.documentElement.classList.contains('dark')

    const apply = (value: boolean): void => {
        dark.value = value
        document.documentElement.classList.toggle('dark', value)
        if (value) {
            document.documentElement.style.colorScheme = 'dark'
        } else {
            document.documentElement.style.colorScheme = 'light'
        }
        localStorage.setItem('dependfix-color-mode', value ? 'dark' : 'light')
    }

    const initColorMode = (): void => {
        const saved = localStorage.getItem('dependfix-color-mode')
        if (saved === 'dark' || saved === 'light') {
            apply(saved === 'dark')
            return
        }
        // 未保存偏好时跟随系统
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
        apply(prefersDark)
    }

    const toggle = (): void => apply(!isDark())

    return {
        dark,
        isDark,
        toggle,
        initColorMode,
    }
}
