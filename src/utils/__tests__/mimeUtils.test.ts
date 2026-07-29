/**
 * Tests for mimeUtils utility
 * Covers MIME-to-extension mapping, extension-to-MIME mapping,
 * extension detection, and extension ensurance for filenames
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getExtensionFromMimeType,
  getMimeTypeForOutputFormat,
  getMimeTypeFromExtension,
  matchesImageDataMimeType,
  normalizeMimeType,
  reconcileFileNameExtension,
  resolvePreferredOutputFormat,
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

    it('should return .png with warning log for empty string', () => {
      // Arrange
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      // Act
      const result = getExtensionFromMimeType('')

      // Assert
      expect(result).toBe('.png')
      expect(consoleErrorSpy).toHaveBeenCalled()
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

  describe('reconcileFileNameExtension', () => {
    it('should add extension when filename has none', () => {
      // Act
      const result = reconcileFileNameExtension('photo', 'image/jpeg')

      // Assert
      expect(result).toBe('photo.jpg')
    })

    it('should preserve existing correct extension', () => {
      // Act
      const result = reconcileFileNameExtension('photo.jpg', 'image/jpeg')

      // Assert
      expect(result).toBe('photo.jpg')
    })

    it('should replace a recognized extension when it does not match the actual MIME type', () => {
      // Act
      const result = reconcileFileNameExtension('photo.png', 'image/jpeg')

      // Assert
      expect(result).toBe('photo.jpg')
    })

    it('should treat an unrecognized dotted suffix as part of the basename', () => {
      expect(reconcileFileNameExtension('banner.v2', 'image/png')).toBe('banner.v2.png')
    })

    it('should preserve or replace uppercase extensions based on the actual MIME type', () => {
      expect(reconcileFileNameExtension('photo.JPG', 'image/jpeg')).toBe('photo.JPG')
      expect(reconcileFileNameExtension('photo.PNG', 'image/jpeg')).toBe('photo.jpg')
    })

    it('should add extension for image/png when filename has no extension', () => {
      // Act
      const result = reconcileFileNameExtension('screenshot', 'image/png')

      // Assert
      expect(result).toBe('screenshot.png')
    })

    it('should add extension for image/webp when filename has no extension', () => {
      // Act
      const result = reconcileFileNameExtension('artwork', 'image/webp')

      // Assert
      expect(result).toBe('artwork.webp')
    })
  })

  describe('output format preference', () => {
    it.each([
      [undefined, undefined],
      ['', undefined],
      ['photo', undefined],
      ['banner.v2', undefined],
      ['my.photo', undefined],
      ['2026.07.29-banner', undefined],
      ['photo.png', 'png'],
      ['photo.PNG', 'png'],
      ['photo.jpg', 'jpeg'],
      ['photo.JPEG', 'jpeg'],
      ['photo.webp', undefined],
    ] as const)('resolves %s to %s', (fileName, expected) => {
      expect(resolvePreferredOutputFormat(fileName)).toBe(expected)
    })

    it('maps output formats to their exact MIME types', () => {
      expect(getMimeTypeForOutputFormat('png')).toBe('image/png')
      expect(getMimeTypeForOutputFormat('jpeg')).toBe('image/jpeg')
    })

    it('matches PNG and JPEG signatures', () => {
      const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
      const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0])

      expect(matchesImageDataMimeType(png, 'image/png')).toBe(true)
      expect(matchesImageDataMimeType(jpeg, 'image/jpeg')).toBe(true)
      expect(matchesImageDataMimeType(png, 'image/jpeg')).toBe(false)
      expect(matchesImageDataMimeType(Buffer.from('not-an-image'), 'image/png')).toBe(false)
    })
  })

  describe('normalizeMimeType', () => {
    it('should return supported MIME type as-is', () => {
      expect(normalizeMimeType('image/jpeg')).toBe('image/jpeg')
      expect(normalizeMimeType('image/png')).toBe('image/png')
      expect(normalizeMimeType('image/webp')).toBe('image/webp')
    })

    it('should return image/png for unknown MIME type', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const result = normalizeMimeType('image/tiff')

      expect(result).toBe('image/png')
      expect(consoleErrorSpy).toHaveBeenCalled()
    })

    it('should return image/png for empty string', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const result = normalizeMimeType('')

      expect(result).toBe('image/png')
      expect(consoleErrorSpy).toHaveBeenCalled()
    })
  })
})
