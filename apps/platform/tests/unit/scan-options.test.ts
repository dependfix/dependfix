import { describe, expect, it } from 'vitest'
import { scanModeOptions, scanSeverityOptions } from '../../app/utils/scan-options'
import { SCAN_MODES, SCAN_SEVERITIES } from '../../app/composables/use-scan-preferences'

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
})
