import { severityLabel } from '#shared/severity-labels'
import type { ScanMode, ScanSeverity } from '~/composables/use-scan-preferences'

export type Translator = (key: string, params?: Record<string, string | number>) => string

/**
 * 扫描参数下拉选项（单仓库扫描弹窗 / 批量扫描弹窗 / 设置页默认值三处共用）。
 *
 * 抽为 util 而非各 SFC 内联：标签口径属于同一事实源（见 [platform.md §7.3](../../../../docs/standards/platform.md#73-utility-抽取与跨组件共享)），
 * 取值与 `use-scan-preferences` 的 `SCAN_MODES` / `SCAN_SEVERITIES` 对齐（单测断言）。
 */

/** 扫描模式选项（report-only / fix / fix-and-pr） */
export const scanModeOptions = (t: Translator): { label: string, value: ScanMode }[] => [
    { label: t('common.scanMode.reportOnly'), value: 'report-only' },
    { label: t('common.scanMode.fix'), value: 'fix' },
    { label: t('common.scanMode.fixAndPr'), value: 'fix-and-pr' },
]

/** 严重级别选项（Critical / High / Medium 为专有名词，不走 i18n；「全部」走 common.severity.all） */
export const scanSeverityOptions = (t: Translator): { label: string, value: ScanSeverity }[] => [
    { label: severityLabel('critical'), value: 'critical' },
    { label: severityLabel('high'), value: 'high' },
    { label: severityLabel('medium'), value: 'medium' },
    { label: t('common.severity.all'), value: 'all' },
]

/** 扫描模式展示标签（未命中回退原值；设置页「当前生效默认」等处复用） */
export const scanModeLabel = (value: string, t: Translator): string =>
    scanModeOptions(t).find((option) => option.value === value)?.label ?? value

/**
 * 严重级别**展示标签**（展示口径单一事实源）：标签来自 `shared/severity-labels`，未命中（历史数据 / 未知枚举）原样返回。
 *
 * 全仓 `severityThreshold` 展示点一律经此函数渲染——含 `all` 走 i18n、其余统一首字母大写。
 * 此前存在三种口径（小写直通 / 大驼峰硬编码映射 / raw 直通），收敛后口径变更只改共享标签表。
 */
export const scanSeverityLabel = (value: string, t: Translator): string =>
    value === 'all' ? t('common.severity.all') : severityLabel(value)
