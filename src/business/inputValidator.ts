import { existsSync } from 'node:fs'
import { extname } from 'node:path'
import type { GenerateImageParams } from '../types/mcp.js'
import {
  ASPECT_RATIO_VALUES,
  IMAGE_PROVIDER_VALUES,
  IMAGE_QUALITY_VALUES,
  IMAGE_SIZE_VALUES,
} from '../types/mcp.js'
import type { Result } from '../types/result.js'
import { Err, Ok } from '../types/result.js'
import { InputValidationError } from '../utils/errors.js'
import { SUPPORTED_EXTENSIONS, SUPPORTED_MIME_TYPES } from '../utils/mimeUtils.js'

const PROMPT_MIN_LENGTH = 1
const PROMPT_MAX_LENGTH = 4000
export const MAX_IMAGE_SIZE = 10 * 1024 * 1024
const SUPPORTED_ASPECT_RATIOS = ASPECT_RATIO_VALUES
const SUPPORTED_QUALITY_VALUES = IMAGE_QUALITY_VALUES
const SUPPORTED_PROVIDER_VALUES = IMAGE_PROVIDER_VALUES

function formatFileSize(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1)
}

export function validatePrompt(prompt: unknown): Result<string, InputValidationError> {
  if (typeof prompt !== 'string') {
    return Err(
      new InputValidationError(
        'Prompt must be a non-empty string',
        'Please provide a descriptive prompt for image generation.'
      )
    )
  }
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

  if (prompt.trim().length === 0) {
    return Err(
      new InputValidationError(
        'Prompt must be a non-empty string',
        'Please provide a descriptive prompt for image generation.'
      )
    )
  }

  return Ok(prompt)
}

export function validateBase64Image(
  imageData?: string,
  mimeType?: string
): Result<Buffer | undefined, InputValidationError> {
  if (!imageData) {
    return Ok(undefined)
  }

  if (mimeType && !SUPPORTED_MIME_TYPES.includes(mimeType)) {
    return Err(
      new InputValidationError(
        `Unsupported MIME type: ${mimeType}. Supported types: ${SUPPORTED_MIME_TYPES.join(', ')}`,
        `Please provide an image with one of these MIME types: ${SUPPORTED_MIME_TYPES.join(', ')}`
      )
    )
  }

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
  } catch (_error) {
    return Err(
      new InputValidationError(
        'Failed to decode base64 image',
        'Please ensure the image is properly base64 encoded'
      )
    )
  }

  return Ok(buffer)
}

function validateImagePath(imagePath?: string): Result<string | undefined, InputValidationError> {
  if (!imagePath) {
    return Ok(undefined)
  }

  if (!existsSync(imagePath)) {
    return Err(
      new InputValidationError(
        `Input image file not found: ${imagePath}`,
        'Please provide a valid absolute path to an existing image file'
      )
    )
  }

  const ext = extname(imagePath).toLowerCase()
  if (!SUPPORTED_EXTENSIONS.includes(ext)) {
    return Err(
      new InputValidationError(
        `Unsupported image format: ${ext}. Supported formats: ${SUPPORTED_EXTENSIONS.join(', ')}`,
        `Please provide an image with one of these extensions: ${SUPPORTED_EXTENSIONS.join(', ')}`
      )
    )
  }

  return Ok(imagePath)
}

export function validateGenerateImageParams(
  input: unknown
): Result<GenerateImageParams, InputValidationError> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return Err(
      new InputValidationError(
        'Tool arguments must be an object',
        'Provide an object containing a prompt and optional image parameters'
      )
    )
  }
  for (const field of [
    'fileName',
    'inputImagePath',
    'purpose',
    'inputImage',
    'inputImageMimeType',
    'aspectRatio',
    'imageSize',
    'quality',
    'provider',
  ] as const) {
    const value = (input as Record<string, unknown>)[field]
    if (value !== undefined && typeof value !== 'string') {
      return Err(
        new InputValidationError(
          `${field} must be a string`,
          `Provide a string for ${field} or omit it`
        )
      )
    }
  }
  // The remaining required string, boolean, and enum fields are checked below.
  const params = input as GenerateImageParams
  const promptResult = validatePrompt(params.prompt)
  if (!promptResult.success) {
    return Err(promptResult.error)
  }

  const imagePathResult = validateImagePath(params.inputImagePath)
  if (!imagePathResult.success) {
    return Err(imagePathResult.error)
  }

  if (params.blendImages !== undefined && typeof params.blendImages !== 'boolean') {
    return Err(
      new InputValidationError(
        'blendImages must be a boolean value',
        'Use true or false for blendImages parameter to enable/disable multi-image blending'
      )
    )
  }

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

  if (params.useWorldKnowledge !== undefined && typeof params.useWorldKnowledge !== 'boolean') {
    return Err(
      new InputValidationError(
        'useWorldKnowledge must be a boolean value',
        'Use true or false for useWorldKnowledge parameter to enable/disable world knowledge integration'
      )
    )
  }

  if (params.useGoogleSearch !== undefined && typeof params.useGoogleSearch !== 'boolean') {
    return Err(
      new InputValidationError(
        'useGoogleSearch must be a boolean value',
        'Use true or false for useGoogleSearch parameter to enable/disable Google Search grounding'
      )
    )
  }

  if (params.inputImage || params.inputImageMimeType) {
    const imageResult = validateBase64Image(params.inputImage, params.inputImageMimeType)
    if (!imageResult.success) {
      return Err(imageResult.error)
    }
  }

  if (params.imageSize !== undefined && !IMAGE_SIZE_VALUES.includes(params.imageSize)) {
    return Err(
      new InputValidationError(
        `Invalid image size: ${params.imageSize}`,
        `Use one of: ${IMAGE_SIZE_VALUES.join(', ')}`
      )
    )
  }

  if (params.aspectRatio !== undefined && !SUPPORTED_ASPECT_RATIOS.includes(params.aspectRatio)) {
    return Err(
      new InputValidationError(
        `Invalid aspect ratio: ${params.aspectRatio}. Supported values: ${SUPPORTED_ASPECT_RATIOS.join(', ')}`,
        `Please use one of the supported aspect ratios: ${SUPPORTED_ASPECT_RATIOS.join(', ')}`
      )
    )
  }

  if (params.quality !== undefined && !SUPPORTED_QUALITY_VALUES.includes(params.quality)) {
    return Err(
      new InputValidationError(
        `Invalid quality value: "${params.quality}". Supported values: ${SUPPORTED_QUALITY_VALUES.join(', ')}`,
        `Please use one of the supported quality values: ${SUPPORTED_QUALITY_VALUES.join(', ')}`
      )
    )
  }

  if (params.provider !== undefined && !SUPPORTED_PROVIDER_VALUES.includes(params.provider)) {
    return Err(
      new InputValidationError(
        `Invalid provider value: "${params.provider}". Supported values: ${SUPPORTED_PROVIDER_VALUES.join(', ')}`,
        `Please use one of the supported providers: ${SUPPORTED_PROVIDER_VALUES.join(', ')}`
      )
    )
  }

  return Ok(params)
}
