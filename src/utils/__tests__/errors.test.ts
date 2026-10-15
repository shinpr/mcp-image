import { describe, expect, it } from 'vitest'
import { FileOperationError, GeminiAPIError, SecurityError } from '../errors'

describe('GeminiAPIError', () => {
  describe('suggestion getter', () => {
    it('should reference both models when message contains model/access/permission keywords', () => {
      const error = new GeminiAPIError('Model not found or access denied')

      const suggestion = error.suggestion

      expect(suggestion).toContain('gemini-nano-banana-2.1')
      expect(suggestion).toContain('gemini-3-pro-image')
    })

    it('should use custom suggestion when provided', () => {
      const customSuggestion = 'Custom suggestion text'
      const error = new GeminiAPIError('Some error', customSuggestion)

      expect(error.suggestion).toBe(customSuggestion)
    })
  })
})

describe('FileOperationError', () => {
  describe('suggestion getter', () => {
    it.each([
      [
        'Failed to save image file: EACCES: permission denied',
        'Check file and directory permissions for the output path',
      ],
      [
        'Failed to save image file: ENOSPC: no space left on device',
        'Free up disk space or choose a different output directory',
      ],
      [
        'Failed to create directory: ENOENT: no such file or directory',
        'Ensure the output directory exists and is accessible',
      ],
      [
        'Failed to save image file: EMFILE: too many open files',
        'Close unused files or restart the application to free file handles',
      ],
      [
        'Failed to save image file: EROFS: read-only file system',
        'Choose a writable directory for file output',
      ],
      ['Failed to save image file', 'Check file system permissions and available disk space'],
    ])('derives the suggestion for "%s"', (message, suggestion) => {
      expect(new FileOperationError(message).suggestion).toBe(suggestion)
    })
  })
})

describe('SecurityError', () => {
  describe('suggestion getter', () => {
    it.each([
      ['Null byte detected in file path', 'Ensure your request meets security requirements'],
      ['Path traversal attempt detected', 'Use valid file paths within allowed directories only'],
      [
        'File path outside allowed directories',
        'Use valid file paths within allowed directories only',
      ],
      [
        'Unsupported file extension: .txt',
        'Use supported file extensions: .jpg, .jpeg, .png, .webp, .gif, .bmp',
      ],
    ])('derives the suggestion for "%s"', (message, suggestion) => {
      expect(new SecurityError(message).suggestion).toBe(suggestion)
    })
  })
})
