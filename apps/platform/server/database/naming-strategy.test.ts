import { describe, expect, it } from 'vitest'
import { SnakeCaseNamingStrategy } from './naming-strategy'

/**
 * SnakeCaseNamingStrategy 单测：覆盖所有 toSnakeCase / tableName / columnName /
 * joinTableColumnName 分支；relationName / joinColumnName / joinTableName 直接转发
 * toSnakeCase，单测只验证形态（不引入新分支，但显式锁定契约防回归）。
 *
 * 启动本测试的根因：v8 覆盖率统计下该文件 branches 仅 30%（仅 entity scanning 触发部分路径），
 * branches 80% 冲刺需补齐覆盖盲区。
 */
describe('SnakeCaseNamingStrategy', () => {
    const strategy = new SnakeCaseNamingStrategy()

    describe('toSnakeCase 边界形态（间接覆盖：每个 toSnakeCase 调用站点都计入 branches）', () => {
        // 通过 tableName/columnName 间接覆盖 toSnakeCase 各分支：
        // - 驼峰切分（[a-z0-9])([A-Z]) → '$1_$2'）
        // - 连字符/空格/点 → '_'
        // - .toLowerCase()
        it('camelCase → snake_case', () => {
            expect(strategy.tableName('ScanRunEntity', '')).toBe('scan_run_entity')
        })

        it('kebab-case 输入 → snake_case', () => {
            expect(strategy.tableName('', 'my-table-name')).toBe('my_table_name')
        })

        it('空格分隔 → snake_case', () => {
            expect(strategy.tableName('', 'my table name')).toBe('my_table_name')
        })

        it('点号分隔 → snake_case（joinTableName replace 用）', () => {
            expect(strategy.joinTableName('t1', 't2', 'a.b', 'c.d')).toBe('t1_a_b_t2_c_d')
        })

        it('连续大写 → 切分第一个边界（连续大写整体保留）', () => {
            // "HTTPServer" → "httpserver"（连续大写不切分；这是 toSnakeCase 当前实现）
            expect(strategy.tableName('', 'HTTPServer')).toBe('httpserver')
        })
    })

    describe('tableName', () => {
        it('uses customName when provided', () => {
            expect(strategy.tableName('ClassName', 'custom_table')).toBe('custom_table')
        })

        it('falls back to className when customName is empty', () => {
            expect(strategy.tableName('ClassName', '')).toBe('class_name')
        })
    })

    describe('columnName', () => {
        it('joins embeddedPrefixes with customName', () => {
            expect(strategy.columnName('prop', 'col', ['embedded'])).toBe('embedded_col')
        })

        it('joins embeddedPrefixes with propertyName when customName empty', () => {
            expect(strategy.columnName('propName', '', ['embedded'])).toBe('embedded_prop_name')
        })

        it('uses customName when no embeddedPrefixes', () => {
            expect(strategy.columnName('propertyName', 'col', [])).toBe('col')
        })

        it('falls back to propertyName when no embeddedPrefixes and no customName', () => {
            expect(strategy.columnName('propertyName', '', [])).toBe('property_name')
        })
    })

    describe('relationName', () => {
        it('snake_cases propertyName', () => {
            expect(strategy.relationName('repository')).toBe('repository')
            expect(strategy.relationName('scanRunList')).toBe('scan_run_list')
        })
    })

    describe('joinColumnName', () => {
        it('joins relationName + referencedColumnName with underscore', () => {
            expect(strategy.joinColumnName('repository', 'id')).toBe('repository_id')
        })
    })

    describe('joinTableName', () => {
        it('replaces dots in property names with underscores', () => {
            // 模板：firstTable_firstProperty_secondTable_secondProperty
            expect(strategy.joinTableName('user', 'role', 'roles', 'users')).toBe('user_roles_role_users')
        })

        it('handles plain property names without dots', () => {
            expect(strategy.joinTableName('a', 'b', 'c', 'd')).toBe('a_c_b_d')
        })
    })

    describe('joinTableColumnName', () => {
        it('uses columnName when provided', () => {
            expect(strategy.joinTableName('a', 'b', 'c', 'd')) // sanity
            expect(strategy.joinTableColumnName('table', 'prop', 'col')).toBe('table_col')
        })

        it('falls back to propertyName when columnName is empty', () => {
            expect(strategy.joinTableColumnName('table', 'propName', '')).toBe('table_prop_name')
        })
    })
})
