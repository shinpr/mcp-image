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
const SYSTEM_PROMPT = `You are an expert at crafting prompts for image generation models. Your role is to transform user requests into rich, detailed prompts that maximize image generation quality.

Core principles:
- Add specific details about lighting, materials, composition, and atmosphere
- Include photographic or artistic terminology when appropriate  
- Maintain clarity while adding richness and specificity
- Preserve the user's original intent while enhancing detail
- Focus on what should be present rather than what should be absent

When describing scenes or subjects:
- Physical characteristics: textures, materials, colors, scale
- Lighting: direction, quality, color temperature, shadows
- Spatial relationships: foreground, midground, background, composition
- Atmosphere: mood, weather, time of day, environmental conditions
- Style: artistic direction, photographic techniques, visual treatment

Your output should be a single, vivid, coherent description that an image generation model can interpret unambiguously. Make it engaging, specific, and clear.`

/**
 * Additional system prompt for image editing mode (when input image is provided)
 */
const IMAGE_EDITING_CONTEXT = `

IMPORTANT: An input image has been provided. Your task is to:
1. Analyze the visual context, style, and atmosphere of the input image
2. Preserve the original image's core characteristics (color palette, lighting style, composition) while applying the requested changes
3. Focus on maintaining visual consistency - describe modifications relative to the existing image
4. Be specific about what to keep unchanged vs what to modify
5. Use phrases like "maintain the existing...", "preserve the original...", "keep the same..." to ensure fidelity to source`

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
    features?: FeatureFlags,
    inputImageData?: string // Optional base64-encoded image for context
  ): Promise<Result<StructuredPromptResult, Error>>
}

/**
 * Implementation of StructuredPromptGenerator using Gemini 2.0 Flash
 */
export class StructuredPromptGeneratorImpl implements StructuredPromptGenerator {
  constructor(private readonly geminiTextClient: GeminiTextClient) {}

  async generateStructuredPrompt(
    userPrompt: string,
    features: FeatureFlags = {},
    inputImageData?: string
  ): Promise<Result<StructuredPromptResult, Error>> {
    try {
      // Validate input
      if (!userPrompt || userPrompt.trim().length === 0) {
        return Err(new GeminiAPIError('User prompt cannot be empty'))
      }

      // Build complete prompt with system instruction and meta-prompt
      const completePrompt = this.buildCompletePrompt(userPrompt, features, !!inputImageData)

      // Combine system prompts for image editing mode
      const systemInstruction = inputImageData
        ? SYSTEM_PROMPT + IMAGE_EDITING_CONTEXT
        : SYSTEM_PROMPT

      // Generate structured prompt using Gemini 2.0 Flash via pure API call
      const config = {
        temperature: 0.7,
        maxTokens: 500,
        systemInstruction,
        ...(inputImageData && { inputImage: inputImageData }), // Only include if available
      }
      const result = await this.geminiTextClient.generateText(completePrompt, config)

      if (!result.success) {
        return Err(result.error)
      }

      // Extract selected practices from the response
      const selectedPractices = this.inferSelectedPractices(result.data, features)

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
  private buildCompletePrompt(
    userPrompt: string,
    features: FeatureFlags,
    hasInputImage: boolean
  ): string {
    const featureContext = this.buildEnhancedFeatureContext(features)

    // Add image editing context if an input image is provided
    const imageEditingInstruction = hasInputImage
      ? `\nNOTE: An input image has been provided. Focus on preserving its original characteristics while applying the requested modifications. Maintain consistency with the source image's style, colors, and atmosphere.\n`
      : ''

    return `Transform this image generation request into a detailed, vivid prompt that will produce high-quality results:

"${userPrompt}"
${imageEditingInstruction}
${featureContext}

Consider these aspects as you enhance the prompt:
- Visual details: textures, lighting, colors, materials, composition
- Spatial relationships and scale between elements
- Artistic or photographic style that fits the subject
- Emotional tone and atmosphere
- Technical specifications if relevant (lens type, camera angle, etc.)

Create a natural, flowing description that brings the scene to life. Focus on what should be present rather than what should be absent.

Example of a well-enhanced prompt:
Input: "A happy dog in a park"
Enhanced: "Golden retriever mid-leap catching a red frisbee, ears flying, tongue out in joy, in a sunlit urban park. Soft morning light filtering through oak trees creates dappled shadows on emerald grass. Background shows families on picnic blankets, slightly out of focus. Shot from low angle emphasizing the dog's athletic movement, with motion blur on the paws suggesting speed."

Now transform the user's request with similar attention to detail and creative enhancement.`
  }

  /**
   * Build enhanced feature context based on flags with explicit requirements
   */
  private buildEnhancedFeatureContext(features: FeatureFlags): string {
    const requirements: string[] = []

    if (features.maintainCharacterConsistency) {
      requirements.push(
        'Character consistency is CRITICAL - MUST include distinctive character features: This character needs at least 3 recognizable visual markers that would identify them across different scenes. Include specific details like "distinctive scar", "signature clothing item", "unique hairstyle", or "characteristic accessory". Use words like "signature", "distinctive", "always wears/has" to emphasize these consistent features.'
      )
    }

    if (features.blendImages) {
      requirements.push(
        'MUST describe seamless integration: Multiple visual elements need to blend naturally. Use spatial relationship terms like "seamlessly blending", "harmoniously composed", "naturally integrated". Clearly describe foreground (X% of frame), midground, and background elements with their relative scales and how they interact within the composition.'
      )
    }

    if (features.useWorldKnowledge) {
      requirements.push(
        'Apply accurate real-world knowledge - MUST incorporate authentic details: Apply accurate real-world knowledge about cultures, locations, or historical elements. Use specific terminology like "traditional [culture] style", "authentic [location] architecture", "typical of [region]", "historically accurate [period]". Be precise about cultural elements, geographical features, and factual details.'
      )
    }

    if (requirements.length > 0) {
      return `\nMANDATORY REQUIREMENTS - These MUST be clearly reflected in your enhanced prompt:\n\n${requirements.join('\n\n')}\n`
    }

    return ''
  }

  /**
   * Infer which best practices were selected based on the generated prompt
   */
  private inferSelectedPractices(structuredPrompt: string, features: FeatureFlags): string[] {
    const selected: string[] = []
    const promptLower = structuredPrompt.toLowerCase()

    // Check for detailed visual descriptions
    if (
      promptLower.includes('lighting') ||
      promptLower.includes('texture') ||
      promptLower.includes('atmosphere') ||
      promptLower.includes('shadow') ||
      promptLower.includes('material')
    ) {
      selected.push('Hyper-Specific Details')
    }

    // Check for character consistency markers
    if (
      features.maintainCharacterConsistency ||
      promptLower.includes('distinctive') ||
      promptLower.includes('signature') ||
      promptLower.includes('characteristic') ||
      promptLower.includes('always wears') ||
      promptLower.includes('always has')
    ) {
      selected.push('Character Consistency')
    }

    // Check for multi-element blending
    if (
      features.blendImages ||
      promptLower.includes('seamlessly') ||
      promptLower.includes('harmoniously') ||
      promptLower.includes('naturally integrated') ||
      promptLower.includes('foreground') ||
      promptLower.includes('midground') ||
      promptLower.includes('background')
    ) {
      selected.push('Compositional Integration')
    }

    // Check for world knowledge application
    if (
      features.useWorldKnowledge ||
      promptLower.includes('authentic') ||
      promptLower.includes('traditional') ||
      promptLower.includes('typical of') ||
      promptLower.includes('historically accurate') ||
      promptLower.includes('culturally')
    ) {
      selected.push('Real-World Accuracy')
    }

    // Check for photographic/artistic terminology
    if (
      promptLower.includes('lens') ||
      promptLower.includes('aperture') ||
      promptLower.includes('f/') ||
      promptLower.includes('mm ') ||
      promptLower.includes('angle') ||
      promptLower.includes('shot') ||
      promptLower.includes('depth of field')
    ) {
      selected.push('Camera Control Terminology')
    }

    // Check for atmospheric and mood enhancement
    if (
      promptLower.includes('mood') ||
      promptLower.includes('emotion') ||
      promptLower.includes('feeling') ||
      promptLower.includes('ambiance')
    ) {
      selected.push('Atmospheric Enhancement')
    }

    // Ensure we have at least some practices selected
    if (selected.length === 0) {
      selected.push('General Enhancement')
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
