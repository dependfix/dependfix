import { describe, expect, it } from 'vitest'
import { createMcpServer } from './index'

describe('createMcpServer（冒烟：7 tool 注册）', () => {
    it('registers the 7 expected tools', () => {
        const server = createMcpServer()
        // McpServer 实例的 _registeredTools 以工具名为键
        const registered = (server as unknown as { _registeredTools: Record<string, unknown> })._registeredTools
        const toolNames = Object.keys(registered).sort()
        expect(toolNames).toEqual([
            'cleanup_branches',
            'discover_repos',
            'fetch_alerts',
            'fix_dependency',
            'get_last_report',
            'history',
            'run_scan',
        ])
    })
})
