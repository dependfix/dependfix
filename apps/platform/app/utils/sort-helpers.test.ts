import { describe, expect, it } from 'vitest'
import {
    ENV_EVENT_SEVERITY_RANK,
    FIX_STATUS_RANK,
    ROLE_RANK,
    RUN_STATUS_RANK,
    SEVERITY_RANK,
    STATUS_RANK,
    updateRoleRank,
    updateStatusRank,
    withEnvEventSeverityRank,
    withFixStatusRank,
    withRoleRank,
    withRunStatusRank,
    withSeverityRank,
    withStatusRank,
} from './sort-helpers'

describe('SEVERITY_RANK', () => {
    it('ranks critical > high > medium > low > unknown (业务语义排序)', () => {
        expect(SEVERITY_RANK.critical).toBeGreaterThan(SEVERITY_RANK.high ?? 0)
        expect(SEVERITY_RANK.high).toBeGreaterThan(SEVERITY_RANK.medium ?? 0)
        expect(SEVERITY_RANK.medium).toBeGreaterThan(SEVERITY_RANK.low ?? 0)
        expect(SEVERITY_RANK.low).toBeGreaterThan(SEVERITY_RANK.unknown ?? 0)
    })

    it('所有 5 个预定义严重级别都有排序键', () => {
        expect(Object.keys(SEVERITY_RANK).sort()).toEqual(['critical', 'high', 'low', 'medium', 'unknown'])
    })
})

describe('STATUS_RANK', () => {
    it('ranks running > completed > failed (运行中优先看)', () => {
        expect(STATUS_RANK.running).toBeGreaterThan(STATUS_RANK.completed ?? 0)
        expect(STATUS_RANK.completed).toBeGreaterThan(STATUS_RANK.failed ?? 0)
    })

    it('所有 3 个预定义状态都有排序键', () => {
        expect(Object.keys(STATUS_RANK).sort()).toEqual(['completed', 'failed', 'running'])
    })
})

describe('FIX_STATUS_RANK', () => {
    it('ranks success > converged > skipped > pending > failed (已修复优先)', () => {
        expect(FIX_STATUS_RANK.success).toBeGreaterThan(FIX_STATUS_RANK.converged ?? 0)
        expect(FIX_STATUS_RANK.converged).toBeGreaterThan(FIX_STATUS_RANK.skipped ?? 0)
        expect(FIX_STATUS_RANK.skipped).toBeGreaterThan(FIX_STATUS_RANK.pending ?? 0)
        expect(FIX_STATUS_RANK.pending).toBeGreaterThan(FIX_STATUS_RANK.failed ?? 0)
    })
})

describe('ROLE_RANK', () => {
    it('ranks admin > org_admin > viewer (管理员优先)', () => {
        expect(ROLE_RANK.admin).toBeGreaterThan(ROLE_RANK.org_admin ?? 0)
        expect(ROLE_RANK.org_admin).toBeGreaterThan(ROLE_RANK.viewer ?? 0)
    })
})

describe('ENV_EVENT_SEVERITY_RANK (env-events 专用)', () => {
    it('ranks critical > error > warn > info (严重优先)', () => {
        expect(ENV_EVENT_SEVERITY_RANK.critical).toBeGreaterThan(ENV_EVENT_SEVERITY_RANK.error ?? 0)
        expect(ENV_EVENT_SEVERITY_RANK.error).toBeGreaterThan(ENV_EVENT_SEVERITY_RANK.warn ?? 0)
        expect(ENV_EVENT_SEVERITY_RANK.warn).toBeGreaterThan(ENV_EVENT_SEVERITY_RANK.info ?? 0)
    })

    it('所有 4 个预定义严重级别都有排序键', () => {
        expect(Object.keys(ENV_EVENT_SEVERITY_RANK).sort()).toEqual(['critical', 'error', 'info', 'warn'])
    })

    it('与 alerts SEVERITY_RANK 值集不重叠（值集独立）', () => {
        // env-events 值集：critical/error/warn/info；alerts 值集：critical/high/medium/low/unknown
        // 仅共享 critical，避免 key 冲突导致 sort 字段污染
        const alertsKeys = new Set(Object.keys(SEVERITY_RANK))
        const envKeys = new Set(Object.keys(ENV_EVENT_SEVERITY_RANK))
        const overlap = [...envKeys].filter((k) => alertsKeys.has(k))
        expect(overlap).toEqual(['critical'])
    })
})

describe('withEnvEventSeverityRank', () => {
    it('为每个对象添加 _severityRank 派生字段（使用 ENV_EVENT_SEVERITY_RANK）', () => {
        const items = [
            { id: '1', severity: 'critical' },
            { id: '2', severity: 'error' },
            { id: '3', severity: 'warn' },
            { id: '4', severity: 'info' },
        ]
        const result = withEnvEventSeverityRank(items)
        expect(result[0]!._severityRank).toBe(4)
        expect(result[1]!._severityRank).toBe(3)
        expect(result[2]!._severityRank).toBe(2)
        expect(result[3]!._severityRank).toBe(1)
    })

    it('未知 severity 落到 0（最低）', () => {
        const items = [{ id: '1', severity: 'unspecified' }]
        expect(withEnvEventSeverityRank(items)[0]!._severityRank).toBe(0)
    })

    it('保留原对象的所有字段（泛型 + 派生扩展）', () => {
        const items = [{ id: '1', severity: 'critical', type: 'sandbox_unavailable' }]
        const result = withEnvEventSeverityRank(items)
        expect(result[0]!.id).toBe('1')
        expect(result[0]!.severity).toBe('critical')
        expect(result[0]!.type).toBe('sandbox_unavailable')
    })

    it('空数组返回空数组', () => {
        expect(withEnvEventSeverityRank([])).toEqual([])
    })

    it('env-events desc 排序得到 critical → error → warn → info (业务语义)', () => {
        const items = [
            { id: '1', severity: 'warn' },
            { id: '2', severity: 'critical' },
            { id: '3', severity: 'info' },
            { id: '4', severity: 'error' },
        ]
        const enriched = withEnvEventSeverityRank(items)
        const sorted = [...enriched].sort((a, b) => b._severityRank - a._severityRank)
        expect(sorted.map((x) => x.severity)).toEqual(['critical', 'error', 'warn', 'info'])
    })
})

describe('RUN_STATUS_RANK (RG-W03 runs.vue 专用)', () => {
    it('pending 落到 0 (初始化未启动)', () => {
        expect(RUN_STATUS_RANK.pending).toBe(0)
    })
    it('dispatched = failed = 1 (已分发/失败并列)', () => {
        expect(RUN_STATUS_RANK.dispatched).toBe(1)
        expect(RUN_STATUS_RANK.failed).toBe(1)
    })
    it('completed = 2', () => {
        expect(RUN_STATUS_RANK.completed).toBe(2)
    })
    it('running = 3 (最高)', () => {
        expect(RUN_STATUS_RANK.running).toBe(3)
    })
})

describe('withRunStatusRank (RG-W03)', () => {
    it('覆盖 runs.vue 全集状态（pending/dispatched/running/completed/failed）', () => {
        const items = [
            { id: '1', status: 'pending' },
            { id: '2', status: 'dispatched' },
            { id: '3', status: 'running' },
            { id: '4', status: 'completed' },
            { id: '5', status: 'failed' },
        ]
        const result = withRunStatusRank(items)
        expect(result[0]!._statusRank).toBe(0)
        expect(result[1]!._statusRank).toBe(1)
        expect(result[2]!._statusRank).toBe(3)
        expect(result[3]!._statusRank).toBe(2)
        expect(result[4]!._statusRank).toBe(1)
    })
})

describe('withSeverityRank', () => {
    it('为每个对象添加 _severityRank 派生字段', () => {
        const items = [
            { id: '1', severity: 'critical' },
            { id: '2', severity: 'high' },
            { id: '3', severity: 'low' },
        ]
        const result = withSeverityRank(items)
        expect(result[0]!._severityRank).toBe(5)
        expect(result[1]!._severityRank).toBe(4)
        expect(result[2]!._severityRank).toBe(2)
    })

    it('未知 severity 落到 0（最低）', () => {
        const items = [{ id: '1', severity: 'unspecified' }]
        expect(withSeverityRank(items)[0]!._severityRank).toBe(0)
    })

    it('保留原对象的所有字段（泛型 + 派生扩展）', () => {
        const items = [{ id: '1', severity: 'critical', packageName: 'lodash' }]
        const result = withSeverityRank(items)
        expect(result[0]!.id).toBe('1')
        expect(result[0]!.severity).toBe('critical')
        expect(result[0]!.packageName).toBe('lodash')
    })

    it('空数组返回空数组', () => {
        expect(withSeverityRank([])).toEqual([])
    })

    it('返回新数组（原数组不被原地修改）', () => {
        const items = [{ id: '1', severity: 'critical' }]
        const result = withSeverityRank(items)
        expect(result).not.toBe(items)
        expect((items[0] as { _severityRank?: number })._severityRank).toBeUndefined()
    })
})

describe('withStatusRank', () => {
    it('为每个对象添加 _statusRank 派生字段', () => {
        const items = [
            { id: '1', status: 'running' },
            { id: '2', status: 'completed' },
            { id: '3', status: 'failed' },
        ]
        const result = withStatusRank(items)
        expect(result[0]!._statusRank).toBe(3)
        expect(result[1]!._statusRank).toBe(2)
        expect(result[2]!._statusRank).toBe(1)
    })

    it('未知 status 落到 0', () => {
        const items = [{ id: '1', status: 'pending' }]
        expect(withStatusRank(items)[0]!._statusRank).toBe(0)
    })
})

describe('withFixStatusRank', () => {
    it('为每个对象添加 _fixStatusRank 派生字段', () => {
        const items = [
            { id: '1', fixStatus: 'success' },
            { id: '2', fixStatus: 'failed' },
            { id: '3', fixStatus: 'converged' },
        ]
        const result = withFixStatusRank(items)
        expect(result[0]!._fixStatusRank).toBe(5)
        expect(result[1]!._fixStatusRank).toBe(1)
        expect(result[2]!._fixStatusRank).toBe(4)
    })
})

describe('withRoleRank', () => {
    it('为每个对象添加 _roleRank 派生字段', () => {
        const items = [
            { id: '1', role: 'admin' as const },
            { id: '2', role: 'org_admin' as const },
            { id: '3', role: 'viewer' as const },
        ]
        const result = withRoleRank(items)
        expect(result[0]!._roleRank).toBe(3)
        expect(result[1]!._roleRank).toBe(2)
        expect(result[2]!._roleRank).toBe(1)
    })

    it('null role 落到 0', () => {
        const items = [{ id: '1', role: null }]
        expect(withRoleRank(items)[0]!._roleRank).toBe(0)
    })

    it('undefined role 落到 0', () => {
        const items = [{ id: '1', role: undefined }]
        expect(withRoleRank(items)[0]!._roleRank).toBe(0)
    })

    it('未知 role 字符串落到 0', () => {
        const items = [{ id: '1', role: 'unknown-role' }]
        expect(withRoleRank(items)[0]!._roleRank).toBe(0)
    })
})

describe('集成: withXxxRank + DataTable 排序契约', () => {
    it('alerts 数据 desc 排序得到 critical → high → low → unknown (业务语义)', () => {
        const items = [
            { id: '1', severity: 'unknown', packageName: 'a' },
            { id: '2', severity: 'critical', packageName: 'b' },
            { id: '3', severity: 'low', packageName: 'c' },
            { id: '4', severity: 'high', packageName: 'd' },
        ]
        const enriched = withSeverityRank(items)
        // 业务语义排序：_severityRank 越大越重要，desc 时 critical(5) 在前
        const sorted = [...enriched].sort((a, b) => b._severityRank - a._severityRank)
        expect(sorted.map((x) => x.severity)).toEqual(['critical', 'high', 'low', 'unknown'])
    })

    it('alerts 数据 asc 排序得到 unknown → low → high → critical (默认 asc 行为)', () => {
        const items = [
            { id: '1', severity: 'unknown', packageName: 'a' },
            { id: '2', severity: 'critical', packageName: 'b' },
            { id: '3', severity: 'low', packageName: 'c' },
            { id: '4', severity: 'high', packageName: 'd' },
        ]
        const enriched = withSeverityRank(items)
        // DataTable 默认 asc（PrimeVue 4 行为），数值小排前
        const sorted = [...enriched].sort((a, b) => a._severityRank - b._severityRank)
        expect(sorted.map((x) => x.severity)).toEqual(['unknown', 'low', 'high', 'critical'])
    })

    it('batch-runs 数据 desc 排序得到 running → completed → failed (运行中优先)', () => {
        const items = [
            { id: '1', status: 'failed' },
            { id: '2', status: 'running' },
            { id: '3', status: 'completed' },
        ]
        const enriched = withStatusRank(items)
        const sorted = [...enriched].sort((a, b) => b._statusRank - a._statusRank)
        expect(sorted.map((x) => x.status)).toEqual(['running', 'completed', 'failed'])
    })
})

describe('RG-B07 修复: 运行时状态/角色变更同步 rank', () => {
    it('updateStatusRank 同步 status + _statusRank (running → completed)', () => {
        const item = { id: '1', status: 'running', _statusRank: 3 }
        updateStatusRank(item, 'completed')
        expect(item.status).toBe('completed')
        expect(item._statusRank).toBe(2)
    })

    it('updateStatusRank 未知 status 落到 0', () => {
        const item = { id: '1', status: 'completed', _statusRank: 2 }
        updateStatusRank(item, 'unknown-state')
        expect(item.status).toBe('unknown-state')
        expect(item._statusRank).toBe(0)
    })

    it('updateStatusRank 返回的对象可用于继续链式调用', () => {
        const item = { id: '1', status: 'running' }
        const result = updateStatusRank(item, 'failed')
        expect(result).toBe(item)
        expect(result._statusRank).toBe(1)
    })

    it('updateRoleRank 同步 role + _roleRank (admin → viewer)', () => {
        const item = { id: '1', role: 'admin', _roleRank: 3 }
        updateRoleRank(item, 'viewer')
        expect(item.role).toBe('viewer')
        expect(item._roleRank).toBe(1)
    })

    it('updateRoleRank null 落到 0', () => {
        const item = { id: '1', role: 'admin', _roleRank: 3 }
        updateRoleRank(item, null)
        expect(item.role).toBeNull()
        expect(item._roleRank).toBe(0)
    })

    it('updateRoleRank 未知 role 字符串落到 0', () => {
        const item: { id: string, role: string | null, _roleRank?: number } = { id: '1', role: null }
        updateRoleRank(item, 'unknown-role')
        expect(item.role).toBe('unknown-role')
        expect(item._roleRank).toBe(0)
    })
})
