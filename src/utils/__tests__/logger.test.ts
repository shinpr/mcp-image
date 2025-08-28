/**
 * Tests for Logger utility
 * Covers structured logging, log levels, and sensitive data filtering
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Logger } from '../logger'

// Mock console methods
const mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {})
const mockConsoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
const mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

describe('Logger', () => {
  let logger: Logger

  beforeEach(() => {
    vi.clearAllMocks()
    logger = new Logger()
  })

  describe('info logging', () => {
    it('should log info message with structured format', () => {
      // Arrange
      const context = 'test-context'
      const message = 'Test info message'
      const metadata = { key: 'value', count: 42 }

      // Act
      logger.info(context, message, metadata)

      // Assert
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('"level":"info"'))
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('"context":"test-context"')
      )
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('"message":"Test info message"')
      )
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('"metadata":{"key":"value","count":42}')
      )
    })

    it('should log info message without metadata', () => {
      // Arrange
      const context = 'test-context'
      const message = 'Test info message'

      // Act
      logger.info(context, message)

      // Assert
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('"level":"info"'))
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.not.stringContaining('"metadata"'))
    })
  })

  describe('warn logging', () => {
    it('should log warn message with structured format', () => {
      // Arrange
      const context = 'validation'
      const message = 'Invalid input detected'
      const metadata = { field: 'prompt', value: 'test' }

      // Act
      logger.warn(context, message, metadata)

      // Assert
      expect(mockConsoleWarn).toHaveBeenCalledWith(expect.stringContaining('"level":"warn"'))
      expect(mockConsoleWarn).toHaveBeenCalledWith(
        expect.stringContaining('"context":"validation"')
      )
    })
  })

  describe('error logging', () => {
    it('should log error message with error details', () => {
      // Arrange
      const context = 'api-call'
      const message = 'API call failed'
      const error = new Error('Network timeout')
      const metadata = { endpoint: '/generate', retries: 3 }

      // Act
      logger.error(context, message, error, metadata)

      // Assert
      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('"level":"error"'))
      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('"context":"api-call"'))
      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('"message":"API call failed"')
      )
      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('"error":"Network timeout"')
      )
    })

    it('should log error message without error object', () => {
      // Arrange
      const context = 'processing'
      const message = 'Processing failed'

      // Act
      logger.error(context, message)

      // Assert
      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('"level":"error"'))
      expect(mockConsoleError).toHaveBeenCalledWith(expect.not.stringContaining('"error":"'))
    })
  })

  describe('sensitive data filtering', () => {
    const sensitiveFields = [
      'API_KEY',
      'apiKey',
      'api_key',
      'SECRET',
      'secret',
      'PASSWORD',
      'password',
      'TOKEN',
      'token',
      'CREDENTIAL',
      'credential',
    ]

    for (const field of sensitiveFields) {
      it(`should redact sensitive field: ${field}`, () => {
        // Arrange
        const metadata = {
          [field]: 'sensitive-value',
          normalField: 'normal-value',
        }

        // Act
        logger.info('test', 'message', metadata)

        // Assert
        expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('"[REDACTED]"'))
        expect(mockConsoleLog).toHaveBeenCalledWith(expect.not.stringContaining('sensitive-value'))
        expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('normal-value'))
      })
    }

    it('should handle nested sensitive data', () => {
      // Arrange
      const metadata = {
        config: {
          apiKey: 'secret-key',
          endpoint: 'https://api.example.com',
        },
        user: {
          id: 123,
          password: 'user-password',
        },
      }

      // Act
      logger.info('test', 'nested data', metadata)

      // Assert
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('"[REDACTED]"'))
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.not.stringContaining('secret-key'))
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.not.stringContaining('user-password'))
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('https://api.example.com')
      )
    })
  })

  describe('timestamp format', () => {
    it('should include ISO timestamp in log entries', () => {
      // Arrange
      const beforeTime = new Date().toISOString()

      // Act
      logger.info('test', 'timestamp test')

      // Assert
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('"timestamp":"'))

      // Extract the timestamp from the log call
      const logCall = mockConsoleLog.mock.calls[0][0]
      const timestampMatch = logCall.match(/"timestamp":"([^"]+)"/)
      expect(timestampMatch).not.toBeNull()

      if (timestampMatch) {
        const timestamp = timestampMatch[1]
        expect(() => new Date(timestamp)).not.toThrow()
        expect(new Date(timestamp).getTime()).toBeGreaterThanOrEqual(new Date(beforeTime).getTime())
      }
    })
  })

  describe('log entry structure', () => {
    it('should produce valid JSON log entries', () => {
      // Arrange
      const context = 'json-test'
      const message = 'Valid JSON test'
      const metadata = { test: true, count: 1 }

      // Act
      logger.info(context, message, metadata)

      // Assert
      const logOutput = mockConsoleLog.mock.calls[0][0]
      expect(() => JSON.parse(logOutput)).not.toThrow()

      const parsedLog = JSON.parse(logOutput)
      expect(parsedLog).toMatchObject({
        timestamp: expect.any(String),
        level: 'info',
        context: 'json-test',
        message: 'Valid JSON test',
        metadata: { test: true, count: 1 },
      })
    })
  })
})
