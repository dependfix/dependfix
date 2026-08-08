import {
    Column,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
} from 'typeorm'
import { BaseEntity } from './base-entity'
import { ScanRun } from './scan-run'

/**
 * 扫描结果明细：一次运行中的告警级结果。
 * 字段对齐 core NormalizedSecurityAlert 的关键切片（source/severity/packageName/fixable/fixStrategy/recommendedVersion）。
 */
@Entity('scan_result')
export class ScanResult extends BaseEntity {
    @Index()
    @Column({ type: 'varchar', length: 36 })
    scanRunId!: string

    @ManyToOne(() => ScanRun, { nullable: false, onDelete: 'CASCADE' })
    @JoinColumn({ name: 'scan_run_id' })
    scanRun!: ScanRun | null

    /** 告警来源（dependabot / code-scanning / pnpm-audit） */
    @Column({ type: 'varchar', length: 32 })
    source!: string

    @Column({ type: 'varchar', length: 32 })
    severity!: string

    @Column({ type: 'varchar', length: 255 })
    packageName!: string

    @Column({ type: 'varchar', length: 500, nullable: true })
    manifestPath!: string | null

    @Column({ type: 'varchar', length: 255, nullable: true })
    ruleId!: string | null

    @Column({ type: 'text', nullable: true })
    summary!: string | null

    @Column({ type: 'boolean', default: false })
    fixable!: boolean

    /** 修复策略（upgrade / lock / wait-upstream / manual / override） */
    @Column({ type: 'varchar', length: 32, nullable: true })
    fixStrategy!: string | null

    @Column({ type: 'varchar', length: 100, nullable: true })
    recommendedVersion!: string | null

    /** 告警 HTML 链接 */
    @Column({ type: 'varchar', length: 500, nullable: true })
    htmlUrl!: string | null

    /** 修复结果（success / failed / skipped / converged / not-tried） */
    @Column({ type: 'varchar', length: 32, default: 'not-tried' })
    fixStatus!: string

    @Column({ type: 'text', nullable: true })
    errorMessage!: string | null
}
