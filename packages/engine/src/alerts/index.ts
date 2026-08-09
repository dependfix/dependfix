// alerts 模块出口。
// 注意：本出口是**内部模块出口**，刻意不进入公共 API 面（src/index.ts 不
// `export * from './alerts'`）——fetchPnpmAuditAlerts 目前仅 DependabotApp
// 内部使用，与 runners/verification-gate 同款策略。如需从 API 面导出请先评估兼容性。
export * from './pnpm-audit-fetcher'
