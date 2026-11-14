// sandbox-image.ts — 沙箱镜像候选解析（三源分发消费侧）。
//
// 只做「选用哪个镜像」：显式 SANDBOX_IMAGE 固定单源；否则跟随平台镜像 registry，
// 再回退 Docker Hub → ghcr → ACR（ACR 置末以减少其负荷）。可达性由执行器逐源 inspect / pull 预检定夺。

/**
 * 沙箱镜像候选（按顺序尝试；显式 `SANDBOX_IMAGE` 时只有一项）。
 *
 * 顺序：显式值 → `SANDBOX_IMAGE_REPO` 覆盖 → 从平台镜像（`DEPENDFIX_IMAGE`）推导同 registry 的
 * 沙箱镜像 → Docker Hub → ghcr → ACR。平台镜像来自哪个 registry，沙箱优先用同一个，
 * 避免「平台走 ACR、沙箱却拉 ghcr」的跨网慢速；不可达时依次回退。
 * ACR 放在最后（其带宽/配额有限，只在其余源都取不到时才用）；若平台本身走 ACR，
 * 推导出的 ACR 镜像仍排首位——那说明该部署本来就在用 ACR。
 */
export function resolveSandboxImageCandidates(env: NodeJS.ProcessEnv = process.env): string[] {
    const explicit = env.SANDBOX_IMAGE?.trim()
    if (explicit) {
        return [explicit]
    }
    const tag = resolveSandboxImageTag(env)
    const repoOverride = env.SANDBOX_IMAGE_REPO?.trim().replace(/\/+$/, '')
    if (repoOverride) {
        return [`${repoOverride}:${tag}`]
    }
    const candidates: string[] = []
    const derived = deriveSandboxRepoFromPlatformImage(env.DEPENDFIX_IMAGE)
    if (derived) {
        candidates.push(`${derived}:${tag}`)
    }
    candidates.push(
        `caomeiyouren/dependfix-sandbox:${tag}`,
        `ghcr.io/dependfix/dependfix-sandbox:${tag}`,
        `registry.cn-hangzhou.aliyuncs.com/caomeiyouren/dependfix-sandbox:${tag}`,
    )
    return [...new Set(candidates)]
}

/** 默认沙箱镜像 = 候选列表首项（保持既有单值语义 / 测试）。 */
export function resolveDefaultSandboxImage(env: NodeJS.ProcessEnv = process.env): string {
    return resolveSandboxImageCandidates(env)[0]!
}

/** tag：显式 `SANDBOX_IMAGE_TAG` → 平台构建版本 → 平台镜像 tag（去 `platform-` 前缀）→ latest。 */
function resolveSandboxImageTag(env: NodeJS.ProcessEnv): string {
    const explicit = env.SANDBOX_IMAGE_TAG?.trim()
    if (explicit) {
        return explicit
    }
    const buildVersion = env.NUXT_BUILD_VERSION?.trim()
    if (buildVersion && buildVersion !== 'unknown') {
        return buildVersion
    }
    const platformTag = parseImageTag(env.DEPENDFIX_IMAGE)
    if (platformTag && isPublishedImageTag(platformTag)) {
        return platformTag.replace(/^platform-/, '')
    }
    // 本地构建 tag（local / dev 等）不对外发布，回退 latest 避免三源全部 404
    return 'latest'
}

/** 发布链确实产出的 tag 形态（latest / platform-* / sha-* / 日期 / 语义化版本）。 */
function isPublishedImageTag(tag: string): boolean {
    return tag === 'latest'
        || /^platform-.+$/.test(tag)
        || /^sha-[0-9a-f]{7,}$/.test(tag)
        || /^\d{4}-\d{2}-\d{2}$/.test(tag)
        || /^v?\d+\.\d+\.\d+(?:[-+].+)?$/.test(tag)
}

/** 解析镜像 tag（忽略无 tag / digest；registry 端口不算 tag）。 */
function parseImageTag(image: string | undefined): string | undefined {
    const ref = image?.trim()
    if (!ref) {
        return undefined
    }
    const withoutDigest = ref.split('@')[0]!
    const lastSlash = withoutDigest.lastIndexOf('/')
    const colon = withoutDigest.lastIndexOf(':')
    return colon > lastSlash ? withoutDigest.slice(colon + 1) : undefined
}

/**
 * 从平台镜像推导同 registry / namespace 的沙箱镜像仓库名：
 * `…/dependfix` 或 `…/dependfix-platform` → `…/dependfix-sandbox`；本地镜像名（无 namespace）不推导。
 */
export function deriveSandboxRepoFromPlatformImage(image: string | undefined): string | null {
    const ref = image?.trim()
    if (!ref) {
        return null
    }
    const withoutDigest = ref.split('@')[0]!
    const lastSlash = withoutDigest.lastIndexOf('/')
    const colon = withoutDigest.lastIndexOf(':')
    const repo = colon > lastSlash ? withoutDigest.slice(0, colon) : withoutDigest
    const parts = repo.split('/')
    if (parts.length < 2) {
        return null
    }
    const name = parts[parts.length - 1]!
    if (name !== 'dependfix' && name !== 'dependfix-platform') {
        return null
    }
    return [...parts.slice(0, -1), 'dependfix-sandbox'].join('/')
}

/** 单个镜像拉取上限（默认 300s；`SANDBOX_IMAGE_PULL_TIMEOUT_MS` 可覆盖）。 */
export function resolveImagePullTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
    const parsed = Number.parseInt(env.SANDBOX_IMAGE_PULL_TIMEOUT_MS ?? '', 10)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 300_000
}
