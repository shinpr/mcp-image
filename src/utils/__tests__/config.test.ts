import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Result } from '../../types/result'
import { getConfig, validateConfig } from '../config'
import { ConfigError } from '../errors'

describe('config', () => {
  const originalEnv = process.env

  beforeEach(() => {
    // Mock process.env for each test
    process.env = { ...originalEnv }
    process.env.GEMINI_API_KEY = undefined
    process.env.IMAGE_OUTPUT_DIR = undefined
  })

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv
  })

  describe('validateConfig', () => {
    it('should return error when GEMINI_API_KEY is missing', () => {
      // Arrange
      const config = {
        geminiApiKey: '',
        imageOutputDir: './output',
        apiTimeout: 30000,
      }

      // Act
      const result = validateConfig(config)

      // Assert
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBeInstanceOf(ConfigError)
        expect(result.error.message).toContain('GEMINI_API_KEY')
        expect(result.error.suggestion).toContain('Set GEMINI_API_KEY')
      }
    })

    it('should return error when GEMINI_API_KEY is too short', () => {
      // Arrange
      const config = {
        geminiApiKey: 'short',
        imageOutputDir: './output',
        apiTimeout: 30000,
      }

      // Act
      const result = validateConfig(config)

      // Assert
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBeInstanceOf(ConfigError)
        expect(result.error.message).toContain('at least 10 characters')
      }
    })

    it('should return error when apiTimeout is invalid', () => {
      // Arrange
      const config = {
        geminiApiKey: 'valid-api-key-12345',
        imageOutputDir: './output',
        apiTimeout: -1000, // Invalid negative timeout
      }

      // Act
      const result = validateConfig(config)

      // Assert
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBeInstanceOf(ConfigError)
        expect(result.error.message).toContain('timeout')
        expect(result.error.message).toContain('positive')
      }
    })

    it('should return success for valid config', () => {
      // Arrange
      const config = {
        geminiApiKey: 'valid-api-key-12345',
        imageOutputDir: './output',
        apiTimeout: 30000,
      }

      // Act
      const result = validateConfig(config)

      // Assert
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toEqual(config)
      }
    })
  })

  describe('getConfig', () => {
    it('should return config with default values when environment variables are not set', () => {
      // Arrange - environment variables are undefined by default

      // Act
      const result = getConfig()

      // Assert
      expect(result.success).toBe(false) // Should fail because API key is required
      if (!result.success) {
        expect(result.error).toBeInstanceOf(ConfigError)
        expect(result.error.message).toContain('GEMINI_API_KEY')
      }
    })

    it('should return config with custom IMAGE_OUTPUT_DIR', () => {
      // Arrange
      process.env.GEMINI_API_KEY = 'test-api-key-12345'
      process.env.IMAGE_OUTPUT_DIR = '/custom/output'

      // Act
      const result = getConfig()

      // Assert
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.geminiApiKey).toBe('test-api-key-12345')
        expect(result.data.imageOutputDir).toBe('/custom/output')
        expect(result.data.apiTimeout).toBe(30000) // Default timeout
      }
    })

    it('should return config with default IMAGE_OUTPUT_DIR when not set', () => {
      // Arrange
      process.env.GEMINI_API_KEY = 'test-api-key-12345'
      // IMAGE_OUTPUT_DIR is undefined

      // Act
      const result = getConfig()

      // Assert
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.geminiApiKey).toBe('test-api-key-12345')
        expect(result.data.imageOutputDir).toBe('./output') // Default value
        expect(result.data.apiTimeout).toBe(30000)
      }
    })

    it('should validate the loaded config', () => {
      // Arrange
      process.env.GEMINI_API_KEY = 'short' // Invalid short API key

      // Act
      const result = getConfig()

      // Assert
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBeInstanceOf(ConfigError)
        expect(result.error.message).toContain('at least 10 characters')
      }
    })
  })
})
