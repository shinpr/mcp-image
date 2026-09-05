import * as path from 'node:path'
import { pathToFileURL } from 'node:url'
import type { GeneratedImageResult } from '../api/imageClient.js'
import type { McpToolResponse, ResourceContent } from '../types/mcp.js'
import { BaseError } from '../utils/errors.js'
import { sanitizeText } from '../utils/logger.js'
import { getMimeTypeFromExtension, SUPPORTED_MIME_TYPES } from '../utils/mimeUtils.js'

const UNKNOWN_ERROR_CODE = 'UNKNOWN_ERROR'
const DEFAULT_ERROR_SUGGESTION = 'Please try again or contact support if the problem persists'

export interface UnknownErrorFallback {
  code: string
  suggestion: string
}

const DEFAULT_UNKNOWN_ERROR_FALLBACK: UnknownErrorFallback = {
  code: UNKNOWN_ERROR_CODE,
  suggestion: DEFAULT_ERROR_SUGGESTION,
}

/**
 * Context keys safe to surface in MCP error responses. Anything not on this
 * list (notably `prompt`, which the caller already supplied, and any future
 * additions) stays out of the wire format.
 */
const SAFE_CONTEXT_KEYS = ['provider', 'stage', 'statusCode'] as const

/**
 * Project an error's context object into a sanitized subset suitable for
 * inclusion in caller-visible error responses. The upstream API message is
 * passed through the logger's redaction patterns before exposure.
 */
function buildPublicDetails(error: BaseError): Record<string, unknown> | undefined {
  const context = error.context ?? {}

  const details: Record<string, unknown> = {}

  for (const key of SAFE_CONTEXT_KEYS) {
    if (context[key] !== undefined) {
      details[key] = context[key]
    }
  }

  const statusCode =
    context['statusCode'] ?? Reflect.get(error, 'statusCode') ?? context['upstreamStatus']
  if (typeof statusCode === 'number') {
    details['statusCode'] = statusCode
  }

  if (typeof context['upstreamMessage'] === 'string') {
    details['upstreamMessage'] = sanitizeText(context['upstreamMessage'])
  }

  return Object.keys(details).length > 0 ? details : undefined
}

function resolveMimeType(metadataMimeType: string | undefined, filePath: string): string {
  if (metadataMimeType && SUPPORTED_MIME_TYPES.includes(metadataMimeType)) {
    return metadataMimeType
  }
  const ext = path.extname(filePath).toLowerCase()
  return getMimeTypeFromExtension(ext)
}

function convertErrorToStructured(
  error: Error,
  unknownFallback: UnknownErrorFallback
): {
  code: string
  message: string
  suggestion: string
  timestamp: string
  details?: Record<string, unknown>
} {
  const baseError = {
    timestamp: new Date().toISOString(),
  }

  if (error instanceof BaseError) {
    const details = buildPublicDetails(error)
    return {
      ...baseError,
      code: error.code,
      message: sanitizeText(error.message),
      suggestion: error.suggestion,
      ...(details && { details }),
    }
  }

  return {
    ...baseError,
    code: unknownFallback.code,
    message: sanitizeText(error.message || 'An unknown error occurred'),
    suggestion: unknownFallback.suggestion,
  }
}

export function buildSuccessResponse(
  generationResult: GeneratedImageResult,
  filePath: string
): McpToolResponse {
  const mimeType = resolveMimeType(generationResult.metadata.mimeType, filePath)
  const fileName = path.basename(filePath)

  const resourceContent: ResourceContent = {
    type: 'resource',
    resource: {
      uri: pathToFileURL(filePath).href,
      name: fileName,
      mimeType,
    },
    metadata: {
      model: generationResult.metadata.model,
      ...(generationResult.metadata.provider && {
        provider: generationResult.metadata.provider,
      }),
      processingTime: 0,
      contextMethod: 'structured_prompt',
      timestamp: generationResult.metadata.timestamp.toISOString(),
    },
  }

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(resourceContent),
      },
    ],
    isError: false,
  }
}

export function buildErrorResponse(
  error: Error,
  unknownFallback: UnknownErrorFallback = DEFAULT_UNKNOWN_ERROR_FALLBACK
): McpToolResponse {
  const structuredError = {
    error: convertErrorToStructured(error, unknownFallback),
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
