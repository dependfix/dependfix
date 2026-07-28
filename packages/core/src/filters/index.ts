import type { AlertReference } from '../alerts'

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
