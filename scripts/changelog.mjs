/**
 * CHANGELOG.md 生成脚本（方案 B）
 *
 * 使用 conventional-changelog + conventional-changelog-cmyr-config 生成日志：
 * - 根级 CHANGELOG.md：全仓库 feat/fix/refactor 类 commit（chore/ci/docs 等类型由
 *   preset 过滤，不进入日志），版本段以 dependfix@ tag 序列划分（dependfix 为主交付物）
 * - packages/cli/CHANGELOG.md：仅 packages/cli 路径下的 commit（path 过滤 + dependfix@ tag 序列）
 * - packages/core/CHANGELOG.md：仅 packages/core 路径下的 commit（path 过滤 + @dependfix/core@ tag 序列）
 * - packages/skills/CHANGELOG.md：仅 packages/skills 路径下的 commit（path 过滤 + @dependfix/skills@ tag 序列）
 *
 * 注意：
 * - 必须在仓库根目录运行（pnpm changelog），cmyr-config 从 cwd 的 package.json 读取
 *   `changelog.language` 决定分组语言（zh → 中文 emoji 分组）
 * - releaseCount: 0 全量重新生成，输出是幂等的（每次覆盖完整历史）
 * - 生成时机：changeset version 之后、publish 之前（此时新版本尚无 tag，
 *   当前版本段输出全部新增 commit）。边界行为：若在版本 == 最新 tag 时运行
 *   （如 core-only 发布后重跑、或发布后立即重跑），顶层段会复用该版本号并生成
 *   自引用 compare 链接（old...old），属正常现象，下一版本发布段会自动归位）
 * - 版本标题日期固定为 HEAD commit 日期（而非生成当天）：保证 CI 重跑幂等，
 *   避免跨天产生无关 diff（release.yml 的 changelog 校验依赖此行为）
 * - 依赖 conventional-changelog@^7（8.x 模板引擎与 cmyr-config 3.x 不兼容）
 */
import { execSync } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ConventionalChangelog, defaultCommitTransform } from 'conventional-changelog'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))

// 版本标题日期：HEAD commit 的 UTC 日期（yyyy-mm-dd），保证任意时刻重跑输出一致。
// 注意转 UTC：writer 对已发布版本段使用 commit 日期的 UTC 形式（formatDate → toISOString），
// 这里统一为 UTC，避免发布后重跑时已发布段日期被改写产生无关 diff
const headDate = new Date(
    execSync('git log -1 --format=%cI', { cwd: repoRoot }).toString().trim(),
).toISOString().slice(0, 10)

const targets = [
    {
        file: 'CHANGELOG.md',
        title: 'dependfix',
        commits: {},
        tags: { prefix: 'dependfix@' },
        // 根级版本锚 = dependfix 包版本（与 dependfix@ tag 序列同步，由 changesets 维护）
        pkg: 'packages/cli/package.json',
    },
    {
        file: 'packages/cli/CHANGELOG.md',
        title: 'dependfix',
        commits: { path: 'packages/cli' },
        tags: { prefix: 'dependfix@' },
        pkg: 'packages/cli/package.json',
    },
    {
        file: 'packages/core/CHANGELOG.md',
        title: '@dependfix/core',
        commits: { path: 'packages/core' },
        tags: { prefix: '@dependfix/core@' },
        pkg: 'packages/core/package.json',
    },
    {
        file: 'packages/skills/CHANGELOG.md',
        title: '@dependfix/skills',
        commits: { path: 'packages/skills' },
        tags: { prefix: '@dependfix/skills@' },
        pkg: 'packages/skills/package.json',
    },
]

async function generate({ commits, tags, pkg }) {
    let out = ''
    const cc = new ConventionalChangelog(repoRoot)
        .loadPreset('conventional-changelog-cmyr-config')
        .options({
            releaseCount: 0,
            // 过滤非数字 issue 引用（如历史 commit 正文中的 "package.json#scripts"），
            // 避免渲染出指向 https://github.com/package.json/issues/scripts 的无效链接
            // 注意：必须先调用 defaultCommitTransform 保留版本分段信息（commit.version），
            // 直接返回自定义对象会破坏 writer 的 generateOn 分段机制（单段错误 relabel）；
            // commit 对象只读，需返回新对象
            transformCommit: (commit, params) => {
                const patch = defaultCommitTransform(commit, params)
                if (!commit.references?.length) {
                    return patch
                }
                const refs = commit.references.filter((ref) => /^\d+$/.test(ref.issue))
                patch.references = refs
                return patch
            },
        })
        .commits(commits)
        .tags(tags)
        .context({ date: headDate })
        .readPackage(join(repoRoot, pkg))
    for await (const chunk of cc.write(false)) {
        out += chunk
    }
    return out
}

for (const target of targets) {
    const content = await generate(target)
    const full = `# ${target.title}\n\n${content}`
    const dest = join(repoRoot, target.file)
    await writeFile(dest, full, 'utf8')
    console.log(`generated ${target.file} (${full.length} bytes)`)
}
