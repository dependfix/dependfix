---
'dependfix': minor
'@dependfix/core': minor
---

**breaking**: 产物格式改为纯 ESM（移除 CJS 双格式）。CLI / Action 消费不受影响；编程式消费请使用 `import`；`require('dependfix')` / `require('@dependfix/core')` 需要 Node 22.12+（原生 require(ESM)，经 exports `default` 条件解析）。
