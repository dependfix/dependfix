import Aura from '@primeuix/themes/aura'
import { definePreset } from '@primeuix/themes'

// 自定义 PrimeVue 主题预设：语义主色（青灰）跟随明暗模式
const DependfixPreset = definePreset(Aura, {
    semantic: {
        primary: {
            '50': '#f0fdfa',
            '100': '#ccfbf1',
            '200': '#99f6e4',
            '300': '#5eead4',
            '400': '#2dd4bf',
            '500': '#14b8a6',
            '600': '#0d9488',
            '700': '#0f766e',
            '800': '#115e59',
            '900': '#134e4a',
            '950': '#042f2e',
        },
    },
})

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
    compatibilityDate: '2025-08-01',
    devtools: { enabled: false },
    modules: [
        '@primevue/nuxt-module',
    ],
    css: [
        'primeicons/primeicons.css',
        '@/assets/styles/main.scss',
    ],
    primevue: {
        options: {
            theme: {
                preset: DependfixPreset,
                options: {
                    darkModeSelector: '.dark',
                    cssLayer: {
                        name: 'primevue',
                        order: 'theme, base, primevue',
                    },
                },
            },
        },
    },
    runtimeConfig: {
        // 服务端私有配置（NUXT_ 前缀环境变量可覆盖）
        // 构建期默认值仅用于开发；生产必须通过 NUXT_AUTH_SECRET 注入（getAuth 启动校验强制）
        authSecret: process.env.AUTH_SECRET || 'dev-secret-change-me',
        encryptionKey: process.env.ENCRYPTION_KEY || '',
        smtpEnabled: !!process.env.SMTP_HOST,
        // 关闭注册（保留登录）：公开部署时设置 REGISTRATION_DISABLED=true
        registrationDisabled: process.env.REGISTRATION_DISABLED === 'true',
        public: {
            // 客户端可见配置
            appName: 'dependfix',
        },
    },
    vite: {
        resolve: {
            dedupe: [
                'primevue',
                '@primevue/core',
                '@primeuix/styled',
                '@primeuix/styles',
                '@primeuix/themes',
            ],
        },
        css: {
            preprocessorOptions: {
                scss: {
                    additionalData: '@use "@/assets/styles/_variables.scss" as *; @use "@/assets/styles/_mixins.scss" as *;',
                },
            },
        },
    },
    typescript: {
        tsConfig: {
            compilerOptions: {
                esModuleInterop: true,
                emitDecoratorMetadata: true,
                experimentalDecorators: true,
                strictPropertyInitialization: false,
            },
        },
    },
    nitro: {
        esbuild: {
            options: {
                tsconfigRaw: {
                    compilerOptions: {
                        experimentalDecorators: true,
                    },
                },
            },
        },
    },
})
