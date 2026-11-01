<script setup lang="ts">
import { ShieldCheck } from '@lucide/vue'
import type { SocialProvider } from '~/utils/social-providers'

/**
 * 第三方登录按钮：图标使用目标平台的官方标识（GitHub mark / Google G），
 * enterprise SSO 无统一品牌标识，回退到通用盾牌图标。
 *
 * 图标来源：GitHub mark 取 Simple Icons 的官方单色路径（CC0）；Google「G」取 Google Identity
 * 官方四色标识，均只用于第三方登录入口的识别。GitHub mark 跟随 `currentColor` 适配明暗主题，
 * Google 四色不随主题改色（品牌规范）。
 *
 * 视觉基座用 caomei `secondary`（描边 + 卡片底色）：`ghost` 变体没有边界，
 * 与下方「立即注册」文本链接在视觉上无法区分，第三方登录入口容易被漏看。
 */
defineProps<{
    provider: SocialProvider
    label: string
}>()

const emit = defineEmits<{
    select: []
}>()
</script>

<template>
    <CaomeiButton
        class="social-login-button"
        :data-provider="provider"
        variant="secondary"
        block
        @click="emit('select')"
    >
        <template #icon>
            <!-- GitHub mark（Simple Icons 官方单色路径，跟随文字色适配明暗主题） -->
            <svg
                v-if="provider === 'github'"
                class="social-login-button__brand"
                viewBox="0 0 24 24"
                aria-hidden="true"
                focusable="false"
            >
                <path
                    fill="currentColor"
                    d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"
                />
            </svg>
            <!-- Google「G」官方四色标识：品牌规范要求保留原色，不随主题改色 -->
            <svg
                v-else-if="provider === 'google'"
                class="social-login-button__brand"
                viewBox="0 0 48 48"
                aria-hidden="true"
                focusable="false"
            >
                <path
                    fill="#EA4335"
                    d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                />
                <path
                    fill="#4285F4"
                    d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                />
                <path
                    fill="#FBBC05"
                    d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                />
                <path
                    fill="#34A853"
                    d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                />
            </svg>
            <CaomeiIcon
                v-else
                :icon="ShieldCheck"
            />
        </template>
        {{ label }}
    </CaomeiButton>
</template>

<style lang="scss" scoped>
.social-login-button {
    // 品牌图标与文案之间留出比默认 4px 更宽松的间距，避免图标挤在首字上
    gap: $space-2;

    &__brand {
        display: block;
        flex-shrink: 0;
        width: 1.125rem;
        height: 1.125rem;
    }
}
</style>
