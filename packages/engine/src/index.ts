// @dependfix/engine 公共出口：执行引擎核心（cli / mcp / platform 共享）。
// 注意：本包刻意不 re-export @dependfix/core（消费者直接依赖 core，避免
// 双层 re-export 造成同名符号冲突与类型来源歧义）。
export * from './github'
export * from './code-scanning/rule-classifier'
export * from './code-scanning/templates'
