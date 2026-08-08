#!/usr/bin/env node
import { connectStdio } from './index'

connectStdio().catch((error) => {
    console.error('[dependfix-mcp] 启动失败:', error)
    process.exit(1)
})
