/**
 * Security Manager for file path validation and sanitization
 * Provides protection against path traversal, null byte injection, and other security threats
 */

import * as path from 'node:path'
import { Err, Ok, type Result } from '../types/result'
import { SecurityError } from './errors'

/**
 * Security manager for handling file path validation and sanitization
 */
export class SecurityManager {
  private readonly allowedBasePaths = [
    process.cwd(),
    path.resolve(process.env['IMAGE_OUTPUT_DIR'] || './output'),
    path.resolve('./temp'),
    path.resolve('./tmp'),
    '/tmp',
  ]

  /**
   * Sanitize and validate file path for security
   * @param inputPath File path to sanitize
   * @returns Result containing sanitized path or security error
   */
  sanitizeFilePath(inputPath: string): Result<string, SecurityError> {
    // Null byte attack prevention
    if (inputPath.includes('\0')) {
      return Err(new SecurityError('Null byte detected in file path'))
    }

    // Path traversal attack prevention
    if (inputPath.includes('..')) {
      return Err(new SecurityError('Path traversal attempt detected'))
    }

    // Resolve and validate absolute path
    const resolvedPath = path.resolve(inputPath)
    const isAllowed = this.allowedBasePaths.some((basePath) =>
      resolvedPath.startsWith(path.resolve(basePath))
    )

    if (!isAllowed) {
      return Err(new SecurityError('File path outside allowed directories'))
    }

    return Ok(resolvedPath)
  }

  /**
   * Validate image file extension
   * @param filePath File path to validate
   * @returns Result indicating validation success or security error
   */
  validateImageFile(filePath: string): Result<void, SecurityError> {
    // Allowed image file extensions
    const allowedExtensions = ['.png', '.jpg', '.jpeg', '.webp']
    const extension = path.extname(filePath).toLowerCase()

    if (!allowedExtensions.includes(extension)) {
      return Err(new SecurityError(`Unsupported file extension: ${extension}`))
    }

    return Ok(undefined)
  }

  /**
   * Validate directory path for security
   * @param dirPath Directory path to validate
   * @returns Result indicating validation success or security error
   */
  validateDirectoryPath(dirPath: string): Result<void, SecurityError> {
    // Use same security checks as file path validation
    const pathValidation = this.sanitizeFilePath(dirPath)
    if (!pathValidation.success) {
      return pathValidation
    }

    return Ok(undefined)
  }

  /**
   * Generate secure temporary file path
   * @param baseName Base name for the temporary file
   * @param extension File extension (with dot)
   * @returns Secure temporary file path
   */
  generateSecureTempPath(baseName: string, extension: string): string {
    const timestamp = Date.now()
    const randomSuffix = Math.random().toString(36).substring(2, 8)
    const secureFilename = `${baseName}-${timestamp}-${randomSuffix}${extension}`

    return path.join('/tmp', secureFilename)
  }

  /**
   * Check if a path is within allowed directories
   * @param targetPath Path to check
   * @returns True if path is within allowed directories
   */
  isPathAllowed(targetPath: string): boolean {
    const resolvedPath = path.resolve(targetPath)
    return this.allowedBasePaths.some((basePath) => resolvedPath.startsWith(path.resolve(basePath)))
  }

  /**
   * Sanitize filename by removing dangerous characters
   * @param filename Filename to sanitize
   * @returns Sanitized filename
   */
  sanitizeFilename(filename: string): string {
    // Remove null bytes and path separators
    let sanitized = filename.replace(/[\0\/\\]/g, '')

    // Remove control characters (ASCII 0-31 and 127) by filtering each character
    sanitized = sanitized
      .split('')
      .filter((char) => {
        const code = char.charCodeAt(0)
        return code > 31 && code !== 127
      })
      .join('')

    // Trim whitespace and dots (to prevent hidden files and relative paths)
    sanitized = sanitized.replace(/^\.+|\.+$/g, '').trim()

    // Ensure filename is not empty after sanitization
    if (sanitized.length === 0) {
      sanitized = `secure-file-${Date.now()}`
    }

    return sanitized
  }
}
