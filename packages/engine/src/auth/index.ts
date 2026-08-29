// @dependfix/engine/auth 子路径出口：GitHub 认证抽象层。
//
// 支持 PAT（classic / fine-grained）与 GitHub App installation token 两种认证路径；
// 调用方通过 fromPat() 或 fromApp() 工厂构造 AuthProvider 实例，再通过 getOctokit() 获取已认证的 Octokit 实例。
//
// 详细设计与落地步骤见 docs/design/governance/c22-pat-backward-compat.md §4.1-4.7。
export * from './auth-provider'
export { fromPat, PatAuthProvider } from './pat-provider'
export { fromApp, AppAuthProvider } from './app-provider'
export { InstallationTokenCache } from './installation-token-cache'
