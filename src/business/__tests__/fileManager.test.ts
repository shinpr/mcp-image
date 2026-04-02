/**
 * Test suite for FileManager
 * Tests file operations including saving images and directory management
 */

import { promises as fs } from 'node:fs'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
// Remove unused import - using .success property directly
import { FileOperationError } from '../../utils/errors'
import { createFileManager, type FileManager } from '../fileManager'

describe('FileManager', () => {
  let fileManager: FileManager
  const testOutputDir = path.join(process.cwd(), 'tmp', 'test-output')
  const testImageData = Buffer.from('fake-image-data')

  beforeEach(() => {
    fileManager = createFileManager()
  })

  afterEach(async () => {
    // Clean up test files
    try {
      await fs.rm(testOutputDir, { recursive: true })
    } catch {
      // Ignore cleanup errors
    }
  })

  describe('saveImage', () => {
    it('should save image data to specified path successfully', async () => {
      const outputPath = path.join(testOutputDir, 'test-image.png')

      const result = await fileManager.saveImage(testImageData, outputPath)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe(outputPath)
        // Verify file was actually created
        const savedData = await fs.readFile(outputPath)
        expect(savedData).toEqual(testImageData)
      }
    })

    it('should create directory automatically if it does not exist', async () => {
      const nestedPath = path.join(testOutputDir, 'nested', 'deep', 'test-image.png')

      const result = await fileManager.saveImage(testImageData, nestedPath)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe(nestedPath)
        // Verify file and directories were created
        const savedData = await fs.readFile(nestedPath)
        expect(savedData).toEqual(testImageData)
      }
    })

    it('should return FileOperationError when save fails due to invalid path', async () => {
      const invalidPath = '/invalid/\0/path/test.png'

      const result = await fileManager.saveImage(testImageData, invalidPath)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBeInstanceOf(FileOperationError)
        expect(result.error.code).toBe('FILE_OPERATION_ERROR')
        expect(result.error.message).toContain('Failed to create directory')
      }
    })
  })

  describe('ensureDirectoryExists', () => {
    it('should create directory successfully if it does not exist', () => {
      const newDirPath = path.join(testOutputDir, 'new-directory')

      const result = fileManager.ensureDirectoryExists(newDirPath)

      expect(result.success).toBe(true)
    })

    it('should succeed if directory already exists', async () => {
      await fs.mkdir(testOutputDir, { recursive: true })

      const result = fileManager.ensureDirectoryExists(testOutputDir)

      expect(result.success).toBe(true)
    })

    it('should return error for invalid directory path', () => {
      const invalidPath = '/invalid/\0/directory'

      const result = fileManager.ensureDirectoryExists(invalidPath)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBeInstanceOf(FileOperationError)
        expect(result.error.code).toBe('FILE_OPERATION_ERROR')
      }
    })
  })

  describe('generateFileName', () => {
    it('should generate timestamp-based filename with correct format', () => {
      const fileName = fileManager.generateFileName()

      expect(fileName).toMatch(/^image-\d{13}-[0-9a-f]{8}\.png$/)
    })

    it('should return .png extension when called without mimeType argument', () => {
      const fileName = fileManager.generateFileName()

      expect(fileName).toMatch(/^image-\d{13}-[0-9a-f]{8}\.png$/)
    })

    it('should return .jpg extension when mimeType is image/jpeg', () => {
      const fileName = fileManager.generateFileName('image/jpeg')

      expect(fileName).toMatch(/^image-\d{13}-[0-9a-f]{8}\.jpg$/)
    })

    it('should return .webp extension when mimeType is image/webp', () => {
      const fileName = fileManager.generateFileName('image/webp')

      expect(fileName).toMatch(/^image-\d{13}-[0-9a-f]{8}\.webp$/)
    })

    it('should return .png extension when mimeType is image/png', () => {
      const fileName = fileManager.generateFileName('image/png')

      expect(fileName).toMatch(/^image-\d{13}-[0-9a-f]{8}\.png$/)
    })

    it('should return .gif extension when mimeType is image/gif', () => {
      const fileName = fileManager.generateFileName('image/gif')

      expect(fileName).toMatch(/^image-\d{13}-[0-9a-f]{8}\.gif$/)
    })

    it('should return .bmp extension when mimeType is image/bmp', () => {
      const fileName = fileManager.generateFileName('image/bmp')

      expect(fileName).toMatch(/^image-\d{13}-[0-9a-f]{8}\.bmp$/)
    })

    it('should return .png extension as fallback for unknown mimeType', () => {
      const fileName = fileManager.generateFileName('image/unknown')

      expect(fileName).toMatch(/^image-\d{13}-[0-9a-f]{8}\.png$/)
    })
  })
})
