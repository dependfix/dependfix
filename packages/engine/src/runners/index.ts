// runners 公共出口（cli/src/index.ts 通过 './runners' 暴露）。
// 注意：verification-gate 刻意**不**在此收口——重构前后它均非公共 API
// （DependfixApp 内部使用），保持 API 面不变。如需从 API 面导出请先评估兼容性。
export * from './verification-runner'
// 进程控制**诊断面**（平台执行器取消未落定时读取）：只暴露只读状态，不含 kill / 记录原语。
// 受支持的最小集合 = 取消原因 + 取消时刻快照（在管子进程数 / 最后命令）；新增导出需按公共 API 变更评估。
export { getAbortReason, getAbortSnapshot } from './process-control'
