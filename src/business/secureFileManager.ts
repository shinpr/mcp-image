/**
 * Secure File Manager for handling image file operations with enhanced security
 * Extends FileManager with security features, temporary file management, and cleanup
 */

import { promises as fs } from 'node:fs'
import * as path from 'node:path'
import type { Result } from '../types/result'
import { Err, Ok } from '../types/result'
import { FileOperationError, type SecurityError } from '../utils/errors'
import { Logger } from '../utils/logger'
import { SecurityManager } from '../utils/security'
import { FileManager } from './fileManager'

/**
 * Secure file manager with enhanced security features and temporary file management
 */
export class SecureFileManager extends FileManager {
  private tempFiles: Set<string> = new Set()
  private readonly securityManager = new SecurityManager()
  private readonly logger = new Logger()

  /**
   * Securely save image data with comprehensive security checks
   * @param imageData Buffer containing the image data
   * @param outputPath Path where the image should be saved
   * @param format Image format for validation (optional)
   * @returns Result containing the saved file path or an error
   */
  async saveImageSecure(
    imageData: Buffer,
    outputPath: string,
    format?: string
  ): Promise<Result<string, FileOperationError | SecurityError>> {
    try {
      // Security validation
      const sanitizedPath = this.securityManager.sanitizeFilePath(outputPath)
      if (!sanitizedPath.success) {
        return sanitizedPath
      }

      const validationResult = this.securityManager.validateImageFile(sanitizedPath.data)
      if (!validationResult.success) {
        return validationResult
      }

      // Ensure secure directory creation
      const dirPath = path.dirname(sanitizedPath.data)
      const dirResult = await this.ensureSecureDirectory(dirPath)
      if (!dirResult.success) {
        return dirResult
      }

      // Atomic file operation using temporary file
      const tempPath = `${sanitizedPath.data}.tmp`
      this.tempFiles.add(tempPath)

      this.logger.debug('secure-file-manager', 'Starting atomic file save', {
        outputPath: sanitizedPath.data,
        tempPath,
        fileSize: imageData.length,
        format,
      })

      // Write to temporary file first
      await fs.writeFile(tempPath, imageData)

      // Atomic move to final destination
      await fs.rename(tempPath, sanitizedPath.data)
      this.tempFiles.delete(tempPath)

      this.logger.info('secure-file-manager', 'Image saved successfully', {
        outputPath: sanitizedPath.data,
        fileSize: imageData.length,
        format,
        securityChecks: 'passed',
      })

      return Ok(sanitizedPath.data)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'

      this.logger.error('secure-file-manager', 'Failed to save image securely', error as Error, {
        outputPath,
        format,
        errorType: 'file-operation',
      })

      return Err(
        new FileOperationError(
          `Failed to save image: ${errorMessage}`,
          'Check directory permissions and disk space'
        )
      )
    }
  }

  /**
   * Ensure secure directory creation with security validation
   * @param dirPath Directory path to create
   * @returns Result indicating success or failure
   */
  private async ensureSecureDirectory(
    dirPath: string
  ): Promise<Result<void, FileOperationError | SecurityError>> {
    try {
      // Validate directory path security
      const validationResult = this.securityManager.validateDirectoryPath(dirPath)
      if (!validationResult.success) {
        return validationResult
      }

      // Use parent class method for actual directory creation
      const createResult = this.ensureDirectoryExists(dirPath)
      if (!createResult.success) {
        return createResult
      }

      this.logger.debug('secure-file-manager', 'Secure directory created', {
        directoryPath: dirPath,
      })

      return Ok(undefined)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'

      this.logger.error(
        'secure-file-manager',
        'Failed to create secure directory',
        error as Error,
        {
          directoryPath: dirPath,
        }
      )

      return Err(
        new FileOperationError(
          `Failed to create secure directory: ${errorMessage}`,
          'Check directory permissions and path validity'
        )
      )
    }
  }

  /**
   * Cleanup all tracked temporary files
   */
  async cleanup(): Promise<void> {
    const cleanupPromises = Array.from(this.tempFiles).map(async (tempFile) => {
      try {
        await fs.unlink(tempFile)
        this.tempFiles.delete(tempFile)

        this.logger.debug('secure-file-manager', 'Temporary file cleaned up', {
          file: tempFile,
        })
      } catch (error) {
        this.logger.warn('secure-file-manager', 'Failed to cleanup temporary file', {
          file: tempFile,
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    })

    await Promise.all(cleanupPromises)

    if (this.tempFiles.size > 0) {
      this.logger.warn('secure-file-manager', 'Some temporary files could not be cleaned', {
        remainingCount: this.tempFiles.size,
      })
    }
  }

  /**
   * Setup process cleanup handlers for graceful shutdown
   */
  setupProcessCleanup(): void {
    const cleanup = () => {
      this.logger.info('secure-file-manager', 'Process cleanup initiated')

      this.cleanup().catch((error) => {
        console.error('Failed to cleanup temporary files:', error)
      })
    }

    // Setup cleanup on various process exit scenarios
    process.on('exit', cleanup)
    process.on('SIGINT', cleanup)
    process.on('SIGTERM', cleanup)
    process.on('uncaughtException', (error) => {
      this.logger.error('secure-file-manager', 'Uncaught exception during cleanup', error)
      cleanup()
    })

    this.logger.info('secure-file-manager', 'Process cleanup handlers registered')
  }

  /**
   * Generate secure filename with validation
   * @param baseName Base name for the file
   * @param extension File extension (with dot)
   * @returns Secure filename
   */
  generateSecureFileName(baseName?: string, extension?: string): string {
    const sanitizedBase = baseName
      ? this.securityManager.sanitizeFilename(baseName)
      : 'gemini-image'

    const safeExtension = extension || '.png'
    const timestamp = Date.now()
    const random = Math.floor(Math.random() * 1000)

    return `${sanitizedBase}-${timestamp}-${random}${safeExtension}`
  }

  /**
   * Get count of tracked temporary files
   * @returns Number of temporary files being tracked
   */
  getTempFileCount(): number {
    return this.tempFiles.size
  }

  /**
   * Check if a specific temporary file is being tracked
   * @param filePath Path to check
   * @returns True if file is being tracked as temporary
   */
  isTempFileTracked(filePath: string): boolean {
    return this.tempFiles.has(filePath)
  }
}
