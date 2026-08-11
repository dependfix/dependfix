import Aura from '@primeuix/themes/aura'
import { definePreset } from '@primeuix/themes'
import { parseDomainList } from './server/utils/email-domain'

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
        '@nuxtjs/i18n',
    ],
    // 国际化：zh-CN 默认无前缀 / en 加 /en 前缀；语言检测见 i18n/localeDetector.ts
    i18n: {
        strategy: 'prefix_and_default',
        defaultLocale: 'zh-CN',
        locales: [
            { code: 'zh-CN', name: '简体中文', file: 'zh-CN.json', language: 'zh-CN' },
            // code 决定 URL 前缀（/en）；language 保留完整语言标识用于 Accept-Language 匹配
            { code: 'en', name: 'English', file: 'en-US.json', language: 'en-US' },
        ],
        langDir: 'locales',
        lazy: true,
        // 检测交给自定义 localeDetector（URL > Cookie > Accept-Language > 默认），关闭模块内置浏览器检测避免双重逻辑
        detectBrowserLanguage: false,
        // Vue I18n 构建期配置（datetime/number 格式本地化），相对 app/i18n/ 解析
        vueI18n: './i18n.config.ts',
        experimental: {
            localeDetector: 'localeDetector.ts',
        },
    },
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
        // 认证部署模式（enterprise | public，互斥二选一，缺省 public）：
        // 登录方式与注册准入策略（enterprise 白名单 / public 黑名单）
        authMode: process.env.AUTH_MODE || 'public',
        // 注册域名名单（逗号分隔，原始字符串；auth.ts 经 parseDomainList 解析为数组）
        allowedEmailDomains: process.env.ALLOWED_EMAIL_DOMAINS || '',
        blockedEmailDomains: process.env.BLOCKED_EMAIL_DOMAINS || '',
        // OAuth 凭据（public 模式；均配置时才启用对应登录方式，未配置自动禁用不阻塞启动）
        githubClientId: process.env.GITHUB_CLIENT_ID || '',
        githubClientSecret: process.env.GITHUB_CLIENT_SECRET || '',
        googleClientId: process.env.GOOGLE_CLIENT_ID || '',
        googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
        // OIDC SSO（enterprise 模式；OIDC_DISCOVERY_URL + clientId/clientSecret 配置才启用；
        // 支持 issuer/authorizationUrl/tokenUrl/userInfoUrl/scopes 覆盖，兼容无 discovery 的 IdP）
        oidcDiscoveryUrl: process.env.OIDC_DISCOVERY_URL || '',
        oidcClientId: process.env.OIDC_CLIENT_ID || '',
        oidcClientSecret: process.env.OIDC_CLIENT_SECRET || '',
        oidcIssuer: process.env.OIDC_ISSUER || '',
        oidcAuthorizationUrl: process.env.OIDC_AUTHORIZATION_URL || '',
        oidcTokenUrl: process.env.OIDC_TOKEN_URL || '',
        oidcUserInfoUrl: process.env.OIDC_USERINFO_URL || '',
        oidcScopes: process.env.OIDC_SCOPES || '',
        // 扫描任务队列（渐进式降级）：REDIS_URL 可用时异步队列；不可用自动降级同步
        redisUrl: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
        // auto（默认）：Redis 探测决定 async/sync；true：强制队列（不可用降级同步 warn）；false：强制同步
        queueEnabled: process.env.QUEUE_ENABLED || 'auto',
        // 失败重试：次数 + 指数退避起点 ms（BullMQ backoff）
        queueJobRetries: process.env.QUEUE_JOB_RETRIES || '',
        queueBackoffMs: process.env.QUEUE_BACKOFF_MS || '',
        // 单容器部署：Nuxt 进程内消费队列（无需独立 worker 进程）
        inProcessWorker: process.env.IN_PROCESS_WORKER === 'true',
        public: {
            // 客户端可见配置（前端可见 env 一律 NUXT_PUBLIC_* 优先，普通 env 兜底：
            // 构建时内联 + 运行时 NUXT_PUBLIC_* 覆盖双通道，对齐 momei 写法）
            appName: 'dependfix',
            // 新建仓库默认分支（DEFAULT_BRANCH 为构建时注入，运行期修改需重建镜像）
            defaultBranch: process.env.NUXT_PUBLIC_DEFAULT_BRANCH || process.env.DEFAULT_BRANCH || 'main',
            // 认证模式（enterprise | public）：登录/注册页按模式展示登录方式与注册策略
            authMode: process.env.NUXT_PUBLIC_AUTH_MODE || process.env.AUTH_MODE || 'public',
            // 注册域名名单（enterprise 白名单域提示用；黑名单不暴露，最小暴露原则）
            allowedEmailDomains: parseDomainList(
                process.env.NUXT_PUBLIC_ALLOWED_EMAIL_DOMAINS || process.env.ALLOWED_EMAIL_DOMAINS || '',
            ),
            // 关闭注册总开关：前端隐藏注册入口
            registrationDisabled:
                process.env.NUXT_PUBLIC_REGISTRATION_DISABLED === 'true'
                || process.env.REGISTRATION_DISABLED === 'true',
            // OAuth 可用性布尔（仅基于根级 env 判断，与服务端 runtimeConfig 私有侧读取通道
            // 严格一致，避免 NUXT_PUBLIC_ 通道导致前后端显示不一致：凭据不通过 NUXT_PUBLIC_ 注入）
            githubAvailable: !!(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET),
            googleAvailable: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
            // OIDC 可用性布尔（enterprise 模式；OIDC_DISCOVERY_URL + clientId/clientSecret 均配置才 true）
            oidcAvailable: !!(
                (process.env.OIDC_DISCOVERY_URL || process.env.OIDC_ISSUER)
                && process.env.OIDC_CLIENT_ID
                && process.env.OIDC_CLIENT_SECRET
            ),
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
