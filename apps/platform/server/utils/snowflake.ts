/**
 * Snowflake ID 生成器（参考 momei 实现）。
 * ID 由时间戳(48位) + 机器ID(10位) + 序列号(12位) 组成，共 70 位，
 * 以十六进制字符串输出（最长 18 字符，适配 varchar(36) 主键）。
 */
export class Snowflake {
    private machineId: number
    private sequence = 0
    private lastTimestamp = -1

    constructor(machineId: number) {
        this.machineId = machineId
    }

    private currentTimestamp(): number {
        return Date.now()
    }

    private nextTimestamp(lastTimestamp: number): number {
        let timestamp = this.currentTimestamp()
        while (timestamp <= lastTimestamp) {
            timestamp = this.currentTimestamp()
        }
        return timestamp
    }

    /** 生成唯一 Snowflake ID（十六进制字符串）。 */
    generateId(): string {
        const timestamp = this.currentTimestamp()
        if (timestamp === this.lastTimestamp) {
            this.sequence = (this.sequence + 1) & 0xfff // 12 位序列号
            if (this.sequence === 0) {
                // 序列号用尽，等待下一毫秒
                this.lastTimestamp = this.nextTimestamp(this.lastTimestamp)
            }
        } else {
            // 随机初始化 sequence 增加随机性
            this.sequence = Math.floor(Math.random() * 0xfff)
        }
        this.lastTimestamp = timestamp
        const id = (BigInt(timestamp) & BigInt('0xFFFFFFFFFFFF')) << BigInt(22)
            | (BigInt(this.machineId) & BigInt(0x3FF)) << BigInt(12)
            | BigInt(this.sequence) & BigInt(0xFFF)
        return id.toString(16)
    }
}

/** 机器 ID：默认进程 ID 对 1024 取余，可通过环境变量 MACHINE_ID 覆盖。 */
const machineId = Number(process.env.MACHINE_ID ?? process.pid % 1024)

export const snowflake = new Snowflake(machineId)
