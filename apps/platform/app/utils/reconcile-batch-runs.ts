import type { BatchRunView } from '~/types/platform'

/**
 * 按 id 增量合并服务端最新列表到本地 batchRuns（原地变异以触发 Vue 3 数组响应式）。
 * 设计目标：避免 PrimeVue DataTable 整表重排导致屏闪。
 *
 * 算法三步：
 * 1. 移除已消失的 id（从后往前 splice，索引稳定）
 * 2. 新增 id 一次性插入到头部（splice(0, 0, ...items) 保持 fresh 顺序）
 * 3. 已存在但 updatedAt 变化的行 → 替换该位置引用（触发局部响应式；updatedAt 相等则保留旧引用）
 *
 * @param local 当前内存中的 batchRuns（ref<BatchRunView[]>）
 * @param fresh 服务端最新返回的 BatchRunView[]（应按 createdAt DESC）
 *
 * 注意：步骤 3 的 updatedAt 等值比较在 MySQL 部署下有秒级精度盲区（默认 `datetime` 无 fsp），
 * 相邻两次 save 落在同一秒时 reconcile 会误判"服务端没变"。当前默认 SQLite + Postgres 不受影响。
 * MySQL 部署时应将 @UpdateDateColumn 改为 `datetime(3)` 或在步骤 3 加内容比对兜底。
 */
export function reconcileBatchRuns(local: BatchRunView[], fresh: BatchRunView[]): void {
    const freshIds = new Set(fresh.map((b) => b.id))
    // 1. 移除已消失的 id（从后往前 splice，索引稳定）
    for (let i = local.length - 1; i >= 0; i--) {
        const item = local[i]!
        if (!freshIds.has(item.id)) {
            local.splice(i, 1)
        }
    }
    // 2. 新增的 id 一次性插入到头部（splice(0, 0, ...items) 保持 fresh 顺序）
    // 注意：逐个 unshift 会反转顺序（unshift(c) → unshift(b) 得 [b, c]），故批量 splice
    const existingIds = new Set(local.map((b) => b.id))
    const newOnes: BatchRunView[] = []
    for (const f of fresh) {
        if (!existingIds.has(f.id)) {
            newOnes.push(f)
            existingIds.add(f.id)
        }
    }
    if (newOnes.length > 0) {
        local.splice(0, 0, ...newOnes)
    }
    // 3. updatedAt 变化的行 → 替换该位置引用（触发局部响应式）
    const indexById = new Map<string, number>()
    local.forEach((b, i) => indexById.set(b.id, i))
    for (const f of fresh) {
        const idx = indexById.get(f.id)
        if (idx !== undefined) {
            const cur = local[idx]!
            if (cur.updatedAt !== f.updatedAt) {
                local[idx] = f
            }
        }
    }
}
