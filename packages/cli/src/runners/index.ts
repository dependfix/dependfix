// runners 公共出口（cli/src/index.ts 通过 './runners' 暴露）。
// 注意：verification-gate 刻意**不**在此收口——重构前后它均非公共 API
// （DependfixApp 内部使用），保持 API 面不变。如需从 API 面导出请先评估兼容性。
export * from './verification-runner'
