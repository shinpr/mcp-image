const NETWORK_ERROR_CODES = ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND'] as const

function extractErrorCode(error: Error): string | undefined {
  if ('code' in error && typeof error.code === 'string') {
    return error.code
  }
  return undefined
}

export function isNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false
  }
  const errorCode = extractErrorCode(error)
  return NETWORK_ERROR_CODES.some((code) => error.message.includes(code) || errorCode === code)
}

export function extractStatusCode(error: unknown): number | undefined {
  if (error && typeof error === 'object' && 'status' in error) {
    const { status } = error
    return typeof status === 'number' ? status : undefined
  }
  return undefined
}
