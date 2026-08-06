# Code Quality Checklist

## Error Handling

### Anti-patterns to Flag

- **Swallowed exceptions**: Empty catch blocks or catch with only logging
  ```javascript
  try { ... } catch (e) { }  // Silent failure
  try { ... } catch (e) { console.log(e) }  // Log and forget
  ```
- **Overly broad catch**: Catching `Exception`/`Error` base class instead of specific types
- **Error information leakage**: Stack traces or internal details exposed to users
- **Missing error handling**: No try-catch around fallible operations (I/O, network, parsing)
- **Async error handling**: Unhandled promise rejections, missing `.catch()`, no error boundary

### Best Practices to Check

- [ ] Errors are caught at appropriate boundaries
- [ ] Error messages are user-friendly (no internal details exposed)
- [ ] Errors are logged with sufficient context for debugging
- [ ] Async errors are properly propagated or handled
- [ ] Fallback behavior is defined for recoverable errors
- [ ] Critical errors trigger alerts/monitoring

### Questions to Ask
- "What happens when this operation fails?"
- "Will the caller know something went wrong?"
- "Is there enough context to debug this error?"

---

## Performance & Caching

### CPU-Intensive Operations

- **Expensive operations in hot paths**: Regex compilation, JSON parsing, crypto in loops
- **Blocking main thread**: Sync I/O, heavy computation without worker/async
- **Unnecessary recomputation**: Same calculation done multiple times
- **Missing memoization**: Pure functions called repeatedly with same inputs

### Database & I/O

- **N+1 queries**: Loop that makes a query per item instead of batch
  ```javascript
  // Bad: N+1
  for (const id of ids) {
    const user = await db.query(`SELECT * FROM users WHERE id = ?`, id)
  }
  // Good: Batch
  const users = await db.query(`SELECT * FROM users WHERE id IN (?)`, ids)
  ```
- **Missing indexes**: Queries on unindexed columns
- **Over-fetching**: SELECT * when only few columns needed
- **No pagination**: Loading entire dataset into memory

### Caching Issues

- **Missing cache for expensive operations**: Repeated API calls, DB queries, computations
- **Cache without TTL**: Stale data served indefinitely
- **Cache without invalidation strategy**: Data updated but cache not cleared
- **Cache key collisions**: Insufficient key uniqueness
- **Caching user-specific data globally**: Security/privacy issue

### Memory

- **Unbounded collections**: Arrays/maps that grow without limit
- **Large object retention**: Holding references preventing GC
- **String concatenation in loops**: Use StringBuilder/join instead
- **Loading large files entirely**: Use streaming instead

### Questions to Ask
- "What's the time complexity of this operation?"
- "How does this behave with 10x/100x data?"
- "Is this result cacheable? Should it be?"
- "Can this be batched instead of one-by-one?"

---

## Boundary Conditions

### Null/Undefined Handling

- **Missing null checks**: Accessing properties on potentially null objects
- **Truthy/falsy confusion**: `if (value)` when `0` or `""` are valid
- **Optional chaining overuse**: `a?.b?.c?.d` hiding structural issues
- **Null vs undefined inconsistency**: Mixed usage without clear convention

### Empty Collections

- **Empty array not handled**: Code assumes array has items
- **Empty object edge case**: `for...in` or `Object.keys` on empty object
- **First/last element access**: `arr[0]` or `arr[arr.length-1]` without length check

### Numeric Boundaries

- **Division by zero**: Missing check before division
- **Integer overflow**: Large numbers exceeding safe integer range
- **Floating point comparison**: Using `===` instead of epsilon comparison
- **Negative values**: Index or count that shouldn't be negative
- **Off-by-one errors**: Loop bounds, array slicing, pagination

### String Boundaries

- **Empty string**: Not handled as edge case
- **Whitespace-only string**: Passes truthy check but is effectively empty
- **Very long strings**: No length limits causing memory/display issues
- **Unicode edge cases**: Emoji, RTL text, combining characters

### Common Patterns to Flag

```javascript
// Dangerous: no null check
const name = user.profile.name

// Dangerous: array access without check
const first = items[0]

// Dangerous: division without check
const avg = total / count

// Dangerous: truthy check excludes valid values
if (value) { ... }  // fails for 0, "", false
```

### Questions to Ask
- "What if this is null/undefined?"
- "What if this collection is empty?"
- "What's the valid range for this number?"
- "What happens at the boundaries (0, -1, MAX_INT)?"

---

## Standards Compliance

### Development-Flow ID Markers in Comments & Test Names (必查)

审查新增/修改的注释与测试名是否残留规划/任务/审计/backlog 编号标记。规范见项目 [development.md §3 注释规范](../../../../docs/standards/development.md)。

- **禁止形态**：`C1:`、`T303`、`G2`、`M4+`、`R2`、`P0`、`P1-1` 等孤立编号（含 `C1：xxx` 中文冒号与 `it('C1: xxx')` 测试名前缀）
- **例外（允许保留）**：
  - 代码内真实常量：如 HTTP 错误码 `E401`
  - 带文档路径/章节名的导航指针：如"背景详见 `docs/plan/todo.md`「已知缺口 G2」"、"见 todo.md G3"
- **修复方式**：删除编号前缀，保留编号后的解释正文（如 `// 按包聚合（P2-1 修复）` → `// 按包聚合（避免同包多告警丢失）`）

### Questions to Ask
- "diff 中新增的注释/测试名是否含孤立编号标记？"
- "编号是否带可反查的文档路径（导航指针例外）？"
- "清理编号后解释正文是否保留、语义是否完整？"

### Bulk Replacements & Line-Ending Integrity (批量替换/行尾审查)

diff 包含大范围替换（脚本/正则批量改写、多文件机械变更）时，重点检查：

- **行尾噪音**：`git diff --ignore-space-at-eol` 与普通 diff 行数差异大 → 说明整文件行尾被翻转（混合行尾仓库常见），要求按行保留原行尾重做
- **代码误伤**：替换正则是否误删代码 token（空调用 `()`、方法名 `trim`/`toUpperCase` 后丢失括号、URL `https:// /` 出现空格）——注意 `typecheck` 不总能覆盖字符串/注释误伤
- **外链破坏**：涉及 URL 文本时检查是否出现 `https:// /`、`http://` 等畸形（check-links 只查本地链接）

规范见 [ai-collaboration.md §1.2 执行原则 6](../../../../docs/standards/ai-collaboration.md)，教训见 [经验归档 §十七](../../../../docs/design/governance/2026-08-06-experience-archive.md)。

### Questions to Ask
- "该改动是否为批量替换？若是，行尾/URL/代码 token 是否被误伤？"
- "是否存在全文件行尾翻转（--ignore-space-at-eol 前后行数差异）？"
