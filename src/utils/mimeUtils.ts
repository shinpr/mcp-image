/**
 * Centralized MIME type and file extension mapping utility.
 * Single source of truth for all MIME type and extension operations.
 */

import * as path from 'node:path'
import type { ImageOutputFormat } from '../types/mcp.js'
import { Logger } from './logger.js'

const logger = new Logger()

/**
 * MIME type to file extension mapping.
 * Primary extension is used for each MIME type.
 */
const MIME_TO_EXTENSION: ReadonlyMap<string, string> = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
  ['image/gif', '.gif'],
  ['image/bmp', '.bmp'],
])

/**
 * File extension to MIME type mapping.
 * Includes aliases (e.g., .jpeg -> image/jpeg).
 */
const EXTENSION_TO_MIME: ReadonlyMap<string, string> = new Map([
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.png', 'image/png'],
  ['.webp', 'image/webp'],
  ['.gif', 'image/gif'],
  ['.bmp', 'image/bmp'],
])

export const DEFAULT_MIME_TYPE = 'image/png'
const DEFAULT_EXTENSION = '.png'
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const JPEG_SIGNATURE = Buffer.from([0xff, 0xd8, 0xff])

/**
 * All supported MIME types for image processing.
 */
export const SUPPORTED_MIME_TYPES: readonly string[] = [...MIME_TO_EXTENSION.keys()]

/**
 * All supported file extensions for image processing.
 * Includes aliases (e.g., both .jpg and .jpeg).
 */
export const SUPPORTED_EXTENSIONS: readonly string[] = [...EXTENSION_TO_MIME.keys()]

/**
 * Get the file extension for a given MIME type.
 * Returns .png with a warning log for unknown MIME types.
 *
 * @param mimeType - The MIME type string (e.g., "image/jpeg")
 * @returns The corresponding file extension (e.g., ".jpg")
 */
export function getExtensionFromMimeType(mimeType: string): string {
  const extension = MIME_TO_EXTENSION.get(mimeType)
  if (extension) {
    return extension
  }

  logger.warn('mimeUtils', `Unknown MIME type encountered, falling back to ${DEFAULT_EXTENSION}`, {
    mimeType,
  })
  return DEFAULT_EXTENSION
}

/**
 * Get the MIME type for a given file extension.
 * Returns image/png for unknown extensions.
 *
 * @param ext - The file extension (e.g., ".jpg" or ".jpeg")
 * @returns The corresponding MIME type (e.g., "image/jpeg")
 */
export function getMimeTypeFromExtension(ext: string): string {
  const normalized = ext.toLowerCase()
  return EXTENSION_TO_MIME.get(normalized) ?? DEFAULT_MIME_TYPE
}

/**
 * Normalize a MIME type against the supported allowlist.
 * Returns the MIME type as-is if supported, otherwise falls back to image/png with a warning.
 *
 * @param mimeType - The MIME type to normalize
 * @returns A supported MIME type string
 */
export function normalizeMimeType(mimeType: string): string {
  if (MIME_TO_EXTENSION.has(mimeType)) {
    return mimeType
  }
  logger.warn('mimeUtils', `Unknown MIME type, normalizing to ${DEFAULT_MIME_TYPE}`, { mimeType })
  return DEFAULT_MIME_TYPE
}

export function resolvePreferredOutputFormat(fileName?: string): ImageOutputFormat | undefined {
  if (!fileName) {
    return undefined
  }

  const extension = path.extname(fileName).toLowerCase()
  if (extension === '.png') {
    return 'png'
  }
  if (extension === '.jpg' || extension === '.jpeg') {
    return 'jpeg'
  }
  return undefined
}

export function getMimeTypeForOutputFormat(format: ImageOutputFormat): 'image/png' | 'image/jpeg' {
  return format === 'jpeg' ? 'image/jpeg' : 'image/png'
}

export function matchesImageDataMimeType(
  imageData: Buffer,
  mimeType: 'image/png' | 'image/jpeg'
): boolean {
  const signature = mimeType === 'image/png' ? PNG_SIGNATURE : JPEG_SIGNATURE
  return (
    imageData.length >= signature.length &&
    imageData.subarray(0, signature.length).equals(signature)
  )
}

/**
 * Ensure a filename has an appropriate file extension based on MIME type.
 * - A recognized extension is preserved only when it matches the actual MIME type.
 * - A recognized mismatched extension is replaced with the actual canonical extension.
 * - Missing or unrecognized extensions are completed without discarding the caller's basename.
 *
 * @param fileName - The filename, with or without extension
 * @param mimeType - The actual MIME type to derive the extension from
 * @returns The filename with an appropriate extension
 */
export function reconcileFileNameExtension(fileName: string, mimeType: string): string {
  const originalExtension = path.extname(fileName)
  const normalizedExtension = originalExtension.toLowerCase()
  const extensionMimeType = EXTENSION_TO_MIME.get(normalizedExtension)
  if (extensionMimeType === mimeType) {
    return fileName
  }

  const newExt = getExtensionFromMimeType(mimeType)
  if (extensionMimeType) {
    return `${fileName.slice(0, -originalExtension.length)}${newExt}`
  }
  return `${fileName}${newExt}`
}
