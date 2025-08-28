/**
 * Response Builder for MCP structured content responses
 * Converts generation results and errors into MCP-compatible response format
 */

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

const DEFAULT_MIME_TYPE = MIME_TYPES.PNG
const UNKNOWN_ERROR_CODE = 'UNKNOWN_ERROR'
const DEFAULT_ERROR_SUGGESTION = 'Please try again or contact support if the problem persists'

/**
 * Builds structured content responses for MCP tool responses
 * Handles both successful image generation and error responses
 */
export class ResponseBuilder {
  /**
   * Builds a successful structured content response with base64 data URI
   * @param generationResult Result from image generation containing image data
   * @returns MCP tool response with structured content
   */
  buildSuccessResponse(generationResult: GenerationResult): McpToolResponse {
    // Determine MIME type from metadata or default to PNG
    const mimeType = this.getMimeTypeFromMetadata(generationResult.metadata)

    // Convert image buffer to base64 data URI
    const base64Data = generationResult.imageData.toString('base64')
    const dataUri = `data:${mimeType};base64,${base64Data}`

    const structuredContent: StructuredContent = {
      type: 'resource',
      resource: {
        uri: dataUri,
        name: `image-${Date.now()}.${this.getExtensionFromMimeType(mimeType)}`,
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
   * Determines MIME type from generation metadata
   * @param metadata Generation metadata that might contain format info
   * @returns MIME type string
   */
  private getMimeTypeFromMetadata(_metadata: GenerationResult['metadata']): string {
    // For now, default to PNG. In future, could read from metadata if available
    return DEFAULT_MIME_TYPE
  }

  /**
   * Gets file extension from MIME type
   * @param mimeType MIME type string
   * @returns File extension without dot
   */
  private getExtensionFromMimeType(mimeType: string): string {
    switch (mimeType) {
      case MIME_TYPES.PNG:
        return 'png'
      case MIME_TYPES.JPEG:
        return 'jpg'
      case MIME_TYPES.WEBP:
        return 'webp'
      default:
        return 'png'
    }
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
    timestamp: string
  } {
    const baseError = {
      timestamp: new Date().toISOString(),
    }

    if (
      error instanceof InputValidationError ||
      error instanceof FileOperationError ||
      error instanceof GeminiAPIError ||
      error instanceof NetworkError ||
      error instanceof ConfigError
    ) {
      return {
        ...baseError,
        code: error.code,
        message: error.message,
        suggestion: error.suggestion,
      }
    }

    // Handle unknown errors
    return {
      ...baseError,
      code: UNKNOWN_ERROR_CODE,
      message: error.message || 'An unknown error occurred',
      suggestion: DEFAULT_ERROR_SUGGESTION,
    }
  }
}
