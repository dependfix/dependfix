// @dependfix/engine 公共出口：执行引擎核心（cli / mcp / platform 共享）。
// 注意：本包刻意不 re-export @dependfix/core（消费者直接依赖 core，避免
// 双层 re-export 造成同名符号冲突与类型来源歧义）。
export * from './github'
export * from './code-scanning/rule-classifier'
export * from './code-scanning/rule-config'
export * from './code-scanning/templates'
export * from './fixers/dependency'
export * from './fixers/pnpm'
export * from './fixers/code-scanning'
export * from './config'
export * from './report/archiver'
export * from './report/history'
export * from './multirepo/scheduler'
export * from './helpers'
export * from './grouping'
export * from './runners'
export * from './alerts'
export * from './ai'
export * from './app'
// auth 抽象层通过子路径 '@dependfix/engine/auth' 暴露（避免与 github 子模块重名）
export type { AuthProvider, AuthProviderOptions, FromAppParams, FromPatParams } from './auth/auth-provider'
