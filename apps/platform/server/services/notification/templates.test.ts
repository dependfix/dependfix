import { describe, expect, it } from 'vitest'
import { renderEnvAlertTemplate, DEFAULT_NOTIFICATION_LOCALE } from './templates'

const baseData = {
    type: 'sandbox_unavailable',
    severity: 'error' as const,
    repository: 'demo/app',
    scanRunId: 'run-1',
    message: 'docker daemon stopped during scan',
    createdAt: '2026-08-20T10:00:00.000Z',
}

describe('renderEnvAlertTemplate', () => {
    it('zh-CN 默认 locale：subject 含 [错误] 前缀', () => {
        const out = renderEnvAlertTemplate(baseData)
        expect(out.subject).toContain('[错误] 环境告警')
        expect(out.subject).toContain('sandbox_unavailable')
        expect(out.subject).toContain('demo/app')
    })

    it('en-US locale：subject 含 [Error] 前缀', () => {
        const out = renderEnvAlertTemplate(baseData, 'en-US')
        expect(out.subject).toContain('[Error] Env Alert')
        expect(out.subject).toContain('sandbox_unavailable')
        expect(out.subject).toContain('demo/app')
    })

    it('severity 驱动 subject 前缀', () => {
        expect(renderEnvAlertTemplate({ ...baseData, severity: 'critical' }).subject).toContain('[严重]')
        expect(renderEnvAlertTemplate({ ...baseData, severity: 'warn' }, 'en-US').subject).toContain('[Warn]')
        expect(renderEnvAlertTemplate({ ...baseData, severity: 'info' }, 'en-US').subject).toContain('[Info]')
    })

    it('无 repository 时 subject 不含括号', () => {
        const out = renderEnvAlertTemplate({ ...baseData, repository: undefined })
        expect(out.subject).not.toContain('()')
        expect(out.subject).not.toContain('(undefined)')
    })

    it('html 包含事件类型、仓库、scanRunId、message、createdAt', () => {
        const out = renderEnvAlertTemplate(baseData)
        expect(out.html).toContain('sandbox_unavailable')
        expect(out.html).toContain('demo/app')
        expect(out.html).toContain('run-1')
        expect(out.html).toContain('docker daemon stopped during scan')
        expect(out.html).toContain('2026-08-20T10:00:00.000Z')
    })

    it('html 转义防 XSS：<script> → &lt;script&gt;', () => {
        const out = renderEnvAlertTemplate({
            ...baseData,
            message: '<script>alert("xss")</script>',
            repository: '<x>',
        })
        expect(out.html).toContain('&lt;script&gt;')
        expect(out.html).toContain('&lt;x&gt;')
        expect(out.html).not.toContain('<script>')
    })

    it('html 严重级别颜色对应（error 橙）', () => {
        const out = renderEnvAlertTemplate({ ...baseData, severity: 'error' })
        expect(out.html).toContain('#ea580c') // orange-600
    })

    it('html 无 repository/scanRunId 时不渲染对应行', () => {
        const out = renderEnvAlertTemplate({
            ...baseData,
            repository: undefined,
            scanRunId: undefined,
        })
        expect(out.html).not.toContain('关联仓库')
        expect(out.html).not.toContain('扫描运行')
    })

    it('text 版本包含关键字段', () => {
        const out = renderEnvAlertTemplate(baseData)
        expect(out.text).toContain('sandbox_unavailable')
        expect(out.text).toContain('demo/app')
        expect(out.text).toContain('docker daemon stopped during scan')
    })

    it('DEFAULT_NOTIFICATION_LOCALE === "zh-CN"', () => {
        expect(DEFAULT_NOTIFICATION_LOCALE).toBe('zh-CN')
    })
})
