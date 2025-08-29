/**
 * Tests for Security Manager
 * Covers file path sanitization, validation, and security checks
 */

import * as path from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { SecurityError } from '../errors'
import { SecurityManager } from '../security'

describe('SecurityManager', () => {
  let securityManager: SecurityManager

  beforeEach(() => {
    securityManager = new SecurityManager()
  })

  describe('file path sanitization', () => {
    it('should sanitize valid relative path', () => {
      // Arrange
      const inputPath = './output/image.png'

      // Act
      const result = securityManager.sanitizeFilePath(inputPath)

      // Assert
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toContain('output')
        expect(result.data).toContain('image.png')
      }
    })

    it('should reject path with null byte', () => {
      // Arrange
      const inputPath = './output/image.png\0'

      // Act
      const result = securityManager.sanitizeFilePath(inputPath)

      // Assert
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBeInstanceOf(SecurityError)
        expect(result.error.message).toContain('Null byte detected')
        expect(result.error.code).toBe('SECURITY_ERROR')
      }
    })

    it('should reject path traversal attempt with ../', () => {
      // Arrange
      const inputPath = '../../../etc/passwd'

      // Act
      const result = securityManager.sanitizeFilePath(inputPath)

      // Assert
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBeInstanceOf(SecurityError)
        expect(result.error.message).toContain('Path traversal attempt')
        expect(result.error.code).toBe('SECURITY_ERROR')
      }
    })

    it('should reject path traversal attempt with ..\\', () => {
      // Arrange
      const inputPath = '..\\..\\secrets.txt'

      // Act
      const result = securityManager.sanitizeFilePath(inputPath)

      // Assert
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBeInstanceOf(SecurityError)
        expect(result.error.message).toContain('Path traversal attempt')
      }
    })

    it('should reject path outside allowed directories', () => {
      // Arrange
      const inputPath = '/var/log/system.log'

      // Act
      const result = securityManager.sanitizeFilePath(inputPath)

      // Assert
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBeInstanceOf(SecurityError)
        expect(result.error.message).toContain('File path outside allowed directories')
        expect(result.error.suggestion).toContain('allowed directories')
      }
    })

    it('should allow path within current working directory', () => {
      // Arrange
      const inputPath = './temp/output.png'

      // Act
      const result = securityManager.sanitizeFilePath(inputPath)

      // Assert
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toContain(process.cwd())
      }
    })

    it('should allow path within temp directory', () => {
      // Arrange
      const tempPath = path.join('/tmp', 'test-image.png')

      // Act
      const result = securityManager.sanitizeFilePath(tempPath)

      // Assert
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe(tempPath)
      }
    })

    it('should handle complex path traversal attempts', () => {
      // Arrange
      const inputPath = './output/../../../root/.ssh/id_rsa'

      // Act
      const result = securityManager.sanitizeFilePath(inputPath)

      // Assert
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.message).toContain('Path traversal attempt')
      }
    })

    it('should handle mixed separators in path traversal', () => {
      // Arrange
      const inputPath = './output\\..\\..\\secrets'

      // Act
      const result = securityManager.sanitizeFilePath(inputPath)

      // Assert
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.message).toContain('Path traversal attempt')
      }
    })
  })

  describe('image file validation', () => {
    it('should validate PNG file extension', () => {
      // Arrange
      const filePath = './output/image.png'

      // Act
      const result = securityManager.validateImageFile(filePath)

      // Assert
      expect(result.success).toBe(true)
    })

    it('should validate JPEG file extension', () => {
      // Arrange
      const filePath = './output/image.jpeg'

      // Act
      const result = securityManager.validateImageFile(filePath)

      // Assert
      expect(result.success).toBe(true)
    })

    it('should validate JPG file extension', () => {
      // Arrange
      const filePath = './output/image.jpg'

      // Act
      const result = securityManager.validateImageFile(filePath)

      // Assert
      expect(result.success).toBe(true)
    })

    it('should validate WebP file extension', () => {
      // Arrange
      const filePath = './output/image.webp'

      // Act
      const result = securityManager.validateImageFile(filePath)

      // Assert
      expect(result.success).toBe(true)
    })

    it('should reject unsupported file extension', () => {
      // Arrange
      const filePath = './output/document.pdf'

      // Act
      const result = securityManager.validateImageFile(filePath)

      // Assert
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBeInstanceOf(SecurityError)
        expect(result.error.message).toContain('Unsupported file extension: .pdf')
        expect(result.error.suggestion).toContain('supported file extensions')
      }
    })

    it('should reject executable file extension', () => {
      // Arrange
      const filePath = './output/malware.exe'

      // Act
      const result = securityManager.validateImageFile(filePath)

      // Assert
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.message).toContain('Unsupported file extension: .exe')
      }
    })

    it('should handle case insensitive extensions', () => {
      // Arrange
      const filePath = './output/IMAGE.PNG'

      // Act
      const result = securityManager.validateImageFile(filePath)

      // Assert
      expect(result.success).toBe(true)
    })

    it('should reject files without extensions', () => {
      // Arrange
      const filePath = './output/imagefile'

      // Act
      const result = securityManager.validateImageFile(filePath)

      // Assert
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.message).toContain('Unsupported file extension:')
      }
    })

    it('should handle multiple dots in filename', () => {
      // Arrange
      const filePath = './output/image.backup.png'

      // Act
      const result = securityManager.validateImageFile(filePath)

      // Assert
      expect(result.success).toBe(true)
    })
  })

  describe('security error handling', () => {
    it('should provide helpful error messages for null byte attacks', () => {
      // Arrange
      const inputPath = 'image.png\0.exe'

      // Act
      const result = securityManager.sanitizeFilePath(inputPath)

      // Assert
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.message).toBe('Null byte detected in file path')
        expect(result.error.suggestion).toBe('Ensure your request meets security requirements')
      }
    })

    it('should provide helpful error messages for path traversal', () => {
      // Arrange
      const inputPath = '../sensitive/file.txt'

      // Act
      const result = securityManager.sanitizeFilePath(inputPath)

      // Assert
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.message).toBe('Path traversal attempt detected')
        expect(result.error.suggestion).toBe('Use valid file paths within allowed directories only')
      }
    })
  })
})
