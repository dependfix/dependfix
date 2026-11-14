<script setup lang="ts">
/**
 * 列表筛选字段骨架（label + 控件堆叠）。
 *
 * 三个列表页的筛选字段此前各写一份结构与间距；抽为共享组件后只保留语义差异
 * （标签文案、控件类型），布局口径单点维护。刻意保持「薄」：不接管取值 / 校验 / 事件。
 */
withDefaults(defineProps<{
    /** 字段标签文案 */
    label: string
    /** 关联控件 id（label[for]） */
    forId: string
    /** 搜索类字段：占满剩余宽度并限宽（repos 搜索框口径） */
    grow?: boolean
    /** 宽字段：min-width 180（运行列表筛选口径） */
    wide?: boolean
    /** 标签使用次要文字色（列表页筛选口径） */
    muted?: boolean
}>(), {
    grow: false,
    wide: false,
    muted: false,
})
</script>

<template>
    <div
        class="filter-field"
        :class="{
            'filter-field--grow': grow,
            'filter-field--wide': wide,
            'filter-field--muted': muted
        }"
    >
        <label :for="forId">{{ label }}</label>
        <slot />
    </div>
</template>

<style lang="scss" scoped>
.filter-field {
    @include field-stack($space-1);

    min-width: 160px;

    label {
        font-size: $font-size-sm;
    }

    &--grow {
        flex: 1 1 220px;
        max-width: 320px;
    }

    &--wide {
        min-width: 180px;
    }

    &--muted label {
        color: $color-text-muted;
    }
}
</style>
