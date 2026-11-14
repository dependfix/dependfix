<script setup lang="ts">
/**
 * 列表筛选条骨架（字段行 + 「重置」按钮）。
 *
 * 只负责布局与重置入口的显隐，不持有筛选态：字段通过默认插槽传入（用 `filter-field`），
 * 重置由页面清空自己的状态后触发重新筛选。三页字段集合与语义不同，骨架保持一致。
 */
defineProps<{
    /** 是否存在生效中的筛选（控制「重置」按钮可见性） */
    active: boolean
    /** 重置按钮文案 */
    resetLabel: string
}>()

const emit = defineEmits<{
    reset: []
}>()
</script>

<template>
    <section class="filter-bar">
        <slot />
        <CaomeiButton
            v-if="active"
            tone="neutral"
            size="sm"
            class="filter-bar__reset"
            @click="emit('reset')"
        >
            {{ resetLabel }}
        </CaomeiButton>
    </section>
</template>

<style lang="scss" scoped>
.filter-bar {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: $space-3;
    margin-bottom: $space-4;
}

.filter-bar__reset {
    margin-bottom: 1px;
}
</style>
