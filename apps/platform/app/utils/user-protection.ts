/**
 * 用户管理操作保护：判断目标用户是否为当前登录用户（防止自我降级/自删）。
 *
 * 背景：better-auth admin plugin 默认允许 admin 修改自己角色 / 禁用自己 / 删除自己，
 * 这种 self-mutation 在唯一 admin 场景下会锁死管理员账号（无其他 admin 可恢复）。
 * 前端防护是当前阶段的最小可行方案（与 todo.md §C65-A1 一致——服务端强制拦截属
 * 后续加固，单独成 backlog 避免单一 admin 锁死）。
 *
 * 典型用例：
 * 1. `setRole` 首行拦截 self → 阻止 self-downgrade
 * 2. `<Select>` `:disabled` 绑定 → UI 层禁用，避免误操作
 * 3. `remove` 二次确认提示增强（当前 confirm 已含「该操作不可撤销」，无需重复）
 *
 * 设计：纯函数 + null-safe。`currentUserId` 为空（未登录 / session 未就绪）时
 * 视为非 self（避免误判），调用方需自行保证已登录（middleware/auth.ts 已守）。
 */
export function isSelfTarget(targetUserId: string, currentUserId: string | null | undefined): boolean {
    if (!currentUserId) {
        return false
    }
    return targetUserId === currentUserId
}
