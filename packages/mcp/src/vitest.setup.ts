/**
 * MCP 测试环境隔离：钉住 local 后端，避免开发机已配置平台 env 时既有 local 用例误走 remote。
 * remote 用例在自身 beforeEach 中显式设置 env。
 */
delete process.env.DEPENDFIX_MCP_BACKEND
delete process.env.DEPENDFIX_PLATFORM_URL
delete process.env.DEPENDFIX_PLATFORM_API_KEY
