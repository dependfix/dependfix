import { describe, expect, it } from 'vitest'
import { appendRepositories, isRuntimeMode, isSeverityThreshold, isAlertSource, normalizeFlagList, parseCommandsFlag, parseIntegerFlag, parseUpgradeGroupsFlag, parseCliArgs } from './index'

describe('isRuntimeMode', () => {
    it('report-only 是有效模式', () => {
        expect(isRuntimeMode('report-only')).toBe(true)
    })

    it('fix 是有效模式', () => {
        expect(isRuntimeMode('fix')).toBe(true)
    })

    it('fix-and-pr 是有效模式', () => {
        expect(isRuntimeMode('fix-and-pr')).toBe(true)
    })

    it('cleanup-branches 是有效模式', () => {
        expect(isRuntimeMode('cleanup-branches')).toBe(true)
    })

    it('invalid 不是有效模式', () => {
        expect(isRuntimeMode('invalid')).toBe(false)
    })

    it('空字符串不是有效模式', () => {
        expect(isRuntimeMode('')).toBe(false)
    })
})

describe('isSeverityThreshold', () => {
    it('critical 是有效阈值', () => {
        expect(isSeverityThreshold('critical')).toBe(true)
    })

    it('high 是有效阈值', () => {
        expect(isSeverityThreshold('high')).toBe(true)
    })

    it('medium 是有效阈值', () => {
        expect(isSeverityThreshold('medium')).toBe(true)
    })

    it('all 是有效阈值', () => {
        expect(isSeverityThreshold('all')).toBe(true)
    })

    it('invalid 不是有效阈值', () => {
        expect(isSeverityThreshold('invalid')).toBe(false)
    })

    it('空字符串不是有效阈值', () => {
        expect(isSeverityThreshold('')).toBe(false)
    })
})

describe('isAlertSource', () => {
    it('github-dependabot 是有效来源', () => {
        expect(isAlertSource('github-dependabot')).toBe(true)
    })

    it('pnpm-audit 是有效来源', () => {
        expect(isAlertSource('pnpm-audit')).toBe(true)
    })

    it('invalid 不是有效来源', () => {
        expect(isAlertSource('invalid')).toBe(false)
    })

    it('空字符串不是有效来源', () => {
        expect(isAlertSource('')).toBe(false)
    })
})

describe('appendRepositories', () => {
    it('添加单个仓库', () => {
        const repos: string[] = []
        appendRepositories(repos, 'owner/repo')
        expect(repos).toEqual(['owner/repo'])
    })

    it('添加多个逗号分隔仓库', () => {
        const repos: string[] = []
        appendRepositories(repos, 'owner/repo1,owner/repo2')
        expect(repos).toEqual(['owner/repo1', 'owner/repo2'])
    })

    it('忽略空白项', () => {
        const repos: string[] = []
        appendRepositories(repos, 'owner/repo1,,owner/repo2,')
        expect(repos).toEqual(['owner/repo1', 'owner/repo2'])
    })

    it('去除空白', () => {
        const repos: string[] = []
        appendRepositories(repos, ' owner/repo1 , owner/repo2 ')
        expect(repos).toEqual(['owner/repo1', 'owner/repo2'])
    })

    it('无效仓库标识抛出错误', () => {
        const repos: string[] = []
        expect(() => appendRepositories(repos, 'invalid')).toThrow('Invalid repository identifier')
    })

    it('空字符串不添加', () => {
        const repos: string[] = []
        appendRepositories(repos, '')
        expect(repos).toEqual([])
    })

    it('追加到已有数组', () => {
        const repos = ['existing/repo']
        appendRepositories(repos, 'owner/new')
        expect(repos).toEqual(['existing/repo', 'owner/new'])
    })
})

describe('parseCliArgs', () => {
    it('解析基本参数', () => {
        const result = parseCliArgs(['fix', '--repo', 'owner/repo'])
        expect(result.mode).toBe('fix')
        expect(result.configOverrides.repositories).toEqual(['owner/repo'])
    })

    it('默认 mode 为 report-only', () => {
        const result = parseCliArgs([])
        expect(result.mode).toBe('report-only')
    })

    it('解析 severity-threshold', () => {
        const result = parseCliArgs(['--severity-threshold', 'critical'])
        expect(result.configOverrides.severityThreshold).toBe('critical')
    })

    it('解析 dry-run', () => {
        const result = parseCliArgs(['--dry-run'])
        expect(result.configOverrides.dryRun).toBe(true)
    })

    it('解析 create-pr', () => {
        const result = parseCliArgs(['--create-pr'])
        expect(result.configOverrides.createPullRequest).toBe(true)
    })

    it('解析 commit', () => {
        const result = parseCliArgs(['--commit'])
        expect(result.configOverrides.commit).toBe(true)
    })

    it('解析 verbose', () => {
        const result = parseCliArgs(['--verbose'])
        expect(result.configOverrides.verbose).toBe(true)
    })

    it('解析 commands', () => {
        const result = parseCliArgs(['--commands', 'lint,test'])
        expect(result.configOverrides.commands).toEqual(['lint', 'test'])
    })

    it('解析 history', () => {
        const result = parseCliArgs(['--history', 'owner/repo'])
        expect(result.configOverrides.history).toBe('owner/repo')
    })

    it('解析 alerts-source', () => {
        const result = parseCliArgs(['--alerts-source', 'pnpm-audit'])
        expect(result.configOverrides.alertSource).toBe('pnpm-audit')
    })

    it('无效 alerts-source 抛出错误', () => {
        expect(() => parseCliArgs(['--alerts-source', 'invalid'])).toThrow('Invalid --alerts-source value')
    })

    it('解析 ai-provider', () => {
        const result = parseCliArgs(['--ai-provider', 'anthropic'])
        expect(result.configOverrides.aiProvider).toBe('anthropic')
    })

    it('无效 ai-provider 抛出错误', () => {
        expect(() => parseCliArgs(['--ai-provider', 'invalid'])).toThrow('Invalid --ai-provider value')
    })

    it('解析 ai-trigger', () => {
        const result = parseCliArgs(['--ai-trigger', 'major'])
        expect(result.configOverrides.aiTrigger).toBe('major')
    })

    it('无效 ai-trigger 抛出错误', () => {
        expect(() => parseCliArgs(['--ai-trigger', 'invalid'])).toThrow('Invalid --ai-trigger value')
    })

    it('解析 max-alerts-per-repository', () => {
        const result = parseCliArgs(['--max-alerts-per-repository', '50'])
        expect(result.configOverrides.maxAlertsPerRepository).toBe(50)
    })

    it('解析 upgrade-groups', () => {
        const result = parseCliArgs(['--upgrade-groups', 'group1:pkg1,pkg2'])
        expect(result.configOverrides.upgradeGroups).toEqual({ group1: ['pkg1', 'pkg2'] })
    })

    it('解析 code-scanning', () => {
        const result = parseCliArgs(['--code-scanning'])
        expect(result.configOverrides.codeScanningEnabled).toBe(true)
    })

    it('解析 code-quality', () => {
        const result = parseCliArgs(['--code-quality'])
        expect(result.configOverrides.codeQualityEnabled).toBe(true)
    })

    it('解析 allow-major-upgrade', () => {
        const result = parseCliArgs(['--allow-major-upgrade'])
        expect(result.configOverrides.allowMajorUpgrade).toBe(true)
    })

    it('解析 cleanup-branches', () => {
        const result = parseCliArgs(['--cleanup-branches'])
        expect(result.configOverrides.cleanupBranches).toBe(true)
    })

    it('解析 cleanup-branches-auto', () => {
        const result = parseCliArgs(['--cleanup-branches-auto'])
        expect(result.configOverrides.cleanupBranchesAuto).toBe(true)
    })

    it('解析 owner', () => {
        const result = parseCliArgs(['--owner', 'owner1,owner2'])
        expect(result.configOverrides.owner).toEqual(['owner1', 'owner2'])
    })

    it('解析 repo-topics', () => {
        const result = parseCliArgs(['--repo-topics', 'topic1,topic2'])
        expect(result.configOverrides.repoTopics).toEqual(['topic1', 'topic2'])
    })

    it('解析 repo-include', () => {
        const result = parseCliArgs(['--repo-include', 'owner/*'])
        expect(result.configOverrides.repoInclude).toEqual(['owner/*'])
    })

    it('解析 repo-exclude', () => {
        const result = parseCliArgs(['--repo-exclude', 'owner/old-*'])
        expect(result.configOverrides.repoExclude).toEqual(['owner/old-*'])
    })
})

describe('normalizeFlagList', () => {
    it('undefined 返回空数组', () => {
        expect(normalizeFlagList(undefined)).toEqual([])
    })

    it('单个字符串返回拆分后数组', () => {
        expect(normalizeFlagList('a,b,c')).toEqual(['a', 'b', 'c'])
    })

    it('数组直接拆分', () => {
        expect(normalizeFlagList(['a,b', 'c'])).toEqual(['a', 'b', 'c'])
    })

    it('去除空白', () => {
        expect(normalizeFlagList(' a , b , c ')).toEqual(['a', 'b', 'c'])
    })

    it('过滤空项', () => {
        expect(normalizeFlagList('a,,b,')).toEqual(['a', 'b'])
    })

    it('空字符串返回空数组', () => {
        expect(normalizeFlagList('')).toEqual([])
    })

    it('仅空白返回空数组', () => {
        expect(normalizeFlagList('   ')).toEqual([])
    })

    it('单元素无逗号', () => {
        expect(normalizeFlagList('single')).toEqual(['single'])
    })

    it('数组含空字符串被过滤', () => {
        expect(normalizeFlagList(['a', '', 'b'])).toEqual(['a', 'b'])
    })
})

describe('parseCommandsFlag', () => {
    it('逗号分隔命令', () => {
        expect(parseCommandsFlag('lint,test,build')).toEqual(['lint', 'test', 'build'])
    })

    it('去除空白', () => {
        expect(parseCommandsFlag(' lint , test ')).toEqual(['lint', 'test'])
    })

    it('过滤空项', () => {
        expect(parseCommandsFlag('lint,,test,')).toEqual(['lint', 'test'])
    })

    it('单个命令', () => {
        expect(parseCommandsFlag('lint')).toEqual(['lint'])
    })

    it('空字符串返回空数组', () => {
        expect(parseCommandsFlag('')).toEqual([])
    })
})

describe('parseIntegerFlag', () => {
    it('有效整数', () => {
        expect(parseIntegerFlag('42', 'flag', 'expected')).toBe(42)
    })

    it('零', () => {
        expect(parseIntegerFlag('0', 'flag', 'expected')).toBe(0)
    })

    it('大整数', () => {
        expect(parseIntegerFlag('100000', 'flag', 'expected')).toBe(100000)
    })

    it('带空白的有效整数', () => {
        expect(parseIntegerFlag(' 42 ', 'flag', 'expected')).toBe(42)
    })

    it('小数抛出错误', () => {
        expect(() => parseIntegerFlag('2.5', 'flag', 'Expected integer')).toThrow('Invalid flag value')
    })

    it('非数字抛出错误', () => {
        expect(() => parseIntegerFlag('abc', 'flag', 'Expected integer')).toThrow('Invalid flag value')
    })

    it('负数抛出错误', () => {
        expect(() => parseIntegerFlag('-1', 'flag', 'Expected integer')).toThrow('Invalid flag value')
    })

    it('混合字符抛出错误', () => {
        expect(() => parseIntegerFlag('12abc', 'flag', 'Expected integer')).toThrow('Invalid flag value')
    })
})

describe('parseUpgradeGroupsFlag', () => {
    it('正常解析分组', () => {
        const result = parseUpgradeGroupsFlag('group1:pkg1,pkg2;group2:pkg3')
        expect(result).toEqual({
            group1: ['pkg1', 'pkg2'],
            group2: ['pkg3'],
        })
    })

    it('空字符串返回空对象', () => {
        expect(parseUpgradeGroupsFlag('')).toEqual({})
    })

    it('忽略空 entry', () => {
        const result = parseUpgradeGroupsFlag('group1:pkg1;;group2:pkg2')
        expect(result).toEqual({
            group1: ['pkg1'],
            group2: ['pkg2'],
        })
    })

    it('缺少冒号抛出错误', () => {
        expect(() => parseUpgradeGroupsFlag('invalid')).toThrow('Invalid --upgrade-groups entry')
    })

    it('冒号在开头抛出错误', () => {
        expect(() => parseUpgradeGroupsFlag(':pkg1')).toThrow('Invalid --upgrade-groups entry')
    })

    it('忽略 __proto__ 键名', () => {
        const result = parseUpgradeGroupsFlag('__proto__:pkg1;group1:pkg2')
        expect(result).toEqual({ group1: ['pkg2'] })
    })

    it('忽略 constructor 键名', () => {
        const result = parseUpgradeGroupsFlag('constructor:pkg1;group1:pkg2')
        expect(result).toEqual({ group1: ['pkg2'] })
    })

    it('忽略 prototype 键名', () => {
        const result = parseUpgradeGroupsFlag('prototype:pkg1;group1:pkg2')
        expect(result).toEqual({ group1: ['pkg2'] })
    })

    it('包列表为空抛出错误', () => {
        expect(() => parseUpgradeGroupsFlag('group1:')).toThrow('Invalid --upgrade-groups entry')
    })

    it('包列表含空白被过滤后为空抛出错误', () => {
        expect(() => parseUpgradeGroupsFlag('group1: , ')).toThrow('Invalid --upgrade-groups entry')
    })

    it('单个分组', () => {
        const result = parseUpgradeGroupsFlag('group1:pkg1')
        expect(result).toEqual({ group1: ['pkg1'] })
    })

    it('包名含空白被 trim', () => {
        const result = parseUpgradeGroupsFlag('group1: pkg1 , pkg2 ')
        expect(result).toEqual({ group1: ['pkg1', 'pkg2'] })
    })
})
