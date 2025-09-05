/**
 * Type definitions for 2-stage processing integration
 * Defines types for coordinating structured prompt generation with image generation
 */

import type { GeneratedImageResult } from '../api/geminiClient'
import type { OrchestrationOptions, OrchestrationResult } from '../business/promptOrchestrator'
import type { GeminiAPIError, NetworkError } from '../utils/errors'
import type { Result } from './result'

/**
 * Image generation request with orchestration options
 */
export interface ImageGenerationRequest {
  originalPrompt: string
  orchestrationOptions?: OrchestrationOptions
  imageParameters?: ImageParameters
}

/**
 * Base image generation parameters
 */
export interface ImageParameters {
  inputImage?: Buffer
  blendImages?: boolean
  maintainCharacterConsistency?: boolean
  useWorldKnowledge?: boolean
  aspectRatio?: string
  quality?: 'low' | 'medium' | 'high'
  style?: 'enhanced' | 'natural' | 'artistic'
}

/**
 * Optimized parameters based on structured prompt analysis
 */
export interface OptimizedParameters extends ImageParameters {
  additionalParameters?: Record<string, unknown>
  optimizationReasons?: string[]
}

/**
 * Metadata for individual processing stages
 */
export interface StageMetadata {
  stageName: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  startTime: Date
  endTime?: Date
  processingTime?: number
  error?: Error
  inputData?: unknown
  outputData?: unknown
}

/**
 * Complete processing metadata for 2-stage workflow
 */
export interface ProcessingMetadata {
  sessionId: string
  originalPrompt: string
  stages: StageMetadata[]
  totalProcessingTime: number
  promptEnhancementTime: number
  imageGenerationTime: number
  appliedOptimizations: string[]
  fallbackUsed: boolean
  timestamp: Date
}

/**
 * Result of complete 2-stage processing
 */
export interface TwoStageResult {
  originalPrompt: string
  structuredPrompt: string
  generatedImage: GeneratedImageResult
  processingMetadata: ProcessingMetadata
  optimizedParameters: OptimizedParameters
  orchestrationResult: OrchestrationResult
  success: boolean
}

/**
 * Interface for parameter optimization based on structured prompts
 */
export interface ParameterOptimizer {
  optimizeForStructuredPrompt(
    structuredPrompt: string,
    baseParams: ImageParameters
  ): Promise<Result<OptimizedParameters, GeminiAPIError>>

  analyzePromptCharacteristics(prompt: string): PromptCharacteristics
}

/**
 * Analysis result of prompt characteristics for optimization
 */
export interface PromptCharacteristics {
  complexity: 'simple' | 'medium' | 'complex'
  contentType: 'portrait' | 'landscape' | 'object' | 'scene' | 'abstract'
  suggestedAspectRatio: string
  suggestedQuality: 'low' | 'medium' | 'high'
  suggestedStyle: 'enhanced' | 'natural' | 'artistic'
  detectedElements: string[]
  recommendedFeatures: {
    blendImages?: boolean
    maintainCharacterConsistency?: boolean
    useWorldKnowledge?: boolean
  }
}

/**
 * Main interface for 2-stage processing coordination
 */
export interface TwoStageProcessor {
  generateImageWithStructuredPrompt(
    request: ImageGenerationRequest
  ): Promise<Result<TwoStageResult, GeminiAPIError | NetworkError>>

  optimizeImageParameters(
    structuredPrompt: string,
    baseParams: ImageParameters
  ): Promise<Result<OptimizedParameters, GeminiAPIError>>

  getProcessingMetadata(sessionId: string): ProcessingMetadata | undefined

  validateConfiguration(): Promise<Result<boolean, GeminiAPIError>>
}

/**
 * Options for 2-stage processor configuration
 */
export interface TwoStageProcessorOptions {
  maxProcessingTime: number
  enableParameterOptimization: boolean
  enableMetadataCollection: boolean
  fallbackStrategy: 'primary' | 'secondary' | 'tertiary'
  performanceTarget: number // in milliseconds
}

/**
 * Factory interface for dependency injection
 */
export interface TwoStageProcessorFactory {
  create(options?: TwoStageProcessorOptions): TwoStageProcessor
}
