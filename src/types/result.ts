/**
 * Result type for operations that may fail
 * Provides type-safe error handling with discriminated unions
 */

/**
 * Result type that represents either success with data or failure with error
 */
export type Result<T, E extends Error> =
  | {
      success: true
      data: T
    }
  | {
      success: false
      error: E
    }

/**
 * Helper function to create a successful Result
 * @param data The data to wrap in a successful Result
 * @returns A successful Result containing the data
 */
export function Ok<T>(data: T): Result<T, never> {
  return {
    success: true,
    data,
  }
}

/**
 * Helper function to create an error Result
 * @param error The error to wrap in a failed Result
 * @returns A failed Result containing the error
 */
export function Err<E extends Error>(error: E): Result<never, E> {
  return {
    success: false,
    error,
  }
}
