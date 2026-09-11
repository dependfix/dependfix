import { bench, describe } from 'vitest'

/**
 * packages/engine/src/runners/verification-runner.bench.test.ts
 *
 * 多 code-scanning 告警 lint 性能基准（M28.2 / T303 Review Gate 触发）。
 *
 * 测量 "在 N 个 cs 告警下逐个跑 quickVerifyProject → runVerification → pnpm lint spawn"
 * 的总耗时，作为优化方案（合并验证 / 批处理 / 缓存）的基线对照。
 *
 * 基准使用占位命令 `node -e "process.exit(0)"` 模拟 lint 子进程开销：
 * - spawn 子进程 + 命令执行 + 退出 0（不跑真 lint 避免 5-30s × N 的 bench 卡死）
 * - workDir 设为真实 packages/engine 路径，spawn 开销与真实 lint 一致
 * - runVerification 默认开启网络审计，**此处关闭**避免审计代理注入干扰基线
 *
 * 三档基准：
 * - N=10  ：典型小项目 cs 告警量
 * - N=50  ：典型中项目 cs 告警量
 * - N=100 ：典型大项目 / CI 极限 cs 告警量
 *
 * 用法：
 *   pnpm --filter @dependfix/engine exec vitest bench \
 *     src/runners/verification-runner.bench.test.ts
 *
 * 预期输出：tinybench 报告每个 bench 的 hz（每秒操作数）/ mean / p99 等。
 * baseline 数据记录到本文件 JSDoc（每次实测后更新）。
 *
 * 关联：T303 Review Gate 2026-08-05 触发 + M28.2 todo.md §M28.2。
 */

import { runVerification } from './verification-runner'

/**
 * 占位 lint 命令：spawn 一个最小 Node.js 进程 + 立即退出 0。
 * 实际 lint（`pnpm lint`）会跑 5-30s；此占位仅测量 spawn 开销（真实 lint 的 ~10-30%）。
 *
 * 优化方案验证：合并验证后总耗时应 ≈ spawn 1 次开销 × 1（而非 × N）。
 */
const PLACEHOLDER_LINT_COMMAND = 'node -e "process.exit(0)"'

/**
 * 真实 packages/engine workDir（用于 spawn 开销与真实 lint 一致）。
 */
const REAL_WORK_DIR = process.cwd()

/**
 * Baseline 数据（M28.2 实施时实测 2026-09-11）：
 *
 * - 当前实现（N 次顺序 runVerification，PLACEHOLDER_LINT_COMMAND 占位命令）：
 *   - N=10  ：~263 ms mean / 340 ms p99
 *   - N=50  ：~1294 ms mean / 1657 ms p99
 *   - N=100 ：~2593 ms mean / 2977 ms p99
 *   - single runVerification（N=1 等价）：~27 ms mean / 39 ms p99
 *
 * - 比例分析：
 *   - N=100 / N=1 = 2593 / 27 ≈ **96x**——理论上限 100x（线性）
 *   - 实测 96x 表明：每次 runVerification 调用顺序串行，无并行 / 缓存
 *   - 真实 `pnpm lint`（5-30s/次）按比例放大：N=100 ≈ 50-300 秒（CI 阻塞瓶颈）
 *
 * - 优化目标（合并验证 → 1 次 runVerification）：
 *   - 预期总耗时 ≈ N=1 耗时 × 1（占位命令 ~27 ms；真实 lint 5-30s）
 *   - **理论提速 ~96x**（占位命令实测）
 *   - 真实环境预期提速 **10-100x**（合并验证消解 spawn 开销但保留 lint 一次执行）
 *
 * - 验证方案：commit 2 实施合并验证后，对照 "single runVerification" bench
 *   预期 N=10/50/100 优化后耗时均接近 single runVerification（N=1 等价）。
 *
 * 历史 commit：
 * - M23.3 C66 告警视图增强（commit f44a527 / b6e7716 / 650a0d2 等）—— A/B/C 分层已实现
 * - app/helpers.ts:474 quickVerifyProject 调用链 —— 每次 cs 告警修复后跑一次 lint
 * - verification-runner.ts:140 runVerification —— 每次 spawn 子进程 + network-audit + telemetry
 */

describe('multi-cs-alerts lint baseline benchmark', () => {
    bench(
        'N=10 cs alerts (sequential runVerification)',
        async () => {
            for (let i = 0; i < 10; i++) {
                await runVerification({
                    workDir: REAL_WORK_DIR,
                    commands: [PLACEHOLDER_LINT_COMMAND],
                    networkAuditDisabled: true,
                })
            }
        },
        { iterations: 3, time: 30_000 },
    )

    bench(
        'N=50 cs alerts (sequential runVerification)',
        async () => {
            for (let i = 0; i < 50; i++) {
                await runVerification({
                    workDir: REAL_WORK_DIR,
                    commands: [PLACEHOLDER_LINT_COMMAND],
                    networkAuditDisabled: true,
                })
            }
        },
        { iterations: 3, time: 60_000 },
    )

    bench(
        'N=100 cs alerts (sequential runVerification)',
        async () => {
            for (let i = 0; i < 100; i++) {
                await runVerification({
                    workDir: REAL_WORK_DIR,
                    commands: [PLACEHOLDER_LINT_COMMAND],
                    networkAuditDisabled: true,
                })
            }
        },
        { iterations: 2, time: 120_000 },
    )
})

/**
 * 对照基准：单次 runVerification（用于计算"合并验证优化后预期耗时"）。
 *
 * 注意：此 bench 仅用于文档对比参考；不实施合并验证优化前，基线无对照意义。
 * 优化实施后，对照 bench 同步新增 "merged N=10 cs alerts (single runVerification)"
 * 验证总耗时 ≈ N=1 耗时 × 1。
 */
describe('control: single runVerification (optimization target)', () => {
    bench(
        'single runVerification (N=1 equivalent)',
        async () => {
            await runVerification({
                workDir: REAL_WORK_DIR,
                commands: [PLACEHOLDER_LINT_COMMAND],
                networkAuditDisabled: true,
            })
        },
        { iterations: 10, time: 10_000 },
    )
})
