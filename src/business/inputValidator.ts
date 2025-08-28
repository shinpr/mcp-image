/**
 * Input validation module for MCP server
 * Validates user inputs according to Gemini API and business requirements
 */

import { existsSync, statSync } from 'node:fs'
import { extname } from 'node:path'
import type { GenerateImageParams } from '../types/mcp'
import type { Result } from '../types/result'
import { Err, Ok } from '../types/result'
import { FileOperationError, InputValidationError } from '../utils/errors'

// Constants for validation limits
const PROMPT_MIN_LENGTH = 1
const PROMPT_MAX_LENGTH = 4000
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB in bytes
const SUPPORTED_IMAGE_FORMATS = ['png', 'jpeg', 'jpg', 'webp']
const SUPPORTED_OUTPUT_FORMATS = ['PNG', 'JPEG', 'WebP'] as const

/**
 * Converts bytes to MB with proper formatting
 */
function formatFileSize(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1)
}

/**
 * Type guard for supported output formats
 */
function isSupportedOutputFormat(
  format: string
): format is (typeof SUPPORTED_OUTPUT_FORMATS)[number] {
  return SUPPORTED_OUTPUT_FORMATS.includes(format as (typeof SUPPORTED_OUTPUT_FORMATS)[number])
}

/**
 * Validates prompt text for length constraints
 */
export function validatePrompt(prompt: string): Result<string, InputValidationError> {
  if (prompt.length < PROMPT_MIN_LENGTH || prompt.length > PROMPT_MAX_LENGTH) {
    return Err(
      new InputValidationError(
        `Prompt must be between ${PROMPT_MIN_LENGTH} and ${PROMPT_MAX_LENGTH} characters. Current length: ${prompt.length}`,
        prompt.length === 0
          ? 'Please provide a descriptive prompt for image generation.'
          : `Please shorten your prompt by ${prompt.length - PROMPT_MAX_LENGTH} characters.`
      )
    )
  }

  return Ok(prompt)
}

/**
 * Validates image file path, format, and size
 */
export function validateImageFile(
  filePath?: string
): Result<string | null, InputValidationError | FileOperationError> {
  if (!filePath) {
    return Ok(null)
  }

  // Check file format first (before file existence to provide better error messages)
  const fileExtension = extname(filePath).toLowerCase().slice(1)
  if (!SUPPORTED_IMAGE_FORMATS.includes(fileExtension)) {
    return Err(
      new InputValidationError(
        `Unsupported file format: .${fileExtension}. Supported formats: ${SUPPORTED_IMAGE_FORMATS.map((f) => f.toUpperCase()).join(', ')}`,
        `Please convert your image to one of these supported formats: ${SUPPORTED_IMAGE_FORMATS.map((f) => f.toUpperCase()).join(', ')}. You can use image editing software or online converters.`
      )
    )
  }

  // Check file existence
  if (!existsSync(filePath)) {
    return Err(new FileOperationError(`File not found: ${filePath}`))
  }

  // Check file size
  try {
    const stats = statSync(filePath)
    if (stats.size > MAX_FILE_SIZE) {
      const sizeInMB = formatFileSize(stats.size)
      const limitInMB = formatFileSize(MAX_FILE_SIZE)
      return Err(
        new InputValidationError(
          `File size exceeds ${limitInMB}MB limit. Current size: ${sizeInMB}MB`,
          `Please compress your image using image editing software, online tools, or save it with lower quality settings to reduce file size below ${limitInMB}MB.`
        )
      )
    }
  } catch (error) {
    return Err(new FileOperationError(`Failed to read file: ${filePath}`))
  }

  return Ok(filePath)
}

/**
 * Validates output format
 */
export function validateOutputFormat(format?: string): Result<string, InputValidationError> {
  if (!format) {
    return Ok('PNG')
  }

  if (!isSupportedOutputFormat(format)) {
    return Err(
      new InputValidationError(
        `Invalid output format: ${format}. Supported formats: ${SUPPORTED_OUTPUT_FORMATS.join(', ')}`,
        `Please specify one of these supported output formats: ${SUPPORTED_OUTPUT_FORMATS.join(', ')}. If not specified, PNG will be used as default.`
      )
    )
  }

  return Ok(format)
}

/**
 * Validates new Gemini 2.5 Flash Image feature parameters
 */
export function validateNewFeatureParams(
  params: GenerateImageParams
): Result<void, InputValidationError> {
  // Validate blendImages parameter
  if (params.blendImages !== undefined && typeof params.blendImages !== 'boolean') {
    return Err(
      new InputValidationError(
        'blendImages must be a boolean value',
        'Use true or false for blendImages parameter to enable/disable multi-image blending functionality'
      )
    )
  }

  // Validate maintainCharacterConsistency parameter
  if (
    params.maintainCharacterConsistency !== undefined &&
    typeof params.maintainCharacterConsistency !== 'boolean'
  ) {
    return Err(
      new InputValidationError(
        'maintainCharacterConsistency must be a boolean value',
        'Use true or false for maintainCharacterConsistency parameter to enable/disable character consistency maintenance'
      )
    )
  }

  // Validate useWorldKnowledge parameter
  if (params.useWorldKnowledge !== undefined && typeof params.useWorldKnowledge !== 'boolean') {
    return Err(
      new InputValidationError(
        'useWorldKnowledge must be a boolean value',
        'Use true or false for useWorldKnowledge parameter to enable/disable world knowledge integration'
      )
    )
  }

  return Ok(undefined)
}

/**
 * Validates complete GenerateImageParams object
 */
export function validateGenerateImageParams(
  params: GenerateImageParams
): Result<GenerateImageParams, InputValidationError | FileOperationError> {
  // Validate prompt
  const promptResult = validatePrompt(params.prompt)
  if (!promptResult.success) {
    return Err(promptResult.error)
  }

  // Validate input image file if provided
  const imageFileResult = validateImageFile(params.inputImagePath)
  if (!imageFileResult.success) {
    return Err(imageFileResult.error)
  }

  // Validate output format
  const formatResult = validateOutputFormat(params.outputFormat)
  if (!formatResult.success) {
    return Err(formatResult.error)
  }

  // Validate new feature parameters
  const newFeatureResult = validateNewFeatureParams(params)
  if (!newFeatureResult.success) {
    return Err(newFeatureResult.error)
  }

  return Ok(params)
}
