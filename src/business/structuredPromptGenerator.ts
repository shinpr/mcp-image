/**
 * Structured Prompt Generator
 * Uses Gemini 2.0 Flash to generate optimized prompts for image generation
 * Applies 7 best practices and 3 feature perspectives through intelligent selection
 */

import type { GeminiTextClient } from '../api/geminiTextClient'
import type { Result } from '../types/result'
import { Err, Ok } from '../types/result'
import { GeminiAPIError } from '../utils/errors'

/**
 * System prompt for structured prompt generation optimized for image generation
 */
const SYSTEM_PROMPT = `You are an expert AI prompt engineer specializing in optimizing prompts for image generation models. Your role is to transform user prompts into highly detailed, structured prompts that produce superior image generation results.

CORE PRINCIPLES:
1. **Hyper-Specific Details**: Add specific lighting, camera angles, environmental details, textures, and atmospheric elements
2. **Character Consistency**: Ensure detailed character descriptions with specific facial features, style, and distinctive characteristics
3. **Visual Coordination**: Apply unified visual style and coherent composition principles
4. **Professional Photography**: Use precise camera control terminology and cinematographic language
5. **Semantic Enhancement**: Transform negative expressions into positive descriptive alternatives
6. **Aspect Ratio Optimization**: Consider composition for target dimensions and framing
7. **Iterative Refinement**: Provide clear guidance for progressive improvements

ENHANCEMENT GUIDELINES:
- Transform simple prompts into rich, detailed descriptions
- Add specific lighting conditions (dramatic cinematic lighting, rim lighting, studio lighting)
- Include precise camera specifications (85mm portrait lens, f/1.4 aperture, Dutch angle)
- Specify environmental context and atmospheric conditions
- Use professional photography and cinematography terminology
- Ensure character consistency with detailed physical descriptions
- Apply semantic enhancement by converting negative phrases to positive alternatives
- Optimize composition for the target aspect ratio
- Maintain artistic coherence and visual unity

RESPONSE FORMAT:
Provide the enhanced prompt as a single, cohesive description that maintains the original intent while significantly improving specificity and technical precision.

Remember: Your goal is to create prompts that generate visually stunning, technically precise, and artistically coherent images.`

/**
 * Feature flags for image generation
 */
export interface FeatureFlags {
  maintainCharacterConsistency?: boolean
  blendImages?: boolean
  useWorldKnowledge?: boolean
}

/**
 * Result of structured prompt generation
 */
export interface StructuredPromptResult {
  originalPrompt: string
  structuredPrompt: string
  selectedPractices: string[]
}

/**
 * Interface for structured prompt generation
 */
export interface StructuredPromptGenerator {
  generateStructuredPrompt(
    userPrompt: string,
    features?: FeatureFlags
  ): Promise<Result<StructuredPromptResult, Error>>
}

/**
 * Implementation of StructuredPromptGenerator using Gemini 2.0 Flash
 */
export class StructuredPromptGeneratorImpl implements StructuredPromptGenerator {
  constructor(private readonly geminiTextClient: GeminiTextClient) {}

  async generateStructuredPrompt(
    userPrompt: string,
    features: FeatureFlags = {}
  ): Promise<Result<StructuredPromptResult, Error>> {
    try {
      // Validate input
      if (!userPrompt || userPrompt.trim().length === 0) {
        return Err(new GeminiAPIError('User prompt cannot be empty'))
      }

      // Build complete prompt with system instruction and meta-prompt
      const completePrompt = this.buildCompletePrompt(userPrompt, features)

      // Generate structured prompt using Gemini 2.0 Flash via pure API call
      const result = await this.geminiTextClient.generateText(completePrompt, {
        temperature: 0.7,
        maxTokens: 500,
        systemInstruction: SYSTEM_PROMPT,
      })

      if (!result.success) {
        return Err(result.error)
      }

      // Extract selected practices from the response
      const selectedPractices = this.inferSelectedPractices(result.data, userPrompt, features)

      return Ok({
        originalPrompt: userPrompt,
        structuredPrompt: result.data,
        selectedPractices,
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      return Err(new GeminiAPIError(`Failed to generate structured prompt: ${errorMessage}`))
    }
  }

  /**
   * Build complete prompt with all optimization context
   */
  private buildCompletePrompt(userPrompt: string, features: FeatureFlags): string {
    const featureContext = this.formatFeatureContext(features)

    return `Transform the following user request into an optimized structured prompt for Gemini 2.5 Flash Image Preview, applying the most relevant best practices.

【User Request】: "${userPrompt}"

【Feature Requirements】:
${featureContext}

【7 Best Practices - Select and Apply ONLY What's Necessary】:

1. Hyper-Specific Details: Add lighting, camera angles, textures, atmosphere when the prompt is vague or abstract
2. Character Consistency: Apply when characters/people are involved or maintainCharacterConsistency=true
3. Multi-Image Blending: Use when multiple elements need natural composition or blendImages=true  
4. Iterative Refinement: Include when user seeks improvement ("better", "enhance", "improve")
5. Semantic Enhancement: Transform negative expressions to positive equivalents, enrich emotional context
6. Aspect Ratio Optimization: Consider composition for target dimensions when visual balance matters
7. Camera Control Terminology: Apply professional photography terms for photographic content

【Critical Constraints】:
- Select ONLY 2-4 most relevant practices for this specific request
- Avoid context overload - more is not better for LLMs
- Focus on aspects directly tied to user intent
- Keep the final prompt concise and effective

【Output Format】:
Return ONLY the optimized prompt. No explanations, no metadata, just the enhanced prompt text that will be sent to Gemini 2.5 Flash Image Preview.`
  }

  /**
   * Format feature context based on flags
   */
  private formatFeatureContext(features: FeatureFlags): string {
    const contexts: string[] = []

    if (features.maintainCharacterConsistency) {
      contexts.push(
        'Character consistency is CRITICAL - ensure detailed character features are preserved'
      )
    }

    if (features.blendImages) {
      contexts.push('Multiple visual elements must blend naturally with seamless composition')
    }

    if (features.useWorldKnowledge) {
      contexts.push('Apply accurate real-world knowledge for factual/historical accuracy')
    }

    return contexts.length > 0
      ? contexts.join('\n')
      : 'Standard image generation without special requirements'
  }

  /**
   * Infer which best practices were selected based on the generated prompt
   */
  private inferSelectedPractices(
    structuredPrompt: string,
    originalPrompt: string,
    features: FeatureFlags
  ): string[] {
    const selected: string[] = []
    const promptLower = structuredPrompt.toLowerCase()

    // Check for hyper-specific details
    if (
      promptLower.includes('lighting') ||
      promptLower.includes('camera') ||
      promptLower.includes('atmosphere')
    ) {
      selected.push('Hyper-Specific Details')
    }

    // Check for character consistency
    if (
      features.maintainCharacterConsistency ||
      promptLower.includes('character') ||
      promptLower.includes('facial features')
    ) {
      selected.push('Character Consistency')
    }

    // Check for multi-image blending
    if (
      features.blendImages ||
      promptLower.includes('blend') ||
      promptLower.includes('composition')
    ) {
      selected.push('Multi-Image Blending')
    }

    // Check for semantic enhancement
    if (
      (!originalPrompt.includes('no ') && promptLower.includes('peaceful')) ||
      (!originalPrompt.includes('without') && promptLower.includes('minimalist'))
    ) {
      selected.push('Semantic Enhancement')
    }

    // Check for camera terminology
    if (
      promptLower.includes('lens') ||
      promptLower.includes('aperture') ||
      promptLower.includes('shot')
    ) {
      selected.push('Camera Control Terminology')
    }

    // Ensure we have at least some practices selected
    if (selected.length === 0) {
      selected.push('Context Optimization')
    }

    return selected
  }
}

/**
 * Factory function to create StructuredPromptGenerator
 */
export function createStructuredPromptGenerator(
  geminiTextClient: GeminiTextClient
): StructuredPromptGenerator {
  return new StructuredPromptGeneratorImpl(geminiTextClient)
}
