/**
 * Type definitions for multi-image processing support
 * Supports batch processing, parallel orchestration, and multi-prompt coordination
 */

import type { GeneratedImageResult } from '../api/geminiClient'
import type { GeminiAPIError, NetworkError } from '../utils/errors'
import type { Result } from './result'
import type { ImageParameters, ProcessingMetadata, TwoStageResult } from './twoStageTypes'

/**
 * Multi-image generation request
 */
export interface MultiImageRequest {
  basePrompt: string
  imageRequirements: ImageRequirement[]
  consistencyLevel: ConsistencyLevel
  aspectRatioStrategy: AspectRatioStrategy
  processingOptions: MultiImageOptions
}

/**
 * Individual image requirement within a multi-image set
 */
export interface ImageRequirement {
  id: string
  specificPrompt?: string
  aspectRatio?: AspectRatio
  priority: number
  consistency: ConsistencyRequirement
  imageParameters?: ImageParameters
}

/**
 * Aspect ratio definitions
 */
export interface AspectRatio {
  width: number
  height: number
  ratio: string // e.g., "16:9", "1:1", "4:3"
}

/**
 * Consistency levels for multi-image processing
 */
export enum ConsistencyLevel {
  STRICT = 'strict', // All elements must match exactly
  MODERATE = 'moderate', // Key elements must match
  LOOSE = 'loose', // General style consistency only
}

/**
 * Aspect ratio strategy for multi-image sets
 */
export enum AspectRatioStrategy {
  ADAPTIVE = 'adaptive', // Choose best ratio per image
  UNIFORM = 'uniform', // Use same ratio for all
  CONTENT_DRIVEN = 'content_driven', // Ratio based on content
  LAST_IMAGE = 'last_image', // Use ratio from last uploaded image
}

/**
 * Consistency requirements for individual images
 */
export interface ConsistencyRequirement {
  maintainCharacters: boolean
  maintainStyle: boolean
  maintainEnvironment: boolean
  maintainLighting: boolean
  maintainMood: boolean
  customRules?: string[]
}

/**
 * Options for multi-image processing
 */
export interface MultiImageOptions {
  enableParallelProcessing: boolean
  maxConcurrentImages: number
  batchProcessingTimeout: number
  enableConsistencyValidation: boolean
  performanceTarget: number // in milliseconds
}

/**
 * Result of multi-image processing
 */
export interface MultiImageResult {
  basePrompt: string
  processedImages: ProcessedImageResult[]
  consistencyMetrics: ConsistencyMetrics
  processingMetadata: MultiImageProcessingMetadata
  aspectRatioSource: 'adaptive' | 'uniform' | 'content_driven' | 'last_image'
  success: boolean
}

/**
 * Individual processed image result
 */
export interface ProcessedImageResult {
  requirement: ImageRequirement
  twoStageResult: TwoStageResult
  consistencyScore: number
  aspectRatioOptimization: AspectRatioOptimizationResult
}

/**
 * Consistency metrics for the entire image set
 */
export interface ConsistencyMetrics {
  overallConsistencyScore: number
  characterConsistency: number
  styleConsistency: number
  environmentConsistency: number
  lightingConsistency: number
  moodConsistency: number
  failedValidations: string[]
}

/**
 * Multi-image specific processing metadata
 */
export interface MultiImageProcessingMetadata extends ProcessingMetadata {
  batchSize: number
  parallelProcessingUsed: boolean
  concurrentImages: number
  consistencyValidationTime: number
  aspectRatioOptimizationTime: number
  imageCoordinationTime: number
}

/**
 * Aspect ratio optimization result
 */
export interface AspectRatioOptimizationResult {
  originalRatio?: AspectRatio
  optimizedRatio: AspectRatio
  optimization: AspectRatioOptimization
  reasoning: string
}

/**
 * Aspect ratio optimization details
 */
export interface AspectRatioOptimization {
  strategy: AspectRatioStrategy
  contentAnalysis: ContentAnalysis
  recommendedRatio: AspectRatio
  confidenceScore: number
}

/**
 * Content analysis for aspect ratio optimization
 */
export interface ContentAnalysis {
  primarySubject: 'portrait' | 'landscape' | 'object' | 'scene' | 'abstract'
  composition: 'horizontal' | 'vertical' | 'square'
  elements: string[]
  rationale: string
}

/**
 * Common elements extracted across multiple images
 */
export interface CommonElements {
  characters: string[]
  style: string[]
  environment: string[]
  lighting: string[]
  mood: string[]
}

/**
 * Consistency profile for coordinating multiple images
 */
export interface ConsistencyProfile {
  level: ConsistencyLevel
  commonElements: CommonElements
  consistencyRules: ConsistencyRule[]
  enforcementPriority: 'characters' | 'style' | 'environment' | 'balanced'
}

/**
 * Individual consistency rule
 */
export interface ConsistencyRule {
  element: string
  requirement: string
  priority: number
  validation: (image: GeneratedImageResult) => boolean
}

/**
 * Image generation context enhanced with multi-image awareness
 */
export interface ImageGenerationContext {
  basePrompt: string
  enhancedPrompt: string
  requirement: ImageRequirement
  consistencyProfile: ConsistencyProfile
  aspectRatioOptimization: AspectRatioOptimization
  relatedContexts: string[] // IDs of related image contexts
}

/**
 * Result of consistency enhancement
 */
export interface ConsistencyEnhancedContexts {
  contexts: ImageGenerationContext[]
  appliedRules: ConsistencyRule[]
  consistencyScore: number
}

/**
 * Coherence validation result for image sets
 */
export interface CoherenceValidationResult {
  isCoherent: boolean
  coherenceScore: number
  validationDetails: CoherenceValidationDetail[]
  recommendations: string[]
}

/**
 * Individual coherence validation detail
 */
export interface CoherenceValidationDetail {
  aspect: 'character' | 'style' | 'environment' | 'lighting' | 'mood'
  score: number
  issues: string[]
  suggestions: string[]
}

/**
 * Uploaded image for multi-image processing
 */
export interface UploadedImage {
  id: string
  data: Buffer
  metadata: UploadedImageMetadata
  aspectRatio: AspectRatio
}

/**
 * Metadata for uploaded images
 */
export interface UploadedImageMetadata {
  filename: string
  fileSize: number
  mimeType: string
  uploadTime: Date
  dimensions: {
    width: number
    height: number
  }
}

/**
 * Processed image set result
 */
export interface ProcessedImageSet {
  images: UploadedImage[]
  consistencyValidation: ConsistencyValidationResult
  recommendedProcessingOrder: string[]
  estimatedProcessingTime: number
}

/**
 * Consistency validation result for uploaded images
 */
export interface ConsistencyValidationResult {
  isValid: boolean
  validationScore: number
  issues: ConsistencyIssue[]
  recommendations: string[]
}

/**
 * Individual consistency issue
 */
export interface ConsistencyIssue {
  type: 'aspect_ratio_mismatch' | 'style_conflict' | 'size_inconsistency' | 'format_incompatibility'
  severity: 'low' | 'medium' | 'high'
  description: string
  affectedImages: string[]
  suggestedFix: string
}

/**
 * Image edit operation
 */
export interface ImageEdit {
  imageId: string
  editType: 'enhance' | 'style_transfer' | 'aspect_ratio_change' | 'consistency_fix'
  parameters: ImageEditParameters
  requireConsistency: boolean
}

/**
 * Parameters for image editing
 */
export interface ImageEditParameters {
  prompt?: string
  style?: string
  aspectRatio?: AspectRatio
  customParameters?: Record<string, unknown>
}

/**
 * Result of consistent editing across multiple images
 */
export interface ConsistentlyEditedImages {
  editedImages: GeneratedImageResult[]
  consistencyMaintained: boolean
  consistencyScore: number
  appliedEdits: ImageEdit[]
  failedEdits: FailedEdit[]
}

/**
 * Failed edit information
 */
export interface FailedEdit {
  edit: ImageEdit
  error: GeminiAPIError | NetworkError
  fallbackApplied: boolean
}

/**
 * Main interface for multi-image coordination
 */
export interface MultiImageCoordinator {
  coordinateMultipleImages(
    request: MultiImageRequest
  ): Promise<Result<MultiImageResult, GeminiAPIError | NetworkError>>

  maintainConsistencyAcrossImages(
    images: ImageGenerationContext[],
    consistencyProfile: ConsistencyProfile
  ): Promise<Result<ConsistencyEnhancedContexts, GeminiAPIError>>

  validateImageSetCoherence(
    imageSet: GeneratedImageResult[]
  ): Promise<Result<CoherenceValidationResult, GeminiAPIError>>
}

/**
 * Interface for aspect ratio control and optimization
 */
export interface AspectRatioController {
  optimizeAspectRatios(
    requirements: ImageRequirement[],
    strategy: AspectRatioStrategy
  ): Promise<Result<OptimizedAspectRatios, GeminiAPIError>>

  analyzeContentForAspectRatio(prompt: string): Promise<Result<ContentAnalysis, GeminiAPIError>>

  selectOptimalRatio(analysis: ContentAnalysis): AspectRatio
}

/**
 * Result of aspect ratio optimization
 */
export interface OptimizedAspectRatios {
  optimizations: AspectRatioOptimizationResult[]
  strategy: AspectRatioStrategy
  overallCoherence: number
}

/**
 * Interface for multi-image upload handling
 */
export interface MultiImageUploadHandler {
  handleMultipleImageUpload(
    images: UploadedImage[],
    consistencyRequirements: ConsistencyRequirement[]
  ): Promise<Result<ProcessedImageSet, GeminiAPIError>>

  maintainEditingConsistency(
    originalImages: GeneratedImageResult[],
    edits: ImageEdit[]
  ): Promise<Result<ConsistentlyEditedImages, GeminiAPIError>>
}
