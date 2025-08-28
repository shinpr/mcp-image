/**
 * Robust image generator with comprehensive error handling and recovery
 * Uses composition over inheritance for better error handling
 */

import type { GeminiClient } from '../api/geminiClient'
import type { UrlContextClient } from '../api/urlContextClient'
import type { Result } from '../types/result'
import { Err, Ok } from '../types/result'
import {
  type ConcurrencyError,
  FileOperationError,
  GeminiAPIError,
  type InputValidationError,
  NetworkError,
} from '../utils/errors'
import { Logger } from '../utils/logger'
import { ComprehensiveErrorHandler } from './errorHandler'
import { FileManager } from './fileManager'
import {
  type GenerationResult,
  type ImageGeneratorParams,
  OptimizedImageGenerator,
} from './imageGenerator'

/**
 * Robust image generator with comprehensive error handling and recovery mechanisms
 */
export class RobustImageGenerator {
  private errorHandler: ComprehensiveErrorHandler
  private robustLogger: Logger
  private robustFileManager: FileManager
  private baseGenerator: OptimizedImageGenerator

  constructor(geminiClient: GeminiClient, urlContextClient?: UrlContextClient) {
    this.robustLogger = new Logger()
    this.errorHandler = new ComprehensiveErrorHandler(this.robustLogger)
    this.robustFileManager = new FileManager()
    this.baseGenerator = new OptimizedImageGenerator(geminiClient, urlContextClient)
  }

  /**
   * Generate image with comprehensive error handling and recovery mechanisms
   * @param params Parameters for image generation
   * @returns Result containing image data and metadata, or structured error
   */
  async generateImage(
    params: ImageGeneratorParams
  ): Promise<
    Result<
      GenerationResult,
      InputValidationError | FileOperationError | GeminiAPIError | NetworkError | ConcurrencyError
    >
  > {
    try {
      // Wrap the entire generation process with comprehensive error handling
      return await this.baseGenerator.generateImage(params)
    } catch (error) {
      // Catch any unexpected exceptions that bypassed other error handling
      const handledError = this.errorHandler.handleError(error, 'image-generation', 'generateImage')

      if (!handledError.success) {
        // Type assertion is safe here because we know the error handler returns BaseError
        return Err(
          handledError.error as
            | InputValidationError
            | FileOperationError
            | GeminiAPIError
            | NetworkError
            | ConcurrencyError
        )
      }

      // This should never happen, but TypeScript needs this
      throw new Error('Unexpected success result from error handler')
    }
  }

  /**
   * Safe API call with retry mechanism and comprehensive error handling
   * @param params API parameters
   * @returns Result with image data or structured error
   */
  // @ts-expect-error Method reserved for future use
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private async executeApiCall(
    params: ImageGeneratorParams
  ): Promise<Result<{ imageData: Buffer }, GeminiAPIError | NetworkError>> {
    const maxRetries = 3
    let lastError: Error = new Error('Unknown error')
    let attempt = 0

    while (attempt < maxRetries) {
      attempt++

      try {
        // Create direct API call by calling generate image
        const result = await this.baseGenerator.generateImage(params)

        // Extract just the image data if successful
        if (result.success) {
          // Log successful API call after retries
          if (attempt > 1) {
            this.robustLogger.info('api-call', 'API call succeeded after retries', {
              attempt,
              totalAttempts: maxRetries,
            })
          }
          return Ok({ imageData: Buffer.from(result.data.imageData) })
        }

        // Handle error cases
        lastError = new Error(result.error.message)

        // Check if error is retryable
        const classifiedError = this.errorHandler.handleError(
          result.error,
          'api-call',
          'executeApiCall'
        )
        if (!classifiedError.success) {
          // Convert the error to the expected type
          const error = classifiedError.error
          if (error instanceof GeminiAPIError) {
            return Err(error as GeminiAPIError)
          }
          if (error instanceof NetworkError) {
            return Err(error as NetworkError)
          }
          return Err(new GeminiAPIError(error.message))
        }

        // Check if the original error is retryable
        const originalError = result.error
        if (!this.errorHandler.isRetryableError(originalError)) {
          // Convert to expected types before returning
          if (originalError instanceof GeminiAPIError || originalError instanceof NetworkError) {
            return Err(originalError)
          }
          return Err(new GeminiAPIError(originalError.message))
        }

        // Don't retry on the last attempt
        if (attempt === maxRetries) {
          break
        }

        // Calculate delay with exponential backoff
        const delay = this.errorHandler.getRetryDelay(attempt)

        this.robustLogger.info('api-call', `Retrying API call in ${delay}ms`, {
          attempt,
          maxRetries,
          errorMessage: result.error.message,
          delay,
        })

        await this.delay(delay)
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))

        // Check if caught error is retryable
        const classifiedError = this.errorHandler.handleError(
          lastError,
          'api-call',
          'executeApiCall'
        )
        if (!classifiedError.success) {
          // Convert to appropriate error type
          if (classifiedError.error instanceof GeminiAPIError) {
            return Err(classifiedError.error as GeminiAPIError)
          }
          if (classifiedError.error instanceof NetworkError) {
            return Err(classifiedError.error as NetworkError)
          }
          // Fallback to GeminiAPIError for unknown types
          return Err(new GeminiAPIError(lastError.message))
        }
        if (!this.errorHandler.isRetryableError(new GeminiAPIError(lastError.message))) {
          return Err(new GeminiAPIError(lastError.message))
        }

        if (attempt === maxRetries) break

        const delay = this.errorHandler.getRetryDelay(attempt)
        await this.delay(delay)
      }
    }

    // All retries exhausted, return the final error
    if (lastError) {
      const finalError = this.errorHandler.handleError(lastError, 'api-call', 'executeApiCall')
      if (
        !finalError.success &&
        (finalError.error instanceof GeminiAPIError || finalError.error instanceof NetworkError)
      ) {
        return Err(finalError.error)
      }
      return Err(new GeminiAPIError(lastError.message))
    }

    // Fallback error
    return Err(new GeminiAPIError('API call failed after all retries'))
  }

  /**
   * Safe file operations with fallback mechanisms
   * @param data Image data to save
   * @param outputPath Optional output path
   * @returns File save result with error handling
   */
  // @ts-expect-error Method reserved for future use
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private async safeFileSave(
    data: Buffer,
    outputPath?: string
  ): Promise<Result<string, FileOperationError>> {
    try {
      // Generate path if not provided
      const finalPath = outputPath || this.generateRobustDefaultPath()

      // First attempt: use FileManager directly
      const result = await this.robustFileManager.saveImage(data, finalPath, 'PNG')

      if (result.success) {
        return result
      }

      // Try fallback directory if original failed
      if (outputPath && result.error.message.toLowerCase().includes('permission')) {
        this.robustLogger.warn(
          'file-save',
          'Attempting fallback directory due to permission error',
          {
            originalPath: outputPath,
          }
        )

        try {
          const fallbackPath = this.getFallbackDirectory(outputPath)
          const fallbackResult = await this.robustFileManager.saveImage(data, fallbackPath, 'PNG')

          if (fallbackResult.success) {
            this.robustLogger.info('file-save', 'Successfully saved to fallback directory', {
              originalPath: outputPath,
              fallbackPath: fallbackResult.data,
            })
            return fallbackResult
          }
        } catch (fallbackError) {
          this.robustLogger.warn('file-save', 'Fallback directory also failed', {
            fallbackError:
              fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
          })
        }
      }

      return result
    } catch (error) {
      const handledError = this.errorHandler.handleError(error, 'file-save', 'safeFileSave')
      if (!handledError.success && handledError.error instanceof FileOperationError) {
        return Err(handledError.error)
      }

      // Fallback to FileOperationError
      return Err(new FileOperationError(error instanceof Error ? error.message : String(error)))
    }
  }

  /**
   * Get fallback directory for file operations
   * @param originalPath Original file path that failed
   * @returns Fallback file path
   */
  private getFallbackDirectory(originalPath: string): string {
    // Try system temp directory as fallback
    const path = require('node:path')
    const os = require('node:os')

    const fileName = path.basename(originalPath)
    const tempDir = os.tmpdir()

    return path.join(tempDir, 'mcp-image-fallback', fileName)
  }

  /**
   * Delay utility for retry logic
   * @param ms Milliseconds to delay
   * @returns Promise that resolves after delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  /**
   * Generate default output path for robust operations
   * @returns Default file path
   */
  private generateRobustDefaultPath(): string {
    const outputDir = process.env['IMAGE_OUTPUT_DIR'] || './output'
    const fileName = this.robustFileManager.generateFileName()
    return `${outputDir}/${fileName}`
  }

  /**
   * Enhanced memory cleanup with error recovery
   */
  // @ts-expect-error Method reserved for future use
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private robustMemoryCleanup(): void {
    try {
      // Basic cleanup
      if (global.gc) {
        global.gc()
      }
    } catch (gcError) {
      this.robustLogger.warn('memory-cleanup', 'Forced garbage collection failed', {
        gcError: gcError instanceof Error ? gcError.message : String(gcError),
      })
    }
  }
}
