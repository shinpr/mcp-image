/**
 * Response Builder for MCP structured content responses
 * Converts generation results and errors into MCP-compatible response format
 */

import * as path from 'node:path'
import type { GeneratedImageResult } from '../api/imageClient.js'
import type { McpToolResponse, StructuredContent } from '../types/mcp.js'
import {
  type BaseError,
  ConfigError,
  FileOperationError,
  GeminiAPIError,
  ImageAPIError,
  InputValidationError,
  NetworkError,
  SecurityError,
} from '../utils/errors.js'
import { getMimeTypeFromExtension, SUPPORTED_MIME_TYPES } from '../utils/mimeUtils.js'

const UNKNOWN_ERROR_CODE = 'UNKNOWN_ERROR'
const DEFAULT_ERROR_SUGGESTION = 'Please try again or contact support if the problem persists'

/**
 * Interface for response builder functionality
 */
export interface ResponseBuilder {
  buildSuccessResponse(generationResult: GeneratedImageResult, filePath: string): McpToolResponse
  buildErrorResponse(error: BaseError | Error): McpToolResponse
}

/**
 * Determines MIME type from generation metadata with extension-based fallback.
 * Uses the API-reported MIME type as the primary source of truth.
 * Falls back to file extension detection when metadata MIME is unavailable.
 *
 * @param metadataMimeType MIME type from API generation metadata
 * @param filePath Path to the image file (used for fallback)
 * @returns MIME type string
 */
function resolveMimeType(metadataMimeType: string | undefined, filePath: string): string {
  if (metadataMimeType && SUPPORTED_MIME_TYPES.includes(metadataMimeType)) {
    return metadataMimeType
  }
  const ext = path.extname(filePath).toLowerCase()
  return getMimeTypeFromExtension(ext)
}

/**
 * Converts various error types to structured error format
 * @param error Error to convert
 * @returns Structured error object
 */
function convertErrorToStructured(error: BaseError | Error): {
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
    error instanceof ImageAPIError ||
    error instanceof NetworkError ||
    error instanceof ConfigError ||
    error instanceof SecurityError
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

/**
 * Creates a response builder with MCP structured content support
 * @returns ResponseBuilder implementation
 */
export function createResponseBuilder(): ResponseBuilder {
  return {
    /**
     * Builds a successful structured content response with file path
     * @param generationResult Result from image generation
     * @param filePath Absolute path to the saved image file (required)
     * @returns MCP tool response with structured content containing file path
     */
    buildSuccessResponse(
      generationResult: GeneratedImageResult,
      filePath: string
    ): McpToolResponse {
      // File-based implementation: Always return file path, never base64
      // This avoids MCP token limit issues (25,000 tokens max)
      const mimeType = resolveMimeType(generationResult.metadata.mimeType, filePath)
      const fileName = path.basename(filePath)

      const structuredContent: StructuredContent = {
        type: 'resource',
        resource: {
          uri: `file://${filePath}`,
          name: fileName,
          mimeType,
        },
        metadata: {
          model: generationResult.metadata.model,
          ...(generationResult.metadata.provider && {
            provider: generationResult.metadata.provider,
          }),
          processingTime: 0, // Not tracked in simplified version
          contextMethod: 'structured_prompt',
          timestamp: generationResult.metadata.timestamp.toISOString(),
        },
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
    },

    /**
     * Builds an error response in structured content format
     * @param error Error that occurred during processing
     * @returns MCP tool response with structured error
     */
    buildErrorResponse(error: BaseError | Error): McpToolResponse {
      const structuredError = {
        error: convertErrorToStructured(error),
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
    },
  }
}
