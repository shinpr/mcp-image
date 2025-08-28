/**
 * Response Builder for MCP structured content responses
 * Converts generation results and errors into MCP-compatible response format
 */

import * as path from 'node:path'
import type { McpToolResponse, StructuredContent, StructuredError } from '../types/mcp'
import {
  type AppError,
  ConfigError,
  FileOperationError,
  GeminiAPIError,
  InputValidationError,
  NetworkError,
} from '../utils/errors'
import type { GenerationResult } from './imageGenerator'

// Constants for MIME types and error handling
const MIME_TYPES = {
  PNG: 'image/png',
  JPEG: 'image/jpeg',
  WEBP: 'image/webp',
} as const

const FILE_EXTENSIONS = {
  PNG: ['.png'],
  JPEG: ['.jpg', '.jpeg'],
  WEBP: ['.webp'],
} as const

const DEFAULT_MIME_TYPE = MIME_TYPES.PNG
const UNKNOWN_ERROR_CODE = 'UNKNOWN_ERROR'
const DEFAULT_ERROR_SUGGESTION = 'Please try again or contact support if the problem persists'

/**
 * Builds structured content responses for MCP tool responses
 * Handles both successful image generation and error responses
 */
export class ResponseBuilder {
  /**
   * Builds a successful structured content response
   * @param generationResult Result from image generation
   * @param filePath Absolute path to the saved image file
   * @returns MCP tool response with structured content
   */
  buildSuccessResponse(generationResult: GenerationResult, filePath: string): McpToolResponse {
    const fileName = path.basename(filePath)
    const mimeType = this.getMimeTypeFromPath(filePath)

    const structuredContent: StructuredContent = {
      type: 'resource',
      resource: {
        uri: `file://${filePath}`,
        name: fileName,
        mimeType,
      },
      metadata: generationResult.metadata,
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(structuredContent),
        },
      ],
      isError: false,
    }
  }

  /**
   * Builds an error response in structured content format
   * @param error Error that occurred during processing
   * @returns MCP tool response with structured error
   */
  buildErrorResponse(error: AppError | Error): McpToolResponse {
    const structuredError: StructuredError = {
      error: this.convertErrorToStructured(error),
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(structuredError),
        },
      ],
      isError: true,
    }
  }

  /**
   * Determines MIME type based on file extension
   * @param filePath Path to the image file
   * @returns MIME type string
   */
  private getMimeTypeFromPath(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase()

    if (FILE_EXTENSIONS.PNG.includes(ext as '.png')) {
      return MIME_TYPES.PNG
    }
    if (FILE_EXTENSIONS.JPEG.includes(ext as '.jpg' | '.jpeg')) {
      return MIME_TYPES.JPEG
    }
    if (FILE_EXTENSIONS.WEBP.includes(ext as '.webp')) {
      return MIME_TYPES.WEBP
    }

    return DEFAULT_MIME_TYPE
  }

  /**
   * Converts various error types to structured error format
   * @param error Error to convert
   * @returns Structured error object
   */
  private convertErrorToStructured(error: AppError | Error): {
    code: string
    message: string
    suggestion: string
  } {
    if (
      error instanceof InputValidationError ||
      error instanceof FileOperationError ||
      error instanceof GeminiAPIError ||
      error instanceof NetworkError ||
      error instanceof ConfigError
    ) {
      return {
        code: error.code,
        message: error.message,
        suggestion: error.suggestion,
      }
    }

    // Handle unknown errors
    return {
      code: UNKNOWN_ERROR_CODE,
      message: error.message || 'An unknown error occurred',
      suggestion: DEFAULT_ERROR_SUGGESTION,
    }
  }
}
