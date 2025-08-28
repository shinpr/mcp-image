/**
 * Tests for Logger utility
 * Covers structured logging, log levels, and sensitive data filtering
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Logger } from '../logger'

// Mock console methods - Logger uses console.error for all MCP-compliant output
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
      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('"level":"info"'))
      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('"context":"test-context"')
      )
      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('"message":"Test info message"')
      )
      expect(mockConsoleError).toHaveBeenCalledWith(
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
      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('"level":"info"'))
      expect(mockConsoleError).toHaveBeenCalledWith(expect.not.stringContaining('"metadata"'))
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
      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('"level":"warn"'))
      expect(mockConsoleError).toHaveBeenCalledWith(
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
        expect.stringContaining('"errorMessage":"Network timeout"')
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
      expect(mockConsoleError).toHaveBeenCalledWith(expect.not.stringContaining('"errorMessage"'))
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
        expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('"[REDACTED]"'))
        expect(mockConsoleError).toHaveBeenCalledWith(
          expect.not.stringContaining('sensitive-value')
        )
        expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('normal-value'))
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
      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('"[REDACTED]"'))
      expect(mockConsoleError).toHaveBeenCalledWith(expect.not.stringContaining('secret-key'))
      expect(mockConsoleError).toHaveBeenCalledWith(expect.not.stringContaining('user-password'))
      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('[URL_REDACTED]'))
    })

    it('should redact GEMINI_API_KEY in environment variable format', () => {
      // Arrange
      const message = 'Starting service with GEMINI_API_KEY=AIzaSyABCDEF123456789'

      // Act
      logger.info('config', message)

      // Assert
      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('[REDACTED]'))
      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.not.stringContaining('AIzaSyABCDEF123456789')
      )
    })

    it('should redact URLs in log messages', () => {
      // Arrange
      const message = 'Fetching data from https://api.example.com/v1/data?key=secret'

      // Act
      logger.info('network', message)

      // Assert
      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('[URL_REDACTED]'))
      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.not.stringContaining('https://api.example.com')
      )
    })

    it('should filter credit card numbers in log messages', () => {
      // Arrange
      const message = 'Payment processed for card 4532-1234-5678-9012'

      // Act
      logger.info('payment', message)

      // Assert
      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('[FILTERED]'))
      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.not.stringContaining('4532-1234-5678-9012')
      )
    })

    it('should filter email addresses in log messages', () => {
      // Arrange
      const message = 'Sending notification to user@example.com'

      // Act
      logger.info('notification', message)

      // Assert
      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('[FILTERED]'))
      expect(mockConsoleError).toHaveBeenCalledWith(expect.not.stringContaining('user@example.com'))
    })

    it('should filter phone numbers in log messages', () => {
      // Arrange
      const message = 'SMS sent to +1-555-123-4567'

      // Act
      logger.info('sms', message)

      // Assert
      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('[FILTERED]'))
      expect(mockConsoleError).toHaveBeenCalledWith(expect.not.stringContaining('+1-555-123-4567'))
    })

    it('should filter SSN in log messages', () => {
      // Arrange
      const message = 'Processing SSN 123-45-6789'

      // Act
      logger.info('processing', message)

      // Assert
      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('[FILTERED]'))
      expect(mockConsoleError).toHaveBeenCalledWith(expect.not.stringContaining('123-45-6789'))
    })
  })

  describe('debug logging', () => {
    const originalNodeEnv = process.env.NODE_ENV

    afterEach(() => {
      process.env.NODE_ENV = originalNodeEnv
    })

    it('should log debug message in development mode', () => {
      // Arrange
      process.env.NODE_ENV = 'development'
      const context = 'debug-test'
      const message = 'Debug message'
      const metadata = { debug: true }

      // Act
      logger.debug(context, message, metadata)

      // Assert
      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('"level":"debug"'))
      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('"context":"debug-test"')
      )
    })

    it('should not log debug message in production mode', () => {
      // Arrange
      process.env.NODE_ENV = 'production'
      const context = 'debug-test'
      const message = 'Debug message'

      // Act
      logger.debug(context, message)

      // Assert
      expect(mockConsoleError).not.toHaveBeenCalled()
    })
  })

  describe('trace and session IDs', () => {
    it('should include traceId and sessionId in log entries', () => {
      // Arrange
      const context = 'trace-test'
      const message = 'Test message with trace'

      // Act
      logger.info(context, message)

      // Assert
      const logOutput = mockConsoleError.mock.calls[0][0]
      const parsedLog = JSON.parse(logOutput)

      expect(parsedLog).toHaveProperty('traceId')
      expect(parsedLog).toHaveProperty('sessionId')
      expect(typeof parsedLog.traceId).toBe('string')
      expect(typeof parsedLog.sessionId).toBe('string')
    })
  })

  describe('error logging with stack traces', () => {
    const originalNodeEnv = process.env.NODE_ENV

    afterEach(() => {
      process.env.NODE_ENV = originalNodeEnv
    })

    it('should include error stack in development mode', () => {
      // Arrange
      process.env.NODE_ENV = 'development'
      const error = new Error('Test error')
      error.stack = 'Error: Test error\n    at Object.<anonymous> (test.js:1:1)'

      // Act
      logger.error('test', 'Error occurred', error)

      // Assert
      const logOutput = mockConsoleError.mock.calls[0][0]
      const parsedLog = JSON.parse(logOutput)

      expect(parsedLog.metadata).toHaveProperty('errorStack')
      expect(parsedLog.metadata.errorStack).toContain('Error: Test error')
    })

    it('should not include error stack in production mode', () => {
      // Arrange
      process.env.NODE_ENV = 'production'
      const error = new Error('Test error')
      error.stack = 'Error: Test error\n    at Object.<anonymous> (test.js:1:1)'

      // Act
      logger.error('test', 'Error occurred', error)

      // Assert
      const logOutput = mockConsoleError.mock.calls[0][0]
      const parsedLog = JSON.parse(logOutput)

      expect(parsedLog.metadata?.errorStack).toBeUndefined()
    })
  })

  describe('timestamp format', () => {
    it('should include ISO timestamp in log entries', () => {
      // Arrange
      const beforeTime = new Date().toISOString()

      // Act
      logger.info('test', 'timestamp test')

      // Assert
      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('"timestamp":"'))

      // Extract the timestamp from the log call
      const logCall = mockConsoleError.mock.calls[0][0]
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
      const logOutput = mockConsoleError.mock.calls[0][0]
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
