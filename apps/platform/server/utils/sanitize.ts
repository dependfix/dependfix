/**
 * 服务端脱敏入口：规则本体已下沉到 `shared/sanitize.ts`（App 与 Nitro 共用）。
 *
 * 保留本文件仅为既有 `#server/utils/sanitize` 导入面稳定；新代码可直接
 * `import { sanitizeString } from '#shared/sanitize'`。
 */
export {
    CIRCULAR_PLACEHOLDER,
    sanitizeDeep,
    sanitizeString,
} from '#shared/sanitize'
