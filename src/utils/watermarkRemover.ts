/**
 * Post-generation watermark removal.
 *
 * Delegates to the external Python tool `remove-ai-watermarks`
 * (https://github.com/wiltodelta/remove-ai-watermarks) to strip AI watermarks
 * (e.g. Gemini "nano banana" sparkle + SynthID) and provenance metadata from a
 * generated image, overwriting the file in place.
 *
 * This is a best-effort step: if the tool is missing or fails, the original
 * image is left untouched and the error is logged (graceful fallback) so image
 * generation still succeeds.
 */

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { Config } from './config.js'
import type { Logger } from './logger.js'

const execFileAsync = promisify(execFile)

/**
 * Removes AI watermarks from the image at `filePath`, overwriting it in place.
 *
 * Never throws: failures (missing binary, non-zero exit, timeout) are logged as
 * warnings and the original file is preserved.
 *
 * @param filePath Absolute path to the generated image to clean.
 * @param config Validated configuration (provides command + timeout).
 * @param logger Logger for success/warning output.
 */
export async function removeWatermark(
  filePath: string,
  config: Config,
  logger: Logger
): Promise<void> {
  // The override may include arguments (e.g. "python -m remove_ai_watermarks").
  // Split on whitespace: first token is the command, the rest are leading args.
  // Note: command paths containing spaces are not supported in the override.
  const [command, ...prefixArgs] = config.removeWatermarkCmd.trim().split(/\s+/)
  if (!command) {
    logger.warn('watermark', 'Watermark removal skipped: empty REMOVE_WATERMARK_CMD')
    return
  }

  const args = [...prefixArgs, 'all', filePath, '-o', filePath]

  try {
    await execFileAsync(command, args, { timeout: config.removeWatermarkTimeout })
    logger.info('watermark', 'Watermark removed', { filePath })
  } catch (error) {
    logger.warn('watermark', 'Watermark removal skipped', {
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
