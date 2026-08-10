import { In, IsNull, type DataSource } from 'typeorm'
import { parseTags, Repository } from '#server/entities/repository'
import type { ScheduleSelectorKind } from '#server/entities/schedule'

/** 选择策略参数（selectorJson 解析后的对象，语义见 Schedule.selectorJson 注释） */
export interface ScheduleSelectorData {
    organizationId?: string
    tag?: string
    repositoryIds?: string[]
}

export interface SelectorInput {
    kind: ScheduleSelectorKind
    data: ScheduleSelectorData
    /** 当前组织上下文（权限隔离：所有策略只返回当前组织的仓库，跨组织不可选） */
    organizationId?: string | null
}

/**
 * 仓库选择策略解析：selectorKind → 目标仓库 id 列表。
 * 权限隔离：所有策略均限 input.organizationId（当前组织）——
 * - all / organization：当前组织全部仓库（单组织模型下两者等价；organization 策略
 *   的 selectorJson.organizationId 仅声明意图，实际仍以当前组织为准，跨组织不可选）
 * - tag：tags JSON 列包含指定标签（应用层解析，无 SQL LIKE 注入面）
 * - explicit：repositoryIds 过滤为当前组织实际存在的仓库（跨组织/不存在 id 静默过滤）
 */
export const resolveRepositoryIds = async (
    ds: DataSource,
    input: SelectorInput,
): Promise<string[]> => {
    const repo = ds.getRepository(Repository)
    // null 时查无归属行（防御：正常路径 organizationId 由应用层填充非空）
    const orgWhere = input.organizationId ? { organizationId: input.organizationId } : { organizationId: IsNull() }

    switch (input.kind) {
        case 'all':
        case 'organization': {
            const repos = await repo.find({ where: orgWhere })
            return repos.map((r) => r.id)
        }
        case 'tag': {
            const tag = input.data.tag
            if (!tag) {
                return []
            }
            const repos = await repo.find({ where: orgWhere })
            return repos
                .filter((r) => parseTags(r.tags).includes(tag))
                .map((r) => r.id)
        }
        case 'explicit': {
            const ids = input.data.repositoryIds ?? []
            if (ids.length === 0) {
                return []
            }
            const repos = await repo.find({ where: { ...orgWhere, id: In(ids) } })
            return repos.map((r) => r.id)
        }
        default:
            return []
    }
}
