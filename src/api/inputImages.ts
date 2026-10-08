import { MAX_INPUT_IMAGES, type ReferenceImage } from '../types/image.js'
import type { ImageProvider } from '../types/mcp.js'
import type { Result } from '../types/result.js'
import { Err, Ok } from '../types/result.js'
import { ImageAPIError } from '../utils/errors.js'

/** Provider checks shared by preflight and direct adapter calls. */
export function validateInputImages(
  provider: ImageProvider,
  images: ReferenceImage[] = []
): Result<void, ImageAPIError> {
  if (images.length > MAX_INPUT_IMAGES[provider]) {
    return Err(
      new ImageAPIError(
        `${provider} accepts at most ${MAX_INPUT_IMAGES[provider]} input images`,
        'Reduce the number of reference images'
      )
    )
  }
  const supported =
    provider === 'seedream'
      ? ['image/png', 'image/jpeg']
      : ['image/png', 'image/jpeg', 'image/webp']
  for (const [index, image] of images.entries()) {
    if (!supported.includes(image.mimeType)) {
      return Err(
        new ImageAPIError(
          `Input image ${index + 1}: unsupported ${provider} MIME type`,
          `Use ${supported.join(', ')}`
        )
      )
    }
  }
  return Ok(undefined)
}
