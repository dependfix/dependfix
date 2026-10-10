import { parseDomainList } from './server/utils/email-domain'
import { localeDetectorFile, nuxtI18n } from './i18n/nuxt-i18n-config'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
    compatibilityDate: '2025-08-01',
    devtools: { enabled: false },
    // 全站 favicon + 社交分享卡片：
    // SVG favicon 优先（现代浏览器原生支持），同时声明 PNG 兜底（部分平台 / 渲染器不支持 SVG）
    // apple-touch-icon 走 PNG（iOS Safari 强制 PNG），og:image 走 PNG（社交平台兼容）
    // 资产单一来源为仓库根 assets/brand/svg/ + assets/brand/png/，公共目录副本保持同步
    app: {
        head: {
            meta: [
                { property: 'og:image', content: '/brand/og-image.png' },
                { property: 'og:image:width', content: '1200' },
                { property: 'og:image:height', content: '630' },
                { property: 'og:image:alt', content: 'dependfix' },
                { name: 'twitter:card', content: 'summary_large_image' },
                { name: 'twitter:image', content: '/brand/og-image.png' },
                { name: 'twitter:image:alt', content: 'dependfix' },
            ],
            link: [
                { rel: 'icon', type: 'image/svg+xml', href: '/brand/favicon.svg' },
                // PNG 兜底：浏览器/平台不支持 SVG 时的 fallback
                { rel: 'alternate icon', type: 'image/png', sizes: '32x32', href: '/brand/favicon-32.png' },
                // iOS Safari 添加到主屏幕时强制 PNG
                { rel: 'apple-touch-icon', sizes: '180x180', href: '/brand/apple-touch-icon.png' },
            ],
        },
    },
    modules: [
        'caomei-ui/nuxt',
        '@nuxtjs/i18n',
    ],
    // caomei-ui 主题接线：模块的 `theme` 只生成一条跨明暗的 `:root` 声明，
    // 因此这里只声明跨主题稳定的 token（实底色 / 亮色档）；
    // 随明暗自适应的 token（primary / bg / text / border）暗色档见 app/assets/styles/_caomei-tokens.scss。
    caomeiUI: {
        prefix: 'Caomei',
        darkMode: 'class',
        theme: {
            // teal-600：soft 底 / 文字 / 边框强调（与 `_variables.scss` 的 `$color-primary-dark` 对齐）
            primary: '#0d9488',
            // teal-700：实底背景色，配 `--caomei-color-on-solid`（白）达 AA 4.5:1；
            // 该 token 跨明暗稳定，不随暗色档变化
            'primary-solid': '#0f766e',
            // 自适应主色作底时的前景色：库默认亮色档为白（配 #0d9488 仅 3.74:1 < AA），
            // 改深色前景后亮色档 5.25:1 达标；暗色档主色为 #5eead4（亮青），库默认前景本就是
            // #0b0b0d，故该跨明暗单值不会造成暗色回归
            'primary-foreground': '#0b0b0d',
            bg: '#fff',
            'bg-elevated': '#f8fafc',
            text: '#334155',
            'text-muted': '#94a3b8',
            border: '#e2e8f0',
        },
    },
    // 国际化：单点声明见 i18n/i18n.config.ts（locales / strategy / detectBrowserLanguage / detector 路径）
    i18n: {
        ...nuxtI18n,
        vueI18n: './i18n.config.ts',
        experimental: { localeDetector: localeDetectorFile },
    },
    css: [
        '@/assets/styles/main.scss',
    ],
    runtimeConfig: {
        // 服务端私有配置（NUXT_ 前缀环境变量可覆盖）
        // 部署产物版本戳（构建期 Docker ARG → 运行时 NUXT_BUILD_VERSION/NUXT_BUILD_COMMIT 覆盖）：
        // 构建期未注入时缺省 unknown（不阻断启动）；供 GET /api/health 与启动日志核对运行态产物。
        // 口径见 docs/standards/platform.md §10.7。
        buildVersion: process.env.NUXT_BUILD_VERSION || 'unknown',
        buildCommit: process.env.NUXT_BUILD_COMMIT || 'unknown',
        // 构建期默认值仅用于开发；生产必须通过 NUXT_AUTH_SECRET 注入（getAuth 启动校验强制）
        authSecret: process.env.AUTH_SECRET || 'dev-secret-change-me',
        encryptionKey: process.env.NUXT_ENCRYPTION_KEY || '',
        // SMTP 配置（私有，运行时 NUXT_ 前缀可覆盖；不进 public bundle）。
        // smtpEnabled 派生自 smtpHost 存在性，向后兼容旧 env-only 行为。
        // 端口默认 587（STARTTLS 明文升级）；SMTP_PORT=465 走 TLS；user/pass 可选（匿名 relay 场景）。
        // SMTP_PASS 仅在服务端私有 config 读取；不暴露给前端（runtimeConfig.public 不引用）。
        smtpHost: process.env.SMTP_HOST || '',
        smtpPort: parseInt(process.env.SMTP_PORT || '587', 10),
        smtpUser: process.env.SMTP_USER || '',
        smtpPass: process.env.SMTP_PASS || '',
        smtpFrom: process.env.SMTP_FROM || '',
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
        // 扫描任务队列（渐进式降级，含消费者维度）：Redis 可用且存在消费者时才异步；否则自动降级同步
        redisUrl: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
        // auto（默认）：Redis 可用且本进程消费队列（inProcessWorker）才 async，否则 sync；
        // true：强制异步（Redis 不可用降级同步 + warn）；false：强制同步
        queueEnabled: process.env.QUEUE_ENABLED || 'auto',
        // 失败重试：次数 + 指数退避起点 ms（BullMQ backoff）
        queueJobRetries: process.env.QUEUE_JOB_RETRIES || '',
        queueBackoffMs: process.env.QUEUE_BACKOFF_MS || '',
        // 单容器部署：Nuxt 进程内消费队列（当前阶段唯一消费者；auto 模式下 false 会降级同步）
        inProcessWorker: process.env.IN_PROCESS_WORKER === 'true',
        // e2e/fixtures 端点放行开关（hard requirement：platform.md §3.6 + security.md §2.1.4）：
        // 生产构建默认 false（NUXT_E2E_FIXTURES_ALLOWED 未设）；仅 e2e webServer 启动时显式开启。
        // 注意：不能直接用 process.env.NODE_ENV 作第二门控——Nitro/esbuild 构建期会把
        // process.env.NODE_ENV 静态替换为构建时值，折叠表达式导致 prod build 永远 404。
        // runtimeConfig 是 Nuxt 官方运行时覆盖通道（NUXT_ 前缀），可绕开 esbuild define。
        e2eFixturesAllowed: process.env.NUXT_E2E_FIXTURES_ALLOWED === 'true' || process.env.E2E_TEST === 'true',
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
