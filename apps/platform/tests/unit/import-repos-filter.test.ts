import { describe, expect, it } from 'vitest'
import { passesRepoFilter } from '../../app/utils/import-repos-filter'

const makeRepo = (overrides: Partial<Parameters<typeof passesRepoFilter>[0]> = {}) => ({
    fork: false,
    private: false,
    archived: false,
    disabled: false,
    fullName: 'owner/repo',
    description: null,
    ...overrides,
})

const defaultFilters = {
    fork: 'source' as const,
    visibility: 'all' as const,
    archived: 'exclude' as const,
    keyword: '',
}

describe('passesRepoFilter', () => {
    it('excludes archived repos when archivedFilter is exclude', () => {
        expect(passesRepoFilter(makeRepo({ archived: true }), defaultFilters)).toBe(false)
    })

    it('excludes disabled repos when archivedFilter is exclude', () => {
        expect(passesRepoFilter(makeRepo({ disabled: true }), defaultFilters)).toBe(false)
    })

    it('includes archived repos when archivedFilter is include', () => {
        const filters = { ...defaultFilters, archived: 'include' as const }
        expect(passesRepoFilter(makeRepo({ archived: true }), filters)).toBe(true)
        expect(passesRepoFilter(makeRepo({ disabled: true }), filters)).toBe(true)
    })

    it('excludes forks when forkFilter is source', () => {
        expect(passesRepoFilter(makeRepo({ fork: true }), defaultFilters)).toBe(false)
    })

    it('includes forks when forkFilter is all', () => {
        const filters = { ...defaultFilters, fork: 'all' as const }
        expect(passesRepoFilter(makeRepo({ fork: true }), filters)).toBe(true)
    })

    it('filters by visibility public', () => {
        const filters = { ...defaultFilters, visibility: 'public' as const }
        expect(passesRepoFilter(makeRepo({ private: true }), filters)).toBe(false)
        expect(passesRepoFilter(makeRepo({ private: false }), filters)).toBe(true)
    })

    it('filters by visibility private', () => {
        const filters = { ...defaultFilters, visibility: 'private' as const }
        expect(passesRepoFilter(makeRepo({ private: true }), filters)).toBe(true)
        expect(passesRepoFilter(makeRepo({ private: false }), filters)).toBe(false)
    })

    it('filters by keyword in fullName and description', () => {
        expect(passesRepoFilter(makeRepo({ fullName: 'owner/my-project' }), { ...defaultFilters, keyword: 'my-proj' })).toBe(true)
        expect(passesRepoFilter(makeRepo({ description: 'a test repo' }), { ...defaultFilters, keyword: 'test' })).toBe(true)
        expect(passesRepoFilter(makeRepo({ fullName: 'owner/other' }), { ...defaultFilters, keyword: 'nomatch' })).toBe(false)
    })

    it('passes active repo with default filters', () => {
        expect(passesRepoFilter(makeRepo(), defaultFilters)).toBe(true)
    })
})
