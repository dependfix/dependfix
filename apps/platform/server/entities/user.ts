import {
    Column,
    Entity,
    Index,
} from 'typeorm'
import { BaseEntity } from './base-entity'

/** better-auth 用户表（字段对齐 better-auth 默认 schema） */
@Entity('user')
export class User extends BaseEntity {
    @Index({ unique: true })
    @Column({ type: 'varchar', length: 255 })
    email!: string

    @Column({ type: 'boolean', default: false })
    emailVerified!: boolean

    @Column({ type: 'text', nullable: true })
    name!: string | null

    @Column({ type: 'text', nullable: true })
    image!: string | null

    @Column({ type: 'text', nullable: true })
    role!: string | null

    @Column({ type: 'boolean', nullable: true })
    banned!: boolean | null

    @Column({ type: 'text', nullable: true })
    banReason!: string | null

    @Column({ type: 'integer', nullable: true })
    banExpires!: number | null
}
