import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { PRODUCT_SKILL_NAME, resolveProductSkillSourceDir } from './source'

describe('resolveProductSkillSourceDir', () => {
    it('DEPENDFIX_SKILLS_DIR 优先于包解析（自包含产物）', () => {
        vi.stubEnv('DEPENDFIX_SKILLS_DIR', '/app/sandbox/skills')
        try {
            expect(resolveProductSkillSourceDir()).toBe(join('/app/sandbox/skills', PRODUCT_SKILL_NAME))
        } finally {
            vi.unstubAllEnvs()
        }
    })

    it('未设置覆盖时回退到 @dependfix/skills 包内目录', () => {
        vi.stubEnv('DEPENDFIX_SKILLS_DIR', '')
        try {
            expect(resolveProductSkillSourceDir()).toMatch(new RegExp(`${PRODUCT_SKILL_NAME}$`))
        } finally {
            vi.unstubAllEnvs()
        }
    })
})
