import {
    DefaultNamingStrategy,
    type NamingStrategyInterface,
} from 'typeorm'

/**
 * TypeORM 命名策略：实体属性 camelCase → 数据库列 snake_case。
 * 与 better-auth 默认字段命名约定（camelCase 属性名）对齐。
 * 注：TypeORM 1.x 不导出 snakeCase 工具（exports 限制子路径），此处内联实现。
 */
const toSnakeCase = (input: string): string =>
    input
        .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
        .replace(/[-\s.]+/g, '_')
        .toLowerCase()

export class SnakeCaseNamingStrategy extends DefaultNamingStrategy implements NamingStrategyInterface {
    override tableName(className: string, customName: string): string {
        return customName ? toSnakeCase(customName) : toSnakeCase(className)
    }

    override columnName(propertyName: string, customName: string, embeddedPrefixes: string[]): string {
        if (embeddedPrefixes.length) {
            return `${toSnakeCase(embeddedPrefixes.join('_'))}_${customName ? toSnakeCase(customName) : toSnakeCase(propertyName)}`
        }
        return customName ? toSnakeCase(customName) : toSnakeCase(propertyName)
    }

    override relationName(propertyName: string): string {
        return toSnakeCase(propertyName)
    }

    override joinColumnName(relationName: string, referencedColumnName: string): string {
        return toSnakeCase(`${relationName}_${referencedColumnName}`)
    }

    override joinTableName(firstTableName: string, secondTableName: string, firstPropertyName: string, secondPropertyName: string): string {
        return toSnakeCase(`${firstTableName}_${firstPropertyName.replace(/\./gi, '_')}_${secondTableName}_${secondPropertyName.replace(/\./gi, '_')}`)
    }

    override joinTableColumnName(tableName: string, propertyName: string, columnName?: string): string {
        return toSnakeCase(`${tableName}_${columnName ? columnName : propertyName}`)
    }
}
