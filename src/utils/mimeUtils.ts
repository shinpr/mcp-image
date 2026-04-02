/**
 * Centralized MIME type and file extension mapping utility.
 * Single source of truth for all MIME type and extension operations.
 */

import * as path from 'node:path'
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

const DEFAULT_MIME_TYPE = 'image/png'
const DEFAULT_EXTENSION = '.png'

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
 * Check if a filename has a recognized image file extension.
 *
 * @param fileName - The filename to check
 * @returns true if the filename has a recognized image extension
 */
export function hasImageExtension(fileName: string): boolean {
  const ext = path.extname(fileName).toLowerCase()
  return EXTENSION_TO_MIME.has(ext)
}

/**
 * Ensure a filename has an appropriate file extension based on MIME type.
 * - If the filename already has an extension (any extension), it is preserved as-is.
 * - If the filename has no extension, one is appended based on the MIME type.
 *
 * @param fileName - The filename, with or without extension
 * @param mimeType - The MIME type to derive the extension from
 * @returns The filename with an appropriate extension
 */
export function ensureExtension(fileName: string, mimeType: string): string {
  const ext = path.extname(fileName)
  if (ext) {
    return fileName
  }

  const newExt = getExtensionFromMimeType(mimeType)
  return `${fileName}${newExt}`
}
