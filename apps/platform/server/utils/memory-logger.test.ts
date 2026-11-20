import { describe, expect, it } from 'vitest'
import { MemoryLogger } from './memory-logger'

describe('MemoryLogger dropped entries', () => {
    it('counts entries dropped by maxEntries trimming', () => {
        const logger = new MemoryLogger({ name: 'test', console: false, maxEntries: 3 })
        for (let index = 0; index < 5; index += 1) {
            logger.info(`entry ${index}`)
        }
        expect(logger.count).toBe(3)
        expect(logger.dropped).toBe(2)
        expect(logger.getEntries().map((entry) => entry.message)).toEqual(['entry 2', 'entry 3', 'entry 4'])
    })

    it('reports 0 when nothing was dropped', () => {
        const logger = new MemoryLogger({ name: 'test', console: false, maxEntries: 10 })
        logger.warn('only one')
        expect(logger.dropped).toBe(0)
    })

    it('keeps minLevel filtering out of the dropped count', () => {
        const logger = new MemoryLogger({ name: 'test', console: false, maxEntries: 1, minLevel: 'warn' })
        logger.debug('ignored')
        logger.info('ignored')
        logger.warn('kept')
        expect(logger.count).toBe(1)
        expect(logger.dropped).toBe(0)
    })

    it('sanitizes message and context before storing', () => {
        const logger = new MemoryLogger({ name: 'test', console: false })
        logger.info('token ghp_shortinvalid', { token: 'secret-value', safe: 'ok' })
        const [entry] = logger.getEntries()
        expect(entry!.message).toContain('ghp_***')
        expect(entry!.context).toEqual({ token: '***', safe: 'ok' })
    })
})
