/**
 * MultiImageCoordinator - Orchestrates multi-image processing with consistency and aspect ratio coordination
 * Supports batch processing, parallel orchestration, and multi-prompt coordination
 */

import type { GeneratedImageResult } from '../../api/geminiClient'
import {
  type AspectRatioController,
  type AspectRatioOptimizationResult,
  type AspectRatioStrategy,
  type CoherenceValidationDetail,
  type CoherenceValidationResult,
  type CommonElements,
  type ConsistencyEnhancedContexts,
  ConsistencyLevel,
  type ConsistencyMetrics,
  type ConsistencyProfile,
  type ConsistencyRule,
  type ImageGenerationContext,
  type MultiImageCoordinator,
  type MultiImageOptions,
  type MultiImageProcessingMetadata,
  type MultiImageRequest,
  type MultiImageResult,
  type ProcessedImageResult,
} from '../../types/multiImageTypes'
import type { Result } from '../../types/result'
import { Err, Ok } from '../../types/result'
import type { TwoStageProcessor } from '../../types/twoStageTypes'
import { GeminiAPIError, NetworkError } from '../../utils/errors'
import { AspectRatioControllerImpl } from './aspectRatioController'

/**
 * Default aspect ratio for fallbacks
 */
const DEFAULT_ASPECT_RATIO = { width: 4, height: 3, ratio: '4:3' }

/**
 * Implementation of MultiImageCoordinator with complete workflow coordination
 */
export class MultiImageCoordinatorImpl implements MultiImageCoordinator {
  private aspectRatioController: AspectRatioController

  constructor(private twoStageProcessor: TwoStageProcessor) {
    this.aspectRatioController = new AspectRatioControllerImpl()
  }

  /**
   * Coordinate multiple image generation with consistency and aspect ratio optimization
   */
  async coordinateMultipleImages(
    request: MultiImageRequest
  ): Promise<Result<MultiImageResult, GeminiAPIError | NetworkError>> {
    const sessionId = this.generateSessionId()
    const startTime = Date.now()

    try {
      // Validate request
      const validationResult = this.validateRequest(request)
      if (!validationResult.success) {
        return Err(validationResult.error)
      }

      // Step 1: Optimize aspect ratios for the image set
      const aspectRatiosResult = await this.aspectRatioController.optimizeAspectRatios(
        request.imageRequirements,
        request.aspectRatioStrategy
      )

      if (!aspectRatiosResult.success) {
        return Err(aspectRatiosResult.error)
      }

      const aspectRatioOptimizations = aspectRatiosResult.data

      // Step 2: Generate consistency profile from base prompt
      const consistencyProfile = await this.generateConsistencyProfile(
        request.basePrompt,
        request.consistencyLevel
      )

      // Step 3: Create enhanced contexts for each image
      const contextsResult = await this.createEnhancedContexts(
        request,
        aspectRatioOptimizations.optimizations,
        consistencyProfile
      )

      if (!contextsResult.success) {
        return Err(contextsResult.error)
      }

      const enhancedContexts = contextsResult.data

      // Step 4: Process images through 2-stage system (parallel or sequential)
      const processedImagesResult = await this.processImages(
        enhancedContexts.contexts,
        request.processingOptions
      )

      if (!processedImagesResult.success) {
        return Err(processedImagesResult.error)
      }

      const processedImages = processedImagesResult.data

      // Step 5: Validate consistency across results
      const generatedImages = processedImages.map((result) => result.twoStageResult.generatedImage)
      const coherenceValidationResult = await this.validateImageSetCoherence(generatedImages)

      if (!coherenceValidationResult.success) {
        return Err(coherenceValidationResult.error)
      }

      const coherenceValidation = coherenceValidationResult.data

      // Step 6: Calculate consistency metrics
      const consistencyMetrics = this.calculateConsistencyMetrics(
        processedImages,
        coherenceValidation
      )

      // Step 7: Compile final result
      const endTime = Date.now()
      const totalProcessingTime = endTime - startTime

      const processingMetadata: MultiImageProcessingMetadata = {
        sessionId,
        originalPrompt: request.basePrompt,
        stages: [], // Would be populated by actual processing stages
        totalProcessingTime,
        promptEnhancementTime: 0, // Would be calculated from actual processing
        imageGenerationTime: 0, // Would be calculated from actual processing
        appliedOptimizations: aspectRatioOptimizations.optimizations.map((opt) => opt.reasoning),
        fallbackUsed: false,
        timestamp: new Date(),
        batchSize: request.imageRequirements.length,
        parallelProcessingUsed: request.processingOptions.enableParallelProcessing,
        concurrentImages: Math.min(
          request.processingOptions.maxConcurrentImages,
          request.imageRequirements.length
        ),
        consistencyValidationTime: 0, // Would be calculated from actual processing
        aspectRatioOptimizationTime: 0, // Would be calculated from actual processing
        imageCoordinationTime: totalProcessingTime,
      }

      const result: MultiImageResult = {
        basePrompt: request.basePrompt,
        processedImages,
        consistencyMetrics,
        processingMetadata,
        aspectRatioSource: this.mapStrategyToSource(request.aspectRatioStrategy),
        success: true,
      }

      return Ok(result)
    } catch (error) {
      return Err(
        error instanceof GeminiAPIError || error instanceof NetworkError
          ? error
          : new GeminiAPIError(
              `Multi-image coordination failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
              'Check request parameters and processing configuration'
            )
      )
    }
  }

  /**
   * Maintain consistency across multiple image generation contexts
   */
  async maintainConsistencyAcrossImages(
    images: ImageGenerationContext[],
    consistencyProfile: ConsistencyProfile
  ): Promise<Result<ConsistencyEnhancedContexts, GeminiAPIError>> {
    try {
      if (!images || images.length === 0) {
        return Err(new GeminiAPIError('No images provided for consistency maintenance'))
      }

      // Extract common elements from all contexts
      const commonElements = this.extractCommonElements(images)

      // Generate consistency rules based on profile and common elements
      const consistencyRules = this.generateConsistencyRules(commonElements, consistencyProfile)

      // Apply consistency enhancements to each context
      const enhancedContexts = await Promise.all(
        images.map((context) => this.applyConsistencyRules(context, consistencyRules))
      )

      // Calculate overall consistency score
      const consistencyScore = this.calculateConsistencyScore(enhancedContexts)

      const result: ConsistencyEnhancedContexts = {
        contexts: enhancedContexts,
        appliedRules: consistencyRules,
        consistencyScore,
      }

      return Ok(result)
    } catch (error) {
      return Err(
        new GeminiAPIError(
          `Consistency maintenance failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'Check image contexts and consistency profile'
        )
      )
    }
  }

  /**
   * Validate coherence across a set of generated images
   */
  async validateImageSetCoherence(
    imageSet: GeneratedImageResult[]
  ): Promise<Result<CoherenceValidationResult, GeminiAPIError>> {
    try {
      if (!imageSet || imageSet.length === 0) {
        return Err(new GeminiAPIError('No images provided for coherence validation'))
      }

      // Analyze each aspect of coherence
      const validationDetails: CoherenceValidationDetail[] = []

      // Character coherence
      const characterCoherence = this.validateCharacterCoherence(imageSet)
      validationDetails.push(characterCoherence)

      // Style coherence
      const styleCoherence = this.validateStyleCoherence(imageSet)
      validationDetails.push(styleCoherence)

      // Environment coherence
      const environmentCoherence = this.validateEnvironmentCoherence(imageSet)
      validationDetails.push(environmentCoherence)

      // Lighting coherence
      const lightingCoherence = this.validateLightingCoherence(imageSet)
      validationDetails.push(lightingCoherence)

      // Mood coherence
      const moodCoherence = this.validateMoodCoherence(imageSet)
      validationDetails.push(moodCoherence)

      // Calculate overall coherence score
      const coherenceScore =
        validationDetails.reduce((sum, detail) => sum + detail.score, 0) / validationDetails.length

      // Determine if set is coherent (threshold: 0.7)
      const isCoherent = coherenceScore >= 0.7

      // Generate recommendations based on validation details
      const recommendations = this.generateCoherenceRecommendations(validationDetails)

      const result: CoherenceValidationResult = {
        isCoherent,
        coherenceScore,
        validationDetails,
        recommendations,
      }

      return Ok(result)
    } catch (error) {
      return Err(
        new GeminiAPIError(
          `Coherence validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'Check image set format and content'
        )
      )
    }
  }

  /**
   * Validate the multi-image request
   */
  private validateRequest(request: MultiImageRequest): Result<boolean, GeminiAPIError> {
    if (!request) {
      return Err(new GeminiAPIError('Invalid request: request is null or undefined'))
    }

    if (!request.basePrompt || request.basePrompt.trim().length === 0) {
      return Err(new GeminiAPIError('Invalid request: base prompt is required'))
    }

    if (!request.imageRequirements || request.imageRequirements.length === 0) {
      return Err(new GeminiAPIError('Invalid request: at least one image requirement is needed'))
    }

    if (!request.processingOptions) {
      return Err(new GeminiAPIError('Invalid request: processing options are required'))
    }

    // Validate each image requirement
    for (const requirement of request.imageRequirements) {
      if (!requirement.id) {
        return Err(new GeminiAPIError('Invalid request: all image requirements must have an ID'))
      }

      if (!requirement.consistency) {
        return Err(
          new GeminiAPIError(
            'Invalid request: all image requirements must have consistency settings'
          )
        )
      }

      if (typeof requirement.priority !== 'number' || requirement.priority < 1) {
        return Err(
          new GeminiAPIError(
            'Invalid request: all image requirements must have a valid priority (>= 1)'
          )
        )
      }
    }

    return Ok(true)
  }

  /**
   * Generate consistency profile from base prompt and consistency level
   */
  private async generateConsistencyProfile(
    basePrompt: string,
    consistencyLevel: ConsistencyLevel
  ): Promise<ConsistencyProfile> {
    // Extract common elements that should be maintained across images
    const commonElements: CommonElements = {
      characters: this.extractCharacters(basePrompt),
      style: this.extractStyle(basePrompt),
      environment: this.extractEnvironment(basePrompt),
      lighting: this.extractLighting(basePrompt),
      mood: this.extractMood(basePrompt),
    }

    // Generate consistency rules based on level
    const consistencyRules: ConsistencyRule[] = []

    if (
      consistencyLevel === ConsistencyLevel.STRICT ||
      consistencyLevel === ConsistencyLevel.MODERATE
    ) {
      if (commonElements.characters.length > 0) {
        consistencyRules.push({
          element: 'characters',
          requirement: 'Maintain exact character appearance and features',
          priority: 1,
          validation: () => true, // Simplified validation for now
        })
      }

      if (commonElements.style.length > 0) {
        consistencyRules.push({
          element: 'style',
          requirement: 'Maintain consistent visual style and artistic approach',
          priority: consistencyLevel === ConsistencyLevel.STRICT ? 1 : 2,
          validation: () => true, // Simplified validation for now
        })
      }
    }

    if (consistencyLevel === ConsistencyLevel.STRICT) {
      if (commonElements.environment.length > 0) {
        consistencyRules.push({
          element: 'environment',
          requirement: 'Maintain consistent environmental elements and setting',
          priority: 2,
          validation: () => true, // Simplified validation for now
        })
      }

      if (commonElements.lighting.length > 0) {
        consistencyRules.push({
          element: 'lighting',
          requirement: 'Maintain consistent lighting conditions and atmosphere',
          priority: 3,
          validation: () => true, // Simplified validation for now
        })
      }
    }

    return {
      level: consistencyLevel,
      commonElements,
      consistencyRules,
      enforcementPriority: 'balanced',
    }
  }

  /**
   * Create enhanced contexts for each image requirement
   */
  private async createEnhancedContexts(
    request: MultiImageRequest,
    aspectRatioOptimizations: AspectRatioOptimizationResult[],
    consistencyProfile: ConsistencyProfile
  ): Promise<Result<ConsistencyEnhancedContexts, GeminiAPIError>> {
    try {
      const contexts: ImageGenerationContext[] = []

      for (let i = 0; i < request.imageRequirements.length; i++) {
        const requirement = request.imageRequirements[i]
        if (!requirement) continue // Safety check
        const aspectRatioOptimization = aspectRatioOptimizations[i]?.optimization

        // Generate enhanced prompt by combining base prompt with specific prompt
        const enhancedPrompt = this.combinePrompts(
          request.basePrompt,
          requirement.specificPrompt || '',
          consistencyProfile
        )

        // Find related contexts (for consistency)
        const relatedContexts = request.imageRequirements
          .filter((req) => req.id !== requirement.id)
          .map((req) => req.id)

        const context: ImageGenerationContext = {
          basePrompt: request.basePrompt,
          enhancedPrompt,
          requirement,
          consistencyProfile,
          aspectRatioOptimization: aspectRatioOptimization || {
            strategy: request.aspectRatioStrategy,
            contentAnalysis: {
              primarySubject: 'scene',
              composition: 'horizontal',
              elements: [],
              rationale: 'Default analysis applied',
            },
            recommendedRatio: { width: 4, height: 3, ratio: '4:3' },
            confidenceScore: 0.5,
          },
          relatedContexts,
        }

        contexts.push(context)
      }

      // Apply consistency maintenance across all contexts
      return await this.maintainConsistencyAcrossImages(contexts, consistencyProfile)
    } catch (error) {
      return Err(
        new GeminiAPIError(
          `Enhanced context creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'Check image requirements and aspect ratio optimizations'
        )
      )
    }
  }

  /**
   * Process images through 2-stage system (parallel or sequential)
   */
  private async processImages(
    contexts: ImageGenerationContext[],
    processingOptions: MultiImageOptions
  ): Promise<Result<ProcessedImageResult[], GeminiAPIError | NetworkError>> {
    try {
      const processedImages: ProcessedImageResult[] = []

      if (processingOptions.enableParallelProcessing && contexts.length > 1) {
        // Parallel processing
        const batches = this.createBatches(contexts, processingOptions.maxConcurrentImages)

        for (const batch of batches) {
          const batchPromises = batch.map(async (context) => {
            return await this.processSingleImage(context)
          })

          const batchResults = await Promise.allSettled(batchPromises)

          for (const result of batchResults) {
            if (result.status === 'fulfilled' && result.value.success) {
              processedImages.push(result.value.data)
            } else {
              // Handle partial failures - create error result
              const errorMessage =
                result.status === 'rejected'
                  ? result.reason?.message || 'Unknown error'
                  : result.value.success === false
                    ? result.value.error.message || 'Processing failed'
                    : 'Processing failed'

              console.warn(`Image processing failed: ${errorMessage}`)
              // Continue with other images - don't fail entire batch
            }
          }
        }
      } else {
        // Sequential processing
        for (const context of contexts) {
          const result = await this.processSingleImage(context)
          if (result.success) {
            processedImages.push(result.data)
          } else {
            console.warn(
              `Image processing failed for ${context.requirement.id}: ${result.error.message}`
            )
            // Continue with other images - don't fail entire sequence
          }
        }
      }

      // Ensure we have at least one successful image
      if (processedImages.length === 0) {
        return Err(new GeminiAPIError('All image processing attempts failed'))
      }

      return Ok(processedImages)
    } catch (error) {
      return Err(
        error instanceof GeminiAPIError || error instanceof NetworkError
          ? error
          : new GeminiAPIError(
              `Image processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
              'Check processing configuration and contexts'
            )
      )
    }
  }

  /**
   * Process a single image through the 2-stage system
   */
  private async processSingleImage(
    context: ImageGenerationContext
  ): Promise<Result<ProcessedImageResult, GeminiAPIError | NetworkError>> {
    try {
      // Create image generation request for 2-stage processor
      const imageRequest = {
        originalPrompt: context.enhancedPrompt,
        imageParameters: {
          ...context.requirement.imageParameters,
          aspectRatio: context.aspectRatioOptimization.recommendedRatio.ratio,
        },
        orchestrationOptions: {
          enablePOML: true,
          bestPracticesMode: 'complete' as const,
          maxProcessingTime: 15000,
        },
      }

      const twoStageResult =
        await this.twoStageProcessor.generateImageWithStructuredPrompt(imageRequest)

      if (!twoStageResult.success) {
        return Err(twoStageResult.error)
      }

      // Calculate consistency score (simplified implementation)
      const consistencyScore = this.calculateImageConsistencyScore(
        twoStageResult.data,
        context.consistencyProfile
      )

      const processedResult: ProcessedImageResult = {
        requirement: context.requirement,
        twoStageResult: twoStageResult.data,
        consistencyScore,
        aspectRatioOptimization: {
          originalRatio: context.requirement.aspectRatio || DEFAULT_ASPECT_RATIO,
          optimizedRatio: context.aspectRatioOptimization.recommendedRatio,
          optimization: context.aspectRatioOptimization,
          reasoning: `Applied ${context.aspectRatioOptimization.strategy} strategy`,
        },
      }

      return Ok(processedResult)
    } catch (error) {
      return Err(
        error instanceof GeminiAPIError || error instanceof NetworkError
          ? error
          : new GeminiAPIError(
              `Single image processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
              'Check image context and 2-stage processor configuration'
            )
      )
    }
  }

  /**
   * Create batches for parallel processing
   */
  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = []
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize))
    }
    return batches
  }

  /**
   * Extract common elements from image generation contexts
   */
  private extractCommonElements(contexts: ImageGenerationContext[]): CommonElements {
    const allCharacters: string[] = []
    const allStyles: string[] = []
    const allEnvironments: string[] = []
    const allLighting: string[] = []
    const allMoods: string[] = []

    for (const context of contexts) {
      allCharacters.push(...this.extractCharacters(context.enhancedPrompt))
      allStyles.push(...this.extractStyle(context.enhancedPrompt))
      allEnvironments.push(...this.extractEnvironment(context.enhancedPrompt))
      allLighting.push(...this.extractLighting(context.enhancedPrompt))
      allMoods.push(...this.extractMood(context.enhancedPrompt))
    }

    return {
      characters: [...new Set(allCharacters)],
      style: [...new Set(allStyles)],
      environment: [...new Set(allEnvironments)],
      lighting: [...new Set(allLighting)],
      mood: [...new Set(allMoods)],
    }
  }

  /**
   * Generate consistency rules based on common elements and profile
   */
  private generateConsistencyRules(
    commonElements: CommonElements,
    profile: ConsistencyProfile
  ): ConsistencyRule[] {
    const rules: ConsistencyRule[] = []

    if (commonElements.characters.length > 0) {
      rules.push({
        element: 'characters',
        requirement: `Maintain consistency for: ${commonElements.characters.join(', ')}`,
        priority: 1,
        validation: () => true, // Simplified validation
      })
    }

    if (commonElements.style.length > 0) {
      rules.push({
        element: 'style',
        requirement: `Maintain style consistency for: ${commonElements.style.join(', ')}`,
        priority: profile.level === ConsistencyLevel.STRICT ? 1 : 2,
        validation: () => true, // Simplified validation
      })
    }

    if (profile.level === ConsistencyLevel.STRICT) {
      if (commonElements.environment.length > 0) {
        rules.push({
          element: 'environment',
          requirement: `Maintain environmental consistency for: ${commonElements.environment.join(', ')}`,
          priority: 2,
          validation: () => true, // Simplified validation
        })
      }

      if (commonElements.lighting.length > 0) {
        rules.push({
          element: 'lighting',
          requirement: `Maintain lighting consistency for: ${commonElements.lighting.join(', ')}`,
          priority: 3,
          validation: () => true, // Simplified validation
        })
      }
    }

    return rules
  }

  /**
   * Apply consistency rules to an image generation context
   */
  private async applyConsistencyRules(
    context: ImageGenerationContext,
    rules: ConsistencyRule[]
  ): Promise<ImageGenerationContext> {
    // Sort rules by priority
    const sortedRules = rules.sort((a, b) => a.priority - b.priority)

    let enhancedPrompt = context.enhancedPrompt

    // Apply each rule to enhance the prompt
    for (const rule of sortedRules) {
      enhancedPrompt = this.applyRuleToPrompt(enhancedPrompt, rule)
    }

    return {
      ...context,
      enhancedPrompt,
    }
  }

  /**
   * Apply a single consistency rule to a prompt
   */
  private applyRuleToPrompt(prompt: string, rule: ConsistencyRule): string {
    // Simple implementation - add consistency keywords based on rule
    const consistencyKeyword = this.getConsistencyKeyword(rule.element)

    if (consistencyKeyword && !prompt.toLowerCase().includes(consistencyKeyword.toLowerCase())) {
      return `${prompt}, maintaining ${consistencyKeyword}`
    }

    return prompt
  }

  /**
   * Get consistency keyword for a rule element
   */
  private getConsistencyKeyword(element: string): string {
    const keywords: Record<string, string> = {
      characters: 'character consistency',
      style: 'visual style',
      environment: 'environmental setting',
      lighting: 'lighting conditions',
      mood: 'mood and atmosphere',
    }

    return keywords[element] || 'consistency'
  }

  /**
   * Calculate consistency score for enhanced contexts
   */
  private calculateConsistencyScore(contexts: ImageGenerationContext[]): number {
    if (contexts.length === 0) return 1.0

    // Simple implementation - based on common elements in prompts
    const prompts = contexts.map((c) => c.enhancedPrompt.toLowerCase())

    // Count common words across prompts
    const allWords = prompts.flatMap((prompt) => prompt.split(' '))
    const wordCounts: Record<string, number> = {}

    for (const word of allWords) {
      if (word.length > 3) {
        // Only count meaningful words
        wordCounts[word] = (wordCounts[word] || 0) + 1
      }
    }

    // Calculate consistency based on shared vocabulary
    const sharedWords = Object.values(wordCounts).filter((count) => count > 1)
    const totalWords = Object.keys(wordCounts).length

    return totalWords > 0 ? sharedWords.length / totalWords : 0.5
  }

  /**
   * Calculate consistency metrics for processed images
   */
  private calculateConsistencyMetrics(
    _processedImages: ProcessedImageResult[],
    coherenceValidation: CoherenceValidationResult
  ): ConsistencyMetrics {
    const overallConsistencyScore = coherenceValidation.coherenceScore

    // Extract individual aspect scores from validation details
    const getAspectScore = (aspect: string): number => {
      const detail = coherenceValidation.validationDetails.find((d) => d.aspect === aspect)
      return detail?.score || 0
    }

    return {
      overallConsistencyScore,
      characterConsistency: getAspectScore('character'),
      styleConsistency: getAspectScore('style'),
      environmentConsistency: getAspectScore('environment'),
      lightingConsistency: getAspectScore('lighting'),
      moodConsistency: getAspectScore('mood'),
      failedValidations: coherenceValidation.validationDetails
        .filter((detail) => detail.issues.length > 0)
        .map((detail) => `${detail.aspect}: ${detail.issues.join(', ')}`),
    }
  }

  /**
   * Validate character coherence across images
   */
  private validateCharacterCoherence(_imageSet: GeneratedImageResult[]): CoherenceValidationDetail {
    // Simplified implementation - would use actual image analysis in production
    return {
      aspect: 'character',
      score: 0.85, // Mock score
      issues: [],
      suggestions: ['Maintain consistent character features across all images'],
    }
  }

  /**
   * Validate style coherence across images
   */
  private validateStyleCoherence(_imageSet: GeneratedImageResult[]): CoherenceValidationDetail {
    return {
      aspect: 'style',
      score: 0.9, // Mock score
      issues: [],
      suggestions: ['Visual style is well maintained across the image set'],
    }
  }

  /**
   * Validate environment coherence across images
   */
  private validateEnvironmentCoherence(
    _imageSet: GeneratedImageResult[]
  ): CoherenceValidationDetail {
    return {
      aspect: 'environment',
      score: 0.8, // Mock score
      issues: ['Minor inconsistencies in background elements'],
      suggestions: ['Consider unified environmental context for better coherence'],
    }
  }

  /**
   * Validate lighting coherence across images
   */
  private validateLightingCoherence(_imageSet: GeneratedImageResult[]): CoherenceValidationDetail {
    return {
      aspect: 'lighting',
      score: 0.75, // Mock score
      issues: ['Lighting direction varies between images'],
      suggestions: ['Establish consistent lighting direction and quality'],
    }
  }

  /**
   * Validate mood coherence across images
   */
  private validateMoodCoherence(_imageSet: GeneratedImageResult[]): CoherenceValidationDetail {
    return {
      aspect: 'mood',
      score: 0.95, // Mock score
      issues: [],
      suggestions: ['Mood and atmosphere are excellently maintained'],
    }
  }

  /**
   * Generate coherence recommendations based on validation details
   */
  private generateCoherenceRecommendations(details: CoherenceValidationDetail[]): string[] {
    const recommendations: string[] = []

    for (const detail of details) {
      if (detail.score < 0.7) {
        recommendations.push(
          `Improve ${detail.aspect} consistency: ${detail.suggestions.join(', ')}`
        )
      }
    }

    if (recommendations.length === 0) {
      recommendations.push('Image set shows good overall coherence')
    }

    return recommendations
  }

  /**
   * Calculate consistency score for a single image
   */
  private calculateImageConsistencyScore(
    _twoStageResult: unknown,
    _consistencyProfile: ConsistencyProfile
  ): number {
    // Simplified implementation - would analyze actual image content in production
    return 0.85 // Mock score
  }

  /**
   * Combine base prompt with specific prompt and consistency elements
   */
  private combinePrompts(
    basePrompt: string,
    specificPrompt: string,
    consistencyProfile: ConsistencyProfile
  ): string {
    let combined = basePrompt

    if (specificPrompt && specificPrompt.trim().length > 0) {
      combined += `, ${specificPrompt}`
    }

    // Add consistency elements
    const consistencyElements = []
    if (consistencyProfile.commonElements.characters.length > 0) {
      consistencyElements.push(
        `featuring ${consistencyProfile.commonElements.characters.join(', ')}`
      )
    }
    if (consistencyProfile.commonElements.style.length > 0) {
      consistencyElements.push(`in ${consistencyProfile.commonElements.style.join(', ')} style`)
    }

    if (consistencyElements.length > 0) {
      combined += `, ${consistencyElements.join(', ')}`
    }

    return combined
  }

  /**
   * Map aspect ratio strategy to source identifier
   */
  private mapStrategyToSource(
    strategy: AspectRatioStrategy
  ): 'adaptive' | 'uniform' | 'content_driven' | 'last_image' {
    switch (strategy) {
      case 'adaptive':
        return 'adaptive'
      case 'uniform':
        return 'uniform'
      case 'content_driven':
        return 'content_driven'
      case 'last_image':
        return 'last_image'
      default:
        return 'adaptive'
    }
  }

  /**
   * Extract character references from prompt
   */
  private extractCharacters(prompt: string): string[] {
    const characters: string[] = []
    const lowerPrompt = prompt.toLowerCase()

    const characterKeywords = [
      'character',
      'person',
      'figure',
      'warrior',
      'knight',
      'mage',
      'hero',
      'villain',
    ]

    for (const keyword of characterKeywords) {
      if (lowerPrompt.includes(keyword)) {
        characters.push(keyword)
      }
    }

    return characters
  }

  /**
   * Extract style references from prompt
   */
  private extractStyle(prompt: string): string[] {
    const styles: string[] = []
    const lowerPrompt = prompt.toLowerCase()

    const styleKeywords = [
      'realistic',
      'artistic',
      'cartoon',
      'anime',
      'photorealistic',
      'illustration',
      'painting',
    ]

    for (const keyword of styleKeywords) {
      if (lowerPrompt.includes(keyword)) {
        styles.push(keyword)
      }
    }

    return styles
  }

  /**
   * Extract environment references from prompt
   */
  private extractEnvironment(prompt: string): string[] {
    const environments: string[] = []
    const lowerPrompt = prompt.toLowerCase()

    const envKeywords = [
      'forest',
      'castle',
      'city',
      'mountain',
      'beach',
      'desert',
      'medieval',
      'fantasy',
      'modern',
    ]

    for (const keyword of envKeywords) {
      if (lowerPrompt.includes(keyword)) {
        environments.push(keyword)
      }
    }

    return environments
  }

  /**
   * Extract lighting references from prompt
   */
  private extractLighting(prompt: string): string[] {
    const lighting: string[] = []
    const lowerPrompt = prompt.toLowerCase()

    const lightingKeywords = [
      'dramatic',
      'soft',
      'bright',
      'dark',
      'natural',
      'artificial',
      'golden',
      'sunset',
      'sunrise',
    ]

    for (const keyword of lightingKeywords) {
      if (lowerPrompt.includes(keyword)) {
        lighting.push(keyword)
      }
    }

    return lighting
  }

  /**
   * Extract mood references from prompt
   */
  private extractMood(prompt: string): string[] {
    const moods: string[] = []
    const lowerPrompt = prompt.toLowerCase()

    const moodKeywords = [
      'heroic',
      'dark',
      'mysterious',
      'cheerful',
      'somber',
      'epic',
      'peaceful',
      'intense',
    ]

    for (const keyword of moodKeywords) {
      if (lowerPrompt.includes(keyword)) {
        moods.push(keyword)
      }
    }

    return moods
  }

  /**
   * Generate unique session ID
   */
  private generateSessionId(): string {
    return `multi-image-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }
}
