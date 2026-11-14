import { describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { useAlertGroups, type AlertGroupRow } from '../../app/composables/use-alert-groups'
import type { AlertsViewMode } from '../../app/utils/alerts-view'

/**
 * use-alert-groups 单测：告警表格按包 / 按仓库分组与排序状态机（自 alerts.vue 拆出）。
 *
 * 覆盖「按包预排序 / 非分组模式保序 / 组计数与组头 / 组排序键 / 折叠切换 / 视图切换重置 /
 * 排序回写补首键 / DataTable 动态属性」九组；浏览器侧分组渲染由 `tests/e2e/alerts-rowgroup.e2e.test.ts` 覆盖。
 */

const t = (key: string) => key

const row = (over: Partial<AlertGroupRow> = {}): AlertGroupRow => ({
    repository: 'acme/app',
    packageName: 'lodash',
    severity: 'high',
    fixStatus: 'pending',
    ...over,
})

const setup = (rows: AlertGroupRow[], mode: AlertsViewMode = 'package') => {
    const source = ref<AlertGroupRow[]>(rows)
    const viewMode = ref<AlertsViewMode>(mode)
    const groups = useAlertGroups({ source, viewMode, t })
    return { groups, viewMode, source }
}

describe('useAlertGroups', () => {
    it('按包模式：包名升序 → 组内 severity 降序', () => {
        const { groups } = setup([
            row({ packageName: 'zod', severity: 'critical' }),
            row({ packageName: 'lodash', severity: 'low' }),
            row({ packageName: 'lodash', severity: 'critical' }),
            row({ packageName: 'lodash', severity: 'medium' }),
        ])

        expect(groups.alerts.value.map((item) => `${item.packageName}:${item.severity}`)).toEqual([
            'lodash:critical',
            'lodash:medium',
            'lodash:low',
            'zod:critical',
        ])
    })

    it('非按包模式保持服务端原始顺序（仅补排序键）', () => {
        const rows = [
            row({ packageName: 'zod', severity: 'low' }),
            row({ packageName: 'lodash', severity: 'critical' }),
        ]
        const { groups } = setup(rows, 'repository')

        expect(groups.alerts.value.map((item) => item.packageName)).toEqual(['zod', 'lodash'])
        expect(groups.alerts.value[0]?._severityRank).toBe(2)
        expect(groups.alerts.value[1]?._severityRank).toBe(5)
    })

    it('组计数与组头：按包显示包名 + 组内最高 severity；按仓库显示仓库名', () => {
        const { groups, viewMode } = setup([
            row({ packageName: 'lodash', severity: 'medium' }),
            row({ packageName: 'lodash', severity: 'critical' }),
            row({ packageName: 'zod', repository: null, severity: 'low' }),
        ])

        expect(groups.groupCounts.value.get('lodash')).toBe(2)
        expect(groups.groupCounts.value.get('zod')).toBe(1)
        expect(groups.groupHeaderLabel(row({ packageName: 'lodash' }))).toBe('lodash')
        expect(groups.groupMaxSeverity(row({ packageName: 'lodash' }))).toBe('critical')

        viewMode.value = 'repository'
        expect(groups.groupHeaderLabel(row({ repository: null }))).toBe('alerts.repositoryUnknown')
        expect(groups.groupCounts.value.get('acme/app')).toBe(2)
        expect(groups.groupCounts.value.get('alerts.repositoryUnknown')).toBe(1)
    })

    it('严重级别排序取值：按包用组排序键，其它模式用行级 rank', () => {
        const { groups, viewMode } = setup([
            row({ packageName: 'lodash', severity: 'low' }),
            row({ packageName: 'zod', severity: 'critical' }),
        ])

        const lodash = groups.groupSeveritySortValue(row({ packageName: 'lodash', severity: 'low' }))
        const zod = groups.groupSeveritySortValue(row({ packageName: 'zod', severity: 'critical' }))
        // 组排序键：包名升序序号参与，severity 更高的 zod 组键更大（desc 排序时排前）
        expect(lodash).toBeGreaterThan(0)
        expect(zod).toBeGreaterThan(lodash)

        viewMode.value = 'none'
        expect(groups.groupSeveritySortValue(row({ packageName: 'lodash', severity: 'low' }))).toBe(2)
    })

    it('折叠切换：toggle 追加 / 移除，isPackageExpanded 同步', () => {
        const { groups } = setup([row()])

        expect(groups.isPackageExpanded('lodash')).toBe(false)
        groups.togglePackage('lodash')
        expect(groups.isPackageExpanded('lodash')).toBe(true)
        groups.togglePackage('lodash')
        expect(groups.isPackageExpanded('lodash')).toBe(false)
    })

    it('视图切换重置排序键与折叠态', () => {
        const { groups } = setup([row()])
        groups.togglePackage('lodash')
        groups.multiSortMeta.value = [{ field: 'packageName', order: 1 }]

        groups.onViewModeChange()

        expect(groups.multiSortMeta.value).toEqual([{ field: '_severityRank', order: -1 }])
        expect(groups.expandedPackages.value).toEqual([])
    })

    it('排序回写：按包模式把严重级别补回第一排序键，其它模式直接采用', () => {
        const { groups, viewMode } = setup([row()])

        groups.onUpdateMultiSortMeta([{ field: 'source', order: 1 }])
        expect(groups.multiSortMeta.value).toEqual([
            { field: '_severityRank', order: -1 },
            { field: 'source', order: 1 },
        ])

        // 用户已把严重级别排成升序时，补回首键必须保留该方向（不得强制回降序）
        groups.onUpdateMultiSortMeta([
            { field: '_severityRank', order: 1 },
            { field: 'source', order: -1 },
        ])
        expect(groups.multiSortMeta.value).toEqual([
            { field: '_severityRank', order: 1 },
            { field: 'source', order: -1 },
        ])

        // 全部清空时原样采用（分组连续性交由预排序基线）
        groups.onUpdateMultiSortMeta([])
        expect(groups.multiSortMeta.value).toEqual([])

        viewMode.value = 'none'
        groups.onUpdateMultiSortMeta([{ field: 'packageName', order: 1 }])
        expect(groups.multiSortMeta.value).toEqual([{ field: 'packageName', order: 1 }])
    })

    it('展开回写与 DataTable 动态属性随视图模式切换', () => {
        const { groups, viewMode } = setup([row()])

        groups.onUpdateExpandedRowGroups(['lodash'])
        expect(groups.expandedPackages.value).toEqual(['lodash'])

        expect(groups.dataTableAttrs.value).toEqual({
            rowGroupMode: 'subheader',
            groupRowsBy: 'packageName',
            expandableRowGroups: true,
        })

        viewMode.value = 'repository'
        expect(groups.dataTableAttrs.value.groupRowsBy).toBe('repository')

        viewMode.value = 'none'
        expect(groups.dataTableAttrs.value).toEqual({
            rowGroupMode: undefined,
            groupRowsBy: undefined,
            expandableRowGroups: false,
        })
    })
})
