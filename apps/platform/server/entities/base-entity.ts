import {
    BeforeInsert,
    CreateDateColumn,
    PrimaryColumn,
    UpdateDateColumn,
} from 'typeorm'
import { snowflake } from '#server/utils/snowflake'
import { getDateType } from '#server/database/type'

/**
 * 基础实体：所有实体共享的主键与时间戳。
 * 主键采用雪花 ID（十六进制字符串，最长 18 字符），@BeforeInsert 自动生成，
 * 与 better-auth generateId 配置保持同源，保证跨表引用一致。
 * 时间列类型必须走 getDateType()（PostgreSQL 需带时区）。
 */
export abstract class BaseEntity {
    @PrimaryColumn('varchar', { length: 36 })
    id!: string

    @CreateDateColumn({ type: getDateType() })
    createdAt!: Date

    @UpdateDateColumn({ type: getDateType() })
    updatedAt!: Date

    @BeforeInsert()
    private setId() {
        if (!this.id) {
            this.id = snowflake.generateId()
        }
    }
}
