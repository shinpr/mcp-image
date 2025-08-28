/**
 * Input validation module for MCP server
 * Validates user inputs according to Gemini API and business requirements
 */

import { existsSync, statSync } from 'node:fs'
import { extname } from 'node:path'
import type { GenerateImageParams } from '../types/mcp'
import { FileOperationError, InputValidationError, type Result } from '../utils/errors'

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
    return {
      ok: false,
      error: new InputValidationError(
        `Prompt must be between ${PROMPT_MIN_LENGTH} and ${PROMPT_MAX_LENGTH} characters. Current length: ${prompt.length}`,
        prompt.length === 0
          ? 'Please provide a descriptive prompt for image generation.'
          : `Please shorten your prompt by ${prompt.length - PROMPT_MAX_LENGTH} characters.`
      ),
    }
  }

  return { ok: true, value: prompt }
}

/**
 * Validates image file path, format, and size
 */
export function validateImageFile(
  filePath?: string
): Result<string | null, InputValidationError | FileOperationError> {
  if (!filePath) {
    return { ok: true, value: null }
  }

  // Check file format first (before file existence to provide better error messages)
  const fileExtension = extname(filePath).toLowerCase().slice(1)
  if (!SUPPORTED_IMAGE_FORMATS.includes(fileExtension)) {
    return {
      ok: false,
      error: new InputValidationError(
        `Unsupported file format: .${fileExtension}. Supported formats: ${SUPPORTED_IMAGE_FORMATS.map((f) => f.toUpperCase()).join(', ')}`,
        `Please convert your image to one of these supported formats: ${SUPPORTED_IMAGE_FORMATS.map((f) => f.toUpperCase()).join(', ')}. You can use image editing software or online converters.`
      ),
    }
  }

  // Check file existence
  if (!existsSync(filePath)) {
    return {
      ok: false,
      error: new FileOperationError(
        `File not found: ${filePath}`,
        'Please check the file path for typos and ensure the file exists. Use absolute paths to avoid confusion.'
      ),
    }
  }

  // Check file size
  try {
    const stats = statSync(filePath)
    if (stats.size > MAX_FILE_SIZE) {
      const sizeInMB = formatFileSize(stats.size)
      const limitInMB = formatFileSize(MAX_FILE_SIZE)
      return {
        ok: false,
        error: new InputValidationError(
          `File size exceeds ${limitInMB}MB limit. Current size: ${sizeInMB}MB`,
          `Please compress your image using image editing software, online tools, or save it with lower quality settings to reduce file size below ${limitInMB}MB.`
        ),
      }
    }
  } catch (error) {
    return {
      ok: false,
      error: new FileOperationError(
        `Failed to read file: ${filePath}`,
        'Please check file permissions, ensure the file is not corrupted, and verify you have read access to the file location.'
      ),
    }
  }

  return { ok: true, value: filePath }
}

/**
 * Validates output format
 */
export function validateOutputFormat(format?: string): Result<string, InputValidationError> {
  if (!format) {
    return { ok: true, value: 'PNG' }
  }

  if (!isSupportedOutputFormat(format)) {
    return {
      ok: false,
      error: new InputValidationError(
        `Invalid output format: ${format}. Supported formats: ${SUPPORTED_OUTPUT_FORMATS.join(', ')}`,
        `Please specify one of these supported output formats: ${SUPPORTED_OUTPUT_FORMATS.join(', ')}. If not specified, PNG will be used as default.`
      ),
    }
  }

  return { ok: true, value: format }
}

/**
 * Validates complete GenerateImageParams object
 */
export function validateGenerateImageParams(
  params: GenerateImageParams
): Result<GenerateImageParams, InputValidationError | FileOperationError> {
  // Validate prompt
  const promptResult = validatePrompt(params.prompt)
  if (!promptResult.ok) {
    return promptResult
  }

  // Validate input image file if provided
  const imageFileResult = validateImageFile(params.inputImagePath)
  if (!imageFileResult.ok) {
    return imageFileResult
  }

  // Validate output format
  const formatResult = validateOutputFormat(params.outputFormat)
  if (!formatResult.ok) {
    return formatResult
  }

  return { ok: true, value: params }
}
