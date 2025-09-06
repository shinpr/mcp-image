/**
 * Configuration management for MCP server
 * Handles environment variables and configuration validation
 */

import type { Result } from '../types/result'
import { Err, Ok } from '../types/result'
import { ConfigError } from './errors'

/**
 * Configuration interface
 */
export interface Config {
  geminiApiKey: string
  imageOutputDir: string
  apiTimeout: number
  skipPromptEnhancement: boolean // Skip prompt enhancement for direct control
}

/**
 * Default configuration values
 */
const DEFAULT_CONFIG = {
  imageOutputDir: './output',
  apiTimeout: 30000, // 30 seconds
} as const

/**
 * Validates the configuration
 * @param config The configuration to validate
 * @returns Result containing validated config or ConfigError
 */
export function validateConfig(config: Config): Result<Config, ConfigError> {
  // Validate GEMINI_API_KEY
  if (!config.geminiApiKey || config.geminiApiKey.trim().length === 0) {
    return Err(
      new ConfigError(
        'GEMINI_API_KEY is required but not provided',
        'Set GEMINI_API_KEY environment variable with your Google AI API key'
      )
    )
  }

  if (config.geminiApiKey.length < 10) {
    return Err(
      new ConfigError(
        'GEMINI_API_KEY appears to be invalid - must be at least 10 characters',
        'Set the GEMINI_API_KEY environment variable to your valid Google AI API key'
      )
    )
  }

  // Validate apiTimeout
  if (config.apiTimeout <= 0) {
    return Err(
      new ConfigError(
        'API timeout must be a positive number',
        'Set a positive timeout value in milliseconds (e.g., 30000 for 30 seconds)'
      )
    )
  }

  // Validate imageOutputDir (basic check - non-empty string)
  if (!config.imageOutputDir || config.imageOutputDir.trim().length === 0) {
    return Err(
      new ConfigError(
        'IMAGE_OUTPUT_DIR cannot be empty',
        'Set IMAGE_OUTPUT_DIR to a valid directory path'
      )
    )
  }

  return Ok(config)
}

/**
 * Loads configuration from environment variables
 * @returns Result containing config or ConfigError
 */
export function getConfig(): Result<Config, ConfigError> {
  const config: Config = {
    geminiApiKey: process.env['GEMINI_API_KEY'] || '',
    imageOutputDir: process.env['IMAGE_OUTPUT_DIR'] || DEFAULT_CONFIG.imageOutputDir,
    apiTimeout: DEFAULT_CONFIG.apiTimeout,
    skipPromptEnhancement: process.env['SKIP_PROMPT_ENHANCEMENT'] === 'true',
  }

  return validateConfig(config)
}
