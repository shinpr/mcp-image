/**
 * Configuration management for MCP server
 * Handles environment variables and configuration validation
 */

import type { ImageProvider, ImageQuality } from '../types/mcp.js'
import { IMAGE_PROVIDER_VALUES, IMAGE_QUALITY_VALUES } from '../types/mcp.js'
import type { Result } from '../types/result.js'
import { Err, Ok } from '../types/result.js'
import { ConfigError } from './errors.js'

/**
 * Configuration interface
 */
export interface Config {
  imageProvider: ImageProvider
  geminiApiKey: string
  openaiApiKey: string
  openaiImageModel: string
  openaiTextModel: string
  imageOutputDir: string
  apiTimeout: number
  skipPromptEnhancement: boolean // Skip prompt enhancement for direct control
  imageQuality: ImageQuality
}

/**
 * Default configuration values
 */
const DEFAULT_CONFIG = {
  imageProvider: 'gemini',
  imageOutputDir: './output',
  apiTimeout: 30000, // 30 seconds
  openaiImageModel: 'gpt-image-2',
  openaiTextModel: 'gpt-5.2',
} as const

function readEnv(name: string): string | undefined {
  const value = process.env[name]
  if (!value || value === 'undefined' || value === 'null') {
    return undefined
  }
  return value
}

/**
 * Validates the configuration
 * @param config The configuration to validate
 * @returns Result containing validated config or ConfigError
 */
export function validateConfig(config: Config): Result<Config, ConfigError> {
  // Validate IMAGE_PROVIDER
  if (!IMAGE_PROVIDER_VALUES.includes(config.imageProvider)) {
    return Err(
      new ConfigError(
        `Invalid IMAGE_PROVIDER value: "${config.imageProvider}". Valid options: ${IMAGE_PROVIDER_VALUES.join(', ')}`,
        `Set IMAGE_PROVIDER to one of: ${IMAGE_PROVIDER_VALUES.join(', ')}`
      )
    )
  }

  // Validate GEMINI_API_KEY only when Gemini is the selected provider.
  if (
    config.imageProvider === 'gemini' &&
    (!config.geminiApiKey || config.geminiApiKey.trim().length === 0)
  ) {
    return Err(
      new ConfigError(
        'GEMINI_API_KEY is required but not provided',
        'Set GEMINI_API_KEY environment variable with your Google AI API key'
      )
    )
  }

  if (config.imageProvider === 'gemini' && config.geminiApiKey.length < 10) {
    return Err(
      new ConfigError(
        'GEMINI_API_KEY appears to be invalid - must be at least 10 characters',
        'Set the GEMINI_API_KEY environment variable to your valid Google AI API key'
      )
    )
  }

  // Validate OPENAI_API_KEY only when OpenAI is the selected provider.
  if (
    config.imageProvider === 'openai' &&
    (!config.openaiApiKey || config.openaiApiKey.trim().length === 0)
  ) {
    return Err(
      new ConfigError(
        'OPENAI_API_KEY is required but not provided',
        'Set OPENAI_API_KEY environment variable with your OpenAI API key'
      )
    )
  }

  if (config.imageProvider === 'openai' && config.openaiApiKey.length < 10) {
    return Err(
      new ConfigError(
        'OPENAI_API_KEY appears to be invalid - must be at least 10 characters',
        'Set the OPENAI_API_KEY environment variable to your valid OpenAI API key'
      )
    )
  }

  if (
    config.imageProvider === 'openai' &&
    (!config.openaiImageModel || config.openaiImageModel.trim().length === 0)
  ) {
    return Err(
      new ConfigError(
        'OPENAI_IMAGE_MODEL cannot be empty',
        'Set OPENAI_IMAGE_MODEL to a valid OpenAI image model such as gpt-image-2'
      )
    )
  }

  if (
    config.imageProvider === 'openai' &&
    !config.skipPromptEnhancement &&
    (!config.openaiTextModel || config.openaiTextModel.trim().length === 0)
  ) {
    return Err(
      new ConfigError(
        'OPENAI_TEXT_MODEL cannot be empty when prompt enhancement is enabled',
        'Set OPENAI_TEXT_MODEL to a valid OpenAI text model, or set SKIP_PROMPT_ENHANCEMENT=true'
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

  // Validate imageQuality
  if (!IMAGE_QUALITY_VALUES.includes(config.imageQuality)) {
    return Err(
      new ConfigError(
        `Invalid IMAGE_QUALITY value: "${config.imageQuality}". Valid options: ${IMAGE_QUALITY_VALUES.join(', ')}`,
        `Set IMAGE_QUALITY to one of: ${IMAGE_QUALITY_VALUES.join(', ')}`
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
    imageProvider: (readEnv('IMAGE_PROVIDER') || DEFAULT_CONFIG.imageProvider) as ImageProvider,
    geminiApiKey: readEnv('GEMINI_API_KEY') || '',
    openaiApiKey: readEnv('OPENAI_API_KEY') || '',
    openaiImageModel: readEnv('OPENAI_IMAGE_MODEL') || DEFAULT_CONFIG.openaiImageModel,
    openaiTextModel: readEnv('OPENAI_TEXT_MODEL') || DEFAULT_CONFIG.openaiTextModel,
    imageOutputDir: readEnv('IMAGE_OUTPUT_DIR') || DEFAULT_CONFIG.imageOutputDir,
    apiTimeout: DEFAULT_CONFIG.apiTimeout,
    skipPromptEnhancement: readEnv('SKIP_PROMPT_ENHANCEMENT') === 'true',
    imageQuality: (readEnv('IMAGE_QUALITY') || 'fast') as ImageQuality,
  }

  return validateConfig(config)
}
