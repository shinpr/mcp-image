import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SecurityError } from '../errors'
import { SecurityManager } from '../security'

describe('SecurityManager', () => {
  let securityManager: SecurityManager

  beforeEach(() => {
    securityManager = new SecurityManager()
  })

  describe('file path sanitization', () => {
    it('should reject path with null byte', () => {
      const inputPath = './output/image.png\0'

      const result = securityManager.sanitizeFilePath(inputPath)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBeInstanceOf(SecurityError)
        expect(result.error.message).toBe('Null byte detected in file path')
      }
    })

    it('should reject path traversal attempt with ../', () => {
      const inputPath = '../../../etc/passwd'

      const result = securityManager.sanitizeFilePath(inputPath)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBeInstanceOf(SecurityError)
        expect(result.error.message).toBe('Path traversal attempt detected')
      }
    })

    it('should reject path outside allowed directories', () => {
      const inputPath = '/var/log/system.log'

      const result = securityManager.sanitizeFilePath(inputPath)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBeInstanceOf(SecurityError)
        expect(result.error.message).toBe('File path outside allowed directories')
      }
    })

    it('should resolve a relative path within the current working directory', () => {
      const result = securityManager.sanitizeFilePath('./temp/output.png')

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe(path.join(process.cwd(), 'temp', 'output.png'))
      }
    })

    it('should allow path within temp directory', () => {
      const tempPath = path.join('/tmp', 'test-image.png')

      const result = securityManager.sanitizeFilePath(tempPath)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe(tempPath)
      }
    })

    it('should reject a sibling directory that only shares an allowed path prefix', () => {
      const result = securityManager.sanitizeFilePath('/tmp-escape/image.png')

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.message).toBe('File path outside allowed directories')
      }
    })
  })

  describe('file name sanitization', () => {
    afterEach(() => {
      vi.useRealTimers()
    })

    it.each([
      ['keeps an ordinary name', 'my photo.png', 'my photo.png'],
      ['removes path separators and null bytes', 'dir/sub\\name\0.png', 'dirsubname.png'],
      ['removes control characters', 'a\u0001b\u007f.png', 'ab.png'],
      ['strips leading and trailing dots', '..hidden.png..', 'hidden.png'],
      ['trims surrounding whitespace', '  name.png  ', 'name.png'],
    ])('%s', (_behavior, fileName, expected) => {
      expect(securityManager.sanitizeFilename(fileName)).toBe(expected)
    })

    it.each([
      ['only dots', '...'],
      ['only separators', '/\\/'],
    ])('falls back to a timestamped name when the input is %s', (_condition, fileName) => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-01-02T03:04:05.678Z'))

      expect(securityManager.sanitizeFilename(fileName)).toBe('secure-file-1767323045678')
    })
  })
})
