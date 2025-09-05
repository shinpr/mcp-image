/**
 * Parameter optimizer for image generation based on structured prompts
 * Analyzes structured prompts and optimizes image generation parameters
 */

import type { Result } from '../types/result'
import { Err, Ok } from '../types/result'
import type {
  ImageParameters,
  OptimizedParameters,
  ParameterOptimizer,
  PromptCharacteristics,
} from '../types/twoStageTypes'
import { GeminiAPIError } from '../utils/errors'

/**
 * Keywords for detecting different content types
 */
const CONTENT_TYPE_KEYWORDS = {
  portrait: ['portrait', 'headshot', 'face', 'person', 'character', 'selfie'],
  landscape: ['landscape', 'panoramic', 'vista', 'scenery', 'horizon', 'mountains', 'valley'],
  object: ['object', 'product', 'item', 'tool', 'device', 'still life'],
  scene: ['scene', 'environment', 'setting', 'room', 'interior', 'exterior', 'building'],
  abstract: ['abstract', 'conceptual', 'artistic', 'pattern', 'texture', 'geometric'],
}

/**
 * Keywords for detecting complexity levels
 */
const COMPLEXITY_KEYWORDS = {
  simple: ['simple', 'minimal', 'clean', 'basic'],
  complex: ['detailed', 'intricate', 'complex', 'elaborate', 'ornate', 'sophisticated'],
}

/**
 * Keywords for detecting cinematic content
 */
const CINEMATIC_KEYWORDS = [
  'cinematic',
  'wide-angle',
  'dramatic',
  'professional photography',
  'film',
  'movie',
  'camera angle',
  'shot',
  'lighting',
  'composition',
]

/**
 * Keywords for detecting character features
 */
const CHARACTER_KEYWORDS = [
  'eyes',
  'hair',
  'face',
  'facial features',
  'expression',
  'character',
  'person',
]

/**
 * Implementation of parameter optimization based on structured prompt analysis
 */
export class ParameterOptimizerImpl implements ParameterOptimizer {
  /**
   * Optimize parameters based on structured prompt analysis
   */
  async optimizeForStructuredPrompt(
    structuredPrompt: string,
    baseParams: ImageParameters
  ): Promise<Result<OptimizedParameters, GeminiAPIError>> {
    try {
      const characteristics = this.analyzePromptCharacteristics(structuredPrompt)
      const optimizationReasons: string[] = []

      // Start with base parameters
      const optimized: OptimizedParameters = {
        ...baseParams,
        optimizationReasons,
      }

      // Optimize aspect ratio based on content type
      if (
        !baseParams.aspectRatio ||
        this.shouldOptimizeAspectRatio(characteristics, baseParams.aspectRatio)
      ) {
        optimized.aspectRatio = characteristics.suggestedAspectRatio
        optimizationReasons.push(
          `aspect ratio optimized for ${characteristics.contentType} content`
        )
      } else {
        optimizationReasons.push('aspect ratio preserved - appropriate for content')
      }

      // Optimize quality based on complexity and content requirements
      if (this.shouldUpgradeQuality(characteristics, baseParams.quality)) {
        optimized.quality = characteristics.suggestedQuality
        optimizationReasons.push(`quality upgraded for ${characteristics.complexity} content`)
      }

      // Optimize style based on prompt analysis
      // Only change style if no style was specified in baseParams
      if (baseParams.style) {
        // Keep the explicitly provided style
        optimized.style = baseParams.style
        optimizationReasons.push('style preserved - explicitly provided')
      } else if (this.shouldOptimizeStyle(characteristics, baseParams.style)) {
        optimized.style = characteristics.suggestedStyle
        optimizationReasons.push('style optimized for detected content characteristics')
      }

      // Apply feature recommendations
      if (
        characteristics.recommendedFeatures.maintainCharacterConsistency &&
        !baseParams.maintainCharacterConsistency
      ) {
        optimized.maintainCharacterConsistency = true
        optimizationReasons.push('character features detected - enabled consistency maintenance')
      }

      if (characteristics.recommendedFeatures.blendImages && !baseParams.blendImages) {
        optimized.blendImages = true
        optimizationReasons.push('multiple elements detected - enabled blending')
      }

      if (characteristics.recommendedFeatures.useWorldKnowledge && !baseParams.useWorldKnowledge) {
        optimized.useWorldKnowledge = true
        optimizationReasons.push('world knowledge requirements detected')
      }

      // Add cinematic optimization if detected
      if (this.detectsCinematicContent(structuredPrompt)) {
        optimizationReasons.push('cinematic composition detected')
        if (optimized.aspectRatio === '1:1') {
          optimized.aspectRatio = '16:9'
          optimizationReasons.push('aspect ratio adjusted for cinematic content')
        }
      }

      // Add macro photography detection
      if (this.detectsMacroContent(structuredPrompt)) {
        optimized.quality = 'high'
        optimized.style = 'enhanced'
        optimizationReasons.push('macro photography detected - enhanced quality and detail')
      }

      return Ok(optimized)
    } catch (error) {
      return Err(
        new GeminiAPIError(
          `Parameter optimization failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'Check prompt format and try again'
        )
      )
    }
  }

  /**
   * Analyze prompt characteristics for optimization
   */
  analyzePromptCharacteristics(prompt: string): PromptCharacteristics {
    const lowerPrompt = prompt.toLowerCase()

    // Detect content type
    const contentType = this.detectContentType(lowerPrompt)

    // Detect complexity
    const complexity = this.detectComplexity(lowerPrompt)

    // Generate suggestions based on analysis
    const suggestedAspectRatio = this.suggestAspectRatio(contentType, lowerPrompt)
    const suggestedQuality = this.suggestQuality(complexity, lowerPrompt)
    const suggestedStyle = this.suggestStyle(lowerPrompt)

    // Extract detected elements
    const detectedElements = this.extractElements(lowerPrompt)

    // Recommend features based on content
    const recommendedFeatures = this.recommendFeatures(lowerPrompt)

    return {
      complexity,
      contentType,
      suggestedAspectRatio,
      suggestedQuality,
      suggestedStyle,
      detectedElements,
      recommendedFeatures,
    }
  }

  /**
   * Detect content type from prompt
   */
  private detectContentType(prompt: string): PromptCharacteristics['contentType'] {
    for (const [type, keywords] of Object.entries(CONTENT_TYPE_KEYWORDS)) {
      if (keywords.some((keyword) => prompt.includes(keyword))) {
        return type as PromptCharacteristics['contentType']
      }
    }
    return 'scene' // Default fallback
  }

  /**
   * Detect complexity level
   */
  private detectComplexity(prompt: string): PromptCharacteristics['complexity'] {
    const simpleScore = COMPLEXITY_KEYWORDS.simple.filter((keyword) =>
      prompt.includes(keyword)
    ).length
    const complexScore = COMPLEXITY_KEYWORDS.complex.filter((keyword) =>
      prompt.includes(keyword)
    ).length

    if (complexScore > simpleScore) return 'complex'
    if (simpleScore > complexScore) return 'simple'
    return 'medium'
  }

  /**
   * Suggest optimal aspect ratio based on content type
   */
  private suggestAspectRatio(
    contentType: PromptCharacteristics['contentType'],
    prompt: string
  ): string {
    // Check for specific aspect ratio hints in prompt
    if (prompt.includes('panoramic') || prompt.includes('wide')) return '21:9'
    if (prompt.includes('cinematic')) return '16:9'
    if (prompt.includes('square') || prompt.includes('instagram')) return '1:1'

    // Default based on content type
    switch (contentType) {
      case 'portrait':
        return '3:4'
      case 'landscape':
        return '16:9'
      case 'object':
        return '1:1'
      case 'scene':
        return '16:9'
      case 'abstract':
        return '1:1'
      default:
        return '16:9'
    }
  }

  /**
   * Suggest quality level based on complexity and requirements
   */
  private suggestQuality(
    complexity: PromptCharacteristics['complexity'],
    prompt: string
  ): NonNullable<ImageParameters['quality']> {
    if (
      prompt.includes('high detail') ||
      prompt.includes('professional') ||
      prompt.includes('macro')
    ) {
      return 'high'
    }
    if (prompt.includes('sketch') || prompt.includes('rough') || prompt.includes('simple')) {
      return 'medium'
    }

    return complexity === 'complex' ? 'high' : 'medium'
  }

  /**
   * Suggest style based on prompt content
   */
  private suggestStyle(prompt: string): NonNullable<ImageParameters['style']> {
    if (prompt.includes('artistic') || prompt.includes('creative') || prompt.includes('stylized')) {
      return 'artistic'
    }
    if (
      prompt.includes('enhanced') ||
      prompt.includes('detailed') ||
      prompt.includes('professional')
    ) {
      return 'enhanced'
    }
    return 'natural'
  }

  /**
   * Extract key elements from prompt
   */
  private extractElements(prompt: string): string[] {
    const elements: string[] = []

    // Simple element extraction - can be enhanced with NLP
    const elementPatterns = [
      /\b(lighting|light)\b/g,
      /\b(color|colours?)\b/g,
      /\b(texture|textures?)\b/g,
      /\b(composition)\b/g,
      /\b(atmosphere|mood)\b/g,
      /\b(details?)\b/g,
    ]

    elementPatterns.forEach((pattern) => {
      const matches = prompt.match(pattern)
      if (matches) {
        elements.push(...matches)
      }
    })

    return [...new Set(elements)] // Remove duplicates
  }

  /**
   * Recommend features based on prompt analysis
   */
  private recommendFeatures(prompt: string): PromptCharacteristics['recommendedFeatures'] {
    return {
      blendImages:
        prompt.includes('blend') || prompt.includes('combine') || prompt.includes('merge'),
      maintainCharacterConsistency: CHARACTER_KEYWORDS.some((keyword) => prompt.includes(keyword)),
      useWorldKnowledge:
        prompt.includes('historical') || prompt.includes('real') || prompt.includes('accurate'),
    }
  }

  /**
   * Check if aspect ratio should be optimized
   */
  private shouldOptimizeAspectRatio(
    characteristics: PromptCharacteristics,
    currentRatio?: string
  ): boolean {
    if (!currentRatio) return true

    // Don't optimize if current ratio matches suggestion
    if (currentRatio === characteristics.suggestedAspectRatio) return false

    // Optimize if current ratio is clearly inappropriate for content type
    if (
      characteristics.contentType === 'portrait' &&
      (currentRatio === '16:9' || currentRatio === '21:9')
    ) {
      return true
    }
    if (characteristics.contentType === 'landscape' && currentRatio === '3:4') {
      return true
    }

    return false
  }

  /**
   * Check if quality should be upgraded
   */
  private shouldUpgradeQuality(
    characteristics: PromptCharacteristics,
    currentQuality?: ImageParameters['quality']
  ): boolean {
    return (
      characteristics.suggestedQuality === 'high' &&
      (currentQuality === 'low' || currentQuality === 'medium')
    )
  }

  /**
   * Check if style should be optimized
   */
  private shouldOptimizeStyle(
    characteristics: PromptCharacteristics,
    currentStyle?: ImageParameters['style']
  ): boolean {
    return !currentStyle || currentStyle !== characteristics.suggestedStyle
  }

  /**
   * Detect cinematic content
   */
  private detectsCinematicContent(prompt: string): boolean {
    const lowerPrompt = prompt.toLowerCase()
    return CINEMATIC_KEYWORDS.some((keyword) => lowerPrompt.includes(keyword))
  }

  /**
   * Detect macro photography content
   */
  private detectsMacroContent(prompt: string): boolean {
    const lowerPrompt = prompt.toLowerCase()
    return (
      lowerPrompt.includes('macro') ||
      lowerPrompt.includes('close-up') ||
      lowerPrompt.includes('extreme close-up') ||
      lowerPrompt.includes('detailed texture')
    )
  }
}
