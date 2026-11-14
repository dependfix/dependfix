import { describe, expect, it } from 'vitest'
import { scanModeLabel, scanModeOptions, scanSeverityLabel, scanSeverityOptions } from '../../app/utils/scan-options'
import { SCAN_MODES, SCAN_SEVERITIES } from '../../app/composables/use-scan-preferences'
import { severityLabel } from '../../shared/severity-labels'

/** i18n key 直出（标签即 key），便于断言选项取值与文案 key */
const t = (key: string) => key

describe('utils/scan-options', () => {
    it('模式选项取值与 SCAN_MODES 完全一致（含顺序）', () => {
        expect(scanModeOptions(t).map((option) => option.value)).toEqual(SCAN_MODES)
    })

    it('严重级别选项取值与 SCAN_SEVERITIES 完全一致（含顺序）', () => {
        expect(scanSeverityOptions(t).map((option) => option.value)).toEqual(SCAN_SEVERITIES)
    })

    it('模式标签走 i18n key', () => {
        expect(scanModeOptions(t).map((option) => option.label)).toEqual([
            'common.scanMode.reportOnly',
            'common.scanMode.fix',
            'common.scanMode.fixAndPr',
        ])
    })

    it('严重级别标签：专有名词原样 + 「全部」走 i18n key', () => {
        expect(scanSeverityOptions(t).map((option) => option.label)).toEqual([
            'Critical',
            'High',
            'Medium',
            'common.severity.all',
        ])
    })

    it('展示标签按值查找（含「全部」走 i18n）；未命中原样返回', () => {
        expect(scanSeverityLabel('critical', t)).toBe('Critical')
        expect(scanSeverityLabel('high', t)).toBe('High')
        expect(scanSeverityLabel('medium', t)).toBe('Medium')
        expect(scanSeverityLabel('all', t)).toBe('common.severity.all')
        // alerts 的 unknown 是合法取值，走共享标签表
        expect(scanSeverityLabel('unknown', t)).toBe('Unknown')
        // 真正未知 / 历史值原样返回（不空白、不误映射）
        expect(scanSeverityLabel('bogus', t)).toBe('bogus')
        expect(scanSeverityLabel('', t)).toBe('')
    })

    it('模式展示标签：命中走 i18n key，未命中原样返回', () => {
        expect(scanModeLabel('report-only', t)).toBe('common.scanMode.reportOnly')
        expect(scanModeLabel('fix-and-pr', t)).toBe('common.scanMode.fixAndPr')
        expect(scanModeLabel('legacy-mode', t)).toBe('legacy-mode')
    })

    it('共享标签表：五个扫描级别 + 未知值回退（前端与服务端同源）', () => {
        expect(severityLabel('critical')).toBe('Critical')
        expect(severityLabel('high')).toBe('High')
        expect(severityLabel('medium')).toBe('Medium')
        expect(severityLabel('low')).toBe('Low')
        expect(severityLabel('unknown')).toBe('Unknown')
        expect(severityLabel('custom')).toBe('custom')
    })
})
