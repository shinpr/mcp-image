/**
 * Tests for mimeUtils utility
 * Covers MIME-to-extension mapping, extension-to-MIME mapping,
 * extension detection, and extension ensurance for filenames
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ensureExtension,
  getExtensionFromMimeType,
  getMimeTypeFromExtension,
  hasImageExtension,
  SUPPORTED_EXTENSIONS,
  SUPPORTED_MIME_TYPES,
} from '../mimeUtils'

describe('mimeUtils', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('SUPPORTED_MIME_TYPES', () => {
    it('should contain all 5 supported MIME types', () => {
      // Assert
      expect(SUPPORTED_MIME_TYPES).toContain('image/jpeg')
      expect(SUPPORTED_MIME_TYPES).toContain('image/png')
      expect(SUPPORTED_MIME_TYPES).toContain('image/webp')
      expect(SUPPORTED_MIME_TYPES).toContain('image/gif')
      expect(SUPPORTED_MIME_TYPES).toContain('image/bmp')
      expect(SUPPORTED_MIME_TYPES).toHaveLength(5)
    })
  })

  describe('SUPPORTED_EXTENSIONS', () => {
    it('should contain all supported extensions', () => {
      // Assert
      expect(SUPPORTED_EXTENSIONS).toContain('.jpg')
      expect(SUPPORTED_EXTENSIONS).toContain('.jpeg')
      expect(SUPPORTED_EXTENSIONS).toContain('.png')
      expect(SUPPORTED_EXTENSIONS).toContain('.webp')
      expect(SUPPORTED_EXTENSIONS).toContain('.gif')
      expect(SUPPORTED_EXTENSIONS).toContain('.bmp')
    })
  })

  describe('getExtensionFromMimeType', () => {
    it('should map image/jpeg to .jpg', () => {
      // Act
      const result = getExtensionFromMimeType('image/jpeg')

      // Assert
      expect(result).toBe('.jpg')
    })

    it('should map image/png to .png', () => {
      // Act
      const result = getExtensionFromMimeType('image/png')

      // Assert
      expect(result).toBe('.png')
    })

    it('should map image/webp to .webp', () => {
      // Act
      const result = getExtensionFromMimeType('image/webp')

      // Assert
      expect(result).toBe('.webp')
    })

    it('should map image/gif to .gif', () => {
      // Act
      const result = getExtensionFromMimeType('image/gif')

      // Assert
      expect(result).toBe('.gif')
    })

    it('should map image/bmp to .bmp', () => {
      // Act
      const result = getExtensionFromMimeType('image/bmp')

      // Assert
      expect(result).toBe('.bmp')
    })

    it('should return .png with warning log for unknown MIME type', () => {
      // Arrange
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      // Act
      const result = getExtensionFromMimeType('image/tiff')

      // Assert
      expect(result).toBe('.png')
      expect(consoleErrorSpy).toHaveBeenCalled()
      const logOutput = consoleErrorSpy.mock.calls[0]?.[0] as string
      expect(logOutput).toContain('warn')
      expect(logOutput).toContain('image/tiff')
    })
  })

  describe('getMimeTypeFromExtension', () => {
    it('should map .jpg to image/jpeg', () => {
      // Act
      const result = getMimeTypeFromExtension('.jpg')

      // Assert
      expect(result).toBe('image/jpeg')
    })

    it('should map .jpeg to image/jpeg', () => {
      // Act
      const result = getMimeTypeFromExtension('.jpeg')

      // Assert
      expect(result).toBe('image/jpeg')
    })

    it('should map .png to image/png', () => {
      // Act
      const result = getMimeTypeFromExtension('.png')

      // Assert
      expect(result).toBe('image/png')
    })

    it('should map .webp to image/webp', () => {
      // Act
      const result = getMimeTypeFromExtension('.webp')

      // Assert
      expect(result).toBe('image/webp')
    })

    it('should map .gif to image/gif', () => {
      // Act
      const result = getMimeTypeFromExtension('.gif')

      // Assert
      expect(result).toBe('image/gif')
    })

    it('should map .bmp to image/bmp', () => {
      // Act
      const result = getMimeTypeFromExtension('.bmp')

      // Assert
      expect(result).toBe('image/bmp')
    })

    it('should return image/png for unknown extension', () => {
      // Act
      const result = getMimeTypeFromExtension('.tiff')

      // Assert
      expect(result).toBe('image/png')
    })
  })

  describe('hasImageExtension', () => {
    it('should return true for .png', () => {
      expect(hasImageExtension('photo.png')).toBe(true)
    })

    it('should return true for .jpg', () => {
      expect(hasImageExtension('photo.jpg')).toBe(true)
    })

    it('should return true for .jpeg', () => {
      expect(hasImageExtension('photo.jpeg')).toBe(true)
    })

    it('should return true for .webp', () => {
      expect(hasImageExtension('photo.webp')).toBe(true)
    })

    it('should return true for .gif', () => {
      expect(hasImageExtension('photo.gif')).toBe(true)
    })

    it('should return true for .bmp', () => {
      expect(hasImageExtension('photo.bmp')).toBe(true)
    })

    it('should return false for no extension', () => {
      expect(hasImageExtension('photo')).toBe(false)
    })

    it('should return false for .txt', () => {
      expect(hasImageExtension('document.txt')).toBe(false)
    })
  })

  describe('ensureExtension', () => {
    it('should add extension when filename has none', () => {
      // Act
      const result = ensureExtension('photo', 'image/jpeg')

      // Assert
      expect(result).toBe('photo.jpg')
    })

    it('should preserve existing correct extension', () => {
      // Act
      const result = ensureExtension('photo.jpg', 'image/jpeg')

      // Assert
      expect(result).toBe('photo.jpg')
    })

    it('should preserve existing extension even if different from MIME type', () => {
      // Act
      const result = ensureExtension('photo.png', 'image/jpeg')

      // Assert
      expect(result).toBe('photo.png')
    })

    it('should add extension for image/png when filename has no extension', () => {
      // Act
      const result = ensureExtension('screenshot', 'image/png')

      // Assert
      expect(result).toBe('screenshot.png')
    })

    it('should add extension for image/webp when filename has no extension', () => {
      // Act
      const result = ensureExtension('artwork', 'image/webp')

      // Assert
      expect(result).toBe('artwork.webp')
    })
  })
})
