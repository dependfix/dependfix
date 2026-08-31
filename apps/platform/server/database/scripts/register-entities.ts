/**
 * Entity metadata side-effect registration helper（CLI 端专用）
 *
 * 背景：
 * - vitest 测试环境走 Nuxt prepare 自动扫描 + 注册所有 entities 装饰器
 * - tsx CLI 直接运行不走 Nitro auto-load，必须显式 import 实体类触发装饰器执行
 * - 但 ESLint @typescript-eslint/no-unused-vars 会把 side-effect import 标记为 warning
 * - 该文件作为单一 side-effect 入口，在文件级禁用 unused-vars 检查（豁免理由明示）
 *
 * 后续扩展：新增 entity 时在此文件追加 import 行即可，集中管理。
 */
 

// 业务核心 entities
import { ScanResult } from '../../entities/scan-result'
import { Repository } from '../../entities/repository'
import { ScanRun } from '../../entities/scan-run'
import { Organization } from '../../entities/organization'

// better-auth + 认证相关
import { User } from '../../entities/user'
import { Session } from '../../entities/session'
import { Account } from '../../entities/account'
import { Verification } from '../../entities/verification'

// 业务模块
import { Credential } from '../../entities/credential'
import { Schedule } from '../../entities/schedule'
import { BatchRun } from '../../entities/batch-run'
import { AuditEvent } from '../../entities/audit-event'

// 仅用于触发 @Entity / @Column 装饰器注册到 TypeORM metadata store
void ScanResult
void Repository
void ScanRun
void Organization
void User
void Session
void Account
void Verification
void Credential
void Schedule
void BatchRun
void AuditEvent
