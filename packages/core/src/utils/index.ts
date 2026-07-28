export function compactRecord<T>(value: Record<string, T | undefined>): Record<string, T> {
    return Object.fromEntries(
        Object.entries(value).filter((entry): entry is [string, T] => entry[1] !== undefined),
    )
}

export function ensureArray<T>(value: T | T[]): T[] {
    return Array.isArray(value) ? value : [value]
}
