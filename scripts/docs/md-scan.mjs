/**
 * md-scan.mjs —— markdown 扫描的共享底层（链接正则 / 宽松归一化 / 逐行遍历）。
 *
 * 从 `scripts/check-docs.mjs` 抽出：`check-docs` 已承载 8 条规则，文件逼近 `max-lines`
 * 上限；把与规则无关的扫描原语下沉，规则文件只保留判定逻辑。
 * `docs/` 下其它脚本（锚点迁移 / 产物复核）复用同一组原语，避免链接正则各自维护。
 */
import { readFileSync } from 'node:fs'

/** markdown 链接（inline 形态）：`[文本](目标)` */
export const LINK_RE = /\[([^\]]*)\]\(([^)\s]+)\)/g

/**
 * fenced code block 边界（反引号或波浪号，info 串随行捕获）。
 * 前导缩进单独捕获：CommonMark 规定 fence 的缩进不得超过 3 空格，4 空格起属缩进代码块
 * （缩进代码块不在本模块模拟面内，见文件头说明）。
 */
export const FENCE_RE = /^( {0,3})(`{3,}|~{3,})(.*)$/

/** 外部链接前缀（不参与仓库内路径校验） */
export const EXTERNAL_LINK_RE = /^(https?:|mailto:|tel:|www\.|<)/

/**
 * 仓库内不参与文档检查的运行时目录（相对仓库根的 POSIX 前缀，必须与实参 repoRoot 一致）。
 *
 * `apps/platform/data`：平台运行时数据（由 `apps/platform/.gitignore` 排除）。扫描 run 会把
 * 目标仓库克隆与产物落在 `data/runs/<runId>/` 下（含大量 `.md`），若不剪枝，这些「本仓不存在」
 * 的文件会被当成仓库文档参与链接 / 插值检查，本地报出成百上千与环境无关的错误
 * （CI 为干净检出，不受影响）。按路径前缀而非目录名 `data`：`data` 是通用名，按名排除会误伤同名正常目录。
 */
export const RUNTIME_EXCLUDED_PATHS = ['apps/platform/data']

/** 宽松规范化：小写 + 移除标点/符号（含 emoji）/空白，用于跨平台锚点比较 */
export function looseNorm(str) {
    return str.toLowerCase().replace(/[\p{P}\p{S}\s]+/gu, '')
}

/**
 * 逐行标记是否处于 fenced code block 内（含 fence 行本身），fence 判定对齐 markdown-it：
 * 开启 / 闭合 fence 缩进 ≤ 3 空格，闭合必须同字符、不短于开启者、且无 info 串。
 * 缩进代码块（4 空格起）不在模拟面内——本函数只认 fence。
 * 需要「先扫描再按行改写」的两段式处理（如锚点迁移的 plan / apply）时用本函数，
 * 保证两侧对代码块边界完全同口径。
 * @param {string[]} lines 按行拆分的原文
 * @returns {boolean[]} 与 lines 等长，true = 属代码块（不参与改写）
 */
export function fenceMask(lines) {
    const mask = []
    let inFence = false
    let fenceChar = ''
    let fenceLength = 0

    for (const line of lines) {
        const fence = line.match(FENCE_RE)
        if (fence) {
            const [, , marker, info] = fence
            if (!inFence) {
                if (!(marker[0] === '`' && info.includes('`'))) {
                    inFence = true
                    fenceChar = marker[0]
                    fenceLength = marker.length
                    mask.push(true)
                    continue
                }
            } else if (marker[0] === fenceChar && marker.length >= fenceLength && info.trim() === '') {
                inFence = false
                mask.push(true)
                continue
            }
        }
        mask.push(inFence)
    }

    return mask
}

/**
 * 逐行遍历 md 的正文（跳过 fenced code block），回调拿到 (行内容, 行号)。
 */
export function forEachProseLine(file, fn) {
    const lines = readFileSync(file, 'utf8').split(/\r?\n/)
    const mask = fenceMask(lines)

    lines.forEach((line, idx) => {
        if (mask[idx]) {
            return
        }
        fn(line, idx + 1)
    })
}
