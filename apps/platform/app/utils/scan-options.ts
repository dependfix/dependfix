import type { ScanMode, ScanSeverity } from '~/composables/use-scan-preferences'

type Translator = (key: string, params?: Record<string, string | number>) => string

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
    { label: 'Critical', value: 'critical' },
    { label: 'High', value: 'high' },
    { label: 'Medium', value: 'medium' },
    { label: t('common.severity.all'), value: 'all' },
]
