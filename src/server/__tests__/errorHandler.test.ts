import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GeminiAPIError } from '../../utils/errors'
import { ErrorHandler } from '../errorHandler'

vi.mock('../../utils/logger', () => ({
  Logger: class {
    error = vi.fn()
    warn = vi.fn()
    info = vi.fn()
  },
  sanitizeText: (input: string) => input,
}))

describe('ErrorHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('handleError', () => {
    it('preserves the code, message, and suggestion of a structured error', () => {
      const error = new GeminiAPIError(
        'API quota exceeded',
        'Check GEMINI_API_KEY environment variable',
        429
      )

      const response = ErrorHandler.handleError(error)
      const body = JSON.parse(response.content[0].text)

      expect(response.isError).toBe(true)
      expect(body.error).toMatchObject({
        code: 'GEMINI_API_ERROR',
        message: 'API quota exceeded',
        suggestion: 'Check GEMINI_API_KEY environment variable',
      })
    })

    it('should handle unknown Error types', () => {
      const error = new Error('Unknown error occurred')

      const response = ErrorHandler.handleError(error)

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
  })

  describe('wrapWithResultType', () => {
    it('should handle non-Error thrown values', async () => {
      const nonErrorValue = 'string error'
      const failedOperation = vi.fn().mockRejectedValue(nonErrorValue)

      const result = await ErrorHandler.wrapWithResultType(failedOperation)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBeInstanceOf(Error)
        expect(result.error.message).toBe('Unknown error')
      }
    })
  })
})
