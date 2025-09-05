/**
 * AspectRatioController - Intelligent aspect ratio optimization for multi-image processing
 * Supports adaptive, uniform, content-driven, and last-image strategies
 */

import {
  type AspectRatio,
  type AspectRatioController,
  type AspectRatioOptimizationResult,
  AspectRatioStrategy,
  type ContentAnalysis,
  type ImageRequirement,
  type OptimizedAspectRatios,
} from '../../types/multiImageTypes'
import type { Result } from '../../types/result'
import { Err, Ok } from '../../types/result'
import { GeminiAPIError } from '../../utils/errors'

/**
 * Default aspect ratio for fallbacks
 */
const DEFAULT_ASPECT_RATIO: AspectRatio = { width: 4, height: 3, ratio: '4:3' }

/**
 * Helper function to get aspect ratio with safe fallback
 */
function getSafeAspectRatio(aspectRatio: AspectRatio | undefined): AspectRatio {
  return aspectRatio || DEFAULT_ASPECT_RATIO
}

/**
 * Standard aspect ratios for image generation
 */
const STANDARD_ASPECT_RATIOS: Record<string, AspectRatio> = {
  square: { width: 1, height: 1, ratio: '1:1' },
  portrait: { width: 3, height: 4, ratio: '3:4' },
  landscape: { width: 4, height: 3, ratio: '4:3' },
  wide: { width: 16, height: 9, ratio: '16:9' },
  ultrawide: { width: 21, height: 9, ratio: '21:9' },
  vertical: { width: 9, height: 16, ratio: '9:16' },
}

/**
 * Content type to aspect ratio mapping
 */
const CONTENT_TYPE_RATIOS: Record<string, AspectRatio> = {
  portrait: STANDARD_ASPECT_RATIOS['portrait']!,
  landscape: STANDARD_ASPECT_RATIOS['landscape']!,
  object: STANDARD_ASPECT_RATIOS['square']!,
  scene: STANDARD_ASPECT_RATIOS['wide']!,
  abstract: STANDARD_ASPECT_RATIOS['square']!,
}

/**
 * Implementation of AspectRatioController with intelligent optimization strategies
 */
export class AspectRatioControllerImpl implements AspectRatioController {
  /**
   * Optimize aspect ratios for multiple image requirements based on strategy
   */
  async optimizeAspectRatios(
    requirements: ImageRequirement[],
    strategy: AspectRatioStrategy
  ): Promise<Result<OptimizedAspectRatios, GeminiAPIError>> {
    try {
      if (!requirements || requirements.length === 0) {
        return Err(
          new GeminiAPIError('No image requirements provided for aspect ratio optimization')
        )
      }

      let optimizations: AspectRatioOptimizationResult[]

      switch (strategy) {
        case AspectRatioStrategy.ADAPTIVE:
          optimizations = await this.adaptiveOptimization(requirements)
          break
        case AspectRatioStrategy.UNIFORM:
          optimizations = await this.uniformOptimization(requirements)
          break
        case AspectRatioStrategy.CONTENT_DRIVEN:
          optimizations = await this.contentDrivenOptimization(requirements)
          break
        case AspectRatioStrategy.LAST_IMAGE:
          optimizations = await this.lastImageOptimization(requirements)
          break
        default:
          optimizations = await this.defaultOptimization(requirements)
      }

      const overallCoherence = this.calculateOverallCoherence(optimizations)

      return Ok({
        optimizations,
        strategy,
        overallCoherence,
      })
    } catch (error) {
      return Err(
        new GeminiAPIError(
          `Aspect ratio optimization failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'Check image requirements and strategy configuration'
        )
      )
    }
  }

  /**
   * Analyze content to determine optimal aspect ratio
   */
  async analyzeContentForAspectRatio(
    prompt: string
  ): Promise<Result<ContentAnalysis, GeminiAPIError>> {
    try {
      if (!prompt || prompt.trim().length === 0) {
        return Err(new GeminiAPIError('Empty prompt provided for content analysis'))
      }

      // Analyze prompt for content characteristics
      const primarySubject = this.detectPrimarySubject(prompt)
      const composition = this.determineComposition(prompt, primarySubject)
      const elements = this.extractElements(prompt)
      const rationale = this.generateRationale(primarySubject, composition, elements)

      const analysis: ContentAnalysis = {
        primarySubject,
        composition,
        elements,
        rationale,
      }

      return Ok(analysis)
    } catch (error) {
      return Err(
        new GeminiAPIError(
          `Content analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'Check prompt format and content'
        )
      )
    }
  }

  /**
   * Select optimal aspect ratio based on content analysis
   */
  selectOptimalRatio(analysis: ContentAnalysis): AspectRatio {
    // Use composition to determine base ratio
    if (analysis.composition === 'vertical') {
      // Prefer portrait ratios for vertical compositions
      if (analysis.primarySubject === 'portrait') {
        return STANDARD_ASPECT_RATIOS['portrait']!
      }
      return STANDARD_ASPECT_RATIOS['vertical']!
    }

    if (analysis.composition === 'horizontal') {
      // Prefer landscape ratios for horizontal compositions
      if (analysis.primarySubject === 'landscape' || analysis.primarySubject === 'scene') {
        return STANDARD_ASPECT_RATIOS['wide']!
      }
      return STANDARD_ASPECT_RATIOS['landscape']!
    }

    // Square composition - use content type mapping
    return CONTENT_TYPE_RATIOS[analysis.primarySubject] || STANDARD_ASPECT_RATIOS['square']!
  }

  /**
   * Adaptive optimization - choose best ratio for each image individually
   */
  private async adaptiveOptimization(
    requirements: ImageRequirement[]
  ): Promise<AspectRatioOptimizationResult[]> {
    const optimizations: AspectRatioOptimizationResult[] = []

    for (const requirement of requirements) {
      try {
        const prompt = requirement.specificPrompt || 'generic image'
        const contentAnalysisResult = await this.analyzeContentForAspectRatio(prompt)

        if (!contentAnalysisResult.success) {
          // Fallback to existing ratio or square
          const fallbackRatio = requirement.aspectRatio || STANDARD_ASPECT_RATIOS['square']!
          optimizations.push({
            originalRatio: getSafeAspectRatio(requirement.aspectRatio),
            optimizedRatio: fallbackRatio,
            optimization: {
              strategy: AspectRatioStrategy.ADAPTIVE,
              contentAnalysis: {
                primarySubject: 'abstract',
                composition: 'square',
                elements: [],
                rationale: 'Content analysis failed, using fallback ratio',
              },
              recommendedRatio: fallbackRatio!,
              confidenceScore: 0.5,
            },
            reasoning: 'Fallback applied due to content analysis failure',
          })
          continue
        }

        const contentAnalysis = contentAnalysisResult.data
        const recommendedRatio = this.selectOptimalRatio(contentAnalysis)
        const confidenceScore = this.calculateConfidenceScore(contentAnalysis)

        optimizations.push({
          originalRatio: getSafeAspectRatio(requirement.aspectRatio),
          optimizedRatio: recommendedRatio,
          optimization: {
            strategy: AspectRatioStrategy.ADAPTIVE,
            contentAnalysis,
            recommendedRatio,
            confidenceScore,
          },
          reasoning: `Adaptive optimization based on content analysis: ${contentAnalysis.rationale}`,
        })
      } catch (error) {
        // Fallback for individual requirement failure
        const fallbackRatio = requirement.aspectRatio || STANDARD_ASPECT_RATIOS['square']
        optimizations.push({
          originalRatio: getSafeAspectRatio(requirement.aspectRatio),
          optimizedRatio: fallbackRatio!,
          optimization: {
            strategy: AspectRatioStrategy.ADAPTIVE,
            contentAnalysis: {
              primarySubject: 'abstract',
              composition: 'square',
              elements: [],
              rationale: 'Error in processing, using fallback',
            },
            recommendedRatio: fallbackRatio!,
            confidenceScore: 0.3,
          },
          reasoning: `Error in adaptive optimization: ${error instanceof Error ? error.message : 'Unknown error'}`,
        })
      }
    }

    return optimizations
  }

  /**
   * Uniform optimization - use same ratio for all images
   */
  private async uniformOptimization(
    requirements: ImageRequirement[]
  ): Promise<AspectRatioOptimizationResult[]> {
    // Analyze all prompts to find most common content type
    const contentTypes: Record<string, number> = {}
    const compositions: Record<string, number> = {}

    for (const requirement of requirements) {
      try {
        const prompt = requirement.specificPrompt || 'generic image'
        const contentAnalysisResult = await this.analyzeContentForAspectRatio(prompt)

        if (contentAnalysisResult.success) {
          const analysis = contentAnalysisResult.data
          contentTypes[analysis.primarySubject] = (contentTypes[analysis.primarySubject] || 0) + 1
          compositions[analysis.composition] = (compositions[analysis.composition] || 0) + 1
        }
      } catch {}
    }

    // Find most common content type and composition
    const contentTypeKeys = Object.keys(contentTypes)
    const compositionKeys = Object.keys(compositions)

    const mostCommonContent =
      contentTypeKeys.length > 0
        ? contentTypeKeys.reduce((a, b) =>
            (contentTypes[a] || 0) > (contentTypes[b] || 0) ? a : b
          )
        : 'portrait'

    const mostCommonComposition =
      compositionKeys.length > 0
        ? compositionKeys.reduce((a, b) =>
            (compositions[a] || 0) > (compositions[b] || 0) ? a : b
          )
        : 'portrait'

    // Select uniform ratio based on most common characteristics
    const uniformAnalysis: ContentAnalysis = {
      primarySubject: mostCommonContent as unknown as ContentAnalysis['primarySubject'],
      composition: mostCommonComposition as unknown as ContentAnalysis['composition'],
      elements: ['uniform processing'],
      rationale: `Uniform ratio selected based on most common content type: ${mostCommonContent}`,
    }

    const uniformRatio = this.selectOptimalRatio(uniformAnalysis)
    const confidenceScore = this.calculateUniformConfidenceScore(contentTypes, compositions)

    // Apply same optimization to all requirements
    return requirements.map((requirement) => ({
      originalRatio: getSafeAspectRatio(requirement.aspectRatio),
      optimizedRatio: uniformRatio,
      optimization: {
        strategy: AspectRatioStrategy.UNIFORM,
        contentAnalysis: uniformAnalysis,
        recommendedRatio: uniformRatio,
        confidenceScore,
      },
      reasoning: `Uniform optimization applied: ${uniformAnalysis.rationale}`,
    }))
  }

  /**
   * Content-driven optimization - detailed content analysis for each image
   */
  private async contentDrivenOptimization(
    requirements: ImageRequirement[]
  ): Promise<AspectRatioOptimizationResult[]> {
    const optimizations: AspectRatioOptimizationResult[] = []

    for (const requirement of requirements) {
      try {
        const prompt = requirement.specificPrompt || 'generic content'
        const contentAnalysisResult = await this.analyzeContentForAspectRatio(prompt)

        if (!contentAnalysisResult.success) {
          throw new Error('Content analysis failed for content-driven optimization')
        }

        const contentAnalysis = contentAnalysisResult.data
        const recommendedRatio = this.selectOptimalRatio(contentAnalysis)

        // Enhanced confidence calculation for content-driven approach
        const confidenceScore = this.calculateContentDrivenConfidence(contentAnalysis, prompt)

        optimizations.push({
          originalRatio: getSafeAspectRatio(requirement.aspectRatio),
          optimizedRatio: recommendedRatio,
          optimization: {
            strategy: AspectRatioStrategy.CONTENT_DRIVEN,
            contentAnalysis,
            recommendedRatio,
            confidenceScore,
          },
          reasoning: `Content-driven optimization: ${contentAnalysis.rationale}`,
        })
      } catch (error) {
        // For content-driven, we want higher accuracy, so use more conservative fallback
        const fallbackRatio = requirement.aspectRatio || STANDARD_ASPECT_RATIOS['landscape']
        optimizations.push({
          originalRatio: getSafeAspectRatio(requirement.aspectRatio),
          optimizedRatio: fallbackRatio!,
          optimization: {
            strategy: AspectRatioStrategy.CONTENT_DRIVEN,
            contentAnalysis: {
              primarySubject: 'scene',
              composition: 'horizontal',
              elements: ['fallback processing'],
              rationale: 'Content-driven analysis failed, using conservative fallback',
            },
            recommendedRatio: fallbackRatio!,
            confidenceScore: 0.4,
          },
          reasoning: `Content-driven fallback: ${error instanceof Error ? error.message : 'Unknown error'}`,
        })
      }
    }

    return optimizations
  }

  /**
   * Last image optimization - use aspect ratio from the last uploaded/specified image
   */
  private async lastImageOptimization(
    requirements: ImageRequirement[]
  ): Promise<AspectRatioOptimizationResult[]> {
    if (requirements.length === 0) {
      return []
    }

    // Find the last image with an aspect ratio
    let lastImageRatio: AspectRatio = STANDARD_ASPECT_RATIOS['landscape']! // default fallback
    for (let i = requirements.length - 1; i >= 0; i--) {
      const requirementRatio = requirements[i]?.aspectRatio
      if (requirementRatio) {
        lastImageRatio = requirementRatio
        break
      }
    }

    // If no explicit aspect ratio found from uploaded images, analyze last requirement
    if (lastImageRatio === STANDARD_ASPECT_RATIOS['landscape']) {
      const lastRequirement = requirements[requirements.length - 1]
      const prompt = lastRequirement?.specificPrompt || 'last image content'
      const contentAnalysisResult = await this.analyzeContentForAspectRatio(prompt)

      if (contentAnalysisResult.success) {
        lastImageRatio = this.selectOptimalRatio(contentAnalysisResult.data)
      }
      // else keep the landscape default
    }

    // Apply last image ratio to all requirements
    const lastImageAnalysis: ContentAnalysis = {
      primarySubject: 'scene',
      composition:
        lastImageRatio.width > lastImageRatio.height
          ? 'horizontal'
          : lastImageRatio.width < lastImageRatio.height
            ? 'vertical'
            : 'square',
      elements: ['last image reference'],
      rationale: `Using aspect ratio from last image: ${lastImageRatio.ratio}`,
    }

    return requirements.map((requirement) => ({
      originalRatio: getSafeAspectRatio(requirement.aspectRatio),
      optimizedRatio: lastImageRatio,
      optimization: {
        strategy: AspectRatioStrategy.LAST_IMAGE,
        contentAnalysis: lastImageAnalysis,
        recommendedRatio: lastImageRatio,
        confidenceScore: 0.8, // High confidence for explicit user choice
      },
      reasoning: `Last image optimization: Applied ratio ${lastImageRatio.ratio} from last uploaded image`,
    }))
  }

  /**
   * Default optimization - balanced approach
   */
  private async defaultOptimization(
    requirements: ImageRequirement[]
  ): Promise<AspectRatioOptimizationResult[]> {
    // Default strategy is adaptive with fallback to landscape
    try {
      return await this.adaptiveOptimization(requirements)
    } catch {
      // Complete fallback - use landscape for all
      const fallbackRatio = STANDARD_ASPECT_RATIOS['landscape']
      return requirements.map((requirement) => ({
        originalRatio: getSafeAspectRatio(requirement.aspectRatio),
        optimizedRatio: fallbackRatio!,
        optimization: {
          strategy: AspectRatioStrategy.ADAPTIVE,
          contentAnalysis: {
            primarySubject: 'scene',
            composition: 'horizontal',
            elements: ['default processing'],
            rationale: 'Default optimization applied due to processing failure',
          },
          recommendedRatio: fallbackRatio!,
          confidenceScore: 0.6,
        },
        reasoning: 'Default optimization applied',
      }))
    }
  }

  /**
   * Detect primary subject type from prompt
   */
  private detectPrimarySubject(prompt: string): ContentAnalysis['primarySubject'] {
    const lowerPrompt = prompt.toLowerCase()

    if (
      lowerPrompt.includes('portrait') ||
      lowerPrompt.includes('face') ||
      lowerPrompt.includes('person') ||
      lowerPrompt.includes('character') ||
      lowerPrompt.includes('headshot')
    ) {
      return 'portrait'
    }

    if (
      lowerPrompt.includes('landscape') ||
      lowerPrompt.includes('mountain') ||
      lowerPrompt.includes('horizon') ||
      lowerPrompt.includes('valley') ||
      lowerPrompt.includes('vista')
    ) {
      return 'landscape'
    }

    if (
      lowerPrompt.includes('scene') ||
      lowerPrompt.includes('environment') ||
      lowerPrompt.includes('setting') ||
      lowerPrompt.includes('background') ||
      lowerPrompt.includes('location')
    ) {
      return 'scene'
    }

    if (
      lowerPrompt.includes('object') ||
      lowerPrompt.includes('product') ||
      lowerPrompt.includes('item') ||
      lowerPrompt.includes('tool') ||
      lowerPrompt.includes('artifact')
    ) {
      return 'object'
    }

    if (
      lowerPrompt.includes('abstract') ||
      lowerPrompt.includes('pattern') ||
      lowerPrompt.includes('texture') ||
      lowerPrompt.includes('concept') ||
      lowerPrompt.includes('artistic')
    ) {
      return 'abstract'
    }

    return 'scene' // Default to scene for unknown content
  }

  /**
   * Determine composition orientation from prompt and subject
   */
  private determineComposition(
    prompt: string,
    primarySubject: string
  ): ContentAnalysis['composition'] {
    const lowerPrompt = prompt.toLowerCase()

    // Explicit orientation keywords
    if (
      lowerPrompt.includes('vertical') ||
      lowerPrompt.includes('tall') ||
      lowerPrompt.includes('upright')
    ) {
      return 'vertical'
    }
    if (
      lowerPrompt.includes('horizontal') ||
      lowerPrompt.includes('wide') ||
      lowerPrompt.includes('panoramic')
    ) {
      return 'horizontal'
    }
    if (
      lowerPrompt.includes('square') ||
      lowerPrompt.includes('centered') ||
      lowerPrompt.includes('balanced')
    ) {
      return 'square'
    }

    // Infer from primary subject
    if (primarySubject === 'portrait') {
      return 'vertical'
    }
    if (primarySubject === 'landscape') {
      return 'horizontal'
    }
    if (primarySubject === 'object' || primarySubject === 'abstract') {
      return 'square'
    }

    // Scene analysis
    if (
      lowerPrompt.includes('action') ||
      lowerPrompt.includes('movement') ||
      lowerPrompt.includes('running') ||
      lowerPrompt.includes('flying')
    ) {
      return 'horizontal'
    }

    return 'horizontal' // Default to horizontal for unknown composition
  }

  /**
   * Extract relevant elements from prompt
   */
  private extractElements(prompt: string): string[] {
    const elements: string[] = []
    const lowerPrompt = prompt.toLowerCase()

    // Character elements
    if (
      lowerPrompt.includes('character') ||
      lowerPrompt.includes('person') ||
      lowerPrompt.includes('figure')
    ) {
      elements.push('character')
    }

    // Environmental elements
    if (
      lowerPrompt.includes('environment') ||
      lowerPrompt.includes('background') ||
      lowerPrompt.includes('setting')
    ) {
      elements.push('environment')
    }

    // Action elements
    if (
      lowerPrompt.includes('action') ||
      lowerPrompt.includes('movement') ||
      lowerPrompt.includes('dynamic')
    ) {
      elements.push('action')
    }

    // Object elements
    if (
      lowerPrompt.includes('object') ||
      lowerPrompt.includes('item') ||
      lowerPrompt.includes('prop')
    ) {
      elements.push('object')
    }

    // Lighting elements
    if (
      lowerPrompt.includes('lighting') ||
      lowerPrompt.includes('light') ||
      lowerPrompt.includes('shadow')
    ) {
      elements.push('lighting')
    }

    return elements.length > 0 ? elements : ['generic']
  }

  /**
   * Generate rationale for aspect ratio selection
   */
  private generateRationale(
    primarySubject: string,
    composition: string,
    elements: string[]
  ): string {
    const baseRationale = `${primarySubject} content with ${composition} composition`

    if (elements.length > 0) {
      return `${baseRationale} featuring ${elements.join(', ')} elements`
    }

    return baseRationale
  }

  /**
   * Calculate confidence score for content analysis
   */
  private calculateConfidenceScore(analysis: ContentAnalysis): number {
    let confidence = 0.5 // Base confidence

    // Increase confidence based on detected elements
    if (analysis.elements.length > 0) {
      confidence += 0.2
    }

    // Increase confidence for clear subject types
    if (analysis.primarySubject === 'portrait' || analysis.primarySubject === 'landscape') {
      confidence += 0.2
    }

    // Increase confidence for clear compositions
    if (analysis.composition !== 'square') {
      confidence += 0.1
    }

    return Math.min(confidence, 1.0)
  }

  /**
   * Calculate confidence score for uniform optimization
   */
  private calculateUniformConfidenceScore(
    contentTypes: Record<string, number>,
    compositions: Record<string, number>
  ): number {
    const totalContent = Object.values(contentTypes).reduce((sum, count) => sum + count, 0)
    const totalComposition = Object.values(compositions).reduce((sum, count) => sum + count, 0)

    if (totalContent === 0 || totalComposition === 0) {
      return 0.5
    }

    // Calculate dominance of most common types
    const maxContent = Math.max(...Object.values(contentTypes))
    const maxComposition = Math.max(...Object.values(compositions))

    const contentDominance = maxContent / totalContent
    const compositionDominance = maxComposition / totalComposition

    return (contentDominance + compositionDominance) / 2
  }

  /**
   * Calculate confidence score for content-driven optimization
   */
  private calculateContentDrivenConfidence(analysis: ContentAnalysis, prompt: string): number {
    let confidence = this.calculateConfidenceScore(analysis)

    // Boost confidence for detailed prompts
    const promptLength = prompt.length
    if (promptLength > 50) {
      confidence += 0.1
    }
    if (promptLength > 100) {
      confidence += 0.1
    }

    // Boost confidence for specific keywords
    const specificKeywords = ['detailed', 'specific', 'precise', 'exact', 'particular']
    const hasSpecificKeywords = specificKeywords.some((keyword) =>
      prompt.toLowerCase().includes(keyword)
    )
    if (hasSpecificKeywords) {
      confidence += 0.15
    }

    return Math.min(confidence, 1.0)
  }

  /**
   * Calculate overall coherence of optimizations
   */
  private calculateOverallCoherence(optimizations: AspectRatioOptimizationResult[]): number {
    if (optimizations.length === 0) {
      return 1.0
    }

    // Calculate average confidence
    const avgConfidence =
      optimizations.reduce((sum, opt) => sum + opt.optimization.confidenceScore, 0) /
      optimizations.length

    // Check ratio consistency (bonus for similar ratios)
    const ratios = optimizations.map((opt) => opt.optimizedRatio.ratio)
    const uniqueRatios = new Set(ratios)
    const consistencyBonus = uniqueRatios.size <= 2 ? 0.1 : 0

    return Math.min(avgConfidence + consistencyBonus, 1.0)
  }
}
