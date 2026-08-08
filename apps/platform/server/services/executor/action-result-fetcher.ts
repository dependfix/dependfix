import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { Octokit } from '@octokit/rest'
import type { RunResult } from '@dependfix/core'

const execFileAsync = promisify(execFile)

/**
 * B 模式结果回填：触发 `workflow_dispatch` 后自动拉取 action 运行结果。
 *
 * 实现路径（见 docs/design/governance/executor-sandbox.md §4 与 backlog C25）：
 * 1. 轮询 workflow run 状态直至 `completed`（带超时，默认 30 分钟）
 * 2. 列出该 run 的 artifacts，找到 `dependfix-report-{runId}`（action.yml 上传的 JSON 报告）
 * 3. 下载 artifact zip → 解压 → 解析 `dependfix-report-*.json` 为 RunResult
 * 4. 返回结构化结果供 orchestrator 落库 ScanRun/ScanResult
 *
 * 凭据要求：`actions: read` 权限（fine-grained PAT 配 Actions: read；classic PAT 自动含）。
 */
export class ActionResultFetcher {
    private readonly client: Octokit
    private readonly pollDelayMs: number
    private readonly runTimeoutMs: number

    constructor(token: string, options: { pollDelayMs?: number, runTimeoutMs?: number } = {}) {
        this.client = new Octokit({ auth: token })
        this.pollDelayMs = options.pollDelayMs ?? 15_000
        this.runTimeoutMs = options.runTimeoutMs ?? 30 * 60 * 1000
    }

    /**
     * 等待 action run 完成并拉取报告。
     * @param owner 仓库 owner
     * @param repo 仓库名
     * @param runId GitHub Actions run id（触发后轮询定位到的 run id）
     * @returns 解析后的 RunResult；超时/未找到报告时返回 null
     */
    async fetch(owner: string, repo: string, runId: number): Promise<RunResult | null> {
        const startedAt = Date.now()

        // 1. 轮询 run 状态至 completed（或失败/超时）
        let status: string | undefined
        while (Date.now() - startedAt < this.runTimeoutMs) {
            const { data } = await this.client.rest.actions.getWorkflowRun({
                owner,
                repo,
                run_id: runId,
            })
            status = data.status ?? undefined
            if (data.status === 'completed') {
                // 2. 仅拉取成功（conclusion: success）的 run；失败/取消无有效报告
                if (data.conclusion === 'success') {
                    break
                }
                return null
            }
            await sleep(this.pollDelayMs)
        }
        if (status !== 'completed') {
            throw new Error(`等待 action run ${runId} 完成超时（${this.runTimeoutMs / 60000} 分钟）`)
        }

        // 3. 按 run 过滤列出 artifacts（比 listArtifactsForRepo 精确，规避跨 run 翻页边界）
        const { data: artifactData } = await this.client.rest.actions.listWorkflowRunArtifacts({
            owner,
            repo,
            run_id: runId,
            per_page: 100,
        })
        const artifact = artifactData.artifacts.find((a) => a.name === `dependfix-report-${runId}`)
        if (!artifact) {
            throw new Error(`run ${runId} 未找到报告 artifact（dependfix-report-${runId}）`)
        }

        // 4. 下载 artifact zip（archive_download_url 返回 302 → zip；非 JSON content-type 为 ArrayBuffer）
        const download = await this.client.rest.actions.downloadArtifact({
            owner,
            repo,
            artifact_id: artifact.id,
            archive_format: 'zip',
        })
        const zipBuffer = Buffer.from(download.data as ArrayBuffer)

        // 5. 解压到临时目录，读取 JSON 报告
        const tempDir = await mkdtemp(join(tmpdir(), 'dependfix-artifact-'))
        try {
            const zipPath = join(tempDir, 'report.zip')
            await writeFile(zipPath, zipBuffer)
            await execFileAsync('unzip', ['-o', zipPath, '-d', tempDir], { timeout: 30_000 })
            // 显式按 dependfix-report- 前缀过滤（排除 index.json 等归档索引，避免 readdir 顺序依赖）
            const reportFiles = readdirSync(tempDir)
                .filter((f) => f.startsWith('dependfix-report-') && f.endsWith('.json'))
            if (reportFiles.length === 0) {
                throw new Error('artifact 中未找到 dependfix-report-*.json 报告')
            }
            const report = JSON.parse(await readFile(join(tempDir, reportFiles[0]!), 'utf-8')) as RunResult
            return report
        } finally {
            await rm(tempDir, { recursive: true, force: true }).catch(() => { /* 清理失败静默 */ })
        }
    }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
