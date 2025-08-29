import { describe, expect, it } from 'vitest'
import type { Result } from '../result'
import { Err, Ok } from '../result'

describe('Result type', () => {
  describe('Ok function', () => {
    it('should create a successful result', () => {
      // Arrange
      const data = 'test data'

      // Act
      const result = Ok(data)

      // Assert
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe(data)
      }
    })

    it('should create a successful result with object data', () => {
      // Arrange
      const data = { id: 1, name: 'test' }

      // Act
      const result = Ok(data)

      // Assert
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toEqual(data)
      }
    })
  })

  describe('Err function', () => {
    it('should create an error result', () => {
      // Arrange
      const error = new Error('test error')

      // Act
      const result = Err(error)

      // Assert
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBe(error)
      }
    })

    it('should create an error result with custom error', () => {
      // Arrange
      class CustomError extends Error {
        constructor(message: string) {
          super(message)
          this.name = 'CustomError'
        }
      }
      const error = new CustomError('custom test error')

      // Act
      const result = Err(error)

      // Assert
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBeInstanceOf(CustomError)
        expect(result.error.message).toBe('custom test error')
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
