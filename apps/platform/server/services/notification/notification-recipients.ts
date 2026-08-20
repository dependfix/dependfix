/**
 * 通知收件人解析（apps/platform/server/services/notification/notification-recipients.ts）。
 *
 * 设计动机：admin 邮箱默认取 organization 内所有 admin / org_admin 角色用户；
 * 部署方可通过 env `DEPENDFIX_ENV_ALERT_RECIPIENTS`（逗号分隔）显式覆盖。
 *
 * 优先级：
 * 1. env `DEPENDFIX_ENV_ALERT_RECIPIENTS` 非空 → 解析为数组（覆盖默认值）
 * 2. 默认 → 查询 User 表 role IN ('admin', 'org_admin') + banned=false 的所有用户邮箱
 * 3. 数据库查询失败 → 空数组（fail-closed：宁可错过告警也不发错对象）
 */

import { User } from '#server/entities/user'
import { ensureDatabaseInitialized } from '#server/database'

const ENV_OVERRIDE_KEY = 'DEPENDFIX_ENV_ALERT_RECIPIENTS'

/**
 * 解析环境告警收件人列表。
 */
export async function resolveNotificationRecipients(): Promise<string[]> {
    // 1. env 覆盖
    const envValue = process.env[ENV_OVERRIDE_KEY]
    if (envValue && envValue.trim().length > 0) {
        return envValue
            .split(',')
            .map((s) => s.trim())
            .filter((s) => s.length > 0)
    }

    // 2. 默认：admin / org_admin 角色 + 未禁用
    try {
        const ds = await ensureDatabaseInitialized()
        const users = await ds.getRepository(User).find({
            where: [
                { role: 'admin', banned: false },
                { role: 'org_admin', banned: false },
            ],
            select: { email: true },
        })
        return users.map((u) => u.email).filter((e): e is string => typeof e === 'string' && e.length > 0)
    } catch (e) {
        console.error('[notification:recipients] failed to query admin users:', e)
        return []
    }
}
