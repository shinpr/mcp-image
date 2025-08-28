/**
 * File Manager for handling image file operations
 * Provides functionality for saving images and managing directories
 */

import { promises as fs, mkdirSync } from 'node:fs'
import * as path from 'node:path'
import type { Result } from '../types/result'
import { Err, Ok } from '../types/result'
import { FileOperationError } from '../utils/errors'

// Constants for file naming and error messages
const FILE_NAME_PREFIX = 'image' as const
const DEFAULT_EXTENSION = '.png' as const
const RANDOM_RANGE = 1000 as const

const ERROR_MESSAGES = {
  SAVE_FAILED: 'Failed to save image file',
  DIRECTORY_CREATION_FAILED: 'Failed to create directory',
  PERMISSION_SUGGESTION: 'Check output directory permissions and disk space',
  PATH_SUGGESTION: 'Check directory path validity and write permissions',
} as const

/**
 * Manages file operations for image generation
 * Handles saving images, creating directories, and file naming
 */
export class FileManager {
  /**
   * Saves image data to the specified file path
   * @param imageData Buffer containing the image data
   * @param outputPath Absolute path where the image should be saved
   * @param format Image format (used for validation)
   * @returns Result containing the saved file path or an error
   */
  async saveImage(
    imageData: Buffer,
    outputPath: string,
    _format?: string
  ): Promise<Result<string, FileOperationError>> {
    try {
      // Ensure the directory exists
      const directory = path.dirname(outputPath)
      const dirResult = this.ensureDirectoryExists(directory)
      if (!dirResult.success) {
        return Err(dirResult.error)
      }

      // Save the file
      await fs.writeFile(outputPath, imageData)

      return Ok(outputPath)
    } catch (error) {
      return Err(
        new FileOperationError(
          `${ERROR_MESSAGES.SAVE_FAILED}: ${error instanceof Error ? error.message : 'Unknown error'}`
        )
      )
    }
  }

  /**
   * Ensures that the specified directory exists, creating it if necessary
   * @param dirPath Path to the directory
   * @returns Result indicating success or failure
   */
  ensureDirectoryExists(dirPath: string): Result<void, FileOperationError> {
    try {
      // Use mkdirSync with recursive option to create all necessary parent directories
      mkdirSync(dirPath, { recursive: true })
      return Ok(undefined)
    } catch (error) {
      return Err(
        new FileOperationError(
          `${ERROR_MESSAGES.DIRECTORY_CREATION_FAILED}: ${error instanceof Error ? error.message : 'Unknown error'}`
        )
      )
    }
  }

  /**
   * Generates a unique filename based on timestamp and random component
   * @returns Generated filename in the format: gemini-image-{timestamp}.png
   */
  generateFileName(): string {
    const timestamp = Date.now()
    const random = Math.floor(Math.random() * RANDOM_RANGE)
    return `${FILE_NAME_PREFIX}-${timestamp}-${random}${DEFAULT_EXTENSION}`
  }
}
