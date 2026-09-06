import { randomBytes } from 'node:crypto'
import { constants as fsConstants, mkdirSync } from 'node:fs'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import type { Result } from '../types/result.js'
import { Err, Ok } from '../types/result.js'
import { FileOperationError, InputValidationError, SecurityError } from '../utils/errors.js'
import {
  DEFAULT_MIME_TYPE,
  getExtensionFromMimeType,
  getMimeTypeFromExtension,
  SUPPORTED_EXTENSIONS,
} from '../utils/mimeUtils.js'
import { MAX_IMAGE_SIZE } from './inputValidator.js'

const FILE_NAME_PREFIX = 'image' as const
const RANDOM_BYTES_LENGTH = 4 as const

const ERROR_MESSAGES = {
  SAVE_FAILED: 'Failed to save image file',
  DIRECTORY_CREATION_FAILED: 'Failed to create directory',
} as const

const INPUT_IMAGE_OPEN_FLAGS =
  fsConstants.O_RDONLY |
  (typeof fsConstants.O_NONBLOCK === 'number' ? fsConstants.O_NONBLOCK : 0) |
  (typeof fsConstants.O_NOFOLLOW === 'number' ? fsConstants.O_NOFOLLOW : 0)

export interface InputImage {
  data: Buffer
  mimeType: string
}

function createInputImageSizeError(actualSize: number): InputValidationError {
  const sizeInMB = (actualSize / (1024 * 1024)).toFixed(1)
  const limitInMB = (MAX_IMAGE_SIZE / (1024 * 1024)).toFixed(1)
  return new InputValidationError(
    `Image size exceeds ${limitInMB}MB limit. Current size: ${sizeInMB}MB`,
    `Please compress your image or reduce its resolution to stay below ${limitInMB}MB`
  )
}

export async function readInputImage(inputPath: string): Promise<InputImage> {
  if (inputPath.includes('\0')) {
    throw new SecurityError('Null byte detected in file path')
  }
  if (inputPath.includes('..')) {
    throw new SecurityError('Path traversal attempt detected')
  }

  let realPath: string
  try {
    realPath = await fs.realpath(path.resolve(inputPath))
  } catch (error) {
    throw new SecurityError('File path cannot be resolved', { cause: error })
  }

  const extension = path.extname(realPath).toLowerCase()
  if (!SUPPORTED_EXTENSIONS.includes(extension)) {
    throw new SecurityError(`Unsupported file extension: ${extension}`)
  }

  const fileHandle = await fs.open(realPath, INPUT_IMAGE_OPEN_FLAGS)
  try {
    const stats = await fileHandle.stat()
    if (!stats.isFile()) {
      throw new InputValidationError(
        'Input image must be a regular file',
        'Please provide a path to a regular PNG, JPEG, or WebP image file'
      )
    }
    if (stats.size > MAX_IMAGE_SIZE) {
      throw createInputImageSizeError(stats.size)
    }

    const boundedBuffer = Buffer.alloc(MAX_IMAGE_SIZE + 1)
    let observedBytes = 0
    while (observedBytes < boundedBuffer.length) {
      const readLength = Math.min(64 * 1024, boundedBuffer.length - observedBytes)
      const { bytesRead } = await fileHandle.read(boundedBuffer, observedBytes, readLength, null)
      if (bytesRead === 0) {
        break
      }

      observedBytes += bytesRead
      if (observedBytes > MAX_IMAGE_SIZE) {
        throw createInputImageSizeError(observedBytes)
      }
    }

    return {
      data: boundedBuffer.subarray(0, observedBytes),
      mimeType: getMimeTypeFromExtension(extension),
    }
  } finally {
    await fileHandle.close()
  }
}

function ensureDirectoryExists(dirPath: string): Result<void, FileOperationError> {
  try {
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

export function generateFileName(mimeType?: string): string {
  const timestamp = Date.now()
  const random = randomBytes(RANDOM_BYTES_LENGTH).toString('hex')
  const extension = getExtensionFromMimeType(mimeType ?? DEFAULT_MIME_TYPE)
  return `${FILE_NAME_PREFIX}-${timestamp}-${random}${extension}`
}

export async function saveImage(
  imageData: Buffer,
  outputPath: string
): Promise<Result<string, FileOperationError>> {
  try {
    const directory = path.dirname(outputPath)
    const dirResult = ensureDirectoryExists(directory)
    if (!dirResult.success) {
      return Err(dirResult.error)
    }

    const fileHandle = await fs.open(
      outputPath,
      fsConstants.O_WRONLY |
        fsConstants.O_CREAT |
        fsConstants.O_TRUNC |
        (typeof fsConstants.O_NOFOLLOW === 'number' ? fsConstants.O_NOFOLLOW : 0)
    )
    try {
      await fileHandle.writeFile(imageData)
    } finally {
      await fileHandle.close()
    }
    return Ok(outputPath)
  } catch (error) {
    return Err(
      new FileOperationError(
        `${ERROR_MESSAGES.SAVE_FAILED}: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    )
  }
}
