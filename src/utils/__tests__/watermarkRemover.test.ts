import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// execFile is promisified at module load, so the mock must invoke the callback.
const execFileMock = vi.fn()
vi.mock('node:child_process', () => ({
  execFile: (...args: unknown[]) => execFileMock(...args),
}))

import type { Config } from '../config'
import type { Logger } from '../logger'
import { removeWatermark } from '../watermarkRemover'

function resolveWith(err: Error | null): void {
  execFileMock.mockImplementation(
    (_cmd: string, _args: string[], _opts: unknown, cb: (e: Error | null, r: unknown) => void) => {
      cb(err, { stdout: '', stderr: '' })
    }
  )
}

const baseConfig: Config = {
  imageProvider: 'gemini',
  geminiApiKey: 'test-api-key-12345',
  openaiApiKey: '',
  imageOutputDir: './output',
  apiTimeout: 30000,
  skipPromptEnhancement: false,
  imageQuality: 'fast',
  removeWatermark: true,
  removeWatermarkCmd: 'remove-ai-watermarks',
  removeWatermarkTimeout: 600000,
}

const logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
} as unknown as Logger

describe('removeWatermark', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('invokes the CLI in place with the "all" mode and logs success', async () => {
    resolveWith(null)

    await removeWatermark('/tmp/out/image.png', baseConfig, logger)

    expect(execFileMock).toHaveBeenCalledTimes(1)
    const [cmd, args, opts] = execFileMock.mock.calls[0]
    expect(cmd).toBe('remove-ai-watermarks')
    expect(args).toEqual(['all', '/tmp/out/image.png', '-o', '/tmp/out/image.png'])
    expect(opts).toMatchObject({ timeout: 600000 })
    expect(logger.info).toHaveBeenCalled()
    expect(logger.warn).not.toHaveBeenCalled()
  })

  it('supports a command override that includes arguments', async () => {
    resolveWith(null)

    await removeWatermark(
      '/tmp/out/image.png',
      {
        ...baseConfig,
        removeWatermarkCmd: 'python -m remove_ai_watermarks',
      },
      logger
    )

    const [cmd, args] = execFileMock.mock.calls[0]
    expect(cmd).toBe('python')
    expect(args).toEqual([
      '-m',
      'remove_ai_watermarks',
      'all',
      '/tmp/out/image.png',
      '-o',
      '/tmp/out/image.png',
    ])
  })

  it('falls back gracefully (no throw, warns) when the CLI is missing', async () => {
    const enoent = Object.assign(new Error('spawn remove-ai-watermarks ENOENT'), {
      code: 'ENOENT',
    })
    resolveWith(enoent)

    await expect(removeWatermark('/tmp/out/image.png', baseConfig, logger)).resolves.toBeUndefined()

    expect(logger.warn).toHaveBeenCalled()
    expect(logger.info).not.toHaveBeenCalled()
  })

  it('falls back gracefully when the CLI exits non-zero', async () => {
    resolveWith(new Error('Command failed: exit code 1'))

    await expect(removeWatermark('/tmp/out/image.png', baseConfig, logger)).resolves.toBeUndefined()

    expect(logger.warn).toHaveBeenCalled()
  })

  it('skips and warns when the command is empty', async () => {
    await removeWatermark(
      '/tmp/out/image.png',
      { ...baseConfig, removeWatermarkCmd: '   ' },
      logger
    )

    expect(execFileMock).not.toHaveBeenCalled()
    expect(logger.warn).toHaveBeenCalled()
  })
})
