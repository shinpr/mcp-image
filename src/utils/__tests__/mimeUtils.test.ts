import { afterEach, describe, expect, it, vi } from 'vitest'
import { expectString } from '../../tests/helpers/inspect'
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
    it('contains exactly the supported MIME types', () => {
      expect(new Set(SUPPORTED_MIME_TYPES)).toEqual(
        new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp'])
      )
    })
  })

  describe('SUPPORTED_EXTENSIONS', () => {
    it('contains exactly the supported extensions', () => {
      expect(new Set(SUPPORTED_EXTENSIONS)).toEqual(
        new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp'])
      )
    })
  })

  describe('getExtensionFromMimeType', () => {
    it.each([
      ['image/jpeg', '.jpg'],
      ['image/png', '.png'],
      ['image/webp', '.webp'],
      ['image/gif', '.gif'],
      ['image/bmp', '.bmp'],
    ])('maps %s to %s', (mimeType, extension) => {
      expect(getExtensionFromMimeType(mimeType)).toBe(extension)
    })

    it('should return .png with warning log for unknown MIME type', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const result = getExtensionFromMimeType('image/tiff')

      expect(result).toBe('.png')
      expect(consoleErrorSpy).toHaveBeenCalled()
      const logOutput = expectString(
        consoleErrorSpy.mock.calls[0]?.[0],
        'first console.error argument'
      )
      expect(logOutput).toContain('warn')
      expect(logOutput).toContain('image/tiff')
    })

    it('should return .png with warning log for empty string', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const result = getExtensionFromMimeType('')

      expect(result).toBe('.png')
      expect(consoleErrorSpy).toHaveBeenCalled()
    })
  })

  describe('getMimeTypeFromExtension', () => {
    it.each([
      ['.jpg', 'image/jpeg'],
      ['.jpeg', 'image/jpeg'],
      ['.png', 'image/png'],
      ['.webp', 'image/webp'],
      ['.gif', 'image/gif'],
      ['.bmp', 'image/bmp'],
    ])('maps %s to %s', (extension, mimeType) => {
      expect(getMimeTypeFromExtension(extension)).toBe(mimeType)
    })

    it('should return image/png for unknown extension', () => {
      const result = getMimeTypeFromExtension('.tiff')

      expect(result).toBe('image/png')
    })
  })

  describe('reconcileFileNameExtension', () => {
    it.each([
      ['photo', 'image/jpeg', 'photo.jpg'],
      ['screenshot', 'image/png', 'screenshot.png'],
      ['artwork', 'image/webp', 'artwork.webp'],
    ])('reconciles %s and %s to %s', (fileName, mimeType, expected) => {
      expect(reconcileFileNameExtension(fileName, mimeType)).toBe(expected)
    })

    it('should preserve existing correct extension', () => {
      const result = reconcileFileNameExtension('photo.jpg', 'image/jpeg')

      expect(result).toBe('photo.jpg')
    })

    it('should replace a recognized extension when it does not match the actual MIME type', () => {
      const result = reconcileFileNameExtension('photo.png', 'image/jpeg')

      expect(result).toBe('photo.jpg')
    })

    it('should treat an unrecognized dotted suffix as part of the basename', () => {
      expect(reconcileFileNameExtension('banner.v2', 'image/png')).toBe('banner.v2.png')
    })

    it('should preserve or replace uppercase extensions based on the actual MIME type', () => {
      expect(reconcileFileNameExtension('photo.JPG', 'image/jpeg')).toBe('photo.JPG')
      expect(reconcileFileNameExtension('photo.PNG', 'image/jpeg')).toBe('photo.jpg')
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
    it.each(['image/jpeg', 'image/png', 'image/webp'])('preserves supported %s', (mimeType) => {
      expect(normalizeMimeType(mimeType)).toBe(mimeType)
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
