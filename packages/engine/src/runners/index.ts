// runners 公共出口（cli/src/index.ts 通过 './runners' 暴露）。
// 注意：verification-gate 刻意**不**在此收口——重构前后它均非公共 API
// （DependfixApp 内部使用），保持 API 面不变。如需从 API 面导出请先评估兼容性。
export * from './verification-runner'
// 进程控制**诊断面**（平台执行器取消未落定时读取）：只暴露只读状态，不含 kill / 记录原语。
// 受支持的最小集合 = 取消原因 + 取消时刻快照（在管子进程数 / 最后命令）；新增导出需按公共 API 变更评估。
export { getAbortReason, getAbortSnapshot } from './process-control'
// 执行子进程环境硬化：平台容器执行器对自身派生的 git 命令复用同一过滤实现（单一事实源），
// 避免 platform 侧另写一份 denylist 造成漂移。
export {
    sanitizeCommandEnv,
    DEFAULT_DENIED_ENV_KEYS,
    DEFAULT_DENIED_ENV_PREFIXES,
    DEFAULT_PRESERVED_ENV_KEYS,
    DEFAULT_PRESERVED_ENV_PREFIXES,
} from './env-hardening'
