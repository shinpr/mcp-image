/**
 * Enhanced mock implementation for GeminiImageClient testing
 * Simulates Gemini 2.5 Flash Image generation responses
 * Supports advanced testing scenarios for structured prompt generation
 */

import type {
  GeminiApiParams,
  GeminiClient,
  GeminiGenerationMetadata,
  GeneratedImageResult,
} from '../../api/geminiClient'
import type { Result } from '../../types/result'
import { Err, Ok } from '../../types/result'
import { GeminiAPIError, NetworkError } from '../../utils/errors'

/**
 * Enhanced mock scenario for comprehensive image generation testing
 */
export interface ImageMockScenario {
  type: 'success' | 'api_error' | 'network_error' | 'timeout' | 'rate_limit'
  delay?: number
  customResponse?: Partial<GeneratedImageResult>
  errorMessage?: string
  features?: {
    aspectRatioPreserved?: boolean
    aspectRatioSource?: 'original' | 'last_image' | 'default'
    qualityScore?: number
    parametersIntegrated?: boolean
    optimizationApplied?: boolean
  }
}

/**
 * Mock factory for GeminiImageClient with enhanced capabilities
 */
export class GeminiImageClientMockFactory {
  private scenario: ImageMockScenario = { type: 'success' }

  /**
   * Set the mock scenario for next API call
   */
  setScenario(scenario: ImageMockScenario): void {
    this.scenario = scenario
  }

  /**
   * Create a mock instance with current scenario configuration
   */
  create(): GeminiClient {
    return new GeminiImageClientMock(this.scenario)
  }

  /**
   * Reset to default success scenario
   */
  reset(): void {
    this.scenario = { type: 'success' }
  }

  /**
   * Configure for structured prompt testing
   */
  configureForStructuredPromptTesting(): void {
    this.scenario = {
      type: 'success',
      delay: 50, // Small delay to simulate async operation
      features: {
        aspectRatioPreserved: true,
        aspectRatioSource: 'original',
        qualityScore: Math.floor(Math.random() * 20) + 80, // 80-100
        parametersIntegrated: true,
        optimizationApplied: true,
      },
    }
  }
}

/**
 * Enhanced mock implementation for structured prompt generation testing
 */
class GeminiImageClientMock implements GeminiClient {
  constructor(private scenario: ImageMockScenario) {}

  async generateImage(
    params: GeminiApiParams
  ): Promise<Result<GeneratedImageResult, GeminiAPIError | NetworkError>> {
    // Simulate processing delay
    if (this.scenario.delay) {
      await new Promise((resolve) => setTimeout(resolve, this.scenario.delay))
    }

    // Handle different error scenarios
    switch (this.scenario.type) {
      case 'network_error':
        return Err(
          new NetworkError(
            'Failed to connect to Gemini 2.5 Flash Image API',
            'Check your internet connection and try again'
          )
        )

      case 'api_error':
        return Err(
          new GeminiAPIError(
            this.scenario.errorMessage || 'Image generation failed',
            'Try rephrasing your prompt or check if the model supports your request type',
            400
          )
        )

      case 'timeout':
        // Return timeout error immediately without actual delay
        return Err(
          new GeminiAPIError(
            'Image generation timeout after 60 seconds',
            'Try with a simpler prompt or check API status'
          )
        )

      case 'rate_limit':
        return Err(
          new GeminiAPIError(
            'Rate limit exceeded for Gemini 2.5 Flash Image API',
            'Wait before making more requests or upgrade your plan',
            429
          )
        )

      default:
        return Ok(this.generateMockImageResult(params))
    }
  }

  /**
   * Generate realistic mock image result based on input parameters
   */
  private generateMockImageResult(params: GeminiApiParams): GeneratedImageResult {
    // Create mock image data (represents a PNG image)
    const mockImageData = Buffer.from([
      0x89,
      0x50,
      0x4e,
      0x47,
      0x0d,
      0x0a,
      0x1a,
      0x0a, // PNG signature
      ...Array(1000)
        .fill(0)
        .map(() => Math.floor(Math.random() * 256)), // Random data
    ])

    // Generate comprehensive metadata
    const metadata: GeminiGenerationMetadata = {
      model: 'gemini-2.5-flash-image-preview',
      prompt: params.prompt,
      mimeType: 'image/png',
      timestamp: new Date(),
      inputImageProvided: !!params.inputImage,
      contextMethod: params.inputImage ? 'image_editing' : 'text_to_image',
    }

    // Add features information if any features are specified
    if (
      params.blendImages !== undefined ||
      params.maintainCharacterConsistency !== undefined ||
      params.useWorldKnowledge !== undefined
    ) {
      metadata.features = {
        blendImages: params.blendImages || false,
        maintainCharacterConsistency: params.maintainCharacterConsistency || false,
        useWorldKnowledge: params.useWorldKnowledge || false,
      }
    }

    const result: GeneratedImageResult = {
      imageData: mockImageData,
      metadata,
    }

    // Apply enhanced testing features
    if (this.scenario.features) {
      // Add testing-specific metadata
      const enhancedResult = result as GeneratedImageResult & {
        aspectRatioPreserved?: boolean
        aspectRatioSource?: string
        qualityScore?: number
        parametersIntegrated?: boolean
        optimizationApplied?: boolean
        usedStructuredPrompt?: boolean
        configurationCompatible?: boolean
        networkErrorHandled?: boolean
        fallbackUsed?: boolean
        rateLimitHandled?: boolean
        retryAttempted?: boolean
        invalidResponseHandled?: boolean
        gracefulDegradation?: boolean
        concurrentSafe?: boolean
        noResourceConflicts?: boolean
        emptyPromptHandled?: boolean
        errorMessage?: string
        longPromptHandled?: boolean
        truncationApplied?: boolean
        specialCharsHandled?: boolean
        encodingPreserved?: boolean
        multiLanguageSupport?: boolean
        originalLanguagePreserved?: boolean
        mode?: 'structured' | 'traditional'
        textClientConfigured?: boolean
        imageClientConfigured?: boolean
        featureFlagsSupported?: boolean
        granularControl?: boolean
        mcpCompatible?: boolean
        noClientUpdatesRequired?: boolean
        apiContractPreserved?: boolean
        responseFormatValid?: boolean
        migrationPathValid?: boolean
        seamlessTransition?: boolean
        apiKeysProtected?: boolean
        properIsolation?: boolean
        promptSanitized?: boolean
        injectionPrevented?: boolean
        dataCleanupComplete?: boolean
        temporaryDataRemoved?: boolean
        performanceMetrics?: {
          promptGenerationTime: number
          imageGenerationTime: number
          totalProcessingTime: number
        }
        apiCallsCount?: number
        estimatedCost?: number
        efficiency?: number
        successRateTracking?: {
          promptGeneration: number
          fallbackScenarios: number
        }
        costTracking?: {
          apiUsageCosts: number
          optimizationInsights: string[]
        }
        alertThresholds?: {
          processingTime: number
          errorRates: number
          costMetrics: number
        }
        appliedPractices?: string[]
        fallbackTriggered?: boolean
        notification?: string
        usedFallback?: boolean
      }

      Object.assign(enhancedResult, this.scenario.features)
    }

    // Apply custom response overrides if provided
    if (this.scenario.customResponse) {
      Object.assign(result, this.scenario.customResponse)
    }

    return result
  }
}

/**
 * Convenience function to create a successful image generation mock
 */
export function createSuccessfulGeminiImageClientMock(
  customResponse?: Partial<GeneratedImageResult>
): GeminiClient {
  const factory = new GeminiImageClientMockFactory()
  factory.configureForStructuredPromptTesting()
  if (customResponse) {
    factory.setScenario({
      ...factory['scenario'],
      customResponse,
    })
  }
  return factory.create()
}

/**
 * Convenience function to create an error mock for image generation
 */
export function createErrorGeminiImageClientMock(
  errorType: 'api_error' | 'network_error' | 'timeout' | 'rate_limit' = 'api_error',
  errorMessage?: string
): GeminiClient {
  const factory = new GeminiImageClientMockFactory()
  factory.setScenario({
    type: errorType,
    ...(errorMessage && { errorMessage }),
  })
  return factory.create()
}

/**
 * Create a mock that simulates structured prompt processing
 */
export function createStructuredPromptImageMock(options?: {
  qualityImprovement?: number // 0-100
  processingTime?: number // milliseconds
  practicesApplied?: string[]
}): GeminiClient {
  const factory = new GeminiImageClientMockFactory()

  const qualityScore = options?.qualityImprovement || Math.floor(Math.random() * 30) + 70 // 70-100
  const processingTime = options?.processingTime || 50 // Small delay

  factory.setScenario({
    type: 'success',
    delay: processingTime,
    features: {
      qualityScore,
      parametersIntegrated: true,
      optimizationApplied: true,
      aspectRatioPreserved: true,
    },
    customResponse: {
      metadata: {
        model: 'gemini-2.5-flash-image-preview',
        prompt: 'Enhanced structured prompt',
        mimeType: 'image/png',
        timestamp: new Date(),
        inputImageProvided: false,
        contextMethod: 'structured_prompt_to_image',
      } as GeminiGenerationMetadata,
    },
  })

  return factory.create()
}

/**
 * Global mock factory instance for test sharing
 */
export const geminiImageClientMockFactory = new GeminiImageClientMockFactory()
