import type { AspectRatio, ImageQuality, ImageSize } from '../types/mcp.js'
import type { Result } from '../types/result.js'
import { Err, Ok } from '../types/result.js'
import type { Config } from '../utils/config.js'
import { ImageAPIError, NetworkError } from '../utils/errors.js'
import { isNetworkError } from './errorClassification.js'
import type { GeneratedImageResult, ImageApiParams, ImageClient } from './imageClient.js'

const SEEDREAM_IMAGE_ENDPOINT = 'https://ark.ap-southeast.bytepluses.com/api/v3/images/generations'
const SEEDREAM_IMAGE_TIMEOUT_MS = 180000
const MAX_RESPONSE_BYTES = 48 * 1024 * 1024
const MAX_DECODED_BYTES = 32 * 1024 * 1024
const PNG_MIME_TYPE = 'image/png'
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

const ASPECT_RATIOS: readonly AspectRatio[] = [
  '1:1',
  '1:4',
  '1:8',
  '2:3',
  '3:2',
  '3:4',
  '4:1',
  '4:3',
  '4:5',
  '5:4',
  '8:1',
  '9:16',
  '16:9',
  '21:9',
]

const SUPPORTED_INPUT_MIME_TYPES = ['image/png', 'image/jpeg'] as const

const SEEDREAM_ROUTES = {
  fast: {
    model: 'seedream-5-0-260128',
    defaultResolution: '2K',
    allowedResolutions: ['2K', '4K'],
    sequentialImageGeneration: true,
  },
  balanced: {
    model: 'dola-seedream-5-0-pro-260628',
    defaultResolution: '1K',
    allowedResolutions: ['1K', '2K'],
    sequentialImageGeneration: false,
  },
  quality: {
    model: 'dola-seedream-5-0-pro-260628',
    defaultResolution: '1K',
    allowedResolutions: ['1K', '2K'],
    sequentialImageGeneration: false,
  },
} as const satisfies Record<
  ImageQuality,
  {
    model: string
    defaultResolution: ImageSize
    allowedResolutions: readonly ImageSize[]
    sequentialImageGeneration: boolean
  }
>

type ProviderCapabilityInput = Pick<
  ImageApiParams,
  'inputImage' | 'inputImageMimeType' | 'aspectRatio' | 'imageSize' | 'useGoogleSearch' | 'quality'
>

type SeedreamRoute = (typeof SEEDREAM_ROUTES)[ImageQuality]

type ResolvedCapabilities = Readonly<{
  aspectRatio: AspectRatio
  quality: ImageQuality
  resolution: ImageSize
  route: SeedreamRoute
}>

type SeedreamImageWireRequestBase = Readonly<{
  prompt: string
  image?: string
  size: ImageSize
  response_format: 'b64_json'
  output_format: 'png'
  stream: false
  watermark: false
  optimize_prompt_options: Readonly<{ mode: 'standard' }>
}>

type SeedreamLiteImageWireRequest = SeedreamImageWireRequestBase &
  Readonly<{
    model: 'seedream-5-0-260128'
    sequential_image_generation: 'disabled'
  }>

type SeedreamProImageWireRequest = SeedreamImageWireRequestBase &
  Readonly<{
    model: 'dola-seedream-5-0-pro-260628'
    sequential_image_generation?: never
  }>

type SeedreamImageWireRequest = SeedreamLiteImageWireRequest | SeedreamProImageWireRequest

function capabilityError(message: string): Result<never, ImageAPIError> {
  return Err(
    new ImageAPIError(message, {
      provider: 'seedream',
      stage: 'capability_preflight',
      suggestion: 'Use a supported Seedream image option without changing provider or model values',
    })
  )
}

function responseContractError(): ImageAPIError {
  return new ImageAPIError('Invalid response from Seedream image provider', {
    provider: 'seedream',
    stage: 'image_response',
    suggestion: 'Retry the request; the provider response did not satisfy the PNG contract',
  })
}

function isStrictBase64(value: string): boolean {
  return (
    value.length > 0 &&
    value.length % 4 === 0 &&
    /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)
  )
}

function hasOwn(record: object, key: PropertyKey): boolean {
  return Object.getOwnPropertyDescriptor(record, key) !== undefined
}

function resolveCapabilities(
  input: ProviderCapabilityInput,
  defaultQuality: ImageQuality
): Result<ResolvedCapabilities, ImageAPIError> {
  if (input.useGoogleSearch === true) {
    return capabilityError('Google Search is not supported by the Seedream image provider')
  }

  const quality = input.quality ?? defaultQuality
  if (!hasOwn(SEEDREAM_ROUTES, quality)) {
    return capabilityError('Unsupported Seedream image quality')
  }

  const route = SEEDREAM_ROUTES[quality]
  const resolution = input.imageSize ?? route.defaultResolution
  if (!route.allowedResolutions.some((allowed) => allowed === resolution)) {
    return capabilityError('Unsupported Seedream model and resolution combination')
  }

  const aspectRatio = input.aspectRatio ?? '1:1'
  if (!ASPECT_RATIOS.some((allowed) => allowed === aspectRatio)) {
    return capabilityError('Unsupported Seedream image aspect ratio')
  }

  const hasInputImage = input.inputImage !== undefined
  const hasInputMimeType = input.inputImageMimeType !== undefined
  if (hasInputImage !== hasInputMimeType) {
    return capabilityError('Seedream image editing requires one image and its MIME type')
  }

  if (hasInputImage && hasInputMimeType) {
    if (!SUPPORTED_INPUT_MIME_TYPES.some((supported) => supported === input.inputImageMimeType)) {
      return capabilityError('Unsupported Seedream input image MIME type')
    }

    if (!isStrictBase64(input.inputImage ?? '')) {
      return capabilityError('Invalid Seedream input image data')
    }
  }

  return Ok({
    aspectRatio,
    quality,
    resolution,
    route,
  })
}

export function validateSeedreamCapabilities(
  input: ProviderCapabilityInput,
  defaultQuality: ImageQuality
): Result<void, ImageAPIError> {
  const result = resolveCapabilities(input, defaultQuality)
  return result.success ? Ok(undefined) : result
}

function appendAspectRatio(prompt: string, aspectRatio: AspectRatio): string {
  return `${prompt}\n\nOutput aspect ratio: ${aspectRatio}.`
}

function buildWireRequest(
  params: ImageApiParams,
  resolved: ResolvedCapabilities
): SeedreamImageWireRequest {
  const base = {
    prompt: appendAspectRatio(params.prompt, resolved.aspectRatio),
    ...(params.inputImage &&
      params.inputImageMimeType && {
        image: `data:${params.inputImageMimeType};base64,${params.inputImage}`,
      }),
    size: resolved.resolution,
    response_format: 'b64_json',
    output_format: 'png',
    stream: false,
    watermark: false,
    optimize_prompt_options: { mode: 'standard' },
  } as const

  if (resolved.route.sequentialImageGeneration) {
    return {
      ...base,
      model: 'seedream-5-0-260128',
      sequential_image_generation: 'disabled',
    }
  }

  return {
    ...base,
    model: 'dola-seedream-5-0-pro-260628',
  }
}

async function cancelBody(body: ReadableStream<Uint8Array> | null): Promise<void> {
  if (body) {
    await body.cancel()
  }
}

async function readBoundedJson(response: Response): Promise<Result<unknown, ImageAPIError>> {
  const contentLength = response.headers.get('content-length')
  if (contentLength && /^\d+$/.test(contentLength) && Number(contentLength) > MAX_RESPONSE_BYTES) {
    await cancelBody(response.body)
    return Err(responseContractError())
  }

  if (response.headers.get('content-type')?.toLowerCase().includes('text/event-stream')) {
    await cancelBody(response.body)
    return Err(responseContractError())
  }

  if (!response.body) {
    return Err(responseContractError())
  }

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let totalBytes = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }

    totalBytes += value.byteLength
    if (totalBytes > MAX_RESPONSE_BYTES) {
      await reader.cancel()
      return Err(responseContractError())
    }
    chunks.push(value)
  }

  const bodyBytes = new Uint8Array(totalBytes)
  let offset = 0
  for (const chunk of chunks) {
    bodyBytes.set(chunk, offset)
    offset += chunk.byteLength
  }

  try {
    return Ok(JSON.parse(new TextDecoder().decode(bodyBytes)))
  } catch {
    return Err(responseContractError())
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function calculateDecodedSize(base64: string): number {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0
  return (base64.length / 4) * 3 - padding
}

function parseImagePayload(payload: unknown): Result<Buffer, ImageAPIError> {
  if (!isRecord(payload) || !Array.isArray(payload['data']) || payload['data'].length !== 1) {
    return Err(responseContractError())
  }

  const image = payload['data'][0]
  if (
    !isRecord(image) ||
    hasOwn(image, 'url') ||
    hasOwn(image, 'stream') ||
    typeof image['b64_json'] !== 'string' ||
    !isStrictBase64(image['b64_json'])
  ) {
    return Err(responseContractError())
  }

  if (calculateDecodedSize(image['b64_json']) > MAX_DECODED_BYTES) {
    return Err(responseContractError())
  }

  const imageData = Buffer.from(image['b64_json'], 'base64')
  if (
    imageData.length === 0 ||
    imageData.length > MAX_DECODED_BYTES ||
    !imageData.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC) ||
    image['mime_type'] !== PNG_MIME_TYPE
  ) {
    return Err(responseContractError())
  }

  return Ok(imageData)
}

class SeedreamImageClientImpl implements ImageClient {
  constructor(
    private readonly apiKey: string,
    private readonly defaultQuality: ImageQuality
  ) {}

  async generateImage(
    params: ImageApiParams
  ): Promise<Result<GeneratedImageResult, ImageAPIError | NetworkError>> {
    const resolvedResult = resolveCapabilities(params, this.defaultQuality)
    if (!resolvedResult.success) {
      return resolvedResult
    }

    const request = buildWireRequest(params, resolvedResult.data)

    try {
      const response = await fetch(SEEDREAM_IMAGE_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(SEEDREAM_IMAGE_TIMEOUT_MS),
      })

      if (!response.ok) {
        await cancelBody(response.body)
        return this.normalizeHttpError(response.status)
      }

      const payloadResult = await readBoundedJson(response)
      if (!payloadResult.success) {
        return payloadResult
      }

      const imageResult = parseImagePayload(payloadResult.data)
      if (!imageResult.success) {
        return imageResult
      }

      return Ok({
        imageData: imageResult.data,
        metadata: {
          model: resolvedResult.data.route.model,
          provider: 'seedream',
          prompt: request.prompt,
          mimeType: PNG_MIME_TYPE,
          timestamp: new Date(),
          inputImageProvided: params.inputImage !== undefined,
        },
      })
    } catch (error) {
      return this.normalizeTransportError(error)
    }
  }

  private normalizeHttpError(statusCode: number): Result<never, ImageAPIError | NetworkError> {
    if (statusCode >= 500) {
      return Err(
        new NetworkError('Seedream image provider unavailable', {
          provider: 'seedream',
          stage: 'image_request',
          failureType: 'upstream',
          upstreamStatus: statusCode,
        })
      )
    }

    return Err(
      new ImageAPIError(
        'Seedream image request was rejected',
        {
          provider: 'seedream',
          stage: 'image_request',
          upstreamStatus: statusCode,
          suggestion:
            statusCode === 401 || statusCode === 403
              ? 'Check that ARK_API_KEY can access the pinned Seedream image model'
              : 'Check the supported Seedream image request options and account quota',
        },
        statusCode
      )
    )
  }

  private normalizeTransportError(error: unknown): Result<never, ImageAPIError | NetworkError> {
    if (this.isAbortFailure(error)) {
      return Err(
        new NetworkError('Timeout during Seedream image generation', {
          provider: 'seedream',
          stage: 'image_request',
          failureType: 'timeout',
        })
      )
    }

    if (this.isNetworkFailure(error)) {
      return Err(
        new NetworkError('Network error during Seedream image generation', {
          provider: 'seedream',
          stage: 'image_request',
          failureType: 'network',
        })
      )
    }

    return Err(
      new ImageAPIError('Failed during Seedream image generation', {
        provider: 'seedream',
        stage: 'image_request',
        suggestion: 'Retry the image request or check the ModelArk service status',
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

export function createSeedreamImageClient(config: Config): Result<ImageClient, ImageAPIError> {
  const apiKey = config.arkApiKey.trim()
  if (apiKey.length === 0) {
    return Err(
      new ImageAPIError(
        'Failed to initialize Seedream image client',
        'Set ARK_API_KEY to a non-empty ModelArk API key'
      )
    )
  }

  const capabilityResult = resolveCapabilities({}, config.imageQuality)
  if (!capabilityResult.success) {
    return capabilityResult
  }

  return Ok(new SeedreamImageClientImpl(apiKey, config.imageQuality))
}
