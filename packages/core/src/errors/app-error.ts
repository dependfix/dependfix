export interface AppErrorOptions {
    cause?: unknown
    details?: Record<string, unknown>
}

export class AppError extends Error {
    readonly code: string
    readonly details?: Record<string, unknown>

    constructor(code: string, message: string, options: AppErrorOptions = {}) {
        super(message, { cause: options.cause })
        this.name = 'AppError'
        this.code = code
        this.details = options.details
    }
}

export function toAppError(error: unknown, fallbackCode = 'UNKNOWN_ERROR'): AppError {
    if (error instanceof AppError) {
        return error
    }

    if (error instanceof Error) {
        return new AppError(fallbackCode, error.message, { cause: error })
    }

    return new AppError(fallbackCode, 'Unexpected non-error value thrown', {
        details: { error },
    })
}
