/**
 * Mock implementation for GeminiTextClient testing
 * Simulates Gemini 2.0 Flash prompt generation responses
 * Supports different response scenarios for comprehensive testing
 */

import type { Result } from '../../types/result'
import { Err, Ok } from '../../types/result'
import { GeminiAPIError, NetworkError } from '../../utils/errors'

/**
 * Parameters for structured prompt generation
 */
export interface PromptGenerationParams {
  prompt: string
  context?: string
  temperature?: number
  maxOutputTokens?: number
}

/**
 * Optimized prompt result with metadata
 */
export interface OptimizedPrompt {
  text: string
  originalPrompt: string
  appliedPractices: string[]
  metadata: {
    model: string
    processingTime: number
    timestamp: Date
    enhancementLevel: 'basic' | 'advanced' | 'complete'
  }
}

/**
 * Interface for Gemini Text Client (2.0 Flash)
 */
export interface GeminiTextClient {
  generateStructuredPrompt(
    params: PromptGenerationParams
  ): Promise<Result<OptimizedPrompt, GeminiAPIError | NetworkError>>
}

/**
 * Mock scenarios for testing different conditions
 */
export interface MockScenario {
  type: 'success' | 'api_error' | 'network_error' | 'timeout' | 'rate_limit'
  delay?: number
  customResponse?: Partial<OptimizedPrompt>
  errorMessage?: string
}

/**
 * Mock factory for GeminiTextClient with configurable scenarios
 */
export class GeminiTextClientMockFactory {
  private scenario: MockScenario = { type: 'success' }

  /**
   * Set the mock scenario for next API call
   */
  setScenario(scenario: MockScenario): void {
    this.scenario = scenario
  }

  /**
   * Create a mock instance with current scenario configuration
   */
  create(): GeminiTextClient {
    return new GeminiTextClientMock(this.scenario)
  }

  /**
   * Reset to default success scenario
   */
  reset(): void {
    this.scenario = { type: 'success' }
  }
}

/**
 * Mock implementation with realistic response simulation
 */
class GeminiTextClientMock implements GeminiTextClient {
  constructor(private scenario: MockScenario) {}

  async generateStructuredPrompt(
    params: PromptGenerationParams
  ): Promise<Result<OptimizedPrompt, GeminiAPIError | NetworkError>> {
    // Simulate processing delay
    if (this.scenario.delay) {
      await new Promise((resolve) => setTimeout(resolve, this.scenario.delay))
    }

    // Handle different error scenarios
    switch (this.scenario.type) {
      case 'network_error':
        return Err(
          new NetworkError(
            'Failed to connect to Gemini 2.0 Flash API',
            'Check your internet connection and try again'
          )
        )

      case 'api_error':
        return Err(
          new GeminiAPIError(
            this.scenario.errorMessage || 'API quota exceeded',
            'Wait before making more requests or upgrade your plan',
            429
          )
        )

      case 'timeout':
        // Return timeout error immediately without actual delay
        return Err(
          new GeminiAPIError(
            'Request timeout after 15 seconds',
            'Try with a shorter prompt or check API status'
          )
        )

      case 'rate_limit':
        return Err(
          new GeminiAPIError(
            'Rate limit exceeded for Gemini 2.0 Flash API',
            'Wait 60 seconds before making another request',
            429
          )
        )

      default:
        return Ok(this.generateMockResponse(params))
    }
  }

  /**
   * Generate realistic mock response based on input prompt
   */
  private generateMockResponse(params: PromptGenerationParams): OptimizedPrompt {
    const { prompt } = params

    // Simulate different enhancement levels based on prompt complexity
    const enhancementLevel = this.determineEnhancementLevel(prompt)
    const structuredPrompt = this.enhancePrompt(prompt, enhancementLevel)

    const mockResponse: OptimizedPrompt = {
      text: structuredPrompt,
      originalPrompt: prompt,
      appliedPractices: this.getAppliedPractices(enhancementLevel),
      metadata: {
        model: 'gemini-2.0-flash',
        processingTime: Math.floor(Math.random() * 10000) + 5000, // 5-15 seconds
        timestamp: new Date(),
        enhancementLevel,
      },
    }

    // Apply custom response overrides if provided
    if (this.scenario.customResponse) {
      Object.assign(mockResponse, this.scenario.customResponse)
    }

    return mockResponse
  }

  /**
   * Determine enhancement level based on prompt characteristics
   */
  private determineEnhancementLevel(prompt: string): 'basic' | 'advanced' | 'complete' {
    if (prompt.length < 20) return 'basic'
    if (prompt.includes('character') || prompt.includes('detailed')) return 'advanced'
    return 'complete'
  }

  /**
   * Simulate prompt enhancement with best practices
   */
  private enhancePrompt(prompt: string, level: 'basic' | 'advanced' | 'complete'): string {
    let enhanced = prompt

    // Apply different enhancements based on level
    switch (level) {
      case 'basic':
        enhanced = `Enhanced: ${prompt} with improved specificity and basic composition guidance`
        break
      case 'advanced':
        enhanced = `Advanced enhancement: ${prompt} with detailed character consistency features, purpose context, and professional camera angles including wide-angle shot perspective`
        break
      case 'complete':
        enhanced = `Complete optimization: ${prompt} transformed with hyper-specific details, character consistency maintenance, contextual purpose clarity, semantic positive expressions, optimal aspect ratio considerations, and precise cinematic control using 85mm portrait lens with Dutch angle composition`
        break
    }

    return enhanced
  }

  /**
   * Get list of applied best practices based on enhancement level
   */
  private getAppliedPractices(level: 'basic' | 'advanced' | 'complete'): string[] {
    const practices = []

    switch (level) {
      case 'complete':
        practices.push('camera-control', 'aspect-ratio', 'semantic-negatives')
        practices.push('character-consistency', 'context-intent', 'iterate-refine')
        practices.push('hyper-specific')
        break
      case 'advanced':
        practices.push('character-consistency', 'context-intent', 'iterate-refine')
        practices.push('hyper-specific')
        break
      case 'basic':
        practices.push('hyper-specific')
        break
    }

    return practices
  }
}

/**
 * Convenience function to create a basic success mock
 */
export function createSuccessfulGeminiTextClientMock(
  customResponse?: Partial<OptimizedPrompt>
): GeminiTextClient {
  const factory = new GeminiTextClientMockFactory()
  factory.setScenario({
    type: 'success',
    delay: 100, // Small delay to simulate async operation without blocking tests
    ...(customResponse && { customResponse }),
  })
  return factory.create()
}

/**
 * Convenience function to create an error mock
 */
export function createErrorGeminiTextClientMock(
  errorType: 'api_error' | 'network_error' | 'timeout' | 'rate_limit' = 'api_error',
  errorMessage?: string
): GeminiTextClient {
  const factory = new GeminiTextClientMockFactory()
  factory.setScenario({
    type: errorType,
    ...(errorMessage && { errorMessage }),
  })
  return factory.create()
}

/**
 * Global mock factory instance for test sharing
 */
export const geminiTextClientMockFactory = new GeminiTextClientMockFactory()
