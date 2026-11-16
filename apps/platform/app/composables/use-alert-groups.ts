import { computed, ref, type Ref } from 'vue'
import type { DataTableSortMeta } from 'caomei-ui'
import { SEVERITY_RANK, withFixStatusRank, withSeverityRank } from '../utils/sort-helpers'
import { summarizePackageGroups, type AlertsViewMode } from '../utils/alerts-view'

/**
 * 告警表格的分组 / 排序状态机（自 alerts.vue 拆出：页面行数治理 max-lines 800）。
 *
 * 语义与拆分前一致：
 * - 「按包」模式把「严重级别」列的排序取值换成**组排序键**（组间唯一），保证任何排序下同包行相邻
 * - 分组展开用字符串数组跟踪，受控回写（caomei 内建折叠按钮依赖回写）
 * - 视图切换重置排序与折叠态，避免上一个视图的状态污染
 *
 * 依赖通过参数注入（不加载 Nuxt 运行时），便于单测直接覆盖分组与排序分支。
 */
export interface AlertGroupRow {
    repository: string | null
    packageName: string
    severity: string
    fixStatus: string
}

export interface UseAlertGroupsOptions<T extends AlertGroupRow> {
    /** 服务端返回的告警集合（`useAsyncData` 的 data） */
    source: Ref<T[] | null | undefined>
    /** 视图模式（package / repository / none） */
    viewMode: Ref<AlertsViewMode>
    /** i18n 文案解析 */
    t: (key: string, params?: Record<string, string | number>) => string
}

export type RankedAlert<T extends AlertGroupRow> = T & { _severityRank: number, _fixStatusRank: number }

export const useAlertGroups = <T extends AlertGroupRow>({ source, viewMode, t }: UseAlertGroupsOptions<T>) => {
    /** alerts 派生：排序键派生（severity / fixStatus 走业务语义排序，非字典序） */
    const rankedAlerts = computed<RankedAlert<T>[]>(() => withFixStatusRank(withSeverityRank(source.value ?? [])))

    /**
     * 「按包」组信息：包名 → 组内最高 severity + 组排序键（聚合逻辑见 `summarizePackageGroups`）。
     * 数据源为**过滤后**的告警集合：组信息应反映当前可见集合，而非全量。
     */
    const packageGroupSummary = computed(() => summarizePackageGroups(source.value ?? []))

    /**
     * 告警数组派生（含业务语义排序键）。
     *
     * 「按包」模式预排序为「包名升序 → 组内 severity 降序」：作为「无排序键」（用户清空排序）时的
     * 展示基线，并为组内稳定排序提供行级 severity 降序的基线顺序（组排序键组间唯一，同包各行同值 →
     * 稳定保留本顺序）。其它视图模式（repository / none）保持服务端原始顺序，行为不变。
     */
    const alerts = computed<RankedAlert<T>[]>(() => {
        const rows = rankedAlerts.value
        if (viewMode.value !== 'package') {
            return rows
        }
        return [...rows].sort((a, b) => {
            if (a.packageName !== b.packageName) {
                return a.packageName < b.packageName ? -1 : 1
            }
            return (b._severityRank ?? 0) - (a._severityRank ?? 0)
        })
    })

    // rowGroup 模式：按 viewMode 聚合计数（subheader 显示该组告警数）
    // viewMode='none' 时不渲染 subheader，该 computed 仅用于 package/repository 模式。
    const groupKeyOf = (alert: T): string => {
        if (viewMode.value === 'repository') {
            return alert.repository ?? t('alerts.repositoryUnknown')
        }
        return alert.packageName
    }
    const groupCounts = computed(() => {
        const counts = new Map<string, number>()
        for (const alert of alerts.value) {
            const key = groupKeyOf(alert)
            counts.set(key, (counts.get(key) ?? 0) + 1)
        }
        return counts
    })
    // groupHeader 显示的标签：package 模式显示 packageName，repository 模式显示 repository 字段
    const groupHeaderLabel = (data: T): string => {
        if (viewMode.value === 'repository') {
            return data.repository ?? t('alerts.repositoryUnknown')
        }
        return data.packageName
    }
    /** 「按包」模式该组的最高严重级别（组头 Tag 展示）；非按包模式不展示。 */
    const groupMaxSeverity = (data: T): string | null => packageGroupSummary.value.get(data.packageName)?.severity ?? null

    // 行分组（rowGroup）与排序状态说明：
    // - 折叠状态用 `string[]` 跟踪（分组键数组）；caomei 受控模式经 `@update:expanded-row-groups` 回写，
    //   不回写则内建折叠按钮点击无效果
    // - caomei 在 `expandableRowGroups` 下会在 `#groupheader` 槽之前渲染内建折叠按钮
    //   （`.caomei-data-table__row-group-toggle`，含 aria-expanded），槽内不再叠加自定义 chevron，避免双 chevron
    /**
     * 默认排序：严重级别降序。
     *
     * 分组连续性由**组排序键**保证：caomei 的相邻行分组要求同组行相邻，而分组字段列已从
     * `columns` 剔除，TanStack 只对「列模型中存在的列」排序（`createSortedRowModel` 以 `getColumn(sort.id)`
     * 为门槛），无法直接以 `packageName` 作排序键。改为让「严重级别」列在「按包」模式下返回**组排序键**
     * （组间唯一，含最高级别 rank 与包名序号，见 `packageGroupSummary`）→ 同包所有行共享同一排序值且
     * 键组间唯一，任何排序下同包行都相邻 → 「一个包一组」为硬不变量。`alerts` 预排序提供同值内的稳定基线
     * （包名升序 → 组内 severity 降序）。「按仓库」视图沿用既有口径（服务端 `orderBy` + 行级 severity 降序），
     * 本条目不改其分组行为。
     * 详见 docs/design/governance/caomei-ui-migration-m31-proof.md §15.10
     */
    const multiSortMeta = ref<DataTableSortMeta[]>([
        { field: '_severityRank', order: -1 },
    ])
    const expandedPackages = ref<string[]>([])
    // 自定义 span 整体可点击 + 键盘 enter/space 触发（验收要求）。
    // 迁移前组件库 4.x 的 rowToggleButton 在 groupheader 之前渲染（渲染顺序实证见迁移评估 §15.10），
    // 自定义 toggle 与其内部 toggle 走不同路径但修改同一 ref，不会重复 toggle。
    const isPackageExpanded = (packageName: string) => expandedPackages.value.includes(packageName)
    const togglePackage = (packageName: string) => {
        expandedPackages.value = isPackageExpanded(packageName)
            ? expandedPackages.value.filter((item) => item !== packageName)
            : [...expandedPackages.value, packageName]
    }

    // DataTable 动态属性：rowGroupMode / groupRowsBy / expandableRowGroups 按 viewMode 切换
    const dataTableAttrs = computed(() => {
        if (viewMode.value === 'none') {
            return {
                rowGroupMode: undefined,
                groupRowsBy: undefined,
                expandableRowGroups: false,
            }
        }
        return {
            rowGroupMode: 'subheader' as const,
            groupRowsBy: viewMode.value === 'package' ? 'packageName' : 'repository',
            expandableRowGroups: true,
        }
    })

    /**
     * 「严重级别」列的排序取值。
     *
     * 「按包」分组模式取**组排序键** `packageGroupSummary.sortKey`（组间唯一，见其上注释）——这是
     * 「一个包一组」的关键：行级 severity 排序会把同包跨档行拆到不同 severity 区块，相邻性破坏后
     * 同名分组头重复出现；组间唯一键则保证任何排序下同包行都相邻。非分组模式（repository / none）
     * 仍取行级 rank。展示不受影响：`#cell-_severityRank` 槽读行级 `severity`。
     * 注：`??` 回退为防御性分支——行数据均来自告警集合，其包名必在 `packageGroupSummary` 中（当前不可达）。
     */
    const groupSeveritySortValue = (row: T): number => {
        if (viewMode.value === 'package') {
            return packageGroupSummary.value.get(row.packageName)?.sortKey ?? (SEVERITY_RANK[row.severity] ?? 0)
        }
        return SEVERITY_RANK[row.severity] ?? 0
    }

    /**
     * 受控排序回写：提供 `multi-sort-meta` 时 caomei 进入受控模式，不回写则点击列头不改变排序
     * （等价迁移前的 `v-model:multi-sort-meta`）。
     *
     * 不用 caomei 的全局 `sort-desc-first`：实测该开关会把列头点击循环变成「desc → asc → 移除」，
     * 与迁移前组件库的「asc → desc → 移除」不一致（且叠加首次点击纠正后 desc 状态不可达）。
     * 默认排序方向仅由 `multiSortMeta` 初值承载（severity desc）。
     *
     * 「按包」模式：把严重级别（组排序键）固定为第一排序键——迁移前组件库在多列排序下会自动
     * 保留 `groupRowsBy` 为首键以免分组被打散，本仓库以「严重级别列排序取值 = 组排序键（组间唯一）」
     * 等价实现。用户移除严重级别键但保留其它键时补回默认降序（保证「一个包一组」）；全部清空时交由
     * `alerts` 预排序基线（同包同值稳定），分组仍连续。
     */
    const onUpdateMultiSortMeta = (meta: DataTableSortMeta[]) => {
        if (viewMode.value !== 'package') {
            multiSortMeta.value = meta
            return
        }
        const severity = meta.find((item) => item.field === '_severityRank')
        const others = meta.filter((item) => item.field !== '_severityRank')
        multiSortMeta.value = others.length > 0
            ? [{ field: '_severityRank', order: severity?.order ?? -1 }, ...others]
            : meta
    }

    /** 受控分组展开回写（等价 `v-model:expanded-row-groups`；不回写则内建折叠按钮点击无效果） */
    const onUpdateExpandedRowGroups = (groups: string[]) => {
        expandedPackages.value = groups
    }

    /**
     * 切换视图模式：重置 multiSortMeta + expandedPackages，避免上一个视图的排序 / 折叠状态污染。
     *
     * 默认严重级别优先（severity desc）：
     * - 业务依据：docs/standards/platform.md §7.1（severity Rank 是 highest-first 设计，desc 才符合
     *   「critical 优先」的业务期望）
     * - 分组连续性由**组排序键**保证（详见 `multiSortMeta` 注释），客户端不设分组字段次排序键
     */
    const onViewModeChange = () => {
        // 排序键固定为严重级别降序；「按包」的组内相邻性由组排序键保证（见 multiSortMeta 注释）
        multiSortMeta.value = [{ field: '_severityRank', order: -1 }]
        expandedPackages.value = []
    }

    return {
        rankedAlerts,
        packageGroupSummary,
        alerts,
        groupCounts,
        groupHeaderLabel,
        groupMaxSeverity,
        multiSortMeta,
        expandedPackages,
        isPackageExpanded,
        togglePackage,
        dataTableAttrs,
        groupSeveritySortValue,
        onUpdateMultiSortMeta,
        onUpdateExpandedRowGroups,
        onViewModeChange,
    }
}
