export type Result<T, E extends Error> =
  | {
      success: true
      data: T
    }
  | {
      success: false
      error: E
    }

export function Ok<T>(data: T): Result<T, never> {
  return {
    success: true,
    data,
  }
}

export function Err<E extends Error>(error: E): Result<never, E> {
  return {
    success: false,
    error,
  }
}

/**
 * Return the value of a successful result, or throw its error. Lets a caller
 * that already runs inside an error boundary read a sequence of fallible steps
 * as ordinary statements.
 */
export function unwrapOrThrow<T, E extends Error>(result: Result<T, E>): T {
  if (!result.success) {
    throw result.error
  }
  return result.data
}
