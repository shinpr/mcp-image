import { describe, expect, it } from 'vitest'
import type { Result } from '../result'
import { Err, Ok } from '../result'

describe('Result type', () => {
  describe('Result type narrowing', () => {
    it('should allow safe data access after success check', () => {
      // This test verifies that TypeScript's type narrowing works correctly
      const result: Result<{ value: number }, Error> = Ok({ value: 42 })

      // Without the if check, accessing result.data would be a type error
      if (result.success) {
        // After narrowing, we can safely access data and perform operations
        const doubled = result.data.value * 2
        expect(doubled).toBe(84)
      }
    })

    it('should allow safe error access after failure check', () => {
      // This test verifies that TypeScript's type narrowing works correctly for errors
      const result: Result<string, Error> = Err(new Error('something went wrong'))

      // Without the if check, accessing result.error would be a type error
      if (!result.success) {
        // After narrowing, we can safely access error properties
        expect(result.error.message).toContain('wrong')
      }
    })
  })

  describe('Result with custom error types', () => {
    it('should preserve custom error type information', () => {
      class ValidationError extends Error {
        constructor(
          message: string,
          public readonly field: string
        ) {
          super(message)
          this.name = 'ValidationError'
        }
      }

      const result: Result<string, ValidationError> = Err(
        new ValidationError('Invalid value', 'email')
      )

      if (!result.success) {
        // Custom error properties should be accessible
        expect(result.error.field).toBe('email')
        expect(result.error.name).toBe('ValidationError')
      }
    })
  })

  describe('Result type guards', () => {
    it('should properly discriminate between success and error states', () => {
      // Arrange
      const successResult: Result<string, Error> = Ok('success')
      const errorResult: Result<string, Error> = Err(new Error('failed'))

      // Act & Assert
      if (successResult.success) {
        // TypeScript should know this is the success case
        expect(successResult.data).toBe('success')
        // @ts-expect-error - error should not exist on success case
        expect(successResult.error).toBeUndefined()
      }

      if (!errorResult.success) {
        // TypeScript should know this is the error case
        expect(errorResult.error).toBeInstanceOf(Error)
        // @ts-expect-error - data should not exist on error case
        expect(errorResult.data).toBeUndefined()
      }
    })
  })

  describe('async Result operations', () => {
    it('should work with Promise<Result<T, E>>', async () => {
      // Arrange
      const asyncOk = async (): Promise<Result<number, Error>> => {
        return Ok(42)
      }

      const asyncErr = async (): Promise<Result<number, Error>> => {
        return Err(new Error('async error'))
      }

      // Act
      const okResult = await asyncOk()
      const errResult = await asyncErr()

      // Assert
      expect(okResult.success).toBe(true)
      if (okResult.success) {
        expect(okResult.data).toBe(42)
      }

      expect(errResult.success).toBe(false)
      if (!errResult.success) {
        expect(errResult.error.message).toBe('async error')
      }
    })
  })
})
