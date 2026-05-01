/**
 * Shared error classification helpers for API client implementations.
 * Used by both Gemini and OpenAI clients to identify network failures
 * and extract HTTP status codes from SDK errors.
 */

export interface ErrorWithCode extends Error {
  code?: string
  status?: number
}

const NETWORK_ERROR_CODES = ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND'] as const

export function isNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false
  }
  return NETWORK_ERROR_CODES.some(
    (code) => error.message.includes(code) || (error as ErrorWithCode).code === code
  )
}

export function extractStatusCode(error: unknown): number | undefined {
  if (error && typeof error === 'object' && 'status' in error) {
    const status = (error as ErrorWithCode).status
    return typeof status === 'number' ? status : undefined
  }
  return undefined
}
