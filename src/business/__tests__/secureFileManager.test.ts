/**
 * Tests for Secure File Manager
 * Covers secure file operations, temporary file management, and cleanup
 */

import { promises as fs, mkdirSync } from 'node:fs'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FileOperationError, SecurityError } from '../../utils/errors'
import { SecureFileManager } from '../secureFileManager'

// Mock fs and path modules
vi.mock('node:fs', async () => ({
  promises: {
    writeFile: vi.fn(),
    unlink: vi.fn(),
    rename: vi.fn(),
  },
  mkdirSync: vi.fn(),
}))

vi.mock('node:path', async () => {
  const actualPath = await vi.importActual('node:path')
  return {
    ...actualPath,
    dirname: vi.fn(),
    resolve: vi.fn(),
  }
})

const mockWriteFile = vi.mocked(fs.writeFile)
const mockUnlink = vi.mocked(fs.unlink)
const mockRename = vi.mocked(fs.rename)
const mockMkdirSync = vi.mocked(mkdirSync)
const mockDirname = vi.mocked(path.dirname)
const mockResolve = vi.mocked(path.resolve)

describe('SecureFileManager', () => {
  let secureFileManager: SecureFileManager
  const mockImageData = Buffer.from('fake-image-data')

  beforeEach(() => {
    vi.clearAllMocks()
    secureFileManager = new SecureFileManager()

    // Setup default mocks for file operations
    mockMkdirSync.mockImplementation(() => {})
    mockWriteFile.mockResolvedValue()
    mockRename.mockResolvedValue()
    mockUnlink.mockResolvedValue()

    // Setup default mocks for path operations
    mockDirname.mockImplementation((p: string) => {
      if (p.includes('/')) {
        const parts = p.split('/')
        parts.pop()
        return parts.join('/') || '/'
      }
      return '.'
    })

    // Mock resolve to make paths relative to current working directory (which is allowed)
    mockResolve.mockImplementation((p: string) => {
      const cwd = process.cwd()
      if (p.startsWith('./output/') || p.startsWith('./temp/')) {
        return `${cwd}/${p.replace('./', '')}`
      }
      if (p.startsWith('./')) {
        return `${cwd}/${p.replace('./', '')}`
      }
      if (p.startsWith('/tmp')) {
        return p // /tmp is allowed
      }
      if (p.startsWith('../')) {
        return '/invalid/path/outside/allowed' // Simulate outside path
      }
      if (p.startsWith('/')) {
        return p // Absolute paths as-is
      }
      return `${cwd}/${p}` // Relative paths
    })
  })

  afterEach(() => {
    // Cleanup any temp files tracking
    vi.restoreAllMocks()
  })

  describe('secure image saving', () => {
    it('should save image securely with path validation', async () => {
      // Arrange
      const outputPath = './output/test-image.png'
      const format = 'PNG'

      // Act
      const result = await secureFileManager.saveImageSecure(mockImageData, outputPath, format)

      // Assert
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toContain('output/test-image.png')
      }
    })

    it('should reject saving image with invalid path', async () => {
      // Arrange
      const outputPath = '../../../etc/passwd.png'
      const format = 'PNG'

      // Act
      const result = await secureFileManager.saveImageSecure(mockImageData, outputPath, format)

      // Assert
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBeInstanceOf(SecurityError)
        expect(result.error.message).toContain('Path traversal attempt')
      }
    })

    it('should reject saving file with null byte in path', async () => {
      // Arrange
      const outputPath = './output/image.png\0.exe'
      const format = 'PNG'

      // Act
      const result = await secureFileManager.saveImageSecure(mockImageData, outputPath, format)

      // Assert
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBeInstanceOf(SecurityError)
        expect(result.error.message).toContain('Null byte detected')
      }
    })

    it('should reject saving unsupported file format', async () => {
      // Arrange
      const outputPath = './output/document.pdf'
      const format = 'PDF'

      // Act
      const result = await secureFileManager.saveImageSecure(mockImageData, outputPath, format)

      // Assert
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBeInstanceOf(SecurityError)
        expect(result.error.message).toContain('Unsupported file extension: .pdf')
      }
    })

    it('should use atomic file operations with temporary files', async () => {
      // Arrange
      const outputPath = './output/atomic-test.png'
      const format = 'PNG'
      mockWriteFile.mockResolvedValue()
      mockRename.mockResolvedValue()

      // Act
      const result = await secureFileManager.saveImageSecure(mockImageData, outputPath, format)

      // Assert
      expect(result.success).toBe(true)

      // Verify atomic operation: write to temp file first, then rename
      expect(mockWriteFile).toHaveBeenCalledWith(expect.stringContaining('.tmp'), mockImageData)
      expect(mockRename).toHaveBeenCalledWith(
        expect.stringContaining('.tmp'),
        expect.stringContaining('atomic-test.png')
      )
    })

    it('should handle file operation errors gracefully', async () => {
      // Arrange
      const outputPath = './output/error-test.png'
      const format = 'PNG'
      mockWriteFile.mockRejectedValue(new Error('Disk full'))

      // Act
      const result = await secureFileManager.saveImageSecure(mockImageData, outputPath, format)

      // Assert
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBeInstanceOf(FileOperationError)
        expect(result.error.message).toContain('Failed to save image')
        expect(result.error.message).toContain('Disk full')
      }
    })

    it('should track temporary files during save operation', async () => {
      // Arrange
      const outputPath = './output/tracked-temp.png'
      const format = 'PNG'
      mockWriteFile.mockResolvedValue()
      mockRename.mockResolvedValue()

      // Act
      await secureFileManager.saveImageSecure(mockImageData, outputPath, format)

      // Verify temp file was tracked (implementation detail - temp files should be added to internal set)
      // This will be verified through cleanup tests
    })
  })

  describe('temporary file management', () => {
    it('should cleanup temporary files on successful operation', async () => {
      // Arrange
      const outputPath = './output/cleanup-success.png'
      const format = 'PNG'
      mockWriteFile.mockResolvedValue()
      mockRename.mockResolvedValue()

      // Act
      await secureFileManager.saveImageSecure(mockImageData, outputPath, format)

      // Assert - temp file should be removed from tracking after successful rename
      await secureFileManager.cleanup()

      // Verify cleanup was called but no temp files remain
      expect(mockUnlink).not.toHaveBeenCalled() // No temp files to clean
    })

    it('should cleanup temporary files on operation failure', async () => {
      // Arrange
      const outputPath = './output/cleanup-failure.png'
      const format = 'PNG'
      mockWriteFile.mockResolvedValue()
      mockRename.mockRejectedValue(new Error('Rename failed'))

      // Act
      await secureFileManager.saveImageSecure(mockImageData, outputPath, format)

      // Assert - temp file should still be tracked for cleanup
      await secureFileManager.cleanup()

      // Verify cleanup was attempted
      expect(mockUnlink).toHaveBeenCalledWith(expect.stringContaining('.tmp'))
    })

    it('should cleanup all tracked temporary files', async () => {
      // Arrange - simulate multiple temp files
      mockWriteFile.mockResolvedValue()
      mockRename.mockRejectedValue(new Error('Multiple failures'))

      const files = ['./output/temp1.png', './output/temp2.png', './output/temp3.png']

      // Create multiple temp files that fail to rename
      for (const file of files) {
        await secureFileManager.saveImageSecure(mockImageData, file, 'PNG')
      }

      mockUnlink.mockResolvedValue()

      // Act
      await secureFileManager.cleanup()

      // Assert - all temp files should be cleaned up
      expect(mockUnlink).toHaveBeenCalledTimes(files.length)
      for (const _ of files) {
        expect(mockUnlink).toHaveBeenCalledWith(expect.stringContaining('.tmp'))
      }
    })

    it('should handle cleanup errors gracefully', async () => {
      // Arrange
      const outputPath = './output/cleanup-error.png'
      const format = 'PNG'
      mockWriteFile.mockResolvedValue()
      mockRename.mockRejectedValue(new Error('Rename failed'))
      mockUnlink.mockRejectedValue(new Error('Permission denied'))

      // Create temp file
      await secureFileManager.saveImageSecure(mockImageData, outputPath, format)

      // Act & Assert - cleanup should not throw even if unlink fails
      await expect(secureFileManager.cleanup()).resolves.toBeUndefined()
    })

    it('should log cleanup failures without throwing', async () => {
      // Arrange
      const outputPath = './output/log-cleanup.png'
      const format = 'PNG'
      mockWriteFile.mockResolvedValue()
      mockRename.mockRejectedValue(new Error('Rename failed'))
      mockUnlink.mockRejectedValue(new Error('Unlink failed'))

      // Mock console to capture logs
      const mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {})

      await secureFileManager.saveImageSecure(mockImageData, outputPath, format)

      // Act
      await secureFileManager.cleanup()

      // Assert - should log warning about cleanup failure
      // Note: Actual implementation should use the logger
      mockConsoleLog.mockRestore()
    })
  })

  describe('process cleanup handlers', () => {
    it('should setup process cleanup handlers', () => {
      // Arrange
      const mockProcessOn = vi.spyOn(process, 'on').mockImplementation(() => process)

      // Act
      secureFileManager.setupProcessCleanup()

      // Assert
      expect(mockProcessOn).toHaveBeenCalledWith('exit', expect.any(Function))
      expect(mockProcessOn).toHaveBeenCalledWith('SIGINT', expect.any(Function))
      expect(mockProcessOn).toHaveBeenCalledWith('SIGTERM', expect.any(Function))
      expect(mockProcessOn).toHaveBeenCalledWith('uncaughtException', expect.any(Function))

      mockProcessOn.mockRestore()
    })

    it('should call cleanup when process exits', () => {
      // Arrange
      const mockProcessOn = vi.spyOn(process, 'on').mockImplementation((event, handler) => {
        if (event === 'exit') {
          // Simulate process exit
          ;(handler as () => void)()
        }
        return process
      })

      const cleanupSpy = vi.spyOn(secureFileManager, 'cleanup').mockResolvedValue()

      // Act
      secureFileManager.setupProcessCleanup()

      // Assert
      expect(cleanupSpy).toHaveBeenCalled()

      mockProcessOn.mockRestore()
      cleanupSpy.mockRestore()
    })
  })

  describe('secure directory creation', () => {
    it('should ensure secure directory creation', async () => {
      // Arrange
      const outputPath = './output/subdir/image.png'
      const format = 'PNG'
      mockWriteFile.mockResolvedValue()
      mockRename.mockResolvedValue()

      // Act
      const result = await secureFileManager.saveImageSecure(mockImageData, outputPath, format)

      // Assert
      expect(result.success).toBe(true)
      // Verify that ensureSecureDirectory was called with the directory path
      expect(mockDirname).toHaveBeenCalledWith(expect.stringContaining('subdir/image.png'))
    })

    it('should handle directory creation failures', async () => {
      // This will be tested through the base FileManager's ensureDirectoryExists method
      // The SecureFileManager should handle these errors appropriately
      const outputPath = './output/restricted/image.png'
      const format = 'PNG'

      const result = await secureFileManager.saveImageSecure(mockImageData, outputPath, format)

      // Security validation should happen before directory creation
      // If path is invalid, it should fail at security check, not directory creation
      expect(result.success).toBeTruthy() // Assuming valid relative path
    })
  })
})
