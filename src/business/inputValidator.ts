/**
 * Input validation module for MCP server
 * Validates user inputs according to Gemini API and business requirements
 */

import { existsSync } from 'node:fs'
import { extname } from 'node:path'
import type { AspectRatio, GenerateImageParams } from '../types/mcp'
import type { Result } from '../types/result'
import { Err, Ok } from '../types/result'
import { InputValidationError } from '../utils/errors'

// Constants for validation limits
const PROMPT_MIN_LENGTH = 1
const PROMPT_MAX_LENGTH = 4000
const MAX_IMAGE_SIZE = 10 * 1024 * 1024 // 10MB in bytes
const SUPPORTED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp']
const SUPPORTED_ASPECT_RATIOS: readonly AspectRatio[] = [
  '1:1',
  '2:3',
  '3:2',
  '3:4',
  '4:3',
  '4:5',
  '5:4',
  '9:16',
  '16:9',
  '21:9',
] as const

/**
 * Converts bytes to MB with proper formatting
 */
function formatFileSize(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1)
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
 * Validates base64 encoded image data
 * @param imageData - Base64 encoded image string
 * @param mimeType - MIME type of the image
 * @returns Result with validated Buffer or error
 */
export function validateBase64Image(
  imageData?: string,
  mimeType?: string
): Result<Buffer | undefined, InputValidationError> {
  // If no image data provided, it's valid (optional parameter)
  if (!imageData) {
    return Ok(undefined)
  }

  // Validate MIME type if provided
  if (mimeType && !SUPPORTED_MIME_TYPES.includes(mimeType)) {
    return Err(
      new InputValidationError(
        `Unsupported MIME type: ${mimeType}. Supported types: ${SUPPORTED_MIME_TYPES.join(', ')}`,
        `Please provide an image with one of these MIME types: ${SUPPORTED_MIME_TYPES.join(', ')}`
      )
    )
  }

  // Check if it's valid base64
  // Remove data URI prefix if present
  const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/
  const cleanedData = imageData.replace(/^data:image\/[a-z]+;base64,/, '')

  if (!base64Regex.test(cleanedData)) {
    return Err(
      new InputValidationError(
        'Invalid base64 format',
        'Please provide a valid base64 encoded image string'
      )
    )
  }

  // Decode and check size
  let buffer: Buffer
  try {
    buffer = Buffer.from(cleanedData, 'base64')

    if (buffer.length > MAX_IMAGE_SIZE) {
      const sizeInMB = formatFileSize(buffer.length)
      const limitInMB = formatFileSize(MAX_IMAGE_SIZE)
      return Err(
        new InputValidationError(
          `Image size exceeds ${limitInMB}MB limit. Current size: ${sizeInMB}MB`,
          `Please compress your image or reduce its resolution to stay below ${limitInMB}MB`
        )
      )
    }
  } catch (error) {
    return Err(
      new InputValidationError(
        'Failed to decode base64 image',
        'Please ensure the image is properly base64 encoded'
      )
    )
  }

  return Ok(buffer)
}

/**
 * Validates input image path
 * @param imagePath - Path to the input image file
 * @returns Result with validated path or error
 */
export function validateImagePath(
  imagePath?: string
): Result<string | undefined, InputValidationError> {
  // If no path provided, it's valid (optional parameter)
  if (!imagePath) {
    return Ok(undefined)
  }

  // Check if file exists
  if (!existsSync(imagePath)) {
    return Err(
      new InputValidationError(
        `Input image file not found: ${imagePath}`,
        'Please provide a valid absolute path to an existing image file'
      )
    )
  }

  // Check file extension
  const ext = extname(imagePath).toLowerCase()
  const supportedExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp']
  if (!supportedExtensions.includes(ext)) {
    return Err(
      new InputValidationError(
        `Unsupported image format: ${ext}. Supported formats: ${supportedExtensions.join(', ')}`,
        `Please provide an image with one of these extensions: ${supportedExtensions.join(', ')}`
      )
    )
  }

  return Ok(imagePath)
}

/**
 * Validates complete GenerateImageParams object
 */
export function validateGenerateImageParams(
  params: GenerateImageParams
): Result<GenerateImageParams, InputValidationError> {
  // Validate prompt
  const promptResult = validatePrompt(params.prompt)
  if (!promptResult.success) {
    return Err(promptResult.error)
  }

  // Validate input image path if provided
  const imagePathResult = validateImagePath(params.inputImagePath)
  if (!imagePathResult.success) {
    return Err(imagePathResult.error)
  }

  // Validate blendImages parameter
  if (params.blendImages !== undefined && typeof params.blendImages !== 'boolean') {
    return Err(
      new InputValidationError(
        'blendImages must be a boolean value',
        'Use true or false for blendImages parameter to enable/disable multi-image blending'
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
        'Use true or false for maintainCharacterConsistency parameter to enable/disable character consistency'
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

  // Validate input image data if provided
  if (params.inputImage || params.inputImageMimeType) {
    const imageResult = validateBase64Image(params.inputImage, params.inputImageMimeType)
    if (!imageResult.success) {
      return Err(imageResult.error)
    }
  }

  // Validate aspectRatio parameter
  if (params.aspectRatio && !SUPPORTED_ASPECT_RATIOS.includes(params.aspectRatio)) {
    return Err(
      new InputValidationError(
        `Invalid aspect ratio: ${params.aspectRatio}`,
        `Supported values: ${SUPPORTED_ASPECT_RATIOS.join(', ')}`
      )
    )
  }

  return Ok(params)
}
