import type { AspectRatio } from '../types/mcp.js'
import type { Result } from '../types/result.js'
import { Err, Ok } from '../types/result.js'
import type { Config } from '../utils/config.js'
import { ImageAPIError, NetworkError } from '../utils/errors.js'
import { isNetworkError } from './errorClassification.js'
import type { GeneratedImageResult, ImageApiParams, ImageClient } from './imageClient.js'

export const MUAPI_IMAGE_ENDPOINT = 'https://api.muapi.ai/v1/images/generations'
export const MUAPI_IMAGE_MODEL = 'flux-schnell'

const MUAPI_IMAGE_TIMEOUT_MS = 300_000
const MAX_JSON_RESPONSE_BYTES = 1 * 1024 * 1024
const MAX_IMAGE_RESPONSE_BYTES = 32 * 1024 * 1024

const MUAPI_ASPECT_RATIOS: ReadonlyMap<AspectRatio, string> = new Map([
  ['1:1', '1024x1024'],
  ['16:9', '1792x1024'],
  ['9:16', '1024x1792'],
])

type ProviderCapabilityInput = Pick<
  ImageApiParams,
  'inputImage' | 'inputImageMimeType' | 'useGoogleSearch' | 'aspectRatio' | 'imageSize'
>

type ResolvedCapabilities = Readonly<{
  aspectRatio: AspectRatio
  size: string
}>

function capabilityError(message: string): Result<never, ImageAPIError> {
  return Err(
    new ImageAPIError(message, {
      provider: 'muapi',
      stage: 'capability_preflight',
      suggestion: 'Use MuAPI generation with 1K, 1:1/16:9/9:16, and no input image',
    })
  )
}

function responseContractError(
  message = 'Invalid response from MuAPI image provider'
): ImageAPIError {
  return new ImageAPIError(message, {
    provider: 'muapi',
    stage: 'image_response',
    suggestion: 'Retry the request; MuAPI must return one HTTPS image URL',
  })
}

function resolveCapabilities(
  input: ProviderCapabilityInput
): Result<ResolvedCapabilities, ImageAPIError> {
  if (input.useGoogleSearch === true) {
    return capabilityError('Google Search is not supported by the MuAPI image provider')
  }

  if (input.inputImage !== undefined || input.inputImageMimeType !== undefined) {
    return capabilityError('MuAPI currently supports image generation but not image editing')
  }

  if (input.imageSize !== undefined && input.imageSize !== '1K') {
    return capabilityError('MuAPI supports 1K output only')
  }

  const aspectRatio = input.aspectRatio ?? '1:1'
  const size = MUAPI_ASPECT_RATIOS.get(aspectRatio)
  if (!size) {
    return capabilityError('MuAPI supports only 1:1, 16:9, and 9:16 output')
  }

  return Ok({ aspectRatio, size })
}

export function validateMuapiCapabilities(
  input: ProviderCapabilityInput
): Result<void, ImageAPIError> {
  const result = resolveCapabilities(input)
  return result.success ? Ok(undefined) : result
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

async function cancelBody(body: ReadableStream<Uint8Array> | null): Promise<void> {
  if (body) {
    await body.cancel()
  }
}

async function readBoundedBody(
  response: Response,
  maxBytes: number,
  error: ImageAPIError
): Promise<Result<Buffer, ImageAPIError>> {
  const contentLength = response.headers.get('content-length')
  if (contentLength && /^\d+$/.test(contentLength) && Number(contentLength) > maxBytes) {
    await cancelBody(response.body)
    return Err(error)
  }

  if (!response.body) {
    return Err(error)
  }

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let totalBytes = 0

  for (;;) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }
    if (!value) {
      await reader.cancel()
      return Err(error)
    }

    totalBytes += value.byteLength
    if (totalBytes > maxBytes) {
      await reader.cancel()
      return Err(error)
    }
    chunks.push(value)
  }

  const bodyBytes = new Uint8Array(totalBytes)
  let offset = 0
  for (const chunk of chunks) {
    bodyBytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return Ok(Buffer.from(bodyBytes))
}

async function readJsonResponse(response: Response): Promise<Result<unknown, ImageAPIError>> {
  const error = responseContractError()
  const bodyResult = await readBoundedBody(response, MAX_JSON_RESPONSE_BYTES, error)
  if (!bodyResult.success) {
    return bodyResult
  }

  try {
    return Ok(JSON.parse(bodyResult.data.toString('utf8')))
  } catch {
    return Err(error)
  }
}

function imageUrlFromPayload(payload: unknown): Result<string, ImageAPIError> {
  if (!isRecord(payload) || !Array.isArray(payload['data']) || payload['data'].length !== 1) {
    return Err(responseContractError())
  }

  const image = payload['data'][0]
  if (!isRecord(image) || typeof image['url'] !== 'string' || image['url'].length === 0) {
    return Err(responseContractError())
  }

  return Ok(image['url'])
}

function validateImageUrl(value: string): Result<URL, ImageAPIError> {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:') {
      return Err(responseContractError('MuAPI returned a non-HTTPS image URL'))
    }
    return Ok(url)
  } catch {
    return Err(responseContractError('MuAPI returned an invalid image URL'))
  }
}

async function downloadImage(
  url: URL,
  prompt: string,
  signal: AbortSignal
): Promise<Result<GeneratedImageResult, ImageAPIError>> {
  const response = await fetch(url, {
    redirect: 'error',
    signal,
  })
  if (!response.ok) {
    await cancelBody(response.body)
    return Err(responseContractError('MuAPI returned an unreadable image URL'))
  }

  const bodyResult = await readBoundedBody(
    response,
    MAX_IMAGE_RESPONSE_BYTES,
    responseContractError()
  )
  if (!bodyResult.success || bodyResult.data.length === 0) {
    return Err(responseContractError())
  }

  const mimeType = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
  if (!mimeType?.startsWith('image/')) {
    return Err(responseContractError('MuAPI image URL did not return an image content type'))
  }

  return Ok({
    imageData: bodyResult.data,
    metadata: {
      model: MUAPI_IMAGE_MODEL,
      provider: 'muapi',
      prompt,
      mimeType,
      timestamp: new Date(),
      inputImageProvided: false,
    },
  })
}

class MuapiImageClientImpl implements ImageClient {
  constructor(private readonly apiKey: string) {}

  async generateImage(
    params: ImageApiParams
  ): Promise<Result<GeneratedImageResult, ImageAPIError | NetworkError>> {
    const resolvedResult = resolveCapabilities(params)
    if (!resolvedResult.success) {
      return resolvedResult
    }

    const timeoutSignal = AbortSignal.timeout(MUAPI_IMAGE_TIMEOUT_MS)
    const signal = params.signal ? AbortSignal.any([params.signal, timeoutSignal]) : timeoutSignal

    try {
      const response = await fetch(MUAPI_IMAGE_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: MUAPI_IMAGE_MODEL,
          prompt: params.prompt,
          n: 1,
          size: resolvedResult.data.size,
        }),
        signal,
      })

      if (!response.ok) {
        await cancelBody(response.body)
        return this.normalizeHttpError(response.status)
      }

      const payloadResult = await readJsonResponse(response)
      if (!payloadResult.success) {
        return payloadResult
      }

      const urlResult = imageUrlFromPayload(payloadResult.data)
      if (!urlResult.success) {
        return urlResult
      }

      const validatedUrl = validateImageUrl(urlResult.data)
      if (!validatedUrl.success) {
        return validatedUrl
      }

      const imageResult = await downloadImage(validatedUrl.data, params.prompt, signal)
      if (!imageResult.success) {
        return imageResult
      }

      return imageResult
    } catch (error) {
      return this.normalizeTransportError(error)
    }
  }

  private normalizeHttpError(statusCode: number): Result<never, ImageAPIError | NetworkError> {
    if (statusCode >= 500) {
      return Err(
        new NetworkError('MuAPI image provider unavailable', {
          provider: 'muapi',
          stage: 'image_request',
          failureType: 'upstream',
          upstreamStatus: statusCode,
        })
      )
    }

    return Err(
      new ImageAPIError(
        'MuAPI image request was rejected',
        {
          provider: 'muapi',
          stage: 'image_request',
          upstreamStatus: statusCode,
          suggestion:
            statusCode === 401 || statusCode === 403
              ? 'Check that MUAPI_API_KEY is valid and can access the image model'
              : 'Check the supported MuAPI image request options and account quota',
        },
        statusCode
      )
    )
  }

  private normalizeTransportError(error: unknown): Result<never, ImageAPIError | NetworkError> {
    if (this.isAbortFailure(error)) {
      return Err(
        new NetworkError('Timeout during MuAPI image generation', {
          provider: 'muapi',
          stage: 'image_request',
          failureType: 'timeout',
        })
      )
    }

    if (this.isNetworkFailure(error)) {
      return Err(
        new NetworkError('Network error during MuAPI image generation', {
          provider: 'muapi',
          stage: 'image_request',
          failureType: 'network',
        })
      )
    }

    return Err(
      new ImageAPIError('Failed during MuAPI image generation', {
        provider: 'muapi',
        stage: 'image_request',
        suggestion: 'Retry the image request or check the MuAPI service status',
      })
    )
  }

  private isNetworkFailure(error: unknown): boolean {
    let current = error

    for (let depth = 0; depth < 4 && current instanceof Error; depth += 1) {
      if (current instanceof TypeError || isNetworkError(current)) {
        return true
      }
      current = Reflect.get(current, 'cause')
    }

    return false
  }

  private isAbortFailure(error: unknown): boolean {
    return (
      error instanceof Error &&
      (error.name === 'AbortError' ||
        error.name === 'TimeoutError' ||
        error.message === 'Request was aborted.')
    )
  }
}

export function createMuapiImageClient(config: Config): Result<ImageClient, ImageAPIError> {
  if (config.muapiApiKey.trim().length === 0) {
    return Err(
      new ImageAPIError(
        'Failed to initialize MuAPI image client',
        'Set MUAPI_API_KEY to a non-empty MuAPI API key'
      )
    )
  }

  return Ok(new MuapiImageClientImpl(config.muapiApiKey))
}
