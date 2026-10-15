import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import * as path from 'node:path'
import { afterEach, describe, expect, it, type Mock, vi } from 'vitest'
import { MAX_IMAGE_SIZE } from '../../types/image'
import { FileOperationError, InputValidationError } from '../../utils/errors'
import * as fileManager from '../fileManager'

const inputFileSystem: { open: Mock } = vi.hoisted(() => ({ open: vi.fn() }))

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  inputFileSystem.open.mockImplementation(actual.open)
  return { ...actual, open: inputFileSystem.open }
})

describe('FileManager', () => {
  const testOutputDir = path.join(process.cwd(), 'tmp', 'test-output')
  const testImageData = Buffer.from('fake-image-data')

  afterEach(async () => {
    try {
      await fs.rm(testOutputDir, { recursive: true })
    } catch {
      // A test may fail before creating the directory.
    }
  })

  describe('readInputImage', () => {
    it('reads image bytes and derives the MIME type from the resolved file', async () => {
      const inputPath = path.join(testOutputDir, 'input.png')
      await fs.mkdir(testOutputDir, { recursive: true })
      await fs.writeFile(inputPath, testImageData)

      const inputImage = await fileManager.readInputImage(inputPath)

      expect(inputImage).toEqual({ data: testImageData, mimeType: 'image/png' })
    })

    it('resolves symlinks before validating the target extension and MIME type', async () => {
      const targetPath = path.join(testOutputDir, 'target.webp')
      const symlinkPath = path.join(testOutputDir, 'input.png')
      await fs.mkdir(testOutputDir, { recursive: true })
      await fs.writeFile(targetPath, testImageData)
      await fs.symlink(targetPath, symlinkPath)

      const inputImage = await fileManager.readInputImage(symlinkPath)

      expect(inputImage).toEqual({ data: testImageData, mimeType: 'image/webp' })
    })

    it.each([
      ['a null byte', '/tmp/image.png\0.exe', 'Null byte detected in file path'],
      ['a traversal segment', '/tmp/../etc/passwd', 'Path traversal attempt detected'],
      ['an unresolvable path', '/tmp/nonexistent-file-12345.png', 'File path cannot be resolved'],
    ])('rejects a path with %s', async (_condition, inputPath, message) => {
      await expect(fileManager.readInputImage(inputPath)).rejects.toMatchObject({
        name: 'SecurityError',
        message,
      })
    })

    it('rejects a file with an unsupported extension', async () => {
      const unsupportedPath = path.join(testOutputDir, 'input.txt')
      await fs.mkdir(testOutputDir, { recursive: true })
      await fs.writeFile(unsupportedPath, testImageData)

      await expect(fileManager.readInputImage(unsupportedPath)).rejects.toMatchObject({
        name: 'SecurityError',
        message: 'Unsupported file extension: .txt',
      })
    })

    it('accepts a file exactly at the 10MB limit', async () => {
      const inputPath = path.join(testOutputDir, 'exact-limit.png')
      const data = Buffer.alloc(MAX_IMAGE_SIZE, 0x61)
      await fs.mkdir(testOutputDir, { recursive: true })
      await fs.writeFile(inputPath, data)

      const inputImage = await fileManager.readInputImage(inputPath)

      expect(inputImage.data.length).toBe(10 * 1024 * 1024)
      expect(inputImage.data.equals(data)).toBe(true)
    })

    it('rejects a file one byte over the 10MB limit', async () => {
      const inputPath = path.join(testOutputDir, 'over-limit.png')
      await fs.mkdir(testOutputDir, { recursive: true })
      await fs.writeFile(inputPath, Buffer.alloc(MAX_IMAGE_SIZE + 1, 0x62))

      const read = fileManager.readInputImage(inputPath)

      await expect(read).rejects.toBeInstanceOf(InputValidationError)
      await expect(read).rejects.toThrow('Image size exceeds 10.0MB limit. Current size: 10.0MB')
    })

    it('rejects a file that grows past the limit after its size was checked', async () => {
      const inputPath = path.join(testOutputDir, 'growth.png')
      await fs.mkdir(testOutputDir, { recursive: true })
      await fs.writeFile(inputPath, Buffer.from('initial-file'))
      let servedBytes = 0
      const close = vi.fn(async () => undefined)
      // Mock-boundary rationale: a real file cannot grow between stat and read deterministically,
      // so only the external file handle is simulated; path checks and bounded reading stay real.
      const growingHandle = {
        stat: async () => ({ isFile: () => true, size: MAX_IMAGE_SIZE }),
        read: async (buffer: Buffer, offset: number, length: number) => {
          const bytesRead = Math.min(length, MAX_IMAGE_SIZE + 1 - servedBytes)
          buffer.fill(0x63, offset, offset + bytesRead)
          servedBytes += bytesRead
          return { buffer, bytesRead }
        },
        close,
      }
      inputFileSystem.open.mockImplementationOnce(async () => growingHandle)

      const read = fileManager.readInputImage(inputPath)

      await expect(read).rejects.toThrow('Image size exceeds 10.0MB limit. Current size: 10.0MB')
      expect(close).toHaveBeenCalledTimes(1)
    })

    it('rejects a directory that carries an image extension', async () => {
      const directoryPath = path.join(testOutputDir, 'non-regular.png')
      await fs.mkdir(directoryPath, { recursive: true })

      await expect(fileManager.readInputImage(directoryPath)).rejects.toMatchObject({
        name: 'InputValidationError',
        message: 'Input image must be a regular file',
      })
    })

    // Windows does not provide POSIX named FIFOs.
    it.skipIf(process.platform === 'win32')(
      'rejects a named pipe without waiting for a writer',
      async () => {
        const fifoPath = path.join(testOutputDir, 'named-pipe.png')
        await fs.mkdir(testOutputDir, { recursive: true })
        await new Promise<void>((resolve, reject) => {
          execFile('/usr/bin/mkfifo', [fifoPath], (error) => (error ? reject(error) : resolve()))
        })

        const read = fileManager.readInputImage(fifoPath).then(
          () => 'resolved' as const,
          (error: unknown) => error
        )
        let deadlineTimer: ReturnType<typeof setTimeout> | undefined
        const outcome = await Promise.race([
          read,
          new Promise<'deadline'>((resolve) => {
            deadlineTimer = setTimeout(() => resolve('deadline'), 500)
          }),
        ])
        clearTimeout(deadlineTimer)
        if (outcome === 'deadline') {
          // Unblock a reader that opened in blocking mode so the test cannot hang.
          await fs.writeFile(fifoPath, 'unblock').catch(() => undefined)
          await read
        }

        expect(outcome).toBeInstanceOf(InputValidationError)
        expect(outcome).toMatchObject({ message: 'Input image must be a regular file' })
      }
    )
  })

  describe('saveImage', () => {
    it('should create directory automatically if it does not exist', async () => {
      const nestedPath = path.join(testOutputDir, 'nested', 'deep', 'test-image.png')

      const result = await fileManager.saveImage(testImageData, nestedPath)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe(nestedPath)
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
        expect(result.error.message).toContain('Failed to create directory')
      }
    })
  })

  describe('generateFileName', () => {
    it.each([
      [undefined, 'png'],
      ['image/jpeg', 'jpg'],
    ])('uses the expected extension for MIME type %s', (mimeType, extension) => {
      expect(fileManager.generateFileName(mimeType)).toMatch(
        new RegExp(`^image-\\d{13}-[0-9a-f]{8}\\.${extension}$`)
      )
    })
  })
})
