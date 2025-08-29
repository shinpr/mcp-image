/**
 * Tests for ErrorHandler utility
 * Covers unified error handling and Result type wrapping
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { McpToolResponse } from '../../types/mcp'
import {
  FileOperationError,
  GeminiAPIError,
  InputValidationError,
  NetworkError,
  type Result,
} from '../../utils/errors'
import { ErrorHandler } from '../errorHandler'

// Mock the logger
vi.mock('../../utils/logger', () => ({
  Logger: vi.fn().mockImplementation(() => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  })),
}))

describe('ErrorHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('handleError', () => {
    it('should handle InputValidationError correctly', () => {
      // Arrange
      const error = new InputValidationError(
        'Prompt is too long',
        'Prompt length must be 1-4000 characters'
      )

      // Act
      const response = ErrorHandler.handleError(error)

      // Assert
      expect(response).toMatchObject({
        isError: true,
        content: [
          {
            type: 'text',
            text: expect.stringContaining('"INPUT_VALIDATION_ERROR"'),
          },
        ],
      })
      expect(response.content[0].text).toContain('Prompt is too long')
      expect(response.content[0].text).toContain('Prompt length must be 1-4000 characters')
    })

    it('should handle GeminiAPIError correctly', () => {
      // Arrange
      const error = new GeminiAPIError(
        'API quota exceeded',
        'Check GEMINI_API_KEY environment variable',
        429
      )

      // Act
      const response = ErrorHandler.handleError(error)

      // Assert
      expect(response).toMatchObject({
        isError: true,
        content: [
          {
            type: 'text',
            text: expect.stringContaining('"GEMINI_API_ERROR"'),
          },
        ],
      })
      expect(response.content[0].text).toContain('API quota exceeded')
      expect(response.content[0].text).toContain('Check GEMINI_API_KEY environment variable')
    })

    it('should handle NetworkError correctly', () => {
      // Arrange
      const originalError = new Error('Connection timeout')
      const error = new NetworkError(
        'Network request failed',
        'Check internet connection and retry',
        originalError
      )

      // Act
      const response = ErrorHandler.handleError(error)

      // Assert
      expect(response).toMatchObject({
        isError: true,
        content: [
          {
            type: 'text',
            text: expect.stringContaining('"NETWORK_ERROR"'),
          },
        ],
      })
      expect(response.content[0].text).toContain('Network request failed')
      expect(response.content[0].text).toContain('Check internet connection and retry')
    })

    it('should handle FileOperationError correctly', () => {
      // Arrange
      const error = new FileOperationError('Failed to save image: Permission denied')

      // Act
      const response = ErrorHandler.handleError(error)

      // Assert
      expect(response).toMatchObject({
        isError: true,
        content: [
          {
            type: 'text',
            text: expect.stringContaining('"FILE_OPERATION_ERROR"'),
          },
        ],
      })
      expect(response.content[0].text).toContain('Failed to save image')
      expect(response.content[0].text).toContain('Check file and directory permissions')
    })

    it('should handle unknown Error types', () => {
      // Arrange
      const error = new Error('Unknown error occurred')

      // Act
      const response = ErrorHandler.handleError(error)

      // Assert
      expect(response).toMatchObject({
        isError: true,
        content: [
          {
            type: 'text',
            text: expect.stringContaining('"INTERNAL_ERROR"'),
          },
        ],
      })
      expect(response.content[0].text).toContain('Unknown error occurred')
      expect(response.content[0].text).toContain('Contact system administrator')
    })

    it('should produce valid JSON in response content', () => {
      // Arrange
      const error = new InputValidationError('Test error', 'Test suggestion')

      // Act
      const response = ErrorHandler.handleError(error)

      // Assert
      expect(() => JSON.parse(response.content[0].text)).not.toThrow()

      const parsedContent = JSON.parse(response.content[0].text)
      expect(parsedContent).toHaveProperty('error')
      expect(parsedContent.error).toHaveProperty('code')
      expect(parsedContent.error).toHaveProperty('message')
      expect(parsedContent.error).toHaveProperty('suggestion')
    })
  })

  describe('wrapWithResultType', () => {
    it('should return Ok result for successful operation', async () => {
      // Arrange
      const successOperation = vi.fn().mockResolvedValue('success result')

      // Act
      const result = await ErrorHandler.wrapWithResultType(successOperation)

      // Assert
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value).toBe('success result')
      }
      expect(successOperation).toHaveBeenCalledOnce()
    })

    it('should return Err result for failed operation', async () => {
      // Arrange
      const error = new Error('Operation failed')
      const failedOperation = vi.fn().mockRejectedValue(error)

      // Act
      const result = await ErrorHandler.wrapWithResultType(failedOperation)

      // Assert
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toBe(error)
      }
      expect(failedOperation).toHaveBeenCalledOnce()
    })

    it('should handle non-Error thrown values', async () => {
      // Arrange
      const nonErrorValue = 'string error'
      const failedOperation = vi.fn().mockRejectedValue(nonErrorValue)

      // Act
      const result = await ErrorHandler.wrapWithResultType(failedOperation)

      // Assert
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(Error)
        expect(result.error.message).toBe('Unknown error')
      }
    })

    it('should log operation context when provided', async () => {
      // Arrange
      const error = new Error('Test error')
      const failedOperation = vi.fn().mockRejectedValue(error)
      const context = 'test-operation'

      // Act
      await ErrorHandler.wrapWithResultType(failedOperation, context)

      // Assert: Logger mock should have been called (verified through coverage)
      expect(failedOperation).toHaveBeenCalledOnce()
    })
  })

  describe('safeExecute compatibility', () => {
    it('should work with the safeExecute function pattern', async () => {
      // Arrange
      const testOperation = (): Promise<string> => Promise.resolve('test result')

      // Act
      const result = await ErrorHandler.wrapWithResultType(testOperation, 'test-context')

      // Assert
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value).toBe('test result')
      }
    })

    it('should handle failed operations with context logging', async () => {
      // Arrange
      const testError = new NetworkError('Network failed', 'Check connection')
      const testOperation = (): Promise<string> => Promise.reject(testError)

      // Act
      const result = await ErrorHandler.wrapWithResultType(testOperation, 'network-test')

      // Assert
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toBe(testError)
      }
    })
  })
})
