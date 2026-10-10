import { describe, expect, it } from 'vitest'
import {
    applyFailureClassification,
    classifyRunFailure,
    parseEngineDeliveryCategory,
    RUN_FAILURE_KINDS,
    RUN_FAILURE_STAGES,
    type RunFailureKind,
    type RunFailureStage,
} from './run-failure-classify'

/**
 * 分类映射全表（与 run-failure-classify.ts 的 FAILURE_CODE_MAP 一一对应）。
 * 集中列在此处，使「新增 / 改错映射」必须同步测试（抗分类漂移）。
 */
const EXPECTED_MAPPINGS: Record<string, { stage: RunFailureStage, kind: RunFailureKind }> = {
    // source
    FETCH_FAILED: { stage: 'source', kind: 'unknown' },
    DISCOVERY_FAILED: { stage: 'source', kind: 'unknown' },
    EMPTY_REPO_LIST: { stage: 'source', kind: 'deterministic' },
    AUTHENTICATION_FAILED: { stage: 'source', kind: 'deterministic' },
    PERMISSION_DENIED: { stage: 'source', kind: 'deterministic' },
    ALERTS_DISABLED: { stage: 'source', kind: 'deterministic' },
    REPO_NOT_FOUND: { stage: 'source', kind: 'deterministic' },
    RATE_LIMITED: { stage: 'source', kind: 'transient' },
    NETWORK_ERROR: { stage: 'source', kind: 'transient' },
    GITHUB_API_ERROR: { stage: 'source', kind: 'unknown' },
    // clone
    clone_timeout: { stage: 'clone', kind: 'transient' },
    // install
    LOCKFILE_NOT_FOUND: { stage: 'install', kind: 'deterministic' },
    MANIFEST_MISMATCH: { stage: 'install', kind: 'deterministic' },
    LOCKFILE_VERSION_MISMATCH: { stage: 'install', kind: 'deterministic' },
    CORRUPTED_LOCKFILE: { stage: 'install', kind: 'deterministic' },
    CREDENTIAL_ERROR: { stage: 'install', kind: 'deterministic' },
    RESOLVE_ERROR: { stage: 'install', kind: 'unknown' },
    MINIMUM_RELEASE_AGE: { stage: 'install', kind: 'deterministic' },
    // fix
    PROCESS_FAILED: { stage: 'fix', kind: 'unknown' },
    OVERRIDE_PROTECTED: { stage: 'fix', kind: 'deterministic' },
    // verify
    VERIFICATION_FAILED: { stage: 'verify', kind: 'deterministic' },
    PRE_EXISTING_FAILURE: { stage: 'verify', kind: 'deterministic' },
    SCRIPT_NOT_FOUND: { stage: 'verify', kind: 'deterministic' },
    network_violation: { stage: 'verify', kind: 'deterministic' },
    // deliver
    COMMIT_FAILED: { stage: 'deliver', kind: 'deterministic' },
    push_failed: { stage: 'deliver', kind: 'unknown' },
    PR_CREATION_FAILED: { stage: 'deliver', kind: 'deterministic' },
    pr_creation_failed: { stage: 'deliver', kind: 'deterministic' },
    ROLLBACK_FAILED: { stage: 'deliver', kind: 'deterministic' },
    // cleanup
    BRANCH_DELETE_FAILED: { stage: 'cleanup', kind: 'unknown' },
    PR_CLOSE_FAILED: { stage: 'cleanup', kind: 'unknown' },
    CLEANUP_DETECT_FAILED: { stage: 'cleanup', kind: 'unknown' },
    CLEANUP_FAILED: { stage: 'cleanup', kind: 'unknown' },
    supersede_failed: { stage: 'cleanup', kind: 'unknown' },
    // runtime
    execution_timeout: { stage: 'runtime', kind: 'transient' },
    execution_failed: { stage: 'runtime', kind: 'unknown' },
    sandbox_unavailable: { stage: 'runtime', kind: 'transient' },
    container_unavailable: { stage: 'runtime', kind: 'transient' },
    orchestration_failed: { stage: 'runtime', kind: 'unknown' },
    engine_exit_2: { stage: 'runtime', kind: 'deterministic' },
    FATAL: { stage: 'runtime', kind: 'unknown' },
    result_fetch_failed: { stage: 'runtime', kind: 'transient' },
    run_url_not_resolved: { stage: 'runtime', kind: 'transient' },
    workflow_not_configured: { stage: 'runtime', kind: 'deterministic' },
    enqueue_failed: { stage: 'runtime', kind: 'transient' },
    orphan_run: { stage: 'runtime', kind: 'transient' },
    force_failed: { stage: 'runtime', kind: 'deterministic' },
    SCAN_PENDING_MERGED: { stage: 'runtime', kind: 'deterministic' },
    // unknown
    engine_delivery_failed: { stage: 'unknown', kind: 'deterministic' },
}

describe('run-failure-classify 常量集', () => {
    it('阶段 / 处置建议全集与设计稿 §4 一致（顺序稳定，供 UI 下拉复用）', () => {
        expect(RUN_FAILURE_STAGES).toEqual([
            'source', 'clone', 'install', 'fix', 'verify', 'deliver', 'runtime', 'cleanup', 'unknown',
        ])
        expect(RUN_FAILURE_KINDS).toEqual(['transient', 'deterministic', 'unknown'])
    })

    it('映射表所有 stage / kind 取值都在常量集内', () => {
        for (const [code, mapping] of Object.entries(EXPECTED_MAPPINGS)) {
            expect(RUN_FAILURE_STAGES, code).toContain(mapping.stage)
            expect(RUN_FAILURE_KINDS, code).toContain(mapping.kind)
        }
    })
})

describe('classifyRunFailure 状态门控', () => {
    it.each(['completed', 'running', 'pending', 'degraded'])('状态 %s 不参与失败分类（三字段 null）', (status) => {
        expect(classifyRunFailure({
            status,
            error: { code: 'VERIFICATION_FAILED', message: 'x' },
            engineCategories: ['VERIFICATION_FAILED'],
        })).toEqual({ code: null, stage: null, kind: null })
    })
})

describe('classifyRunFailure 全映射覆盖', () => {
    it.each(Object.entries(EXPECTED_MAPPINGS))('errorJson.code=%s → 映射阶段 / 处置建议', (code, expected) => {
        const result = classifyRunFailure({ status: 'failed', error: { code, message: 'boom' } })
        expect(result).toEqual({ code, stage: expected.stage, kind: expected.kind })
    })

    it.each(Object.entries(EXPECTED_MAPPINGS))('引擎类别 %s（无 errorJson 时回退）→ 映射阶段 / 处置建议', (code, expected) => {
        const result = classifyRunFailure({ status: 'failed', error: null, engineCategories: [code] })
        expect(result).toEqual({ code, stage: expected.stage, kind: expected.kind })
    })
})

describe('classifyRunFailure engine_delivery_failed 细分', () => {
    it('从 message 的 （CATEGORY） 回读细分阶段', () => {
        const result = classifyRunFailure({
            status: 'failed',
            error: {
                code: 'engine_delivery_failed',
                message: '引擎交付阶段失败（VERIFICATION_FAILED）：legacy-peer-deps 验证链失败',
            },
        })
        expect(result).toEqual({ code: 'VERIFICATION_FAILED', stage: 'verify', kind: 'deterministic' })
    })

    it('无法解析类别时归 unknown + deterministic（保留兜底码供审计）', () => {
        const result = classifyRunFailure({
            status: 'failed',
            error: { code: 'engine_delivery_failed', message: '交付阶段失败' },
        })
        expect(result).toEqual({ code: 'engine_delivery_failed', stage: 'unknown', kind: 'deterministic' })
    })

    it('message 为空时不抛错，走兜底映射', () => {
        const result = classifyRunFailure({ status: 'failed', error: { code: 'engine_delivery_failed' } })
        expect(result).toEqual({ code: 'engine_delivery_failed', stage: 'unknown', kind: 'deterministic' })
    })
})

describe('classifyRunFailure 兜底与回退', () => {
    it('未纳入映射表的码 → 保留 code，stage / kind 归 unknown', () => {
        const result = classifyRunFailure({ status: 'failed', error: { code: 'brand_new_failure', message: 'x' } })
        expect(result).toEqual({ code: 'brand_new_failure', stage: 'unknown', kind: 'unknown' })
    })

    it('无任何失败信息（failed 但 errorJson / 引擎类别均缺失）→ code null + unknown', () => {
        expect(classifyRunFailure({ status: 'failed' })).toEqual({ code: null, stage: 'unknown', kind: 'unknown' })
        expect(classifyRunFailure({ status: 'failed', error: null, engineCategories: [] }))
            .toEqual({ code: null, stage: 'unknown', kind: 'unknown' })
    })

    it('引擎类别优先返回映射表内可识别项（跳过前置未知类别）', () => {
        const result = classifyRunFailure({
            status: 'failed',
            error: null,
            engineCategories: ['MYSTERY_CATEGORY', 'COMMIT_FAILED'],
        })
        expect(result).toEqual({ code: 'COMMIT_FAILED', stage: 'deliver', kind: 'deterministic' })
    })

    it('引擎类别全部未知时取首个类别（保留审计信息）', () => {
        const result = classifyRunFailure({ status: 'failed', engineCategories: ['MYSTERY_A', 'MYSTERY_B'] })
        expect(result).toEqual({ code: 'MYSTERY_A', stage: 'unknown', kind: 'unknown' })
    })

    it('引擎类别含 null / undefined 时被过滤', () => {
        const result = classifyRunFailure({ status: 'failed', engineCategories: [null, undefined, 'COMMIT_FAILED'] })
        expect(result).toEqual({ code: 'COMMIT_FAILED', stage: 'deliver', kind: 'deterministic' })
    })

    it('dispatched 状态参与分类（PR 创建失败 / 结果未就绪）', () => {
        expect(classifyRunFailure({ status: 'dispatched', error: { code: 'pr_creation_failed', message: 'x' } }))
            .toEqual({ code: 'pr_creation_failed', stage: 'deliver', kind: 'deterministic' })
        expect(classifyRunFailure({ status: 'dispatched', error: { code: 'result_fetch_failed', message: 'x' } }))
            .toEqual({ code: 'result_fetch_failed', stage: 'runtime', kind: 'transient' })
    })

    it('dispatched 且无任何错误信息（已派发待回执）→ 不归失败分类', () => {
        expect(classifyRunFailure({ status: 'dispatched' }))
            .toEqual({ code: null, stage: null, kind: null })
        expect(classifyRunFailure({ status: 'dispatched', error: null, engineCategories: [] }))
            .toEqual({ code: null, stage: null, kind: null })
    })
})

describe('parseEngineDeliveryCategory', () => {
    it('解析标准形态', () => {
        expect(parseEngineDeliveryCategory('引擎交付阶段失败（COMMIT_FAILED）：git commit 失败')).toBe('COMMIT_FAILED')
    })

    it('无匹配 / 空输入 → null', () => {
        expect(parseEngineDeliveryCategory('no category here')).toBeNull()
        expect(parseEngineDeliveryCategory('')).toBeNull()
        expect(parseEngineDeliveryCategory(null)).toBeNull()
        expect(parseEngineDeliveryCategory(undefined)).toBeNull()
    })
})

describe('applyFailureClassification', () => {
    it('就地写入三列', () => {
        const target = { failureCode: null, failureStage: null, failureKind: null } as {
            failureCode: string | null
            failureStage: RunFailureStage | null
            failureKind: RunFailureKind | null
        }
        applyFailureClassification(target, { status: 'failed', error: { code: 'clone_timeout', message: 'x' } })
        expect(target).toEqual({ failureCode: 'clone_timeout', failureStage: 'clone', failureKind: 'transient' })
    })

    it('非失败终态清空既有分类（复用 run 记录时不残留）', () => {
        const target = {
            failureCode: 'VERIFICATION_FAILED',
            failureStage: 'verify' as RunFailureStage | null,
            failureKind: 'deterministic' as RunFailureKind | null,
        }
        applyFailureClassification(target, { status: 'completed' })
        expect(target).toEqual({ failureCode: null, failureStage: null, failureKind: null })
    })
})
