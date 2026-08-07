// AI 研判 app 集成：触发执行 → 结果分流 → code-change 闭环修复
// 或建议输出。dry-run 不触发（不产生费用）；apiKey 仅运行时持有。

import type { Octokit } from '@octokit/rest'
import type { FixAction } from '@dependfix/core'
import type { AiOptions } from '../config'
import { verifyProject, type AppContext } from '../app/helpers'
import { parseMajorVersion } from '../fixers/dependency'
import { createChangelogFetcher } from './changelog-fetcher'
import { applyChanges, buildVersionLockOverride, buildWaitUpstreamNote } from './patch-applier'
import { validateAiChanges } from './safety-gate'
import type { AiAssessment } from './schema'
import { assessBreakingChange, type AiUsage } from './index'

export interface AiIntegrationDeps {
    ai: AiOptions
    client: Octokit
    ctx: Pick<AppContext, 'config' | 'customCommands' | 'logger' | 'workDir' | 'allErrors'>
    repo: string
    /** dry-run 不触发 AI（不产生费用） */
    dryRun: boolean
}

export interface AiAssessmentRequest {
    packageName: string
    fromVersion: string
    toVersion: string
    /** 升级验证失败日志（stderr 文本；可选） */
    failureLog?: string
    /** 受影响文件路径（可选） */
    affectedFiles?: string[]
}

export interface AiIntegrationResult {
    /** 是否执行了 AI 研判（false = 未启用 / dry-run） */
    attempted: boolean
    /** 产出动作：ai-patch 修复（code-change 成功）或 ai-suggestion 建议（降级/其他分类/被拒） */
    actions: FixAction[]
    /** 本次研判的 token 消耗（changelog 采集失败等未发生调用时为 undefined；app 层聚合进报告） */
    usage?: AiUsage
}

/**
 * 执行一次 AI 研判集成（changelog 采集 → 研判 → 分流）。
 *
 * 分流：
 * - code-change → safety-gate → applyChanges → 完整验证（install+lint+build）
 *   → 成功 ai-patch；失败回滚转建议
 * - version-lock → 生成 override 建议文本（人工确认执行）
 * - wait-upstream / manual / 研判降级 → 建议区块
 */
export async function runAiIntegration(
    deps: AiIntegrationDeps,
    request: AiAssessmentRequest,
): Promise<AiIntegrationResult> {
    const { ai, client, ctx, repo, dryRun } = deps
    if (!ai.enabled || dryRun) {
        return { attempted: false, actions: [] }
    }
    const { logger } = ctx

    // 1. changelog 采集（失败降级：跳过 AI，转为人工建议）
    const fetcher = createChangelogFetcher(client)
    const changelog = await fetcher.fetchChangelog(request.packageName)
    if (changelog.error) {
        logger.warn(`[ai] ${request.packageName}: changelog 采集失败（${changelog.error}），跳过 AI 研判`)
        return {
            attempted: true,
            actions: [suggestionAction(repo, request, 'AI 研判跳过：changelog 采集失败', changelog.error)],
        }
    }

    // 2. 研判
    const assess = await assessBreakingChange({
        config: {
            provider: ai.provider,
            model: ai.model,
            apiKey: ai.apiKey ?? '',
            baseUrl: ai.baseUrl,
            apiUrl: ai.apiUrl,
        },
        context: {
            packageName: request.packageName,
            fromVersion: request.fromVersion,
            toVersion: request.toVersion,
            changelogEntries: changelog.entries,
            failureLog: request.failureLog,
            affectedFiles: request.affectedFiles,
        },
    })

    // 3. usage 日志（决策 4：每次调用消耗可见）+ 透出给 app 聚合进报告
    logUsage(logger, request.packageName, ai.model, assess.usage)
    const usage = assess.usage

    if (assess.degraded || !assess.assessment) {
        return {
            attempted: true,
            actions: [suggestionAction(repo, request, 'AI 研判降级，转人工建议', assess.error)],
            usage,
        }
    }

    // 4. 按分类分流
    const assessment = assess.assessment
    if (assessment.classification === 'code-change') {
        const action = await applyCodeChangeFix(deps, request, assessment)
        return { attempted: true, actions: [action], usage }
    }
    if (assessment.classification === 'version-lock') {
        const lock = buildVersionLockOverride(request.packageName, request.toVersion)
        const detail = lock
            ? `建议在 pnpm-workspace.yaml overrides 添加：\`${lock.key}: ${lock.value}\`（人工确认后执行）`
            : '建议锁定版本（版本信息不完整，人工确认）'
        return {
            attempted: true,
            actions: [suggestionAction(repo, request, `版本锁定建议：${assessment.summary}`, `${detail}\n\n${assessment.rationale}`)],
            usage,
        }
    }
    if (assessment.classification === 'wait-upstream') {
        return {
            attempted: true,
            actions: [suggestionAction(repo, request, buildWaitUpstreamNote(assessment), assessment.rationale)],
            usage,
        }
    }
    return {
        attempted: true,
        actions: [suggestionAction(repo, request, `人工处理建议：${assessment.summary}`, assessment.rationale)],
        usage,
    }
}

// ---------------------------------------------------------------------------
// code-change 闭环
// ---------------------------------------------------------------------------

async function applyCodeChangeFix(
    deps: AiIntegrationDeps,
    request: AiAssessmentRequest,
    assessment: AiAssessment,
): Promise<FixAction> {
    const { ctx, repo, dryRun } = deps
    const { logger, workDir } = ctx

    // 静态安全门（范围/路径/敏感信息）
    const gate = validateAiChanges(workDir, assessment.changes)
    if (!gate.ok) {
        logger.warn(`[ai] ${request.packageName}: 修复被安全门拒绝（${gate.errors.join('; ')}），转人工建议`)
        return suggestionAction(
            repo,
            request,
            `AI 修复被安全门拒绝：${gate.errors.join('; ')}`,
            assessment.summary,
        )
    }

    // dry-run 不写盘（此处已由入口拦截，防御纵深）
    if (dryRun) {
        return {
            type: 'dependency-upgrade',
            repository: repo,
            target: request.packageName,
            fromVersion: request.fromVersion,
            toVersion: request.toVersion,
            isMajor: isMajorUpgrade(request),
            success: true,
            strategy: 'ai-patch',
            noOp: true,
            diff: `[dry-run] AI 计划修复 ${assessment.changes.length} 个文件：${assessment.changes.map((c) => c.filePath).join(', ')}`,
            durationMs: 0,
        }
    }

    // 应用结构化修改
    const applied = applyChanges(workDir, assessment.changes)
    if (!applied.success) {
        logger.warn(`[ai] ${request.packageName}: 修复应用失败（${applied.error}），转人工建议`)
        return suggestionAction(repo, request, `AI 修复应用失败：${applied.error}`, assessment.summary)
    }

    // 完整验证（install + lint + build，对齐跨线升级语义）
    const verifyActions = await verifyProject(ctx, repo)
    const failed = verifyActions.filter((a) => !a.success)
    if (failed.length > 0) {
        applied.rollback()
        const failedCommands = failed.map((a) => a.target).join(', ')
        logger.warn(`[ai] ${request.packageName}: 修复验证失败（${failedCommands}），已回滚，转人工建议`)
        return {
            type: 'dependency-upgrade',
            repository: repo,
            target: request.packageName,
            fromVersion: request.fromVersion,
            toVersion: request.toVersion,
            isMajor: isMajorUpgrade(request),
            success: false,
            strategy: 'ai-patch',
            error: `AI 修复验证失败（${failedCommands}）；已回滚，转人工建议`,
            durationMs: 0,
        }
    }

    logger.info(`[ai] ${request.packageName}: AI 修复通过完整验证（${assessment.changes.length} 个文件）`)
    return {
        type: 'dependency-upgrade',
        repository: repo,
        target: request.packageName,
        fromVersion: request.fromVersion,
        toVersion: request.toVersion,
        isMajor: isMajorUpgrade(request),
        success: true,
        strategy: 'ai-patch',
        diff: `AI 修复 ${assessment.changes.length} 个文件：${assessment.changes.map((c) => c.filePath).join(', ')}`,
        durationMs: 0,
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function suggestionAction(
    repo: string,
    request: AiAssessmentRequest,
    summary: string,
    detail?: string,
): FixAction {
    return {
        type: 'dependency-upgrade',
        repository: repo,
        target: request.packageName,
        fromVersion: request.fromVersion,
        toVersion: request.toVersion,
        isMajor: isMajorUpgrade(request),
        success: true,
        strategy: 'ai-suggestion',
        noOp: true, // 建议类中性动作：不计 fixed/failed，报告可见
        diff: detail ? `${summary}\n\n${detail}` : summary,
        durationMs: 0,
    }
}

function isMajorUpgrade(request: AiAssessmentRequest): boolean {
    const from = parseMajorVersion(request.fromVersion)
    const to = parseMajorVersion(request.toVersion)
    return from !== -1 && to !== -1 && from !== to
}

function logUsage(logger: AppContext['logger'], packageName: string, model: string, usage: AiUsage): void {
    const cost = usage.estimatedCostUsd
    const costText = cost !== undefined ? `, 估算成本 $${cost.toFixed(4)}` : ''
    logger.info(
        `[ai] ${packageName} 研判消耗: ${usage.calls} 次调用, ${usage.inputTokens} in / ${usage.outputTokens} out tokens${costText} (${model})`,
    )
}
