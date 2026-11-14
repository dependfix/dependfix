// docker-image.ts — 沙箱镜像引用校验（仓库级 sandboxImage / 平台 SANDBOX_IMAGE 共用口径）。
//
// 只做「语法合理」校验，不解析 registry 可达性：镜像是否存在由执行期 docker 拉取结果决定。
// 支持 `registry[:port]/path:tag` 与 `[@sha256:<64 hex>]`；禁止空白 / 控制字符 / 空段 / `..`。

/** 镜像引用最大长度（与 Repository.sandboxImage 列宽一致）。 */
export const MAX_DOCKER_IMAGE_LENGTH = 255

const IMAGE_PATTERN = /^(?:[a-z0-9]+(?:[._-][a-z0-9]+)*(?::[0-9]{1,5})?\/)?[a-z0-9]+(?:[._-][a-z0-9]+)*(?:\/[a-z0-9]+(?:[._-][a-z0-9]+)*)*(?::[A-Za-z0-9_][A-Za-z0-9_.-]{0,127})?(?:@sha256:[a-f0-9]{64})?$/

/** 是否合法的 Docker 镜像引用（不含协议前缀与空白）。 */
export function isValidDockerImage(value: string): boolean {
    const image = value.trim()
    if (!image || image.length > MAX_DOCKER_IMAGE_LENGTH) {
        return false
    }
    if (image.includes('..') || image.includes('//')) {
        return false
    }
    return IMAGE_PATTERN.test(image)
}

/** 归一化：trim 后空串 → null（未配置 = 走平台默认）。 */
export function normalizeDockerImage(value: string | null | undefined): string | null {
    if (typeof value !== 'string') {
        return null
    }
    const image = value.trim()
    return image.length > 0 ? image : null
}
