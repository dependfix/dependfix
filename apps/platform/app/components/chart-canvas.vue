<script setup lang="ts">
/**
 * `chart-canvas`: 极简 Chart.js Vue 包装组件。
 *
 * 动机：PrimeVue `<Chart>` 内部用 `import('chart.js/auto')`（200KB 全量），
 * 与本项目"tree-shakable 引入"原则冲突（dashboard 图表实际只用 doughnut + bar），
 * 自实现可避免 ~150KB 冗余 bundle 体积。
 *
 * 使用方式：参考 PrimeVue Chart 文档签名 `type / data / options / width / height / class`。
 *
 * SSR：Chart.js 引用 `window` / `document`，必须由 `<ClientOnly>` 包裹或保证仅 client 使用。
 * 父组件 dashboard.vue 已用 `<ClientOnly>` 包裹，无需额外处理。
 *
 * 相关文档：[docs/plan/todo.md §C61 仪表板告警图表（2026-08-20 启动）](../../plan/todo.md)
 */
import {
    ArcElement,
    BarController,
    BarElement,
    CategoryScale,
    Chart,
    DoughnutController,
    Legend,
    LinearScale,
    Tooltip,
    type ChartConfiguration,
    type ChartType,
} from 'chart.js'
import { onBeforeUnmount, ref, watch } from 'vue'

Chart.register(ArcElement, BarController, BarElement, CategoryScale, DoughnutController, LinearScale, Legend, Tooltip)

interface Props {
    type: ChartType
    data: ChartConfiguration['data']
    options?: ChartConfiguration['options']
    width?: string | number
    height?: string | number
    /** RG-W04 修复：canvas 元素无文本替代，aria-label 让屏幕阅读器可读图表内容 */
    ariaLabel?: string
}

const props = defineProps<Props>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
let chartInstance: Chart | null = null

const buildConfig = (): ChartConfiguration => ({
    type: props.type,
    data: props.data,
    options: props.options,
})

const createChart = (): void => {
    if (!canvasRef.value) return
    chartInstance = new Chart(canvasRef.value, buildConfig())
}

const updateChart = (): void => {
    if (!chartInstance) return
    chartInstance.data = props.data
    chartInstance.options = props.options ?? {}
    chartInstance.update()
}

onMounted(createChart)
watch(() => [props.data, props.options], updateChart, { deep: true })
onBeforeUnmount(() => {
    chartInstance?.destroy()
    chartInstance = null
})
</script>

<template>
    <canvas
        ref="canvasRef"
        :width="width"
        :height="height"
        :aria-label="ariaLabel"
        role="img"
    />
</template>
