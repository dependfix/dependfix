export * from './alert-filter'

import type { AlertReference } from '../alerts'

// ---------------------------------------------------------------------------
// Legacy / generic filter types (kept for backward compatibility)
// ---------------------------------------------------------------------------

export interface FilterDecision {
    accepted: boolean
    reason?: string
}

export type AlertFilter = (alert: AlertReference) => FilterDecision

export function createPassThroughFilter(): AlertFilter {
    return function passThroughFilter(): FilterDecision {
        return { accepted: true }
    }
}
